import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import type { ClienteResumo } from '../types/database';

function formatarData(dataIso: string | null): string {
  if (!dataIso) return '—';
  const [ano, mes, dia] = dataIso.split('-');
  if (!ano || !mes || !dia) return dataIso;
  return `${dia}/${mes}/${ano}`;
}

type Ordenacao = 'ultima_reuniao' | 'nome';

export function Clientes() {
  const [clientes, setClientes] = useState<ClienteResumo[]>([]);
  const [semCliente, setSemCliente] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('ultima_reuniao');

  useEffect(() => {
    let cancelled = false;

    async function carregar() {
      setLoading(true);
      const [{ data, error: fetchError }, { count }] = await Promise.all([
        supabase.from('clientes_resumo').select('*'),
        supabase.from('atas_reuniao').select('id', { count: 'exact', head: true }).is('cliente_id', null),
      ]);

      if (cancelled) return;

      if (fetchError) setError(fetchError.message);
      else setClientes(data ?? []);
      setSemCliente(count ?? 0);
      setLoading(false);
    }

    carregar();
    return () => {
      cancelled = true;
    };
  }, []);

  const clientesFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const lista = termo ? clientes.filter((c) => c.nome.toLowerCase().includes(termo)) : clientes;

    return [...lista].sort((a, b) => {
      if (ordenacao === 'nome') return a.nome.localeCompare(b.nome, 'pt-BR');
      if (!a.ultima_reuniao && !b.ultima_reuniao) return a.nome.localeCompare(b.nome, 'pt-BR');
      if (!a.ultima_reuniao) return 1;
      if (!b.ultima_reuniao) return -1;
      return b.ultima_reuniao.localeCompare(a.ultima_reuniao);
    });
  }, [clientes, busca, ordenacao]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Clientes</h1>
          <p className="field-hint">Acesse o histórico de reuniões e atas de cada cliente.</p>
        </div>
        <Link to="/nova" className="btn btn-primary">
          + Nova ata
        </Link>
      </div>

      {loading && <p className="page-loading">Carregando…</p>}
      {error && <p className="form-error">{error}</p>}

      {!loading && !error && clientes.length === 0 && semCliente === 0 && (
        <div className="empty-state">
          <p>Nenhum cliente cadastrado ainda.</p>
          <Link to="/nova" className="btn btn-primary">
            Gerar a primeira ata
          </Link>
        </div>
      )}

      {!loading && !error && (clientes.length > 0 || semCliente > 0) && (
        <>
          <div className="clientes-toolbar">
            <label className="field field-full">
              <span>Buscar cliente</span>
              <input
                type="search"
                placeholder="Nome do cliente…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Ordenar por</span>
              <select value={ordenacao} onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}>
                <option value="ultima_reuniao">Última reunião</option>
                <option value="nome">Nome (A–Z)</option>
              </select>
            </label>
          </div>

          {clientesFiltrados.length === 0 && (
            <div className="empty-state">
              <p>Nenhum cliente encontrado para essa busca.</p>
            </div>
          )}

          {clientesFiltrados.length > 0 && (
            <div className="clientes-grid">
              {clientesFiltrados.map((cliente) => (
                <Link key={cliente.id} to={`/clientes/${cliente.id}`} className="card cliente-card">
                  <h3>{cliente.nome}</h3>
                  <p className="field-hint">
                    {cliente.qtd_atas} {cliente.qtd_atas === 1 ? 'ata' : 'atas'} · Última reunião:{' '}
                    {formatarData(cliente.ultima_reuniao)}
                  </p>
                  <span className="cliente-card-acao">Ver atas →</span>
                </Link>
              ))}
            </div>
          )}

          {semCliente > 0 && (
            <Link to="/atas" className="card cliente-card cliente-card-sem-vinculo">
              <h3>Sem cliente</h3>
              <p className="field-hint">
                {semCliente} {semCliente === 1 ? 'ata ainda não está vinculada' : 'atas ainda não estão vinculadas'} a
                um cliente.
              </p>
              <span className="cliente-card-acao">Revisar em Todas as atas →</span>
            </Link>
          )}
        </>
      )}
    </div>
  );
}
