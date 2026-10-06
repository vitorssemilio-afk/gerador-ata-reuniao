// Mesmos 7 tipos de reunião usados no Mapeador de Funil IA — só pra
// ajudar o vínculo automático por lá quando o reuniao_id exato não for
// informado (ver docs/integracao-mapeador.md). Opcional: sem isso, a ata
// ainda é enviada, só fica "aguardando vínculo manual" do lado do
// Mapeador.
export const TIPOS_REUNIAO_MAPEADOR: { valor: string; label: string }[] = [
  { valor: '', label: 'Não informar' },
  { valor: 'kickoff', label: 'Kickoff' },
  { valor: 'treinamento', label: 'Treinamento' },
  { valor: 'checkin_1', label: 'Check-in 1' },
  { valor: 'checkin_2', label: 'Check-in 2' },
  { valor: 'tira_duvidas', label: 'Tira-dúvidas' },
  { valor: 'reuniao_final', label: 'Reunião final / Entrega' },
  { valor: 'extraordinaria', label: 'Reunião extraordinária' },
];

export function labelTipoReuniao(valor: string | null): string {
  if (!valor) return '';
  return TIPOS_REUNIAO_MAPEADOR.find((t) => t.valor === valor)?.label ?? valor;
}
