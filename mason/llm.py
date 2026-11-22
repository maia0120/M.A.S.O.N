"""Ciclo de execução dos agentes sobre a Messages API da Anthropic.

Cada agente (MASON ou um departamento) roda um laço: envia a conversa ao modelo,
executa as ferramentas que ele pedir e devolve os resultados, até ele terminar.
A conversa é salva no banco a cada passo (apenas acrescentando, nunca editando),
então um trabalho pode ser retomado depois — por exemplo, quando o proprietário
decide uma aprovação.
"""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from typing import Any, Callable

import anthropic

from . import db

log = logging.getLogger("mason.llm")

MODEL = os.environ.get("MASON_MODEL", "claude-opus-5-5")
FALLBACK_BETA = "server-side-fallback-2026-07-01"

_client: Any = None


def get_client() -> Any:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(max_retries=4)
    return _client


def set_client(client: Any) -> None:
    """Permite trocar o cliente (usado nos testes)."""
    global _client
    _client = client


class StopLoop(Exception):
    """Lançada por uma ferramenta para encerrar o laço após este passo (ex.: aguardando aprovação)."""


@dataclass
class Tool:
    name: str
    description: str
    properties: dict[str, Any]
    required: list[str]
    handler: Callable[..., Any]

    def spec(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": {
                "type": "object",
                "properties": self.properties,
                "required": self.required,
                "additionalProperties": False,
            },
        }


@dataclass
class RunResult:
    text: str
    stop_reason: str
    stopped_by_tool: bool = False
    tool_calls: list[str] = field(default_factory=list)


def _block_to_dict(block: Any) -> dict[str, Any]:
    if isinstance(block, dict):
        return block
    return block.model_dump(mode="json", by_alias=True, exclude_none=True)


def _call(system: str, messages: list[dict[str, Any]], tools: list[dict[str, Any]], effort: str) -> Any:
    client = get_client()
    return client.beta.messages.create(
        model=MODEL,
        max_tokens=16000,
        system=system,
        messages=messages,
        tools=tools,
        output_config={"effort": effort},
        cache_control={"type": "ephemeral"},
        betas=[FALLBACK_BETA],
        fallbacks="default",
    )


def run_agent(conversation: str, system: str, tools: list[Tool], new_user_content: Any,
              effort: str = "high", extra_tools: list[dict[str, Any]] | None = None,
              max_steps: int = 25) -> RunResult:
    """Acrescenta `new_user_content` à conversa e roda o agente até ele terminar."""
    by_name = {t.name: t for t in tools}
    tool_specs = [t.spec() for t in tools] + list(extra_tools or [])

    messages = db.load_conversation(conversation)
    if messages and messages[-1]["role"] == "assistant":
        # execução anterior interrompida entre o pedido de ferramenta e o resultado
        pending = [b for b in messages[-1]["content"] if isinstance(b, dict) and b.get("type") == "tool_use"]
        if pending:
            interrupted = [{"type": "tool_result", "tool_use_id": b["id"], "is_error": True,
                            "content": "Execução interrompida antes desta ferramenta rodar."} for b in pending]
            messages.append({"role": "user", "content": interrupted})
            db.append_conversation(conversation, "user", interrupted)
    if messages and messages[-1]["role"] == "user":
        # a conversa parou depois de resultados de ferramentas (ex.: aguardando aprovação):
        # a nova mensagem continua a mesma vez do usuário
        messages[-1]["content"] = db._as_blocks(messages[-1]["content"]) + db._as_blocks(new_user_content)
    else:
        messages.append({"role": "user", "content": new_user_content})
    db.append_conversation(conversation, "user", new_user_content)

    texts: list[str] = []
    calls: list[str] = []
    stop_reason = "end_turn"

    for _ in range(max_steps):
        try:
            response = _call(system, messages, tool_specs, effort)
        except anthropic.AuthenticationError:
            raise RuntimeError("Chave da API da Anthropic inválida ou ausente (defina ANTHROPIC_API_KEY).")
        except anthropic.BadRequestError as e:
            raise RuntimeError(f"Requisição rejeitada pela API: {e.message}")
        except anthropic.RateLimitError:
            raise RuntimeError("Limite de uso da API atingido; tente novamente em instantes.")
        except anthropic.APIStatusError as e:
            raise RuntimeError(f"Erro da API ({e.status_code}): {e.message}")
        except anthropic.APIConnectionError:
            raise RuntimeError("Não foi possível conectar à API da Anthropic.")

        content = [_block_to_dict(b) for b in response.content]
        messages.append({"role": "assistant", "content": content})
        db.append_conversation(conversation, "assistant", content)
        stop_reason = response.stop_reason or "end_turn"

        for b in content:
            if b.get("type") == "text" and b.get("text", "").strip():
                texts.append(b["text"])

        if stop_reason == "refusal":
            texts.append("(O modelo recusou esta solicitação.)")
            break
        if stop_reason == "pause_turn":
            continue
        if stop_reason == "max_tokens":
            texts.append("(Resposta interrompida por limite de tamanho.)")
            break

        tool_uses = [b for b in content if b.get("type") == "tool_use"]
        if not tool_uses:
            break

        results = []
        stop_after = False
        for tu in tool_uses:
            calls.append(tu["name"])
            tool = by_name.get(tu["name"])
            try:
                if tool is None:
                    raise ValueError(f"Ferramenta desconhecida: {tu['name']}")
                args = tu.get("input") or {}
                if isinstance(args, str):
                    args = json.loads(args)
                missing = [r for r in tool.required if r not in args]
                if missing:
                    raise ValueError(f"Parâmetros obrigatórios ausentes: {', '.join(missing)}")
                try:
                    out = tool.handler(**args)
                except StopLoop as s:
                    out = str(s) or "ok"
                    stop_after = True
                results.append({
                    "type": "tool_result",
                    "tool_use_id": tu["id"],
                    "content": out if isinstance(out, str) else json.dumps(out, ensure_ascii=False, default=str),
                })
            except Exception as e:  # erro da ferramenta volta para o agente, não derruba o laço
                log.warning("Ferramenta %s falhou: %s", tu["name"], e)
                results.append({"type": "tool_result", "tool_use_id": tu["id"],
                                "content": f"Erro: {e}", "is_error": True})

        messages.append({"role": "user", "content": results})
        db.append_conversation(conversation, "user", results)
        if stop_after:
            return RunResult("\n\n".join(texts), stop_reason, True, calls)
    else:
        texts.append("(Limite de passos atingido.)")
        stop_reason = "max_steps"

    return RunResult("\n\n".join(texts), stop_reason, False, calls)


WEB_SEARCH_TOOL = {"type": "web_search_20260209", "name": "web_search", "max_uses": 8}
