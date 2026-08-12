import type { AtaReuniao } from '../types/database';

function slug(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split('-');
  if (!ano || !mes || !dia) return dataIso;
  return `${dia}/${mes}/${ano}`;
}

export function nomeArquivoAtaDocx(ata: Pick<AtaReuniao, 'cliente' | 'data_reuniao'>): string {
  return `Ata_${slug(ata.cliente) || 'cliente'}_${formatarData(ata.data_reuniao).replace(/\//g, '-')}.docx`;
}

export async function gerarAtaDocxBlob(ata: AtaReuniao): Promise<Blob> {
  const {
    Document,
    Packer,
    Paragraph,
    HeadingLevel,
    Table,
    TableRow,
    TableCell,
    TextRun,
    WidthType,
    AlignmentType,
  } = await import('docx');

  const horario =
    ata.hora_inicio && ata.hora_fim
      ? `${ata.hora_inicio}–${ata.hora_fim}`
      : ata.hora_inicio || '';

  const celulaCabecalho = (texto: string) =>
    new TableCell({
      width: { size: 25, type: WidthType.PERCENTAGE },
      children: [new Paragraph({ children: [new TextRun({ text: texto, bold: true })] })],
    });
  const celulaValor = (texto: string) =>
    new TableCell({
      width: { size: 75, type: WidthType.PERCENTAGE },
      children: [new Paragraph(texto)],
    });

  const tabelaCabecalho = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [celulaCabecalho('Cliente/Projeto'), celulaValor(ata.cliente)] }),
      new TableRow({ children: [celulaCabecalho('Data'), celulaValor(`${formatarData(ata.data_reuniao)}${horario ? ` (${horario})` : ''}`)] }),
      new TableRow({
        children: [
          celulaCabecalho('Participantes'),
          celulaValor(ata.participantes.length > 0 ? ata.participantes.join(', ') : 'não identificado'),
        ],
      }),
    ],
  });

  const secoesTopicos = ata.topicos.flatMap((topico) => [
    new Paragraph({ text: topico.titulo, heading: HeadingLevel.HEADING_2, spacing: { before: 200 } }),
    new Paragraph(topico.resumo),
  ]);

  const listaDecisoes =
    ata.decisoes.length > 0
      ? ata.decisoes.map((d) => new Paragraph({ text: d, bullet: { level: 0 } }))
      : [new Paragraph('Nenhuma decisão registrada.')];

  const linhaHeaderAcoes = new TableRow({
    tableHeader: true,
    children: ['Ação', 'Responsável', 'Prazo'].map(
      (texto) =>
        new TableCell({
          shading: { fill: 'EFEFEF' },
          children: [new Paragraph({ children: [new TextRun({ text: texto, bold: true })] })],
        }),
    ),
  });

  const linhasAcoes =
    ata.acoes.length > 0
      ? ata.acoes.map(
          (acao) =>
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph(acao.descricao)] }),
                new TableCell({ children: [new Paragraph(acao.responsavel ?? '—')] }),
                new TableCell({ children: [new Paragraph(acao.prazo ?? '—')] }),
              ],
            }),
        )
      : [
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph('Nenhuma ação combinada.')] }),
              new TableCell({ children: [new Paragraph('—')] }),
              new TableCell({ children: [new Paragraph('—')] }),
            ],
          }),
        ];

  const tabelaAcoes = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [linhaHeaderAcoes, ...linhasAcoes],
  });

  const listaPendencias =
    ata.pendencias.length > 0
      ? ata.pendencias.map((p) => new Paragraph({ text: p, bullet: { level: 0 } }))
      : [new Paragraph('Nenhuma pendência.')];

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: `Ata de Reunião — ${ata.assunto}`,
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.LEFT,
          }),
          new Paragraph({ text: '', spacing: { after: 100 } }),
          tabelaCabecalho,
          new Paragraph({ text: 'Pauta', heading: HeadingLevel.HEADING_1, spacing: { before: 300 } }),
          new Paragraph(ata.pauta || '—'),
          new Paragraph({ text: 'Discutido', heading: HeadingLevel.HEADING_1, spacing: { before: 300 } }),
          ...(secoesTopicos.length > 0 ? secoesTopicos : [new Paragraph('Nenhum tópico registrado.')]),
          new Paragraph({ text: 'Decisões', heading: HeadingLevel.HEADING_1, spacing: { before: 300 } }),
          ...listaDecisoes,
          new Paragraph({ text: 'Ações', heading: HeadingLevel.HEADING_1, spacing: { before: 300 } }),
          tabelaAcoes,
          new Paragraph({ text: 'Pendências', heading: HeadingLevel.HEADING_1, spacing: { before: 300 } }),
          ...listaPendencias,
          new Paragraph({ text: 'Próxima Reunião', heading: HeadingLevel.HEADING_1, spacing: { before: 300 } }),
          new Paragraph(ata.proxima_reuniao ?? 'A definir.'),
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}

export async function baixarAtaDocx(ata: AtaReuniao): Promise<void> {
  const blob = await gerarAtaDocxBlob(ata);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivoAtaDocx(ata);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
