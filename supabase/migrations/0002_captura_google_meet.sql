-- Captura automática de reuniões do Google Meet (v2 do roadmap).
--
-- Cada consultor conecta a própria conta Google (OAuth, escopo
-- meetings.space.readonly) uma vez. O refresh token fica criptografado
-- no banco (pgcrypto + Supabase Vault, mesmo padrão de credencial
-- sensível usado em outras partes do projeto) — nunca em texto puro,
-- nunca lido pelo client.
--
-- Uma Edge Function agendada (verificar-reunioes-meet, configurada via
-- cron fora desta migration — ver README) roda periodicamente, usa o
-- token de cada conexão pra listar reuniões novas com transcrição
-- pronta na API do Meet, e grava o resultado em
-- reunioes_meet_detectadas — sem nenhuma ata ser criada automaticamente
-- (fica pendente até o consultor revisar e confirmar).
--
-- Pré-requisito: extensão supabase_vault habilitada e um secret
-- "google_meet_oauth_key" criado nela (ver README) — usada como chave
-- simétrica de criptografia do refresh token.

create extension if not exists pgcrypto;

create table if not exists public.conexoes_google_meet (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  google_email text not null,
  refresh_token_criptografado bytea not null,
  ultima_verificacao timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, google_email)
);

alter table public.conexoes_google_meet enable row level security;

create policy "conexoes_google_meet_select_own"
  on public.conexoes_google_meet for select
  to authenticated
  using (user_id = auth.uid());

create policy "conexoes_google_meet_delete_own"
  on public.conexoes_google_meet for delete
  to authenticated
  using (user_id = auth.uid());

create trigger conexoes_google_meet_set_updated_at
  before update on public.conexoes_google_meet
  for each row execute function public.set_updated_at();

-- Grava (ou atualiza) a conexão do usuário autenticado, criptografando
-- o refresh token antes. Chamada só pela Edge Function
-- google-meet-conectar, logo após trocar o "code" do OAuth pelos
-- tokens — nunca direto pelo client.
create or replace function public.salvar_conexao_google_meet(
  p_google_email text,
  p_refresh_token text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chave text;
  v_id uuid;
begin
  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'google_meet_oauth_key';
  if v_chave is null then
    raise exception 'Secret "google_meet_oauth_key" não configurada no Supabase Vault.';
  end if;

  insert into public.conexoes_google_meet (user_id, google_email, refresh_token_criptografado)
  values (auth.uid(), p_google_email, pgp_sym_encrypt(p_refresh_token, v_chave))
  on conflict (user_id, google_email)
  do update set refresh_token_criptografado = excluded.refresh_token_criptografado
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.salvar_conexao_google_meet(text, text) from public;
grant execute on function public.salvar_conexao_google_meet(text, text) to authenticated;

-- Usada só pela Edge Function agendada verificar-reunioes-meet
-- (chamada com a service_role key, sem usuário logado): devolve todas
-- as conexões já com o token descriptografado, pra ela consultar a API
-- do Meet em nome de cada consultor.
create or replace function public.listar_conexoes_google_meet_para_verificacao()
returns table (
  id uuid,
  user_id uuid,
  google_email text,
  refresh_token text,
  ultima_verificacao timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chave text;
begin
  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'google_meet_oauth_key';
  if v_chave is null then
    raise exception 'Secret "google_meet_oauth_key" não configurada no Supabase Vault.';
  end if;

  return query
    select
      c.id,
      c.user_id,
      c.google_email,
      pgp_sym_decrypt(c.refresh_token_criptografado, v_chave),
      c.ultima_verificacao
    from public.conexoes_google_meet c;
end;
$$;

revoke all on function public.listar_conexoes_google_meet_para_verificacao() from public;
grant execute on function public.listar_conexoes_google_meet_para_verificacao() to service_role;

create or replace function public.marcar_conexao_google_meet_verificada(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.conexoes_google_meet set ultima_verificacao = now() where id = p_id;
$$;

revoke all on function public.marcar_conexao_google_meet_verificada(uuid) from public;
grant execute on function public.marcar_conexao_google_meet_verificada(uuid) to service_role;

-- ============================================================
-- Reuniões que a verificação periódica encontrou, aguardando revisão
-- humana antes de virarem ata de verdade.
-- ============================================================
create table if not exists public.reunioes_meet_detectadas (
  id uuid primary key default gen_random_uuid(),
  conexao_id uuid not null references public.conexoes_google_meet(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- resource name do conferenceRecord na API do Meet (ex:
  -- "conferenceRecords/abc123") — único, evita gravar a mesma reunião
  -- duas vezes em verificações consecutivas.
  conference_record_name text not null unique,
  titulo text,
  iniciado_em timestamptz,
  finalizado_em timestamptz,
  transcricao text not null default '',
  status text not null default 'pendente' check (status in ('pendente', 'ignorada', 'ata_criada')),
  ata_id uuid references public.atas_reuniao(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists reunioes_meet_detectadas_user_id_idx on public.reunioes_meet_detectadas(user_id);
create index if not exists reunioes_meet_detectadas_status_idx on public.reunioes_meet_detectadas(status);

alter table public.reunioes_meet_detectadas enable row level security;

create policy "reunioes_meet_detectadas_select_own"
  on public.reunioes_meet_detectadas for select
  to authenticated
  using (user_id = auth.uid());

create policy "reunioes_meet_detectadas_update_own"
  on public.reunioes_meet_detectadas for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
