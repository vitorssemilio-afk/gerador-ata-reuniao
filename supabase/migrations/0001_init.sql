-- Gerador automático de Ata de Reunião a partir de transcrição
-- (Google Meet / Zoom). Fluxo: usuário exporta a transcrição e sobe no
-- app (v1) — captura automática via API do Zoom/Meet fica para v2, pois
-- exige aprovação de app e OAuth com escopos de gravação.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.atas_reuniao (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cliente text not null,
  assunto text not null,
  data_reuniao date not null,
  hora_inicio text,
  hora_fim text,
  participantes text[] not null default '{}',
  transcricao text not null default '',
  status text not null default 'rascunho'
    check (status in ('rascunho', 'processando_ia', 'revisao', 'concluida', 'erro')),
  erro_ia text,
  pauta text not null default '',
  topicos jsonb not null default '[]',
  decisoes jsonb not null default '[]',
  acoes jsonb not null default '[]',
  pendencias jsonb not null default '[]',
  proxima_reuniao text,
  texto_whatsapp text not null default '',
  drive_file_id text,
  drive_file_link text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists atas_reuniao_user_id_idx on public.atas_reuniao(user_id);
create index if not exists atas_reuniao_cliente_idx on public.atas_reuniao(cliente);
create index if not exists atas_reuniao_data_reuniao_idx on public.atas_reuniao(data_reuniao desc);

alter table public.atas_reuniao enable row level security;

-- Time inteiro autenticado compartilha o histórico de atas (mesmo padrão
-- de acesso de outras ferramentas internas parecidas).
create policy "atas_reuniao_all_authenticated"
  on public.atas_reuniao for all
  to authenticated
  using (true) with check (true);

create trigger atas_reuniao_set_updated_at
  before update on public.atas_reuniao
  for each row execute function public.set_updated_at();
