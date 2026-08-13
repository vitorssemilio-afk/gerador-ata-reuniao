import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import type { ReuniaoMeetDetectada } from '../types/database';

function formatarDataHora(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR');
}

export function ReunioesDetectadas() {
  const [reunioes, setReunioes] = useState<ReuniaoMeetDetectada[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ignorando, setIgnorando] = useState<string | null>(null);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('reunioes_meet_detectadas')
      .select('*')
      .eq('status', 'pendente')
      .order('finalizado_em', { ascending: false });

    if (fetchError) setError(fetchError.message);
    else setReunioes(data ?? []);
    setLoading(false);
  }

  async function ignorar(id: string) {
    setIgnorando(id);
    const { error: updateError } = await supabase
      .from('reunioes_meet_detectadas')
      .update({ status: 'ignorada' })
      .eq('id', id);

    if (updateError) setError(updateError.message);
    else setReunioes((atual) => atual.filter((r) => r.id !== id));
    setIgnorando(null);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Reuniões detectadas</h1>
          <p className="field-hint">
            Reuniões do Google Meet com transcrição pronta, encontradas automaticamente pelas contas
            conectadas em <Link to="/integracoes">Integrações</Link>. Nenhuma ata é criada sem você
            confirmar.
          </p>
        </div>
      </div>

      {loading && <p className="page-loading">Carregando…</p>}
      {error && <p className="form-error">{error}</p>}

      {!loading && !error && reunioes.length === 0 && (
        <div className="empty-state">
          <p>Nenhuma reunião nova aguardando revisão.</p>
        </div>
      )}

      {!loading && reunioes.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Reunião</th>
                <th>Data</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reunioes.map((reuniao) => (
                <tr key={reuniao.id}>
                  <td>{reuniao.titulo ?? 'Reunião do Meet'}</td>
                  <td>{formatarDataHora(reuniao.finalizado_em)}</td>
                  <td className="table-actions">
                    <Link to={`/nova?reuniao_detectada_id=${reuniao.id}`} className="btn btn-secondary">
                      Criar ata
                    </Link>{' '}
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => ignorar(reuniao.id)}
                      disabled={ignorando === reuniao.id}
                    >
                      {ignorando === reuniao.id ? 'Ignorando…' : 'Ignorar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
