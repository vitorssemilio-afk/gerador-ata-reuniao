import type { AtaReuniao } from '../types/database';

const EMOJIS_NUMERO = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split('-');
  if (!ano || !mes || !dia) return dataIso;
  return `${dia}/${mes}/${ano}`;
}

function linhaHorario(ata: Pick<AtaReuniao, 'hora_inicio' | 'hora_fim'>): string {
  if (ata.hora_inicio && ata.hora_fim) return `${ata.hora_inicio}–${ata.hora_fim}`;
  if (ata.hora_inicio) return ata.hora_inicio;
  return '';
}

export function gerarTextoWhatsapp(
  ata: Pick<
    AtaReuniao,
    | 'assunto'
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
  >,
): string {
  const linhas: string[] = [];

  linhas.push(`📋 *Ata de Reunião — ${ata.assunto}*`);
  const horario = linhaHorario(ata);
  linhas.push(`📅 Data: ${formatarData(ata.data_reuniao)}${horario ? ` | ⏰ ${horario}` : ''}`);
  linhas.push(`👥 Presentes: ${ata.participantes.length > 0 ? ata.participantes.join(', ') : 'não identificado'}`);
  linhas.push('');

  if (ata.pauta) {
    linhas.push('*Pauta:*');
    linhas.push(ata.pauta);
    linhas.push('');
  }

  if (ata.topicos.length > 0) {
    linhas.push('*Discutido:*');
    ata.topicos.forEach((topico, i) => {
      const emoji = EMOJIS_NUMERO[i] ?? '🔹';
      linhas.push(`${emoji} *${topico.titulo}*`);
      linhas.push(topico.resumo);
      linhas.push('');
    });
  }

  if (ata.decisoes.length > 0) {
    linhas.push('📝 *Decisões:*');
    ata.decisoes.forEach((decisao) => linhas.push(`- ${decisao}`));
    linhas.push('');
  }

  linhas.push('✅ *Ações:*');
  if (ata.acoes.length > 0) {
    ata.acoes.forEach((acao) => {
      const partes = [acao.descricao];
      if (acao.responsavel) partes.push(`Responsável: ${acao.responsavel}`);
      if (acao.prazo) partes.push(`Prazo: ${acao.prazo}`);
      linhas.push(`- ${partes.join(' — ')}`);
    });
  } else {
    linhas.push('- Nenhuma ação combinada.');
  }
  linhas.push('');

  linhas.push('⏳ *Pendências:*');
  if (ata.pendencias.length > 0) {
    ata.pendencias.forEach((pendencia) => linhas.push(`- ${pendencia}`));
  } else {
    linhas.push('- Nenhuma.');
  }
  linhas.push('');

  linhas.push(`📌 Próxima reunião: ${ata.proxima_reuniao ?? 'a definir'}`);

  return linhas.join('\n').trim() + '\n';
}

export async function copiarParaAreaDeTransferencia(texto: string): Promise<void> {
  await navigator.clipboard.writeText(texto);
}
