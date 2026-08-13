import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.8';
import { corsHeaders } from '../_shared/cors.ts';
import { renovarAccessToken } from '../_shared/googleOAuth.ts';
import { listarConferenciasRecentes, obterTranscricaoDaReuniao } from './meetApi.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

// Sem verificação anterior, olha só as últimas 24h pra não varrer o
// histórico inteiro de conferências na primeira execução de cada
// conexão.
const JANELA_PRIMEIRA_VERIFICACAO_HORAS = 24;

type ConexaoParaVerificar = {
  id: string;
  user_id: string;
  google_email: string;
  refresh_token: string;
  ultima_verificacao: string | null;
};

// Chamada por um cron (ver README) — não é acionada pelo front. Usa a
// service_role key porque roda sem usuário logado, pra poder ler o
// token de todas as conexões via listar_conexoes_google_meet_para_verificacao
// (RPC restrita a essa role) e gravar reuniões detectadas de qualquer
// usuário.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return jsonResponse({ error: 'Não autorizado.' }, 401);
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

  const { data: conexoes, error: conexoesError } = await supabase.rpc(
    'listar_conexoes_google_meet_para_verificacao',
  );

  if (conexoesError) {
    console.error('Erro ao listar conexões do Google Meet', conexoesError);
    return jsonResponse({ error: conexoesError.message }, 500);
  }

  const resultado: Record<string, { reunioes_encontradas: number; erro?: string }> = {};

  for (const conexao of (conexoes ?? []) as ConexaoParaVerificar[]) {
    try {
      const encontradas = await verificarConexao(supabase, conexao);
      resultado[conexao.google_email] = { reunioes_encontradas: encontradas };
    } catch (err) {
      console.error(`Erro ao verificar conexão ${conexao.google_email}`, err);
      resultado[conexao.google_email] = {
        reunioes_encontradas: 0,
        erro: String(err instanceof Error ? err.message : err),
      };
    }
  }

  return jsonResponse({ ok: true, resultado });
});

// deno-lint-ignore no-explicit-any
async function verificarConexao(supabase: any, conexao: ConexaoParaVerificar): Promise<number> {
  const tokens = await renovarAccessToken(conexao.refresh_token);

  const desde = conexao.ultima_verificacao
    ? new Date(conexao.ultima_verificacao)
    : new Date(Date.now() - JANELA_PRIMEIRA_VERIFICACAO_HORAS * 60 * 60 * 1000);

  const conferencias = await listarConferenciasRecentes(tokens.access_token, desde);
  let encontradas = 0;

  for (const conferencia of conferencias) {
    if (!conferencia.endTime) continue; // reunião ainda em andamento

    const transcricao = await obterTranscricaoDaReuniao(tokens.access_token, conferencia.name);
    if (!transcricao) continue; // sem transcrição pronta ainda (ou reunião sem transcrição habilitada)

    const { error: insertError } = await supabase
      .from('reunioes_meet_detectadas')
      .upsert(
        {
          conexao_id: conexao.id,
          user_id: conexao.user_id,
          conference_record_name: conferencia.name,
          titulo: `Reunião do Meet — ${new Date(conferencia.startTime ?? Date.now()).toLocaleDateString('pt-BR')}`,
          iniciado_em: conferencia.startTime ?? null,
          finalizado_em: conferencia.endTime ?? null,
          transcricao,
          status: 'pendente',
        },
        { onConflict: 'conference_record_name', ignoreDuplicates: true },
      );

    if (insertError) {
      console.error('Erro ao gravar reunião detectada', insertError);
      continue;
    }

    encontradas++;
  }

  await supabase.rpc('marcar_conexao_google_meet_verificada', { p_id: conexao.id });

  return encontradas;
}
