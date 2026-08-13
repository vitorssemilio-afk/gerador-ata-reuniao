const MEET_API_BASE = 'https://meet.googleapis.com/v2';

export type ConferenceRecord = {
  name: string; // ex: "conferenceRecords/abc123"
  startTime?: string;
  endTime?: string;
};

type Transcript = {
  name: string; // ex: "conferenceRecords/abc123/transcripts/xyz"
  state: 'STARTED' | 'ENDED' | 'FILE_GENERATED' | string;
};

type TranscriptEntry = {
  name: string;
  participant?: string; // resource name do participante
  text: string;
  startTime?: string;
};

type Participant = {
  name: string; // ex: "conferenceRecords/abc123/participants/456"
  signedinUser?: { displayName?: string };
  anonymousUser?: { displayName?: string };
  phoneUser?: { displayName?: string };
};

async function chamarMeetApi<T>(accessToken: string, path: string): Promise<T> {
  const resposta = await fetch(`${MEET_API_BASE}/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resposta.ok) {
    const texto = await resposta.text();
    throw new Error(`Meet API ${path} respondeu ${resposta.status}: ${texto}`);
  }

  return resposta.json();
}

export async function listarConferenciasRecentes(
  accessToken: string,
  desde: Date,
): Promise<ConferenceRecord[]> {
  const registros: ConferenceRecord[] = [];
  let pageToken: string | undefined;

  do {
    const query = new URLSearchParams({ pageSize: '50' });
    if (pageToken) query.set('pageToken', pageToken);

    const dados: { conferenceRecords?: ConferenceRecord[]; nextPageToken?: string } = await chamarMeetApi(
      accessToken,
      `conferenceRecords?${query.toString()}`,
    );

    for (const registro of dados.conferenceRecords ?? []) {
      // A API já devolve em ordem decrescente de início — para assim
      // que achar algo mais antigo que o corte, sem paginar o histórico
      // inteiro a cada verificação.
      if (registro.endTime && new Date(registro.endTime) <= desde) {
        return registros;
      }
      registros.push(registro);
    }

    pageToken = dados.nextPageToken;
  } while (pageToken);

  return registros;
}

async function listarParticipantes(accessToken: string, conferenceRecordName: string): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  let pageToken: string | undefined;

  do {
    const query = new URLSearchParams({ pageSize: '100' });
    if (pageToken) query.set('pageToken', pageToken);

    const dados: { participants?: Participant[]; nextPageToken?: string } = await chamarMeetApi(
      accessToken,
      `${conferenceRecordName}/participants?${query.toString()}`,
    );

    for (const participante of dados.participants ?? []) {
      const nome =
        participante.signedinUser?.displayName ??
        participante.anonymousUser?.displayName ??
        participante.phoneUser?.displayName ??
        'Participante';
      mapa.set(participante.name, nome);
    }

    pageToken = dados.nextPageToken;
  } while (pageToken);

  return mapa;
}

async function buscarTranscricaoFinalizada(
  accessToken: string,
  conferenceRecordName: string,
): Promise<Transcript | null> {
  const dados: { transcripts?: Transcript[] } = await chamarMeetApi(accessToken, `${conferenceRecordName}/transcripts`);
  // TEMP DEBUG — remover depois de confirmar o formato da resposta da API do Meet.
  console.log(`DEBUG transcripts de ${conferenceRecordName}:`, JSON.stringify(dados.transcripts ?? []));
  return (dados.transcripts ?? []).find((t) => t.state === 'ENDED' || t.state === 'FILE_GENERATED') ?? null;
}

async function listarEntradasTranscricao(accessToken: string, transcriptName: string): Promise<TranscriptEntry[]> {
  const entradas: TranscriptEntry[] = [];
  let pageToken: string | undefined;

  do {
    const query = new URLSearchParams({ pageSize: '100' });
    if (pageToken) query.set('pageToken', pageToken);

    const dados: { transcriptEntries?: TranscriptEntry[]; nextPageToken?: string } = await chamarMeetApi(
      accessToken,
      `${transcriptName}/entries?${query.toString()}`,
    );

    entradas.push(...(dados.transcriptEntries ?? []));
    pageToken = dados.nextPageToken;
  } while (pageToken);

  entradas.sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  return entradas;
}

// Monta a transcrição em texto corrido ("Nome: fala"), no mesmo
// formato que o parser de .vtt/.srt já produz — assim a Edge Function
// gerar-ata (e o prompt da IA) não precisam saber de onde a
// transcrição veio.
export async function obterTranscricaoDaReuniao(
  accessToken: string,
  conferenceRecordName: string,
): Promise<string | null> {
  const transcript = await buscarTranscricaoFinalizada(accessToken, conferenceRecordName);
  if (!transcript) return null;

  const [entradas, participantes] = await Promise.all([
    listarEntradasTranscricao(accessToken, transcript.name),
    listarParticipantes(accessToken, conferenceRecordName),
  ]);

  if (entradas.length === 0) return null;

  return entradas
    .map((entrada) => {
      const nome = entrada.participant ? participantes.get(entrada.participant) ?? 'Participante' : 'Participante';
      return `${nome}: ${entrada.text}`;
    })
    .join('\n');
}
