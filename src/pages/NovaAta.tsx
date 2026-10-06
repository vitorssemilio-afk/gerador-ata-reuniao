import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ClienteSelect } from '../components/ClienteSelect';
import { useAuth } from '../contexts/AuthContext';
import { lerArquivoTranscricao, normalizarTranscricao } from '../lib/parseTranscricao';
import { supabase } from '../lib/supabaseClient';

const EXTENSOES_ACEITAS = '.txt,.vtt,.srt';

function horaLocal(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toTimeString().slice(0, 5);
}

export function NovaAta() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reuniaoDetectadaId = searchParams.get('reuniao_detectada_id');
  const clienteNomePreSelecionado = searchParams.get('cliente_nome');

  const [cliente, setCliente] = useState(clienteNomePreSelecionado ?? '');
  const [assunto, setAssunto] = useState('');
  const [dataReuniao, setDataReuniao] = useState(() => new Date().toISOString().slice(0, 10));
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFim, setHoraFim] = useState('');
  const [participantes, setParticipantes] = useState('');
  const [transcricao, setTranscricao] = useState('');
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [carregandoDetectada, setCarregandoDetectada] = useState(Boolean(reuniaoDetectadaId));

  useEffect(() => {
    if (!reuniaoDetectadaId) return;

    supabase
      .from('reunioes_meet_detectadas')
      .select('*')
      .eq('id', reuniaoDetectadaId)
      .single()
      .then(({ data, error: fetchError }) => {
        if (fetchError || !data) {
          setError(fetchError?.message ?? 'Reunião detectada não encontrada.');
        } else {
          setAssunto(data.titulo ?? '');
          if (data.iniciado_em) setDataReuniao(new Date(data.iniciado_em).toISOString().slice(0, 10));
          setHoraInicio(horaLocal(data.iniciado_em));
          setHoraFim(horaLocal(data.finalizado_em));
          setTranscricao(data.transcricao);
        }
        setCarregandoDetectada(false);
      });
  }, [reuniaoDetectadaId]);

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

    const { data: clienteCadastrado, error: clienteError } = await supabase.rpc('obter_ou_criar_cliente', {
      p_nome: cliente,
    });

    if (clienteError || !clienteCadastrado) {
      setError(clienteError?.message ?? 'Erro ao vincular o cliente.');
      setEnviando(false);
      return;
    }

    const participantesLista = participantes
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    const { data: ata, error: insertError } = await supabase
      .from('atas_reuniao')
      .insert({
        user_id: user.id,
        cliente: clienteCadastrado.nome,
        cliente_id: clienteCadastrado.id,
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

    if (reuniaoDetectadaId) {
      await supabase
        .from('reunioes_meet_detectadas')
        .update({ status: 'ata_criada', ata_id: ata.id })
        .eq('id', reuniaoDetectadaId);
    }

    await supabase.functions.invoke('gerar-ata', {
      body: { ata_id: ata.id },
    });

    navigate(`/${ata.id}`, { replace: true });
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>{clienteNomePreSelecionado ? `Nova ata — ${clienteNomePreSelecionado}` : 'Nova ata de reunião'}</h1>
      </div>

      {reuniaoDetectadaId && (
        <p className="form-info">
          Transcrição pré-carregada de uma reunião detectada automaticamente no Google Meet. Só
          falta preencher cliente/projeto e assunto.
        </p>
      )}

      <form className="card form-card" onSubmit={handleSubmit}>
        {error && <p className="form-error">{error}</p>}

        <div className="form-grid">
          <ClienteSelect
            label="Cliente / Projeto"
            value={cliente}
            onChange={(nome) => setCliente(nome)}
            placeholder="Ex: Studio Nova"
            required
          />
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

        {!reuniaoDetectadaId && (
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
        )}

        <label className="field field-full">
          <span>{reuniaoDetectadaId ? 'Transcrição (capturada automaticamente — pode editar)' : 'Ou cole o texto da transcrição aqui'}</span>
          <textarea
            rows={10}
            value={transcricao}
            onChange={(e) => {
              setTranscricao(e.target.value);
              setNomeArquivo(null);
            }}
            placeholder="Cole aqui a transcrição da reunião…"
            disabled={carregandoDetectada}
          />
        </label>

        <button type="submit" className="btn btn-primary btn-auto" disabled={enviando || carregandoDetectada}>
          {enviando ? 'Gerando ata…' : 'Gerar ata com IA'}
        </button>
      </form>
    </div>
  );
}
