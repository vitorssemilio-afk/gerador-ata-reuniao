import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AtaStatusBadge } from '../components/AtaStatusBadge';
import { supabase } from '../lib/supabaseClient';
import type { AtaReuniao } from '../types/database';

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split('-');
  if (!ano || !mes || !dia) return dataIso;
  return `${dia}/${mes}/${ano}`;
}

export function Atas() {
  const [atas, setAtas] = useState<AtaReuniao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

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

  const atasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return atas;
    return atas.filter(
      (ata) =>
        ata.cliente.toLowerCase().includes(termo) ||
        ata.assunto.toLowerCase().includes(termo) ||
        formatarData(ata.data_reuniao).includes(termo),
    );
  }, [atas, busca]);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Atas de reunião</h1>
        <Link to="/nova" className="btn btn-primary">
          + Nova ata
        </Link>
      </div>

      {atas.length > 0 && (
        <label className="field field-full">
          <span>Buscar</span>
          <input
            type="search"
            placeholder="Cliente, assunto ou data (dd/mm/aaaa)…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </label>
      )}

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

      {!loading && atasFiltradas.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Assunto</th>
                <th>Data</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {atasFiltradas.map((ata) => (
                <tr key={ata.id}>
                  <td>
                    <Link to={`/${ata.id}`}>{ata.cliente}</Link>
                  </td>
                  <td>{ata.assunto}</td>
                  <td>{formatarData(ata.data_reuniao)}</td>
                  <td>
                    <AtaStatusBadge status={ata.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && atas.length > 0 && atasFiltradas.length === 0 && (
        <div className="empty-state">
          <p>Nenhuma ata encontrada para essa busca.</p>
        </div>
      )}
    </div>
  );
}
