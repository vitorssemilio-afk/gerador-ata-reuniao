// Normaliza transcrições exportadas do Zoom/Google Meet (.vtt, .srt) ou
// texto solto (.txt / colado) para texto corrido, removendo timestamps e
// numeração de cue — o que sobra pro usuário colar direto na caixa de
// texto, ou o que a IA recebe como entrada.

const TIMESTAMP_VTT = /^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}/;
const TIMESTAMP_SRT_INDEX = /^\d+$/;

function limparVtt(conteudo: string): string {
  const linhas = conteudo.replace(/\r/g, '').split('\n');
  const resultado: string[] = [];

  for (const linhaBruta of linhas) {
    const linha = linhaBruta.trim();
    if (!linha) continue;
    if (linha === 'WEBVTT') continue;
    if (linha.startsWith('NOTE') || linha.startsWith('STYLE') || linha.startsWith('REGION')) continue;
    if (TIMESTAMP_VTT.test(linha)) continue;
    if (TIMESTAMP_SRT_INDEX.test(linha)) continue;
    // Remove tags de cue (<v Nome>...), preservando o texto.
    resultado.push(linha.replace(/<[^>]+>/g, ''));
  }

  return juntarLinhasRepetidas(resultado);
}

function limparSrt(conteudo: string): string {
  return limparVtt(conteudo);
}

// O Meet/Zoom costuma repetir a mesma linha "Nome: fala" em cues
// consecutivos por causa da legenda incremental. Colapsa duplicatas
// consecutivas idênticas.
function juntarLinhasRepetidas(linhas: string[]): string {
  const resultado: string[] = [];
  for (const linha of linhas) {
    if (resultado[resultado.length - 1] === linha) continue;
    resultado.push(linha);
  }
  return resultado.join('\n');
}

export function normalizarTranscricao(conteudo: string, nomeArquivo?: string): string {
  const extensao = nomeArquivo?.toLowerCase().split('.').pop();

  if (extensao === 'vtt') return limparVtt(conteudo);
  if (extensao === 'srt') return limparSrt(conteudo);

  // Sem extensão conhecida: detecta pelo conteúdo (upload sem nome, ou colado).
  const inicio = conteudo.trimStart().slice(0, 20);
  if (inicio.startsWith('WEBVTT')) return limparVtt(conteudo);
  if (TIMESTAMP_SRT_INDEX.test(conteudo.trimStart().split('\n')[0] ?? '')) return limparSrt(conteudo);

  return conteudo.trim();
}

export async function lerArquivoTranscricao(file: File): Promise<string> {
  const texto = await file.text();
  return normalizarTranscricao(texto, file.name);
}
