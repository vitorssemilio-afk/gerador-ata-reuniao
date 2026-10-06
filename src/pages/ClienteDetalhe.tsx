import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AtasListagem } from '../components/AtasListagem';
import { supabase } from '../lib/supabaseClient';
import type { AtaReuniao, Cliente } from '../types/database';

function formatarData(dataIso: string | null): string {
  if (!dataIso) return '—';
  const [ano, mes, dia] = dataIso.split('-');
  if (!ano || !mes || !dia) return dataIso;
  return `${dia}/${mes}/${ano}`;
}

export function ClienteDetalhe() {
  const { id } = useParams<{ id: string }>();

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [atas, setAtas] = useState<AtaReuniao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editando, setEditando] = useState(false);
  const [nomeEditado, setNomeEditado] = useState('');
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [erroNome, setErroNome] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: clienteData, error: clienteError }, { data: atasData, error: atasError }] = await Promise.all([
      supabase.from('clientes').select('*').eq('id', id).single(),
      supabase.from('atas_reuniao').select('*').eq('cliente_id', id).order('data_reuniao', { ascending: false }),
    ]);

    if (clienteError || !clienteData) {
      setError(clienteError?.message ?? 'Cliente não encontrado.');
      setLoading(false);
      return;
    }

    setCliente(clienteData);
    setNomeEditado(clienteData.nome);
    setAtas(atasData ?? []);
    setError(atasError?.message ?? null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function salvarNome() {
    if (!cliente) return;
    const nome = nomeEditado.trim();
    if (!nome) {
      setErroNome('O nome não pode ficar vazio.');
      return;
    }

    setSalvandoNome(true);
    setErroNome(null);

    const { data, error: updateError } = await supabase
      .from('clientes')
      .update({ nome })
      .eq('id', cliente.id)
      .select()
      .single();

    if (updateError || !data) {
      setErroNome(
        updateError?.message.includes('duplicate') || updateError?.code === '23505'
          ? 'Já existe um cliente com esse nome.'
          : updateError?.message ?? 'Erro ao renomear o cliente.',
      );
      setSalvandoNome(false);
      return;
    }

    setCliente(data);
    setAtas((atual) => atual.map((a) => ({ ...a, cliente: data.nome })));
    setEditando(false);
    setSalvandoNome(false);
  }

  if (loading) return <div className="page-loading">Carregando…</div>;
  if (error && !cliente) return <p className="form-error">{error}</p>;
  if (!cliente) return null;

  const ultimaReuniao = atas[0]?.data_reuniao ?? null;

  return (
    <div className="page">
      <nav className="breadcrumb" aria-label="Navegação">
        <Link to="/">Clientes</Link>
        <span aria-hidden="true">/</span>
        <span>{cliente.nome}</span>
      </nav>

      <div className="page-header">
        <div>
          {editando ? (
            <div className="cliente-nome-edicao">
              <input
                value={nomeEditado}
                onChange={(e) => setNomeEditado(e.target.value)}
                aria-label="Nome do cliente"
                autoFocus
              />
              <button type="button" className="btn btn-secondary" onClick={salvarNome} disabled={salvandoNome}>
                {salvandoNome ? 'Salvando…' : 'Salvar'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setEditando(false);
                  setNomeEditado(cliente.nome);
                  setErroNome(null);
                }}
              >
                Cancelar
              </button>
            </div>
          ) : (
            <h1>
              {cliente.nome}{' '}
              <button type="button" className="link-button cliente-editar-btn" onClick={() => setEditando(true)}>
                editar
              </button>
            </h1>
          )}
          {erroNome && <p className="form-error">{erroNome}</p>}
          <p className="field-hint">
            {atas.length} {atas.length === 1 ? 'ata' : 'atas'} · Última reunião: {formatarData(ultimaReuniao)}
          </p>
        </div>
        <Link to={`/nova?cliente_id=${cliente.id}&cliente_nome=${encodeURIComponent(cliente.nome)}`} className="btn btn-primary">
          + Nova ata
        </Link>
      </div>

      {error && <p className="form-error">{error}</p>}

      {atas.length === 0 ? (
        <div className="empty-state">
          <p>Esse cliente ainda não tem nenhuma ata.</p>
          <Link to={`/nova?cliente_id=${cliente.id}&cliente_nome=${encodeURIComponent(cliente.nome)}`} className="btn btn-primary">
            Gerar a primeira ata
          </Link>
        </div>
      ) : (
        <AtasListagem atas={atas} />
      )}
    </div>
  );
}
