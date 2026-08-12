import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { lerArquivoTranscricao, normalizarTranscricao } from '../lib/parseTranscricao';
import { supabase } from '../lib/supabaseClient';

const EXTENSOES_ACEITAS = '.txt,.vtt,.srt';

export function NovaAta() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cliente, setCliente] = useState('');
  const [assunto, setAssunto] = useState('');
  const [dataReuniao, setDataReuniao] = useState(() => new Date().toISOString().slice(0, 10));
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFim, setHoraFim] = useState('');
  const [participantes, setParticipantes] = useState('');
  const [transcricao, setTranscricao] = useState('');
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const texto = await lerArquivoTranscricao(file);
      setTranscricao(texto);
      setNomeArquivo(file.name);
    } catch {
      setError('Não foi possível ler o arquivo enviado.');
    }
  }

  function limparArquivo() {
    setNomeArquivo(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);

    const transcricaoFinal = normalizarTranscricao(transcricao);
    if (!transcricaoFinal.trim()) {
      setError('Cole ou envie a transcrição da reunião.');
      return;
    }
    if (!cliente.trim() || !assunto.trim() || !dataReuniao) {
      setError('Preencha cliente/projeto, assunto e data.');
      return;
    }

    setEnviando(true);

    const participantesLista = participantes
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    const { data: ata, error: insertError } = await supabase
      .from('atas_reuniao')
      .insert({
        user_id: user.id,
        cliente: cliente.trim(),
        assunto: assunto.trim(),
        data_reuniao: dataReuniao,
        hora_inicio: horaInicio || null,
        hora_fim: horaFim || null,
        participantes: participantesLista,
        transcricao: transcricaoFinal,
        status: 'processando_ia',
      })
      .select()
      .single();

    if (insertError || !ata) {
      setError(insertError?.message ?? 'Erro ao criar a ata.');
      setEnviando(false);
      return;
    }

    await supabase.functions.invoke('gerar-ata', {
      body: { ata_id: ata.id },
    });

    navigate(`/${ata.id}`, { replace: true });
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Nova ata de reunião</h1>
      </div>

      <form className="card form-card" onSubmit={handleSubmit}>
        {error && <p className="form-error">{error}</p>}

        <div className="form-grid">
          <label className="field">
            <span>Cliente / Projeto</span>
            <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Ex: Studio Nova" required />
          </label>
          <label className="field">
            <span>Assunto da reunião</span>
            <input
              value={assunto}
              onChange={(e) => setAssunto(e.target.value)}
              placeholder="Ex: Kickoff de implementação"
              required
            />
          </label>
          <label className="field">
            <span>Data</span>
            <input type="date" value={dataReuniao} onChange={(e) => setDataReuniao(e.target.value)} required />
          </label>
          <label className="field">
            <span>Horário início</span>
            <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
          </label>
          <label className="field">
            <span>Horário fim</span>
            <input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
          </label>
          <label className="field field-full">
            <span>Participantes (opcional — separe por vírgula; se vazio, a IA tenta identificar pela transcrição)</span>
            <input
              value={participantes}
              onChange={(e) => setParticipantes(e.target.value)}
              placeholder="Fulano, Ciclano, Beltrano"
            />
          </label>
        </div>

        <label className="field field-full">
          <span>Transcrição (.txt, .vtt ou .srt exportado do Zoom/Meet)</span>
          <input ref={fileInputRef} type="file" accept={EXTENSOES_ACEITAS} onChange={handleArquivo} />
          {nomeArquivo && (
            <span className="field-hint">
              Arquivo carregado: {nomeArquivo}{' '}
              <button type="button" className="link-button" onClick={limparArquivo}>
                remover
              </button>
            </span>
          )}
        </label>

        <label className="field field-full">
          <span>Ou cole o texto da transcrição aqui</span>
          <textarea
            rows={10}
            value={transcricao}
            onChange={(e) => {
              setTranscricao(e.target.value);
              setNomeArquivo(null);
            }}
            placeholder="Cole aqui a transcrição da reunião…"
          />
        </label>

        <button type="submit" className="btn btn-primary btn-auto" disabled={enviando}>
          {enviando ? 'Gerando ata…' : 'Gerar ata com IA'}
        </button>
      </form>
    </div>
  );
}
