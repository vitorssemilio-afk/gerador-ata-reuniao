// Integração com Google Drive via Google Identity Services (OAuth2,
// escopo drive.file — o app só enxerga/gerencia os arquivos e pastas que
// ele mesmo cria, nunca o Drive inteiro do usuário).
//
// Requer VITE_GOOGLE_OAUTH_CLIENT_ID configurado (Client ID OAuth2 do
// tipo "Web application" no Google Cloud Console, com o domínio do app
// autorizado). Sem isso, a funcionalidade de salvar no Drive fica
// desabilitada e o usuário ainda pode baixar o .docx manualmente.

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const PASTA_RAIZ_NOME = 'Atas de Reunião';

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }): { requestAccessToken: (opts?: { prompt?: string }) => void };
        };
      };
    };
  }
}

let scriptPromise: Promise<void> | null = null;

function carregarScriptGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar o script do Google Identity Services.'));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

let accessTokenCache: { token: string; expiraEm: number } | null = null;

export function googleDriveConfigurado(): boolean {
  return Boolean(import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID);
}

export async function obterTokenAcessoDrive(): Promise<string> {
  const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) {
    throw new Error('VITE_GOOGLE_OAUTH_CLIENT_ID não configurado. Veja .env.example.');
  }

  if (accessTokenCache && accessTokenCache.expiraEm > Date.now()) {
    return accessTokenCache.token;
  }

  await carregarScriptGis();

  return new Promise((resolve, reject) => {
    const cliente = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error || 'Não foi possível obter acesso ao Google Drive.'));
          return;
        }
        accessTokenCache = { token: response.access_token, expiraEm: Date.now() + 55 * 60 * 1000 };
        resolve(response.access_token);
      },
    });
    cliente.requestAccessToken({ prompt: '' });
  });
}

async function buscarPasta(token: string, nome: string, parentId?: string): Promise<string | null> {
  const partesQuery = [
    `name = '${nome.replace(/'/g, "\\'")}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
  ];
  if (parentId) partesQuery.push(`'${parentId}' in parents`);

  const url = `${DRIVE_API}/files?q=${encodeURIComponent(partesQuery.join(' and '))}&fields=files(id,name)`;
  const resposta = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resposta.ok) throw new Error(`Falha ao buscar pasta no Drive: ${resposta.status}`);
  const dados = await resposta.json();
  return dados.files?.[0]?.id ?? null;
}

async function criarPasta(token: string, nome: string, parentId?: string): Promise<string> {
  const resposta = await fetch(`${DRIVE_API}/files?fields=id`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: nome,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  if (!resposta.ok) throw new Error(`Falha ao criar pasta no Drive: ${resposta.status}`);
  const dados = await resposta.json();
  return dados.id;
}

async function garantirPasta(token: string, nome: string, parentId?: string): Promise<string> {
  const existente = await buscarPasta(token, nome, parentId);
  if (existente) return existente;
  return criarPasta(token, nome, parentId);
}

export async function salvarAtaNoDrive(
  clienteNome: string,
  nomeArquivo: string,
  blob: Blob,
): Promise<{ id: string; link: string }> {
  const token = await obterTokenAcessoDrive();

  const pastaRaizId = await garantirPasta(token, PASTA_RAIZ_NOME);
  const pastaClienteId = await garantirPasta(token, clienteNome, pastaRaizId);

  const metadata = {
    name: nomeArquivo,
    parents: [pastaClienteId],
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };

  const boundary = `-------drive-upload-${Date.now()}`;
  const arrayBuffer = await blob.arrayBuffer();
  const corpo = new Blob([
    `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\ncontent-type: ${metadata.mimeType}\r\n\r\n`,
    arrayBuffer,
    `\r\n--${boundary}--`,
  ]);

  const resposta = await fetch(`${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,webViewLink`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': `multipart/related; boundary=${boundary}`,
    },
    body: corpo,
  });

  if (!resposta.ok) {
    const texto = await resposta.text();
    throw new Error(`Falha ao enviar arquivo para o Drive: ${resposta.status} ${texto}`);
  }

  const dados = await resposta.json();
  return { id: dados.id, link: dados.webViewLink };
}
