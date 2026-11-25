import type { AtaReuniao } from '../types/database';

export type AtividadeItem = {
  ata_id: string;
  indice: number;
  descricao: string;
  responsavel: string | null;
  prazo: string | null;
  concluida: boolean;
  cliente: string;
  cliente_id: string | null;
  assunto: string;
  data_reuniao: string;
};

// Status em que a ata já tem conteúdo revisado (ações definidas de
// verdade) — rascunho/processando/erro ainda não têm nada confiável pra
// virar atividade.
const STATUS_COM_ACOES: AtaReuniao['status'][] = ['revisao', 'concluida'];

export function extrairAtividades(
  atas: Pick<AtaReuniao, 'id' | 'cliente' | 'cliente_id' | 'assunto' | 'data_reuniao' | 'status' | 'acoes'>[],
): AtividadeItem[] {
  const itens: AtividadeItem[] = [];

  for (const ata of atas) {
    if (!STATUS_COM_ACOES.includes(ata.status)) continue;

    ata.acoes.forEach((acao, indice) => {
      if (!acao.descricao.trim()) return;
      itens.push({
        ata_id: ata.id,
        indice,
        descricao: acao.descricao,
        responsavel: acao.responsavel,
        prazo: acao.prazo,
        concluida: Boolean(acao.concluida),
        cliente: ata.cliente,
        cliente_id: ata.cliente_id,
        assunto: ata.assunto,
        data_reuniao: ata.data_reuniao,
      });
    });
  }

  return itens;
}
