import { useEffect, useState } from 'react';
import { googleMeetConfigurado, iniciarConexaoGoogleMeet } from '../lib/googleMeetAuth';
import { supabase } from '../lib/supabaseClient';
import type { ConexaoGoogleMeet } from '../types/database';

function formatarDataHora(iso: string | null): string {
  if (!iso) return 'nunca';
  return new Date(iso).toLocaleString('pt-BR');
}

export function Integracoes() {
  const [conexoes, setConexoes] = useState<ConexaoGoogleMeet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<string | null>(null);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('conexoes_google_meet')
      .select('*')
      .order('created_at', { ascending: false });

    if (fetchError) setError(fetchError.message);
    else setConexoes(data ?? []);
    setLoading(false);
  }

  async function desconectar(id: string) {
    setRemovendo(id);
    const { error: deleteError } = await supabase.from('conexoes_google_meet').delete().eq('id', id);
    if (deleteError) setError(deleteError.message);
    else setConexoes((atual) => atual.filter((c) => c.id !== id));
    setRemovendo(null);
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Integrações</h1>
      </div>

      <div className="card form-card">
        <h2>Google Meet — captura automática</h2>
        <p className="field-hint">
          Conecta sua conta Google (precisa ser Workspace com transcrição de reuniões habilitada). A
          partir daí, reuniões novas com transcrição pronta aparecem em{' '}
          <strong>Reuniões detectadas</strong> pra você revisar e gerar a ata — nada é criado
          automaticamente sem sua confirmação.
        </p>

        {!googleMeetConfigurado() && (
          <p className="form-error">
            VITE_GOOGLE_OAUTH_CLIENT_ID não configurado — veja o README pra habilitar essa
            integração.
          </p>
        )}

        {error && <p className="form-error">{error}</p>}
        {loading && <p className="page-loading">Carregando…</p>}

        {!loading && conexoes.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Conta Google</th>
                  <th>Última verificação</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {conexoes.map((conexao) => (
                  <tr key={conexao.id}>
                    <td>{conexao.google_email}</td>
                    <td>{formatarDataHora(conexao.ultima_verificacao)}</td>
                    <td>
                      {conexao.status === 'erro' ? (
                        <span className="badge badge-erro" title={conexao.ultimo_erro ?? undefined}>
                          Precisa reconectar
                        </span>
                      ) : (
                        <span className="badge badge-ok">Conectada</span>
                      )}
                    </td>
                    <td className="table-actions">
                      {conexao.status === 'erro' && (
                        <button type="button" className="link-button" onClick={iniciarConexaoGoogleMeet}>
                          Reconectar
                        </button>
                      )}
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => desconectar(conexao.id)}
                        disabled={removendo === conexao.id}
                      >
                        {removendo === conexao.id ? 'Removendo…' : 'Desconectar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button
          type="button"
          className="btn btn-primary btn-auto"
          onClick={iniciarConexaoGoogleMeet}
          disabled={!googleMeetConfigurado()}
        >
          + Conectar conta Google
        </button>
      </div>
    </div>
  );
}
