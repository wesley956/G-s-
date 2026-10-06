import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { getDashboard } from '../services/dashboardService';
import { formatCurrency } from '../services/productService';
import { paymentLabels } from '../lib/receipt';
import { logError } from '../lib/errors';
import type { Dashboard } from '../types/dashboard';
import '../styles/dashboard.css';

const methods = ['CASH', 'PIX', 'DEBIT_CARD', 'CREDIT_CARD', 'CREDIT_CUSTOMER'];
export function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const pending = useRef(false);
  async function load() {
    if (pending.current) return;
    pending.current = true;
    const current = ++request.current;
    setBusy(true); setError(null);
    try {
      const result = await getDashboard();
      if (current === request.current) setData(result);
    } catch (err) {
      if (current === request.current) { setError(String(err)); logError(err); }
    } finally {
      if (current === request.current) { pending.current = false; setBusy(false); }
    }
  }
  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      ++request.current; pending.current = false;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  const cards = data ? [
    ['Caixa', data.cashOpen ? 'Aberto' : 'Fechado', data.cashOpen ? 'Pronto para vender' : 'Abra o caixa para iniciar as vendas'],
    ['Vendas hoje', formatCurrency(data.soldCents), `${data.salesCount} vendas finalizadas, após descontos`],
    ['Cancelamentos hoje', formatCurrency(data.cancelledCents), `${data.cancelledCount} cancelamentos, inclusive de vendas anteriores`],
    ['Vendas líquidas hoje', formatCurrency(data.soldCents - data.cancelledCents), 'Vendas de hoje menos cancelamentos de hoje'],
    ['Vendas fiado hoje', formatCurrency(data.creditSalesCents), 'Parcelas fiado de vendas finalizadas hoje'],
    ['Fiado em aberto', formatCurrency(data.balanceCents), 'Dívidas atuais, incluindo clientes inativos'],
    ['Clientes com dívida', String(data.debtorsCount), 'Clientes com saldo atual maior que zero'],
    ['Estoque baixo', String(data.lowStockCount), 'Produtos ativos no mínimo ou abaixo dele'],
  ] : [];
  const methodNames = [...methods, ...(data?.methods.filter(row => !methods.includes(row.method)).map(row => row.method) || [])];
  return <section className="dashboard-page" aria-busy={busy}>
    <header className="page-header"><div><p className="eyebrow">Visão geral</p><h1>Início</h1><p className="muted">Acompanhe o movimento do depósito sem depender de internet.</p></div>
      <button type="button" className="ghost-button" disabled={busy} onClick={() => void load()}><RefreshCw size={16} />Atualizar painel</button>
    </header>
    {error && <div className="feedback error" role="alert">Não foi possível atualizar o painel: {error}. Tente novamente em Atualizar painel.{data && ' Os indicadores abaixo são da última consulta bem-sucedida.'}</div>}
    {busy && <p role="status">Consultando indicadores locais...</p>}
    {data && <>
      <p className="muted">Dia consultado: {data.day.split('-').reverse().join('/')} · Atualizado em {data.generatedAtLocal} (horário local).</p>
      <div className="card-grid dashboard-metrics">{cards.map(([title, value, description]) => <article className="metric-card" key={title}><span>{title}</span><strong>{value}</strong><small>{description}</small></article>)}</div>
      {!data.salesCount && !data.cancelledCount && !data.methods.some(row => row.receiptsCents || row.receiptRefundCents) && <p className="feedback">Nenhuma venda, cancelamento ou recebimento de caderneta hoje. Dívidas e estoque mostram os valores atuais.</p>}
      <div className="panel"><h2>Formas de pagamento hoje</h2>
        <p className="muted">Receber uma dívida não é uma nova venda. Fiado não entra no dinheiro físico do caixa; PIX e cartões também são separados.</p>
        <p className="muted">Cancelamentos e devoluções aparecem no dia em que ocorreram. O líquido do dia pode ser negativo por vendas de dias anteriores.</p>
        <div className="data-table-wrapper dashboard-table"><table className="data-table"><thead><tr>{['Forma', 'Vendas', 'Estornos de vendas', 'Caderneta recebida', 'Caderneta devolvida'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>
          {methodNames.map(name => {
            const row = data.methods.find(value => value.method === name);
            return <tr key={name}><th scope="row">{paymentLabels[name as keyof typeof paymentLabels] || 'Não identificada'}</th>{[row?.salesCents || 0, row?.saleRefundCents || 0, row?.receiptsCents || 0, row?.receiptRefundCents || 0].map((value, index) => <td key={index}>{formatCurrency(value)}</td>)}</tr>;
          })}
        </tbody></table></div>
      </div>
    </>}
    <div className="panel"><p className="eyebrow">Atalhos</p><h2>Comece por aqui</h2><div className="quick-actions"><a href="#/sales/new">Nova venda</a><a href="#/cash">Abrir caixa</a><a href="#/inventory">Entrada de estoque</a><a href="#/customers">Cadastrar cliente</a></div></div>
  </section>;
}
