// Envia a ata finalizada pro Mapeador de Funil IA (webhook-atas). Chamada
// pelo frontend logo depois de salvar a ata com status 'concluida' — nunca
// roda sozinha em background, sempre como consequência direta da ação do
// consultor.
//
// O segredo do Mapeador (MAPEADOR_WEBHOOK_SECRET) só existe aqui, como
// secret desta Edge Function — nunca no frontend, nunca em log.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.8';
import { corsHeaders } from '../_shared/cors.ts';

type AtaAcao = {
  descricao: string;
  responsavel: string | null;
  prazo: string | null;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

// Só repassa prazo quando já é uma data de verdade (yyyy-mm-dd) — o campo
// aqui é texto livre ("19/08", "até sexta") e o Mapeador espera uma data.
// Melhor deixar em branco (consultor preenche lá) do que inventar.
function prazoComoData(prazo: string | null): string | null {
  if (!prazo) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(prazo.trim()) ? prazo.trim() : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let payload: { ata_id?: unknown } | null = null;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Corpo da requisição inválido.' }, 400);
  }

  const ataId = payload?.ata_id;
  if (typeof ataId !== 'string' || !ataId) {
    return jsonResponse({ error: 'ata_id é obrigatório.' }, 400);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Não autenticado.' }, 401);
  }

  const mapeadorUrl = Deno.env.get('MAPEADOR_WEBHOOK_URL');
  const mapeadorSecret = Deno.env.get('MAPEADOR_WEBHOOK_SECRET');
  if (!mapeadorUrl || !mapeadorSecret) {
    console.error('MAPEADOR_WEBHOOK_URL ou MAPEADOR_WEBHOOK_SECRET não configurados.');
    return jsonResponse({ error: 'Integração com o Mapeador não está configurada.' }, 500);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: ata, error: fetchError } = await supabase
    .from('atas_reuniao')
    .select('*')
    .eq('id', ataId)
    .single();

  if (fetchError || !ata) {
    return jsonResponse({ error: 'Ata não encontrada.' }, 404);
  }

  const resumoPartes = [ata.pauta, ...ata.topicos.map((t: { titulo: string; resumo: string }) => `${t.titulo}: ${t.resumo}`)];

  const mapeadorPayload = {
    external_minute_id: ata.id,
    integration_source: 'app_atas',
    cliente_id: ata.mapeador_cliente_id,
    implementacao_id: ata.mapeador_implementacao_id,
    reuniao_id: ata.mapeador_reuniao_id,
    tipo_reuniao: ata.mapeador_tipo_reuniao,
    titulo: ata.assunto,
    data_reuniao: ata.hora_inicio ? `${ata.data_reuniao}T${ata.hora_inicio}:00` : `${ata.data_reuniao}T00:00:00`,
    participantes: (ata.participantes as string[]).map((nome) => ({ nome })),
    resumo: resumoPartes.filter(Boolean).join('\n\n'),
    decisoes: (ata.decisoes as string[]).map((d) => ({ titulo: d })),
    acoes: (ata.acoes as AtaAcao[]).map((a) => ({
      titulo: a.descricao,
      responsavel_nome: a.responsavel,
      prazo_sugerido: prazoComoData(a.prazo),
    })),
    conteudo_original: ata.transcricao || null,
    gerada_em: ata.updated_at,
  };

  let status: 'enviado' | 'vinculado' | 'requer_revisao' | 'falhou' = 'falhou';
  let mensagem: string | null = null;

  try {
    const resposta = await fetch(mapeadorUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${mapeadorSecret}`,
      },
      body: JSON.stringify(mapeadorPayload),
    });

    const resultado = await resposta.json().catch(() => null);

    if (resposta.ok && resultado?.success) {
      status = resultado.status === 'requires_link' ? 'requer_revisao' : 'vinculado';
      mensagem =
        resultado.status === 'requires_link'
          ? 'Ata enviada — precisa ser vinculada manualmente a uma reunião no Mapeador.'
          : 'Ata enviada e vinculada no Mapeador.';
    } else {
      status = 'falhou';
      mensagem = resultado?.message ?? `Erro ${resposta.status} ao enviar pro Mapeador.`;
    }
  } catch (err) {
    console.error('Erro ao chamar o webhook do Mapeador', err);
    status = 'falhou';
    mensagem = 'Não foi possível conectar ao Mapeador.';
  }

  const { data: ataAtualizada } = await supabase
    .from('atas_reuniao')
    .update({
      enviado_mapeador_em: new Date().toISOString(),
      enviado_mapeador_status: status,
      enviado_mapeador_mensagem: mensagem,
    })
    .eq('id', ataId)
    .select()
    .single();

  return jsonResponse({ ok: status !== 'falhou', status, mensagem, ata: ataAtualizada });
});
