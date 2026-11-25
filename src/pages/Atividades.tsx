import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { extrairAtividades } from '../lib/atividades';
import { supabase } from '../lib/supabaseClient';
import type { AtaReuniao } from '../types/database';

type AtaParaAtividades = Pick<
  AtaReuniao,
  'id' | 'cliente' | 'cliente_id' | 'assunto' | 'data_reuniao' | 'status' | 'acoes'
>;

type FiltroStatus = 'pendentes' | 'concluidas' | 'todas';

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split('-');
  if (!ano || !mes || !dia) return dataIso;
  return `${dia}/${mes}/${ano}`;
}

export function Atividades() {
  const [atas, setAtas] = useState<AtaParaAtividades[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('pendentes');
  const [filtroResponsavel, setFiltroResponsavel] = useState('');

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setLoading(true);
    const hoje = new Date().toISOString().slice(0, 10);
    const { data, error: fetchError } = await supabase
      .from('atas_reuniao')
      .select('id,cliente,cliente_id,assunto,data_reuniao,status,acoes')
      .in('status', ['revisao', 'concluida'])
      .gte('data_reuniao', hoje)
      .order('data_reuniao', { ascending: false });

    if (fetchError) setError(fetchError.message);
    else setAtas(data ?? []);
    setLoading(false);
  }

  const atividades = useMemo(() => extrairAtividades(atas), [atas]);

  const responsaveisDisponiveis = useMemo(() => {
    const valores = new Set(atividades.map((a) => a.responsavel).filter((v): v is string => Boolean(v)));
    return Array.from(valores).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [atividades]);

  const atividadesFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    const lista = atividades.filter((item) => {
      if (filtroStatus === 'pendentes' && item.concluida) return false;
      if (filtroStatus === 'concluidas' && !item.concluida) return false;
      if (filtroResponsavel && item.responsavel !== filtroResponsavel) return false;
      if (termo) {
        const alvo = `${item.descricao} ${item.cliente} ${item.assunto}`.toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });

    return [...lista].sort((a, b) =>
      filtroStatus === 'pendentes'
        ? a.data_reuniao.localeCompare(b.data_reuniao)
        : b.data_reuniao.localeCompare(a.data_reuniao),
    );
  }, [atividades, busca, filtroStatus, filtroResponsavel]);

  const pendentesCount = useMemo(() => atividades.filter((a) => !a.concluida).length, [atividades]);

  async function alternarConcluida(item: ReturnType<typeof extrairAtividades>[number]) {
    const chave = `${item.ata_id}-${item.indice}`;
    setSalvando(chave);
    setError(null);

    const ata = atas.find((a) => a.id === item.ata_id);
    if (!ata) {
      setSalvando(null);
      return;
    }

    const novasAcoes = ata.acoes.map((acao, i) => (i === item.indice ? { ...acao, concluida: !item.concluida } : acao));

    const { error: updateError } = await supabase
      .from('atas_reuniao')
      .update({ acoes: novasAcoes })
      .eq('id', item.ata_id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setAtas((atual) => atual.map((a) => (a.id === item.ata_id ? { ...a, acoes: novasAcoes } : a)));
    }
    setSalvando(null);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Atividades</h1>
          <p className="field-hint">
            O que precisa ser feito, extraído das ações definidas em reuniões de hoje em diante.{' '}
            {pendentesCount > 0 && `${pendentesCount} ${pendentesCount === 1 ? 'pendente' : 'pendentes'}.`}
          </p>
        </div>
      </div>

      {loading && <p className="page-loading">Carregando…</p>}
      {error && <p className="form-error">{error}</p>}

      {!loading && !error && (
        <>
          <div className="atividades-toolbar">
            <label className="field field-full">
              <span>Buscar</span>
              <input
                type="search"
                placeholder="Ação, cliente ou assunto…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Status</span>
              <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as FiltroStatus)}>
                <option value="pendentes">Pendentes</option>
                <option value="concluidas">Concluídas</option>
                <option value="todas">Todas</option>
              </select>
            </label>
            {responsaveisDisponiveis.length > 0 && (
              <label className="field">
                <span>Responsável</span>
                <select value={filtroResponsavel} onChange={(e) => setFiltroResponsavel(e.target.value)}>
                  <option value="">Todos</option>
                  {responsaveisDisponiveis.map((nome) => (
                    <option key={nome} value={nome}>
                      {nome}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {atividadesFiltradas.length === 0 && (
            <div className="empty-state">
              <p>
                {filtroStatus === 'pendentes'
                  ? 'Nenhuma atividade pendente — tudo em dia.'
                  : 'Nenhuma atividade encontrada para esses filtros.'}
              </p>
            </div>
          )}

          {atividadesFiltradas.length > 0 && (
            <ul className="atividades-lista">
              {atividadesFiltradas.map((item) => {
                const chave = `${item.ata_id}-${item.indice}`;
                return (
                  <li key={chave} className={`card atividade-item${item.concluida ? ' atividade-concluida' : ''}`}>
                    <label className="atividade-checkbox">
                      <input
                        type="checkbox"
                        checked={item.concluida}
                        disabled={salvando === chave}
                        onChange={() => alternarConcluida(item)}
                        aria-label={item.concluida ? 'Marcar como pendente' : 'Marcar como concluída'}
                      />
                    </label>
                    <div className="atividade-conteudo">
                      <p className="atividade-descricao">{item.descricao}</p>
                      <p className="field-hint atividade-meta">
                        {item.cliente_id ? (
                          <Link to={`/clientes/${item.cliente_id}`}>{item.cliente}</Link>
                        ) : (
                          item.cliente || 'Sem cliente'
                        )}
                        {' · '}
                        <Link to={`/${item.ata_id}`}>{item.assunto}</Link>
                        {' · '}
                        {formatarData(item.data_reuniao)}
                        {item.responsavel && ` · ${item.responsavel}`}
                        {item.prazo && ` · Prazo: ${item.prazo}`}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
