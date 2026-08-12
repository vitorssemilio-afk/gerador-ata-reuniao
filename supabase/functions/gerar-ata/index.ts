import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.8';
import { corsHeaders } from '../_shared/cors.ts';
import { gerarAtaComIA } from './ia.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
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

  if (!ata.transcricao || !ata.transcricao.trim()) {
    return jsonResponse({ error: 'Transcrição vazia.' }, 400);
  }

  await supabase.from('atas_reuniao').update({ status: 'processando_ia', erro_ia: null }).eq('id', ataId);

  try {
    const resultado = await gerarAtaComIA(ata.transcricao as string, {
      cliente: ata.cliente as string,
      assunto: ata.assunto as string,
      dataReuniao: ata.data_reuniao as string,
      participantes: (ata.participantes as string[]) ?? [],
    });

    const participantesFinal =
      ((ata.participantes as string[]) ?? []).length > 0
        ? (ata.participantes as string[])
        : resultado.participantes_identificados;

    const { data: ataAtualizada, error: updateError } = await supabase
      .from('atas_reuniao')
      .update({
        status: 'revisao',
        participantes: participantesFinal,
        pauta: resultado.pauta,
        topicos: resultado.topicos,
        decisoes: resultado.decisoes,
        acoes: resultado.acoes,
        pendencias: resultado.pendencias,
        proxima_reuniao: resultado.proxima_reuniao,
      })
      .eq('id', ataId)
      .select()
      .single();

    if (updateError) {
      console.error('Erro ao salvar ata gerada', updateError);
      return jsonResponse({ error: updateError.message }, 500);
    }

    return jsonResponse({ ok: true, ata: ataAtualizada });
  } catch (iaError) {
    console.error('Erro ao gerar ata com IA', iaError);
    const mensagem = String(iaError instanceof Error ? iaError.message : iaError);
    await supabase.from('atas_reuniao').update({ status: 'erro', erro_ia: mensagem }).eq('id', ataId);
    return jsonResponse({ error: 'Falha ao gerar ata com IA.' }, 502);
  }
});
