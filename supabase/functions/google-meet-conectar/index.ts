import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.8';
import { corsHeaders } from '../_shared/cors.ts';
import { obterEmailDoToken, trocarCodePorTokens } from '../_shared/googleOAuth.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

// Recebe o "code" do redirecionamento OAuth (fluxo authorization code,
// iniciado em src/lib/googleMeetAuth.ts) e troca pelos tokens direto
// com o Google — o Client Secret nunca fica exposto no navegador,
// só aqui na Edge Function. Grava o refresh token criptografado via
// salvar_conexao_google_meet, associado ao usuário autenticado que
// chamou (JWT repassado pelo front).
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let payload: { code?: unknown; redirect_uri?: unknown } | null = null;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Corpo da requisição inválido.' }, 400);
  }

  const code = payload?.code;
  const redirectUri = payload?.redirect_uri;
  if (typeof code !== 'string' || !code || typeof redirectUri !== 'string' || !redirectUri) {
    return jsonResponse({ error: 'code e redirect_uri são obrigatórios.' }, 400);
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

  try {
    const tokens = await trocarCodePorTokens(code, redirectUri);

    if (!tokens.refresh_token) {
      return jsonResponse(
        {
          error:
            'O Google não devolveu um refresh token — normalmente acontece quando essa conta já autorizou o app antes. Revogue o acesso em myaccount.google.com/permissions e tente conectar de novo.',
        },
        400,
      );
    }

    const email = await obterEmailDoToken(tokens.access_token);

    const { error: rpcError } = await supabase.rpc('salvar_conexao_google_meet', {
      p_google_email: email,
      p_refresh_token: tokens.refresh_token,
    });

    if (rpcError) {
      console.error('Erro ao salvar conexão do Google Meet', rpcError);
      return jsonResponse({ error: rpcError.message }, 500);
    }

    return jsonResponse({ ok: true, google_email: email });
  } catch (err) {
    console.error('Erro ao conectar Google Meet', err);
    const mensagem = String(err instanceof Error ? err.message : err);
    return jsonResponse({ error: mensagem }, 502);
  }
});
