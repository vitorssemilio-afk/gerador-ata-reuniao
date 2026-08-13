// Conexão com o Google Meet via OAuth "authorization code" (diferente
// do fluxo usado pro Drive — aqui precisamos de um refresh token de
// longa duração, porque a verificação de reuniões novas roda em
// segundo plano, sem o consultor com o app aberto). A troca do code
// pelos tokens acontece só no servidor (Edge Function
// google-meet-conectar), nunca no navegador — exige o Client Secret,
// que não pode ficar exposto no front.

// "email" além do escopo do Meet: é o que faz o endpoint de userinfo
// (chamado pela Edge Function google-meet-conectar pra identificar a
// conta conectada) devolver o e-mail — sem ele a resposta vem sem esse
// campo, mesmo com o access token válido.
const MEET_SCOPE = 'https://www.googleapis.com/auth/meetings.space.readonly email';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

export function googleMeetConfigurado(): boolean {
  return Boolean(import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID);
}

export function urlCallbackGoogleMeet(): string {
  return `${window.location.origin}/conectar-google/callback`;
}

// Reaproveita o mesmo Client ID OAuth já usado pro Google Drive (é o
// mesmo tipo de credencial "Aplicativo da Web" no Google Cloud) — só
// precisa garantir que a URL de callback abaixo esteja cadastrada nas
// "Origens JavaScript autorizadas" e nos "URIs de redirecionamento
// autorizados" desse Client ID.
export function iniciarConexaoGoogleMeet(): void {
  const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) {
    throw new Error('VITE_GOOGLE_OAUTH_CLIENT_ID não configurado. Veja .env.example.');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: urlCallbackGoogleMeet(),
    response_type: 'code',
    scope: MEET_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  });

  window.location.href = `${GOOGLE_AUTH_URL}?${params.toString()}`;
}
