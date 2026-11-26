-- =====================================================================
-- Interclasse 2026 — banco de dados (Supabase / PostgreSQL)
-- Rode este arquivo inteiro no Supabase: SQL Editor → New query → Run.
-- =====================================================================

-- 1) Campeonato: um único registro com turmas, jogos, gols e cronômetro
create table if not exists public.campeonato (
  id            text primary key,
  dados         jsonb not null,
  atualizado_em timestamptz not null default now()
);

-- 2) Gerenciador: só quem estiver nesta tabela edita o campeonato e modera o mural
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- Posts válidos: cada texto com até 280 caracteres
create or replace function public.posts_validos(p jsonb)
returns boolean language sql immutable as $$
  select not exists (
    select 1 from jsonb_array_elements(p) e
    where jsonb_typeof(e) <> 'object' or char_length(coalesce(e->>'texto', '')) > 280
  );
$$;

-- 3) Torcedores: nome, sala, posts e denúncias de cada torcedor
create table if not exists public.torcedores (
  id            uuid primary key references auth.users (id) on delete cascade,
  nome          text  not null check (char_length(nome) between 1 and 40),
  turma         text  not null check (char_length(turma) between 1 and 60),
  posts         jsonb not null default '[]'::jsonb check (jsonb_typeof(posts) = 'array' and jsonb_array_length(posts) <= 150 and public.posts_validos(posts)),
  denuncias     jsonb not null default '[]'::jsonb check (jsonb_typeof(denuncias) = 'array' and jsonb_array_length(denuncias) <= 100),
  atualizado_em timestamptz not null default now()
);

-- Quem é o gerenciador?
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------
-- Regras de acesso (RLS)
-- ---------------------------------------------------------------------
alter table public.campeonato enable row level security;
alter table public.admins     enable row level security;
alter table public.torcedores enable row level security;

-- Campeonato: todo mundo lê; só o gerenciador grava
drop policy if exists "campeonato leitura publica" on public.campeonato;
create policy "campeonato leitura publica" on public.campeonato
  for select using (true);
drop policy if exists "campeonato gerente insere" on public.campeonato;
create policy "campeonato gerente insere" on public.campeonato
  for insert to authenticated with check (public.is_admin());
drop policy if exists "campeonato gerente altera" on public.campeonato;
create policy "campeonato gerente altera" on public.campeonato
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Admins: cada um só consegue ver a própria linha (ninguém grava pelo site)
drop policy if exists "admins ve a si mesmo" on public.admins;
create policy "admins ve a si mesmo" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- Torcedores: mural público; cada torcedor cria/edita só o próprio registro;
-- o gerenciador pode editar (apagar posts) e excluir qualquer um
drop policy if exists "torcida leitura publica" on public.torcedores;
create policy "torcida leitura publica" on public.torcedores
  for select using (true);
drop policy if exists "torcedor cria o proprio" on public.torcedores;
create policy "torcedor cria o proprio" on public.torcedores
  for insert to authenticated with check (id = auth.uid());
drop policy if exists "torcedor ou gerente altera" on public.torcedores;
create policy "torcedor ou gerente altera" on public.torcedores
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
drop policy if exists "gerente exclui torcedor" on public.torcedores;
create policy "gerente exclui torcedor" on public.torcedores
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- Tempo real (placar e mural atualizam sozinhos)
-- ---------------------------------------------------------------------
do $$
begin
  begin alter publication supabase_realtime add table public.campeonato; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.torcedores; exception when duplicate_object then null; end;
end $$;

-- ---------------------------------------------------------------------
-- Dados iniciais: turmas do 1º ano A–E, sem jogos
-- ---------------------------------------------------------------------
insert into public.campeonato (id, dados)
values ('estado', '{"turmas":["1º Ano A","1º Ano B","1º Ano C","1º Ano D","1º Ano E"],"jogos":[],"turmas1AnoV2":true}'::jsonb)
on conflict (id) do nothing;

-- =====================================================================
-- DEPOIS de criar a conta do gerenciador (Authentication → Users → Add user),
-- rode a linha abaixo trocando o e-mail:
--
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'seu-email@exemplo.com';
-- =====================================================================
