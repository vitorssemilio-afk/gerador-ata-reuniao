import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AtaStatusBadge, STATUS_LABELS } from './AtaStatusBadge';
import { labelTipoReuniao } from '../lib/tiposReuniao';
import type { AtaReuniao, AtaStatus } from '../types/database';

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split('-');
  if (!ano || !mes || !dia) return dataIso;
  return `${dia}/${mes}/${ano}`;
}

type AtasListagemProps = {
  atas: AtaReuniao[];
  mostrarCliente?: boolean;
};

export function AtasListagem({ atas, mostrarCliente = false }: AtasListagemProps) {
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState<AtaStatus | ''>('');
  const [tipo, setTipo] = useState('');
  const [dataDe, setDataDe] = useState('');
  const [dataAte, setDataAte] = useState('');
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  const tiposDisponiveis = useMemo(() => {
    const valores = new Set(atas.map((a) => a.mapeador_tipo_reuniao).filter((v): v is string => Boolean(v)));
    return Array.from(valores);
  }, [atas]);

  const atasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return atas.filter((ata) => {
      if (termo) {
        const alvo = mostrarCliente ? `${ata.assunto} ${ata.cliente}` : ata.assunto;
        if (!alvo.toLowerCase().includes(termo)) return false;
      }
      if (status && ata.status !== status) return false;
      if (tipo && ata.mapeador_tipo_reuniao !== tipo) return false;
      if (dataDe && ata.data_reuniao < dataDe) return false;
      if (dataAte && ata.data_reuniao > dataAte) return false;
      return true;
    });
  }, [atas, busca, status, tipo, dataDe, dataAte, mostrarCliente]);

  const temFiltrosAtivos = Boolean(status || tipo || dataDe || dataAte);

  return (
    <div className="atas-listagem">
      <div className="atas-listagem-busca">
        <label className="field field-full">
          <span>Buscar por assunto{mostrarCliente ? ' ou cliente' : ''}</span>
          <input
            type="search"
            placeholder={mostrarCliente ? 'Assunto ou cliente…' : 'Assunto da reunião…'}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </label>
        <button
          type="button"
          className={`btn btn-secondary btn-filtros${temFiltrosAtivos ? ' btn-filtros-ativo' : ''}`}
          onClick={() => setFiltrosAbertos((v) => !v)}
        >
          Filtros{temFiltrosAtivos ? ' •' : ''}
        </button>
      </div>

      {filtrosAbertos && (
        <div className="card atas-filtros-painel">
          <div className="form-grid">
            <label className="field">
              <span>Status da ata</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as AtaStatus | '')}>
                <option value="">Todos</option>
                {(Object.entries(STATUS_LABELS) as [AtaStatus, string][]).map(([valor, label]) => (
                  <option key={valor} value={valor}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {tiposDisponiveis.length > 0 && (
              <label className="field">
                <span>Tipo de reunião</span>
                <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  <option value="">Todos</option>
                  {tiposDisponiveis.map((valor) => (
                    <option key={valor} value={valor}>
                      {labelTipoReuniao(valor)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              <span>Período — de</span>
              <input type="date" value={dataDe} onChange={(e) => setDataDe(e.target.value)} />
            </label>
            <label className="field">
              <span>Período — até</span>
              <input type="date" value={dataAte} onChange={(e) => setDataAte(e.target.value)} />
            </label>
          </div>
          {temFiltrosAtivos && (
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setStatus('');
                setTipo('');
                setDataDe('');
                setDataAte('');
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {atas.length === 0 && (
        <div className="empty-state">
          <p>Nenhuma ata por aqui ainda.</p>
        </div>
      )}

      {atas.length > 0 && atasFiltradas.length === 0 && (
        <div className="empty-state">
          <p>Nenhuma ata encontrada para esses filtros.</p>
        </div>
      )}

      {atasFiltradas.length > 0 && (
        <>
          <div className="table-wrap atas-tabela-desktop">
            <table className="data-table">
              <thead>
                <tr>
                  {mostrarCliente && <th>Cliente</th>}
                  <th>Assunto</th>
                  {tiposDisponiveis.length > 0 && <th>Tipo</th>}
                  <th>Data</th>
                  <th>Status da ata</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {atasFiltradas.map((ata) => (
                  <tr key={ata.id}>
                    {mostrarCliente && (
                      <td>
                        {ata.cliente_id ? <Link to={`/clientes/${ata.cliente_id}`}>{ata.cliente}</Link> : ata.cliente || 'Sem cliente'}
                      </td>
                    )}
                    <td>{ata.assunto}</td>
                    {tiposDisponiveis.length > 0 && <td>{labelTipoReuniao(ata.mapeador_tipo_reuniao)}</td>}
                    <td>{formatarData(ata.data_reuniao)}</td>
                    <td>
                      <AtaStatusBadge status={ata.status} />
                    </td>
                    <td className="table-actions">
                      <Link to={`/${ata.id}`} className="link-button">
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="atas-cards-mobile">
            {atasFiltradas.map((ata) => (
              <li key={ata.id} className="card ata-card-mobile">
                <Link to={`/${ata.id}`} className="ata-card-mobile-link">
                  <strong>{ata.assunto}</strong>
                  {mostrarCliente && <span className="field-hint">{ata.cliente || 'Sem cliente'}</span>}
                  <div className="ata-card-mobile-meta">
                    <span>{formatarData(ata.data_reuniao)}</span>
                    <AtaStatusBadge status={ata.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
