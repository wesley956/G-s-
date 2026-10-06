export function localMonthPeriod(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return { start: `${year}-${month}-01`, end: `${year}-${month}-${String(now.getDate()).padStart(2, '0')}` };
}
export function periodLabel(start: string, end: string) {
  const display = (date: string) => date.split('-').reverse().join('/');
  return `${display(start)} a ${display(end)}`;
}
export const movementLabels: Record<string, string> = {
  SALE: 'Venda', RECEIPT: 'Recebimento de caderneta', SUPPLY: 'Suprimento', WITHDRAWAL: 'Sangria', EXPENSE: 'Despesa',
  SALE_REFUND: 'Estorno de venda', RECEIPT_REFUND: 'Devolução de caderneta', EXPENSE_REFUND: 'Devolução de despesa', UNKNOWN_REFUND: 'Estorno sem vínculo',
};
