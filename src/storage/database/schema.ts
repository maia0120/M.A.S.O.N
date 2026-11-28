/**
 * Migrações em ordem. Nunca edite uma migração já publicada: crie a próxima.
 * IDs são texto (UUID) para não depender de lastInsertId entre drivers.
 * Datas em ISO 8601 (texto).
 */
export const MIGRATIONS: string[] = [
  /* v1 — fundação */ `
  CREATE TABLE IF NOT EXISTS ideas (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    original_description TEXT NOT NULL,      -- palavras do usuário, nunca reescritas pela IA
    organized_description TEXT,               -- organização feita pela IA
    ai_suggestions TEXT,                      -- sugestões da IA, separadas do que o usuário disse
    category TEXT,
    status TEXT NOT NULL DEFAULT 'nova',      -- nova | em_analise | aprovada | em_desenvolvimento | arquivada
    project_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS idea_history (
    id TEXT PRIMARY KEY,
    idea_id TEXT NOT NULL,
    field TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    source TEXT NOT NULL,                     -- usuario | ia
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    contact TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    origin_idea_id TEXT,
    client_id TEXT,
    stage TEXT NOT NULL DEFAULT 'planejamento', -- planejamento | design | desenvolvimento | qualidade | entregue
    status TEXT NOT NULL DEFAULT 'ativo',       -- ativo | pausado | concluido | arquivado
    external_links TEXT NOT NULL DEFAULT '[]',  -- JSON [{label,url}]
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS project_history (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    event TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    project_id TEXT,
    status TEXT NOT NULL DEFAULT 'pendente',  -- pendente | em_andamento | concluida
    due_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,                       -- tecnico | prompt_claude | briefing | estrategia | outro
    department TEXT NOT NULL,
    project_id TEXT,
    idea_id TEXT,
    current_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS document_versions (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    content TEXT NOT NULL,
    note TEXT,
    source TEXT NOT NULL,                     -- usuario | ia
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    project_id TEXT,                          -- NULL = caixa de entrada (importado, ainda sem projeto)
    name TEXT NOT NULL,
    mime TEXT,
    size INTEGER NOT NULL DEFAULT 0,
    storage_ref TEXT,                         -- caminho no armazenamento de arquivos
    text_content TEXT,                        -- conteúdo legível, quando o arquivo é texto
    analysis TEXT,
    version_label TEXT,
    imported_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,                       -- preferencia | decisao | fato | contexto
    subject TEXT,
    content TEXT NOT NULL,
    source TEXT NOT NULL,                     -- usuario | ia_sugestao | decisao_confirmada | nao_verificado
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS expressions (
    id TEXT PRIMARY KEY,
    expression TEXT NOT NULL,
    meaning TEXT NOT NULL,
    example TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS transcript_corrections (
    id TEXT PRIMARY KEY,
    heard TEXT NOT NULL,
    correct TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    auto_apply INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT,
    summary TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,                       -- user | assistant | tool
    content TEXT NOT NULL,
    meta TEXT,                                -- JSON (ferramentas usadas, seção ativa)
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    summary TEXT NOT NULL,
    section TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ideas_status ON ideas(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
  CREATE INDEX IF NOT EXISTS idx_docs_project ON documents(project_id);
  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(created_at);
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;
