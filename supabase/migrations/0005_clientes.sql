-- Cadastro de clientes — até aqui "cliente" era só um texto livre dentro
-- de atas_reuniao (sem identidade própria, sujeito a grafias diferentes
-- pro mesmo cliente). Esta migration cria o cadastro real e liga as atas
-- a ele por id, mantendo a coluna de texto (atas_reuniao.cliente) em
-- sincronia — ela continua sendo usada como está hoje pro nome da pasta
-- no Drive, pro .docx e pro texto de WhatsApp, então não pode sumir nem
-- mudar de significado.

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (btrim(nome) <> ''),
  -- minúsculas + sem espaço nas pontas + espaços internos colapsados —
  -- é o que decide se duas grafias são "o mesmo cliente" (ex: "Mansão
  -- Fato", " mansão   fato " e "MANSÃO FATO" caem na mesma linha).
  nome_normalizado text not null generated always as (
    regexp_replace(lower(btrim(nome)), '\s+', ' ', 'g')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (nome_normalizado)
);

alter table public.clientes enable row level security;

-- Mesmo padrão de acesso já usado em atas_reuniao: time inteiro
-- autenticado compartilha o cadastro.
create policy "clientes_all_authenticated"
  on public.clientes for all
  to authenticated
  using (true) with check (true);

create trigger clientes_set_updated_at
  before update on public.clientes
  for each row execute function public.set_updated_at();

-- Resolve (ou cria) o cliente pelo nome de forma atômica — evita duas
-- requisições simultâneas (ou um duplo clique) criando dois cadastros
-- pro mesmo nome. Se já existir um cliente com o mesmo nome normalizado,
-- devolve o cadastro existente (preservando a grafia já salva); senão,
-- cria um novo com a grafia informada.
create or replace function public.obter_ou_criar_cliente(p_nome text)
returns public.clientes
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cliente public.clientes;
begin
  if btrim(coalesce(p_nome, '')) = '' then
    raise exception 'Nome do cliente não pode ser vazio.';
  end if;

  insert into public.clientes (nome)
  values (btrim(p_nome))
  on conflict (nome_normalizado) do update set updated_at = now()
  returning * into v_cliente;

  return v_cliente;
end;
$$;

revoke all on function public.obter_ou_criar_cliente(text) from public;
grant execute on function public.obter_ou_criar_cliente(text) to authenticated;

-- Vínculo real da ata com o cliente. A coluna de texto "cliente"
-- continua existindo (mantém tudo que já lê/exporta esse campo
-- funcionando sem mudanças), mas passa a ser mantida em sincronia com o
-- nome do cadastro vinculado.
alter table public.atas_reuniao
  add column if not exists cliente_id uuid references public.clientes(id) on delete set null;

create index if not exists atas_reuniao_cliente_id_idx on public.atas_reuniao(cliente_id);

-- Ao renomear um cliente, propaga o nome novo pras atas já vinculadas —
-- sem isso elas ficariam mostrando o nome antigo (a coluna de texto é só
-- um espelho de leitura rápida, quem manda é cliente_id).
create or replace function public.propagar_nome_cliente()
returns trigger
language plpgsql
as $$
begin
  if new.nome is distinct from old.nome then
    update public.atas_reuniao set cliente = new.nome where cliente_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists clientes_propagar_nome on public.clientes;
create trigger clientes_propagar_nome
  after update of nome on public.clientes
  for each row execute function public.propagar_nome_cliente();

-- ============================================================
-- Migração das atas existentes: cria os cadastros de cliente que ainda
-- não existem e vincula cada ata pelo nome normalizado. Idempotente —
-- rodar de novo não duplica nada, porque só mexe em atas ainda sem
-- cliente_id e usa o mesmo "on conflict" por nome normalizado.
-- ============================================================

-- 1) Cria um cadastro por nome normalizado ainda não cadastrado. Entre
--    grafias diferentes do mesmo nome normalizado, usa a primeira em
--    ordem alfabética como grafia "canônica" — é só o ponto de partida,
--    dá pra editar o nome depois pela tela de Clientes.
insert into public.clientes (nome)
select distinct on (norm) cliente
from (
  select
    cliente,
    regexp_replace(lower(btrim(cliente)), '\s+', ' ', 'g') as norm
  from public.atas_reuniao
  where cliente_id is null and btrim(coalesce(cliente, '')) <> ''
) t
order by norm, cliente
on conflict (nome_normalizado) do nothing;

-- 2) Vincula cada ata ainda sem cliente_id ao cadastro de mesmo nome
--    normalizado (já existente antes desta migration ou recém-criado
--    no passo acima).
update public.atas_reuniao a
set cliente_id = c.id
from public.clientes c
where a.cliente_id is null
  and btrim(coalesce(a.cliente, '')) <> ''
  and c.nome_normalizado = regexp_replace(lower(btrim(a.cliente)), '\s+', ' ', 'g');

-- Atas sem nome de cliente válido (texto vazio/só espaço) ficam com
-- cliente_id nulo mesmo — aparecem na visão "Sem cliente" no app, pra
-- revisão manual. Nenhum registro é apagado ou alterado além do vínculo.

-- ============================================================
-- Resumo pra conferir o resultado da migração (rode manualmente no SQL
-- Editor depois do deploy — não faz parte da migration em si):
--
-- select count(*) as clientes_criados from public.clientes;
-- select count(*) as atas_vinculadas from public.atas_reuniao where cliente_id is not null;
-- select id, cliente, data_reuniao from public.atas_reuniao where cliente_id is null;
-- ============================================================

-- Resumo das atas por cliente — usado pela página "Clientes" do app
-- (quantidade de atas + data da última reunião por cliente). View comum
-- (sem security definer): a RLS de atas_reuniao/clientes já libera tudo
-- pra qualquer autenticado, então o resultado respeita o mesmo escopo de
-- permissão de quem consulta.
create or replace view public.clientes_resumo as
select
  c.id,
  c.nome,
  count(a.id) as qtd_atas,
  max(a.data_reuniao) as ultima_reuniao
from public.clientes c
left join public.atas_reuniao a on a.cliente_id = c.id
group by c.id, c.nome;

grant select on public.clientes_resumo to authenticated;
