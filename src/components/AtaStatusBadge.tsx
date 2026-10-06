import type { AtaStatus } from '../types/database';

export const STATUS_LABELS: Record<AtaStatus, string> = {
  rascunho: 'Rascunho',
  processando_ia: 'Gerando com IA',
  revisao: 'Aguardando revisão',
  concluida: 'Concluída',
  erro: 'Erro',
};

const TONS: Record<AtaStatus, string> = {
  rascunho: 'status-tone-info',
  processando_ia: 'status-tone-info',
  revisao: 'status-tone-warning',
  concluida: 'status-tone-success',
  erro: 'status-tone-danger',
};

export function AtaStatusBadge({ status }: { status: AtaStatus }) {
  return <span className={`status-badge ${TONS[status]}`}>{STATUS_LABELS[status]}</span>;
}
