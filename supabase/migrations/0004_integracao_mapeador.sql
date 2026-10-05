-- Integração com o Mapeador de Funil IA — quando uma ata é finalizada aqui
-- (status 'concluida'), ela é enviada automaticamente pra lá, vinculada ao
-- cliente/implementação/reunião corretos. Nunca identificamos esse vínculo
-- só pelo nome do cliente — por isso estes campos guardam os IDs reais do
-- Mapeador, preenchidos manualmente por quem revisa a ata (copiados da URL
-- da implementação/cliente no Mapeador). Sem eles, a ata ainda é enviada,
-- só que fica "aguardando vínculo" do lado de lá.
alter table public.atas_reuniao
  add column if not exists mapeador_cliente_id uuid,
  add column if not exists mapeador_implementacao_id uuid,
  add column if not exists mapeador_reuniao_id uuid,
  add column if not exists mapeador_tipo_reuniao text,
  add column if not exists enviado_mapeador_em timestamptz,
  add column if not exists enviado_mapeador_status text check (
    enviado_mapeador_status in ('enviado', 'vinculado', 'requer_revisao', 'falhou')
  ),
  add column if not exists enviado_mapeador_mensagem text;
