import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { urlCallbackGoogleMeet } from '../lib/googleMeetAuth';
import { supabase } from '../lib/supabaseClient';

type Estado = 'processando' | 'sucesso' | 'erro';

export function ConectarGoogleCallback() {
  const [searchParams] = useSearchParams();
  const [estado, setEstado] = useState<Estado>('processando');
  const [mensagem, setMensagem] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const erroOAuth = searchParams.get('error');

    if (erroOAuth) {
      setEstado('erro');
      setMensagem(
        erroOAuth === 'access_denied'
          ? 'Você cancelou a autorização.'
          : `O Google recusou a autorização: ${erroOAuth}`,
      );
      return;
    }

    if (!code) {
      setEstado('erro');
      setMensagem('Nenhum código de autorização recebido do Google.');
      return;
    }

    supabase.functions
      .invoke('google-meet-conectar', { body: { code, redirect_uri: urlCallbackGoogleMeet() } })
      .then(({ data, error }) => {
        if (error || data?.error) {
          setEstado('erro');
          setMensagem(data?.error ?? error?.message ?? 'Falha ao conectar com o Google.');
          return;
        }
        setEstado('sucesso');
        setMensagem(data?.google_email ?? null);
      });
    // Roda só uma vez, ao montar — o "code" só pode ser trocado uma vez pelo Google.
  }, [searchParams]);

  return (
    <div className="auth-screen">
      <div className="auth-card">
        {estado === 'processando' && <p className="page-loading">Conectando com o Google…</p>}

        {estado === 'sucesso' && (
          <div className="auth-form">
            <p className="form-info">Conta {mensagem} conectada com sucesso.</p>
            <Link to="/integracoes" className="btn btn-primary">
              Voltar pra Integrações
            </Link>
          </div>
        )}

        {estado === 'erro' && (
          <div className="auth-form">
            <p className="form-error">{mensagem}</p>
            <Link to="/integracoes" className="btn btn-secondary">
              Voltar pra Integrações
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
