# Ata IA — Gerador de Ata de Reunião

App que recebe a transcrição de uma reunião online (Google Meet ou Zoom) e gera automaticamente
uma ata de reunião em dois formatos: um texto pronto pra colar no WhatsApp e um documento Word
(`.docx`) completo, com opção de salvar direto no Google Drive.

**v1 é upload manual da transcrição** (exportar `.vtt`/`.srt` do Zoom/Meet ou colar o texto).
A partir da v2, quem usa Google Meet com Workspace pode conectar a própria conta e deixar o app
detectar reuniões novas sozinho — ver seção "Captura automática (Google Meet)" abaixo. Em ambos os
casos, o resultado da IA sempre passa por revisão humana antes de copiar/baixar/salvar.

## Setup

1. Crie um projeto no [Supabase](https://supabase.com).
2. Rode a migration em `supabase/migrations/0001_init.sql` no SQL Editor do Supabase, ou
   `supabase db push` via CLI.
3. Copie `.env.example` para `.env.local` e preencha com a URL e a anon key do seu projeto.
4. Ative Email/Password em Authentication → Providers no painel do Supabase.
5. Configure a Edge Function `gerar-ata` (ver seção abaixo).

```bash
npm install
npm run dev
```

## Estrutura

- `/login` — autenticação (login/cadastro)
- `/` — histórico de atas geradas, com busca por cliente, assunto ou data
- `/nova` — upload do arquivo (`.txt`/`.vtt`/`.srt`) ou colar a transcrição, mais os metadados da
  reunião (cliente/projeto, assunto, data, horário, participantes — opcional, a IA tenta
  identificar os falantes pela transcrição se não informado). Quando aberta a partir de uma
  reunião detectada automaticamente (`?reuniao_detectada_id=...`), a transcrição já vem
  pré-carregada
- `/integracoes` — conectar/desconectar contas Google Meet pra captura automática
- `/reunioes-detectadas` — reuniões novas que a verificação automática encontrou, aguardando
  revisão (criar ata ou ignorar)
- `/:id` — revisão: todos os campos que a IA extraiu (pauta, tópicos discutidos, decisões, ações
  com responsável/prazo, pendências, próxima reunião) ficam editáveis antes de finalizar — a IA
  erra nome e prazo às vezes, por isso a v1 nunca envia nada automaticamente, sempre passa por
  revisão humana. A partir daí:
  - **Copiar para WhatsApp**: texto corrido com emojis e `*negrito*` (compatível com a formatação
    do WhatsApp), gerado a partir dos campos estruturados e também editável direto na caixa antes
    de copiar
  - **Baixar Word (.docx)**: documento com título, tabela de cabeçalho (cliente/data/participantes),
    uma seção por tópico discutido, tabela de ações e listas de decisões/pendências — gerado no
    navegador com a biblioteca `docx` (`src/lib/exportAtaDocx.ts`), sem precisar de backend
  - **Salvar no Google Drive**: só aparece se `VITE_GOOGLE_OAUTH_CLIENT_ID` estiver configurado
    (ver abaixo); cria (ou reaproveita) uma pasta `Atas de Reunião/<Cliente>` e sobe o `.docx` lá,
    nomeado `Ata_<Cliente>_<dd-mm-aaaa>.docx`

## Transcrição — parsing e limite de contexto

`src/lib/parseTranscricao.ts` limpa o `.vtt`/`.srt` antes de mandar pra IA: remove timestamps,
numeração de cue e tags de formatação, e colapsa linhas repetidas consecutivas (comum em legenda
incremental do Meet/Zoom) — sobra só o texto corrido com os nomes dos falantes.

Reuniões de 1h+ podem gerar transcrições muito longas. A Edge Function `gerar-ata` (mais
especificamente `supabase/functions/gerar-ata/ia.ts`) divide a transcrição em pedaços de ~80 mil
caracteres quando ela passa de 100 mil, resume cada pedaço isoladamente (sem tentar tirar
conclusões gerais nesse passo) e só então monta a ata final consolidando esses resumos — em vez de
mandar o texto inteiro de uma vez e arriscar estourar o contexto ou perder qualidade num prompt
gigante.

## Edge Function `gerar-ata`

Recebe `ata_id`, busca a transcrição salva em `atas_reuniao`, chama a API da Anthropic (Messages
API, `https://api.anthropic.com/v1/messages`) e grava o resultado estruturado (pauta, tópicos,
decisões, ações, pendências, próxima reunião) de volta na mesma linha, avançando `status` de
`processando_ia` para `revisao` (ou `erro`, com a mensagem em `erro_ia`, se a chamada falhar).

Gere uma chave em [console.anthropic.com](https://console.anthropic.com) → **API Keys**.

Deploy e configuração via [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase functions deploy gerar-ata
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
# opcional — sobrescreve o modelo padrão (claude-sonnet-5)
supabase secrets set ANTHROPIC_MODEL=claude-sonnet-5
```

`SUPABASE_URL` e `SUPABASE_ANON_KEY` já ficam disponíveis automaticamente no runtime da função. A
função usa o JWT do usuário autenticado (repassado pelo front via `supabase.functions.invoke`)
para ler/gravar os dados, então o RLS garante que só usuários autenticados acessam os dados.

## Google Drive (opcional)

O upload usa [Google Identity Services](https://developers.google.com/identity/oauth2/web/guides/overview)
direto do navegador (sem backend/service account), com o escopo `drive.file` — o app só enxerga e
gerencia os arquivos/pastas que ele mesmo cria, nunca o Drive inteiro do usuário logado.

1. No [Google Cloud Console](https://console.cloud.google.com/apis/credentials), crie um **OAuth
   client ID** do tipo "Web application".
2. Em "Authorized JavaScript origins", adicione a URL onde o app roda (ex:
   `http://localhost:5173` em dev, e o domínio de produção).
3. Copie o Client ID pra `VITE_GOOGLE_OAUTH_CLIENT_ID` no `.env.local`.

Sem essa variável configurada, o botão "Salvar no Google Drive" simplesmente não aparece — baixar
o `.docx` manualmente continua funcionando normalmente.

## Captura automática (Google Meet)

Cada consultor conecta a própria conta Google em `/integracoes`. A partir daí, uma Edge Function
agendada (`verificar-reunioes-meet`) roda periodicamente, verifica se teve reunião nova com
transcrição pronta na API do Google Meet, e grava em `/reunioes-detectadas` — sem gerar nenhuma ata
sozinha, sempre esperando o consultor revisar e confirmar.

**Só funciona pra contas Google Workspace com a transcrição de reuniões do Meet habilitada**
(Business Standard ou superior) — conta Gmail pessoal não gera transcrição nenhuma.

### 1. Habilitar a API do Meet e os escopos

No mesmo projeto do Google Cloud usado pro Drive:

1. **APIs e Serviços → Biblioteca** → procura "Google Meet API" → **Ativar**
2. **APIs e Serviços → Credenciais** → abre o Client ID OAuth que você já criou pro Drive → copia o
   **Client Secret** (diferente do Client ID — esse aqui é secreto, nunca vai pro front)
3. No mesmo Client ID, em **URIs de redirecionamento autorizados**, adiciona:
   `http://localhost:5173/conectar-google/callback` (e a URL de produção, quando publicar)
4. Na **Tela de consentimento OAuth**, garante que os escopos `.../auth/meetings.space.readonly` e
   `email` estão liberados (o app já pede os dois automaticamente na hora de conectar — só
   confirma que a tela de consentimento não bloqueia escopo sensível sem estar configurada)

Como o escopo do Meet é "sensível", quem for conectar vê um aviso de "app não verificado" — pra uso
interno com poucos consultores (até 100), dá pra seguir assim sem passar pela verificação completa
do Google.

### 2. Secrets da Edge Function

```bash
supabase secrets set GOOGLE_OAUTH_CLIENT_ID=seu-client-id.apps.googleusercontent.com
supabase secrets set GOOGLE_OAUTH_CLIENT_SECRET=seu-client-secret
```

### 3. Chave de criptografia no Supabase Vault

O refresh token de cada consultor fica criptografado no banco (nunca em texto puro). Ative o Vault
em **Database → Extensions → supabase_vault** (se ainda não estiver ativo) e crie um secret chamado
`google_meet_oauth_key` com um valor aleatório forte — pelo SQL Editor:

```sql
select vault.create_secret('cole-aqui-um-valor-aleatorio-forte', 'google_meet_oauth_key');
```

(gere o valor aleatório com `openssl rand -hex 32`, por exemplo — guarde num gerenciador de senhas,
não precisa lembrar dele, só existe pra isso)

### 4. Deploy das funções

`verificar-reunioes-meet` é chamada pelo cron com um segredo próprio (`CRON_SECRET`, configurado no
próximo passo), não com um JWT do Supabase — por isso o deploy dela precisa da flag
`--no-verify-jwt`, senão o próprio Supabase bloqueia a chamada antes de chegar no código da função.

```bash
supabase functions deploy google-meet-conectar
supabase functions deploy verificar-reunioes-meet --no-verify-jwt
```

### 5. Agendar a verificação periódica

`verificar-reunioes-meet` não é chamada pelo front — precisa de um cron chamando ela por fora,
autenticado com um segredo próprio (`CRON_SECRET`) que só o cron e a função conhecem. Não usa a
`service_role key` do painel pra isso — o formato dela varia entre versões/projetos do Supabase, o
que tornaria a comparação frágil.

Gera um valor aleatório forte (ex: `openssl rand -hex 32`, ou no PowerShell:
`-join ((48..57) + (97..102) | Get-Random -Count 64 | ForEach-Object {[char]$_})`) e usa o **mesmo
valor** nos dois lados:

```bash
supabase secrets set CRON_SECRET=cole-aqui-o-valor-gerado
```

Com as extensões `pg_cron` e `pg_net` ativas (**Database → Extensions**), guarda o mesmo valor no
Vault e agenda o job pelo SQL Editor:

```sql
select vault.create_secret('cole-aqui-o-mesmo-valor-gerado', 'cron_secret');

select cron.schedule(
  'verificar-reunioes-meet',
  '*/15 * * * *', -- a cada 15 minutos; ajuste como preferir
  $$
  select net.http_post(
    url := 'https://SEU_PROJECT_REF.supabase.co/functions/v1/verificar-reunioes-meet',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    -- a função consulta a API do Meet várias vezes em sequência (uma
    -- reunião por vez) — o timeout padrão do pg_net (5s) estoura fácil
    -- com mais de uma conexão/reunião pra verificar.
    timeout_milliseconds := 30000
  );
  $$
);
```

A função usa essa mesma service role key (repassada no header `Authorization`) como autenticação —
ela roda sem usuário logado, então não faz sentido usar JWT de sessão.

### Como funciona por dentro

- **Conexão** (`/integracoes` → `iniciarConexaoGoogleMeet`, `src/lib/googleMeetAuth.ts`): monta a URL
  de autorização do Google (`access_type=offline`, `prompt=consent` — garante que sempre vem um
  refresh token) e redireciona. O Google volta pra `/conectar-google/callback` com um `code`.
- **Troca do code** (Edge Function `google-meet-conectar`): o `code` só pode ser usado uma vez, e a
  troca por tokens exige o Client Secret — por isso acontece no servidor, nunca no navegador. Salva
  o refresh token criptografado via `salvar_conexao_google_meet` (RPC).
- **Verificação periódica** (Edge Function `verificar-reunioes-meet`, `meetApi.ts`): pra cada conexão,
  renova o access token, lista `conferenceRecords` terminados desde a última verificação, busca a
  transcrição de cada um (`transcripts` → `entries`, com os nomes dos participantes resolvidos via
  `participants`), monta o texto no formato `Nome: fala` (mesmo formato que o parser de `.vtt`/`.srt`
  já produz) e grava em `reunioes_meet_detectadas` — deduplicado por `conference_record_name`.
- **Revisão** (`/reunioes-detectadas`): lista as reuniões pendentes; "Criar ata" abre `/nova` com a
  transcrição pré-carregada (só falta cliente/projeto e assunto), "Ignorar" descarta.

### Tabelas `conexoes_google_meet` e `reunioes_meet_detectadas`

`conexoes_google_meet` guarda uma linha por consultor conectado (e-mail da conta Google, refresh
token criptografado, última verificação) — RLS restrito ao próprio usuário; o refresh token só é
lido pela função `listar_conexoes_google_meet_para_verificacao`, restrita à `service_role`, nunca
pelo client. `reunioes_meet_detectadas` guarda as reuniões encontradas (`status`: `pendente` →
`ata_criada` ou `ignorada`), também restrita ao próprio usuário via RLS.

## Tabela `atas_reuniao`

Guarda cliente/projeto, assunto, data/horário, participantes, a transcrição original, `status`
(`rascunho` → `processando_ia` → `revisao` → `concluida`, ou `erro`), todos os campos estruturados
que a IA extraiu, o texto final do WhatsApp (editável, sobrescreve o gerado automaticamente ao
salvar) e o `id`/link do arquivo no Drive quando salvo lá. RLS liberado pra qualquer usuário
autenticado — é um histórico compartilhado por quem usa o app.
