import type { AtaReuniao } from '../types/database';

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split('-');
  if (!ano || !mes || !dia) return dataIso;
  return `${dia}/${mes}/${ano}`;
}

type Props = {
  ata: Pick<
    AtaReuniao,
    | 'assunto'
    | 'cliente'
    | 'data_reuniao'
    | 'hora_inicio'
    | 'hora_fim'
    | 'participantes'
    | 'pauta'
    | 'topicos'
    | 'decisoes'
    | 'acoes'
    | 'pendencias'
    | 'proxima_reuniao'
  >;
};

// Pré-visualização de como a ata sai no .docx (e no Drive, já que é o
// mesmo arquivo) — os campos de revisão são caixas de texto soltas, sem
// dar pra ver de relance como vai ficar o cabeçalho, a tabela de ações
// etc. no documento final.
export function AtaPreviewDocumento({ ata }: Props) {
  const horario =
    ata.hora_inicio && ata.hora_fim ? `${ata.hora_inicio}–${ata.hora_fim}` : ata.hora_inicio || '';

  return (
    <div className="doc-preview">
      <h1 className="doc-preview-title">Ata de Reunião — {ata.assunto || '(sem assunto)'}</h1>

      <table className="doc-preview-header">
        <tbody>
          <tr>
            <th>Cliente/Projeto</th>
            <td>{ata.cliente || '—'}</td>
          </tr>
          <tr>
            <th>Data</th>
            <td>
              {formatarData(ata.data_reuniao)}
              {horario ? ` (${horario})` : ''}
            </td>
          </tr>
          <tr>
            <th>Participantes</th>
            <td>{ata.participantes.length > 0 ? ata.participantes.join(', ') : 'não identificado'}</td>
          </tr>
        </tbody>
      </table>

      <h2 className="doc-preview-heading">Pauta</h2>
      <p>{ata.pauta || '—'}</p>

      <h2 className="doc-preview-heading">Discutido</h2>
      {ata.topicos.length > 0 ? (
        ata.topicos.map((topico, i) => (
          <div key={i}>
            <h3 className="doc-preview-subheading">{topico.titulo || `Tema ${i + 1}`}</h3>
            <p>{topico.resumo || '—'}</p>
          </div>
        ))
      ) : (
        <p>Nenhum tópico registrado.</p>
      )}

      <h2 className="doc-preview-heading">Decisões</h2>
      {ata.decisoes.length > 0 ? (
        <ul>
          {ata.decisoes.map((d, i) => (
            <li key={i}>{d || '—'}</li>
          ))}
        </ul>
      ) : (
        <p>Nenhuma decisão registrada.</p>
      )}

      <h2 className="doc-preview-heading">Ações</h2>
      <table className="doc-preview-table">
        <thead>
          <tr>
            <th>Ação</th>
            <th>Responsável</th>
            <th>Prazo</th>
          </tr>
        </thead>
        <tbody>
          {ata.acoes.length > 0 ? (
            ata.acoes.map((acao, i) => (
              <tr key={i}>
                <td>{acao.descricao || '—'}</td>
                <td>{acao.responsavel ?? '—'}</td>
                <td>{acao.prazo ?? '—'}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td>Nenhuma ação combinada.</td>
              <td>—</td>
              <td>—</td>
            </tr>
          )}
        </tbody>
      </table>

      <h2 className="doc-preview-heading">Pendências</h2>
      {ata.pendencias.length > 0 ? (
        <ul>
          {ata.pendencias.map((p, i) => (
            <li key={i}>{p || '—'}</li>
          ))}
        </ul>
      ) : (
        <p>Nenhuma pendência.</p>
      )}

      <h2 className="doc-preview-heading">Próxima Reunião</h2>
      <p>{ata.proxima_reuniao || 'A definir.'}</p>
    </div>
  );
}
