const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

export type TokensGoogle = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

function credenciaisOAuth(): { clientId: string; clientSecret: string } {
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET não configuradas nas secrets da função.');
  }
  return { clientId, clientSecret };
}

export async function trocarCodePorTokens(code: string, redirectUri: string): Promise<TokensGoogle> {
  const { clientId, clientSecret } = credenciaisOAuth();

  const resposta = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!resposta.ok) {
    const texto = await resposta.text();
    throw new Error(`Falha ao trocar code por tokens: ${resposta.status} ${texto}`);
  }

  return resposta.json();
}

export async function renovarAccessToken(refreshToken: string): Promise<TokensGoogle> {
  const { clientId, clientSecret } = credenciaisOAuth();

  const resposta = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });

  if (!resposta.ok) {
    const texto = await resposta.text();
    throw new Error(`Falha ao renovar access token: ${resposta.status} ${texto}`);
  }

  return resposta.json();
}

export async function obterEmailDoToken(accessToken: string): Promise<string> {
  const resposta = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resposta.ok) {
    const texto = await resposta.text();
    throw new Error(`Falha ao obter e-mail do usuário: ${resposta.status} ${texto}`);
  }

  const dados = await resposta.json();
  if (typeof dados.email !== 'string') {
    throw new Error('Resposta do Google não trouxe e-mail do usuário.');
  }
  return dados.email;
}
