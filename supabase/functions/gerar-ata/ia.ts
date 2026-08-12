import { CHUNK_SUMMARY_SYSTEM_PROMPT, SYSTEM_PROMPT } from './prompt.ts';

export type AtaTopicoIA = { titulo: string; resumo: string };
export type AtaAcaoIA = { descricao: string; responsavel: string | null; prazo: string | null };

export type ResultadoAtaIA = {
  pauta: string;
  participantes_identificados: string[];
  topicos: AtaTopicoIA[];
  decisoes: string[];
  acoes: AtaAcaoIA[];
  pendencias: string[];
  proxima_reuniao: string | null;
};

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TENTATIVAS = 2;

// Transcrições de reuniões de 1h+ podem passar de 100 mil caracteres.
// Acima desse limiar, resumimos em pedaços antes de montar a ata final,
// pra não estourar o contexto nem perder qualidade por um prompt gigante.
const LIMITE_CARACTERES_SEM_CHUNK = 100_000;
const TAMANHO_CHUNK = 80_000;

async function chamarAnthropic(system: string, messages: ChatMessage[], maxTokens = 8000): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY não configurada nas secrets da função.');
  }

  const model = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5';

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      thinking: { type: 'disabled' },
      system,
      messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API respondeu ${response.status}: ${errorText}`);
  }

  const texto = await lerRespostaStream(response);
  if (!texto) {
    throw new Error('Resposta da IA não contém texto.');
  }
  return texto;
}

async function lerRespostaStream(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Resposta da IA sem corpo para leitura em stream.');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let texto = '';
  let stopReason: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const linhas = buffer.split('\n');
    buffer = linhas.pop() ?? '';

    for (const linha of linhas) {
      if (!linha.startsWith('data: ')) continue;
      const dados = linha.slice('data: '.length).trim();
      if (!dados) continue;

      let evento: Record<string, unknown>;
      try {
        evento = JSON.parse(dados);
      } catch {
        continue;
      }

      if (
        evento.type === 'content_block_delta' &&
        typeof evento.delta === 'object' &&
        evento.delta !== null &&
        (evento.delta as Record<string, unknown>).type === 'text_delta'
      ) {
        texto += String((evento.delta as Record<string, unknown>).text ?? '');
      }

      if (evento.type === 'message_delta' && typeof evento.delta === 'object' && evento.delta !== null) {
        const delta = evento.delta as Record<string, unknown>;
        if (typeof delta.stop_reason === 'string') {
          stopReason = delta.stop_reason;
        }
      }
    }
  }

  if (stopReason === 'max_tokens') {
    console.error('Resposta da IA foi cortada por atingir max_tokens.');
  }

  return texto;
}

function extrairJson(texto: string): string {
  const semEspacos = texto.trim();
  const fenceMatch = semEspacos.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1] : semEspacos;
}

function isAcaoIA(item: unknown): item is AtaAcaoIA {
  if (typeof item !== 'object' || item === null) return false;
  const a = item as Record<string, unknown>;
  return (
    typeof a.descricao === 'string' &&
    (typeof a.responsavel === 'string' || a.responsavel === null) &&
    (typeof a.prazo === 'string' || a.prazo === null)
  );
}

function isTopicoIA(item: unknown): item is AtaTopicoIA {
  if (typeof item !== 'object' || item === null) return false;
  const t = item as Record<string, unknown>;
  return typeof t.titulo === 'string' && typeof t.resumo === 'string';
}

function parseRespostaIA(texto: string): ResultadoAtaIA | null {
  let json: unknown;
  try {
    json = JSON.parse(extrairJson(texto));
  } catch {
    return null;
  }

  if (typeof json !== 'object' || json === null) return null;
  const obj = json as Record<string, unknown>;

  if (typeof obj.pauta !== 'string') return null;
  if (!Array.isArray(obj.topicos) || !obj.topicos.every(isTopicoIA)) return null;
  if (!Array.isArray(obj.decisoes) || !obj.decisoes.every((d) => typeof d === 'string')) return null;
  if (!Array.isArray(obj.acoes) || !obj.acoes.every(isAcaoIA)) return null;
  if (!Array.isArray(obj.pendencias) || !obj.pendencias.every((p) => typeof p === 'string')) return null;

  const participantes = Array.isArray(obj.participantes_identificados)
    ? obj.participantes_identificados.filter((p): p is string => typeof p === 'string')
    : [];

  return {
    pauta: obj.pauta,
    participantes_identificados: participantes,
    topicos: obj.topicos,
    decisoes: obj.decisoes as string[],
    acoes: obj.acoes,
    pendencias: obj.pendencias as string[],
    proxima_reuniao: typeof obj.proxima_reuniao === 'string' ? obj.proxima_reuniao : null,
  };
}

function dividirEmChunks(texto: string, tamanho: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < texto.length; i += tamanho) {
    chunks.push(texto.slice(i, i + tamanho));
  }
  return chunks;
}

async function resumirTranscricaoLonga(transcricao: string): Promise<string> {
  const chunks = dividirEmChunks(transcricao, TAMANHO_CHUNK);
  const resumos: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const resumo = await chamarAnthropic(
      CHUNK_SUMMARY_SYSTEM_PROMPT,
      [{ role: 'user', content: `Trecho ${i + 1} de ${chunks.length}:\n\n${chunks[i]}` }],
      4000,
    );
    resumos.push(`--- Notas do trecho ${i + 1}/${chunks.length} ---\n${resumo}`);
  }

  return resumos.join('\n\n');
}

export async function gerarAtaComIA(
  transcricao: string,
  metadados: { cliente: string; assunto: string; dataReuniao: string; participantes: string[] },
): Promise<ResultadoAtaIA> {
  const transcricaoParaIA =
    transcricao.length > LIMITE_CARACTERES_SEM_CHUNK
      ? await resumirTranscricaoLonga(transcricao)
      : transcricao;

  const prefixo = transcricao.length > LIMITE_CARACTERES_SEM_CHUNK
    ? 'Abaixo estão notas já resumidas por trechos de uma transcrição longa (a transcrição original foi dividida em partes por limite de tamanho). Monte a ata final consolidando essas notas.'
    : 'Abaixo está a transcrição completa da reunião.';

  const conteudo = `Cliente/Projeto: ${metadados.cliente}
Assunto: ${metadados.assunto}
Data: ${metadados.dataReuniao}
Participantes informados: ${metadados.participantes.length > 0 ? metadados.participantes.join(', ') : '(não informado — identifique pela transcrição, se possível)'}

${prefixo}

${transcricaoParaIA}`;

  const messages: ChatMessage[] = [{ role: 'user', content: conteudo }];

  for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa++) {
    const textoResposta = await chamarAnthropic(SYSTEM_PROMPT, messages, 8000);
    const resultado = parseRespostaIA(textoResposta);
    if (resultado) return resultado;

    console.error('Resposta da IA não era JSON válido:', textoResposta.slice(0, 3000));
    messages.push({ role: 'assistant', content: textoResposta });
    messages.push({
      role: 'user',
      content: 'Sua resposta anterior não era um JSON válido. Responda apenas com JSON válido, sem texto adicional.',
    });
  }

  throw new Error('A IA não retornou um JSON válido após nova tentativa.');
}
