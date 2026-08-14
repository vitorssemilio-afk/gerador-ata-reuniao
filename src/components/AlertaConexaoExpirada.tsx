import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

// Aviso global (aparece em qualquer página) quando alguma conexão do
// Google Meet do usuário parou de funcionar — sem isso, o consultor só
// notaria a falha quando percebesse a ausência de reuniões novas.
export function AlertaConexaoExpirada() {
  const [emailsComErro, setEmailsComErro] = useState<string[]>([]);

  useEffect(() => {
    let ativo = true;

    async function verificar() {
      const { data } = await supabase
        .from('conexoes_google_meet')
        .select('google_email')
        .eq('status', 'erro');

      if (ativo) setEmailsComErro((data ?? []).map((c) => c.google_email));
    }

    verificar();
    return () => {
      ativo = false;
    };
  }, []);

  if (emailsComErro.length === 0) return null;

  return (
    <div className="alert-banner alert-banner-erro">
      <span>
        A conexão do Google Meet com {emailsComErro.join(', ')} expirou ou foi revogada — reuniões novas
        não estão sendo detectadas.
      </span>
      <Link to="/integracoes">Reconectar</Link>
    </div>
  );
}
