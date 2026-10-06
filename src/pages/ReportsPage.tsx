import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { getReport, exportReport } from '../services/reportService';
import { formatCurrency } from '../services/productService';
import { paymentLabels } from '../lib/receipt';
import { localMonthPeriod, movementLabels, periodLabel } from '../lib/report';
import type { Report, ReportPeriod } from '../types/report';
import '../styles/reports.css';

const tabs = ['Resumo', 'Produtos', 'Despesas', 'Caixa', 'Cadernetas', 'Estoque'] as const;
type Tab = typeof tabs[number];
const quantity = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const method = (value: string) => value in paymentLabels ? paymentLabels[value as keyof typeof paymentLabels] : 'Não identificada';
const money = (value: number | null) => value === null ? 'Não informado' : formatCurrency(value);
function Metric({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{formatCurrency(value)}</strong>{detail && <small>{detail}</small>}</article>;
}
function Table({ headers, children, empty }: { headers: string[]; children: ReactNode; empty: boolean }) {
  return <div className="panel data-table-wrapper report-table">{empty ? <p>Nenhum registro para esta consulta.</p> : <table className="data-table"><thead><tr>{headers.map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{children}</tbody></table>}</div>;
}
export function ReportsPage() {
  const [period, setPeriod] = useState<ReportPeriod>(localMonthPeriod);
  const [report, setReport] = useState<Report | null>(null);
  const [tab, setTab] = useState<Tab>('Resumo');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lock = useRef(false);
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    let active = true;
    void getReport(localMonthPeriod()).then(result => { if (active) setReport(result); }).catch(err => { if (active) setError(String(err)); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; alive.current = false; };
  }, []);
  async function consult(exportCsv = false) {
    if (lock.current || busy) return;
    if (!period.start || !period.end || period.start > period.end) { setError('Informe um período válido: a data inicial deve ser anterior ou igual à data final.'); return; }
    lock.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      if (exportCsv) {
        const result = await exportReport(period);
        if (alive.current) { setReport(result.report); setNotice(result.path ? `CSV salvo em ${result.path}` : 'Exportação cancelada. Nenhum arquivo foi salvo.'); }
      } else {
        const result = await getReport(period);
        if (alive.current) setReport(result);
      }
    } catch (err) { if (alive.current) setError(String(err)); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  return <section className="reports-page">
    <header className="page-header"><div><p className="eyebrow">Gestão offline</p><h1>Relatórios</h1><p className="muted">Vendas, recebimentos, despesas e movimentos do caixa.</p></div><button className="primary-button" disabled={busy} onClick={() => void consult(true)}><Download size={18} />Exportar CSV</button></header>
    <form className="panel report-filters" onSubmit={e => { e.preventDefault(); void consult(); }}>
      <label className="field"><span>Data inicial</span><input type="date" required value={period.start} disabled={busy} onChange={e => setPeriod(value => ({ ...value, start: e.target.value }))} /></label>
      <label className="field"><span>Data final</span><input type="date" required value={period.end} disabled={busy} onChange={e => setPeriod(value => ({ ...value, end: e.target.value }))} /></label>
      <button className="ghost-button" disabled={busy} type="submit"><RefreshCw size={16} />Consultar</button>
    </form>
    {error && <div className="feedback error" role="alert">{error}</div>}
    {notice && <div className="feedback" role="status">{notice}</div>}
    {busy && <p role="status">Consultando dados locais...</p>}
    {report && <>
      <p className="muted report-period">Período consultado: <strong>{periodLabel(report.start, report.end)}</strong> · Dados consultados em {report.generatedAtLocal} (horário local).</p>
      <p className="muted">Vendas pela finalização; cancelamentos e devoluções pela data em que ocorreram. Um período pode ter resultado negativo por devoluções de operações anteriores. A consulta não altera os lançamentos.</p>
      {!report.sales.count && !report.sales.cancelledCount && !report.movements.length && <p className="feedback">Nenhum movimento financeiro neste período. Cadernetas e estoque continuam mostrando os valores atuais.</p>}
      <nav className="report-tabs" aria-label="Seções do relatório">{tabs.map(item => <button key={item} type="button" className="ghost-button" aria-pressed={tab === item} onClick={() => setTab(item)}>{item}</button>)}</nav>
      {tab === 'Resumo' && <div>
        <h2>Vendas no período</h2><div className="card-grid report-metrics"><Metric label="Vendas brutas" value={report.sales.grossCents} detail={`${report.sales.count} vendas finalizadas`} /><Metric label="Descontos" value={report.sales.discountCents} /><Metric label="Cancelamentos" value={report.sales.cancelledCents} detail={`${report.sales.cancelledCount} vendas canceladas`} /><Metric label="Vendas líquidas" value={report.sales.netCents} detail="Vendas após descontos menos cancelamentos" /></div>
        <h2>Formas de pagamento</h2><p className="muted">Recebimentos de caderneta são separados das vendas. Fiado representa uma dívida, sem entrada de dinheiro. Despesas e devoluções não compõem o faturamento.</p>
        <Table empty={!report.methods.length} headers={['Forma', 'Vendas', 'Estornos de vendas', 'Caderneta recebida', 'Caderneta devolvida', 'Despesas pagas', 'Despesas devolvidas']}>{report.methods.map(row => <tr key={row.method}><th scope="row">{method(row.method)}</th>{[row.salesCents, row.saleRefundCents, row.receiptsCents, row.receiptRefundCents, row.expensesCents, row.expenseRefundCents].map((value, index) => <td key={index}>{money(value)}</td>)}</tr>)}</Table>
      </div>}
      {tab === 'Produtos' && <div><h2>Produtos no período</h2><p className="muted">Nomes registrados na venda. Valores brutos dos itens, antes do desconto da venda.</p><Table empty={!report.products.length} headers={['Produto', 'Vendidos', 'Cancelados', 'Quantidade líquida', 'Bruto vendido', 'Bruto cancelado']}>{report.products.map(row => <tr key={`${row.id}:${row.name}`}><th scope="row">{row.name}</th><td>{quantity(row.soldQuantity)}</td><td>{quantity(row.cancelledQuantity)}</td><td>{quantity(row.soldQuantity - row.cancelledQuantity)}</td><td>{money(row.grossCents)}</td><td>{money(row.cancelledGrossCents)}</td></tr>)}</Table></div>}
      {tab === 'Despesas' && <div><h2>Despesas por categoria e fornecedor</h2><p className="muted">Categoria e nome do fornecedor preservados no pagamento. Devoluções consideradas pela data da entrada.</p><Table empty={!report.expenses.length} headers={['Categoria', 'Fornecedor registrado', 'Pagamentos', 'Devoluções', 'Líquido']}>{report.expenses.map(row => <tr key={JSON.stringify([row.category, row.supplierId, row.supplier])}><th scope="row">{row.category}</th><td className="report-text">{row.supplier}</td><td>{money(row.paidCents)}</td><td>{money(row.refundedCents)}</td><td>{money(row.paidCents - row.refundedCents)}</td></tr>)}</Table></div>}
      {tab === 'Caixa' && <div><h2>Dinheiro físico no período</h2><p className="muted">Entradas e saídas apenas em dinheiro. Fundos de abertura são apresentados separadamente; o movimento líquido não é o saldo disponível do caixa.</p><div className="card-grid report-metrics"><Metric label="Entradas em dinheiro" value={report.cash.inCents} /><Metric label="Saídas em dinheiro" value={report.cash.outCents} /><Metric label="Movimento líquido" value={report.cash.netCents} /><Metric label="Fundos de abertura" value={report.cash.openingCents} /><Metric label="Suprimentos" value={report.cash.suppliesCents} detail="Exclui devoluções de despesas" /><Metric label="Sangrias" value={report.cash.withdrawalsCents} /><Metric label="Diferenças de fechamento" value={report.cash.closingDifferenceCents} detail="Contado menos esperado" /></div>
        {report.cash.unknownRefundCents > 0 && <p className="feedback">Há {money(report.cash.unknownRefundCents)} em estornos antigos sem vínculo. O efeito em dinheiro consta nos movimentos; confira a origem antes de interpretar os totais de vendas e recebimentos.</p>}
        <h2>Fechamentos no período</h2><p className="muted">Valores registrados no fechamento, preservados após cancelamentos posteriores.</p><Table empty={!report.closings.length} headers={['Fechado em', 'Abertura', 'Esperado', 'Contado', 'Diferença', 'Observações']}>{report.closings.map(row => <tr key={row.id}><th scope="row">{row.closedAt}</th><td>{money(row.openingCents)}</td><td>{money(row.expectedCents)}</td><td>{money(row.informedCents)}</td><td>{money(row.informedCents === null || row.expectedCents === null ? null : row.informedCents - row.expectedCents)}</td><td className="report-text">{row.notes || '—'}</td></tr>)}</Table>
        <h2>Movimentos no período</h2><Table empty={!report.movements.length} headers={['Data local', 'Movimento', 'Forma', 'Valor', 'Efeito em dinheiro']}>{report.movements.map(row => <tr key={row.id}><th scope="row">{row.date}</th><td className="report-text"><strong>{movementLabels[row.kind] || row.kind}</strong><small className="expense-detail">{row.description || (row.saleNumber ? `Venda #${row.saleNumber}` : '')}{row.category ? ` · ${row.category}` : ''}{row.supplier ? ` · ${row.supplier}` : ''}</small></td><td>{method(row.method)}</td><td>{money(row.amountCents)}</td><td>{money(row.cashDeltaCents)}</td></tr>)}</Table>
      </div>}
      {tab === 'Cadernetas' && <div><h2>Saldos atuais da caderneta</h2><p className="muted">Valores atuais na data da consulta, incluindo clientes inativos. O filtro de período não representa um saldo histórico.</p><Table empty={!report.accounts.length} headers={['Cliente', 'Situação', 'Saldo atual']}>{report.accounts.map(row => <tr key={row.id}><th scope="row">{row.name}</th><td>{row.active ? 'Ativo' : 'Inativo'}</td><td>{money(row.balanceCents)}</td></tr>)}</Table></div>}
      {tab === 'Estoque' && <div><h2>Estoque atual</h2><p className="muted">Quantidades atuais na data da consulta, incluindo produtos inativos. O filtro de período não representa um estoque histórico.</p><Table empty={!report.stock.length} headers={['Produto', 'Situação', 'Quantidade atual', 'Mínimo']}>{report.stock.map(row => <tr key={row.id}><th scope="row">{row.name}</th><td>{row.active ? 'Ativo' : 'Inativo'}</td><td>{quantity(row.quantity)}</td><td>{quantity(row.minimum)}</td></tr>)}</Table></div>}
    </>}
  </section>;
}
