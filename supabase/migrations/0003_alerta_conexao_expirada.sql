-- Alerta de conexão do Google Meet expirada/revogada.
--
-- Quando o refresh token de uma conexão para de funcionar (usuário
-- revogou o acesso pelo Google, ou o token expirou por inatividade
-- prolongada), a verificação periódica passa a falhar silenciosamente
-- pra aquele consultor — ele só notaria a ausência de reuniões novas
-- depois de um tempo. Agora a Edge Function verificar-reunioes-meet
-- marca a conexão como "erro" nesse caso, e o app mostra um aviso
-- pedindo pra reconectar.

alter table public.conexoes_google_meet
  add column if not exists status text not null default 'ativa' check (status in ('ativa', 'erro')),
  add column if not exists ultimo_erro text;

-- Reconectar (salvar_conexao_google_meet de novo) sempre limpa o erro —
-- é exatamente a ação que resolve o problema.
create or replace function public.salvar_conexao_google_meet(
  p_google_email text,
  p_refresh_token text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_chave text;
  v_id uuid;
begin
  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'google_meet_oauth_key';
  if v_chave is null then
    raise exception 'Secret "google_meet_oauth_key" não configurada no Supabase Vault.';
  end if;

  insert into public.conexoes_google_meet (user_id, google_email, refresh_token_criptografado, status, ultimo_erro)
  values (auth.uid(), p_google_email, pgp_sym_encrypt(p_refresh_token, v_chave), 'ativa', null)
  on conflict (user_id, google_email)
  do update set
    refresh_token_criptografado = excluded.refresh_token_criptografado,
    status = 'ativa',
    ultimo_erro = null
  returning id into v_id;

  return v_id;
end;
$$;

-- Verificação com sucesso também limpa qualquer erro anterior.
create or replace function public.marcar_conexao_google_meet_verificada(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.conexoes_google_meet
  set ultima_verificacao = now(), status = 'ativa', ultimo_erro = null
  where id = p_id;
$$;

-- Chamada pela Edge Function verificar-reunioes-meet quando a
-- renovação do access token falha (refresh token inválido/revogado) —
-- é o que faz o aviso aparecer pro consultor no app.
create or replace function public.marcar_conexao_google_meet_com_erro(p_id uuid, p_erro text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.conexoes_google_meet
  set status = 'erro', ultimo_erro = p_erro
  where id = p_id;
$$;

revoke all on function public.marcar_conexao_google_meet_com_erro(uuid, text) from public;
grant execute on function public.marcar_conexao_google_meet_com_erro(uuid, text) to service_role;
