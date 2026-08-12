# Ata IA — Gerador de Ata de Reunião

App que recebe a transcrição de uma reunião online (Google Meet ou Zoom) e gera automaticamente
uma ata de reunião em dois formatos: um texto pronto pra colar no WhatsApp e um documento Word
(`.docx`) completo, com opção de salvar direto no Google Drive.

**v1 é upload manual da transcrição** — captura automática direto da API do Zoom/Meet fica pra v2,
porque exige aprovação de app e OAuth com escopos de gravação. O fluxo atual é: exportar a
transcrição do Zoom/Meet (`.vtt`/`.srt`, formato padrão de ambos) ou colar o texto, revisar/editar
o resultado da IA e só então copiar/baixar/salvar.

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
  identificar os falantes pela transcrição se não informado)
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
  - **Salvar no Google Drive**: só aparece se `VITE_GOOGLE_DRIVE_CLIENT_ID` estiver configurado
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
3. Copie o Client ID pra `VITE_GOOGLE_DRIVE_CLIENT_ID` no `.env.local`.

Sem essa variável configurada, o botão "Salvar no Google Drive" simplesmente não aparece — baixar
o `.docx` manualmente continua funcionando normalmente.

## Tabela `atas_reuniao`

Guarda cliente/projeto, assunto, data/horário, participantes, a transcrição original, `status`
(`rascunho` → `processando_ia` → `revisao` → `concluida`, ou `erro`), todos os campos estruturados
que a IA extraiu, o texto final do WhatsApp (editável, sobrescreve o gerado automaticamente ao
salvar) e o `id`/link do arquivo no Drive quando salvo lá. RLS liberado pra qualquer usuário
autenticado — é um histórico compartilhado por quem usa o app.
