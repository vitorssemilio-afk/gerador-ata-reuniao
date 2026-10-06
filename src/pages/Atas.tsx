import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AtasListagem } from '../components/AtasListagem';
import { supabase } from '../lib/supabaseClient';
import type { AtaReuniao } from '../types/database';

export function Atas() {
  const [atas, setAtas] = useState<AtaReuniao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('atas_reuniao')
        .select('*')
        .order('data_reuniao', { ascending: false });

      if (cancelled) return;

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setAtas(data ?? []);
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Todas as atas</h1>
          <p className="field-hint">Histórico completo, de todos os clientes.</p>
        </div>
        <Link to="/nova" className="btn btn-primary">
          + Nova ata
        </Link>
      </div>

      {loading && <p className="page-loading">Carregando…</p>}
      {error && <p className="form-error">{error}</p>}

      {!loading && !error && atas.length === 0 && (
        <div className="empty-state">
          <p>Nenhuma ata gerada ainda.</p>
          <Link to="/nova" className="btn btn-primary">
            Gerar a primeira ata
          </Link>
        </div>
      )}

      {!loading && !error && atas.length > 0 && <AtasListagem atas={atas} mostrarCliente />}
    </div>
  );
}
