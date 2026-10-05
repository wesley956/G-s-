import { useEffect, useState } from "react";
import { getDb } from "../lib/db";
import { formatCurrency } from "../services/productService";

export function DashboardPage() {
  const [cards, setCards] = useState<string[][]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void (async () => {
    const db = await getDb();
    const [rows] = await db.select<{ open: number; sales: number; credit: number; low: number }[]>(`SELECT
      (SELECT COUNT(*) FROM cash_sessions WHERE status='OPEN') AS open,
      (SELECT COALESCE(SUM(total_cents),0) FROM sales WHERE status='COMPLETED' AND date(completed_at,'localtime')=date('now','localtime')) AS sales,
      (SELECT COALESCE(SUM(CASE WHEN status='CANCELLED' THEN 0 WHEN type='PAYMENT' THEN -amount_cents ELSE amount_cents END),0) FROM customer_account_entries) AS credit,
      (SELECT COUNT(*) FROM products WHERE active=1 AND stock_quantity<=minimum_stock) AS low`);
    setCards([["Caixa",rows.open ? "Aberto" : "Fechado",rows.open ? "Pronto para vender" : "Abra o caixa para iniciar as vendas"],
      ["Vendas hoje",formatCurrency(rows.sales),"Vendas finalizadas, sem cancelamentos"],
      ["Fiado em aberto",formatCurrency(rows.credit),"Saldo atual das cadernetas"],
      ["Estoque baixo",String(rows.low),"Produtos no mínimo ou abaixo dele"]]);
  })().catch(err => setError(String(err))); }, []);
  return (
    <section>
      <header className="page-header">
        <div>
          <p className="eyebrow">Visão geral</p>
          <h1>Início</h1>
          <p className="muted">Acompanhe o movimento do depósito sem depender de internet.</p>
        </div>
      </header>

      {error && <div className="feedback error">{error}</div>}
      <div className="card-grid">
        {cards.map(([title, value, description]) => (
          <article className="metric-card" key={title}>
            <span>{title}</span>
            <strong>{value}</strong>
            <small>{description}</small>
          </article>
        ))}
      </div>

      <div className="panel">
        <div>
          <p className="eyebrow">Atalhos</p>
          <h2>Comece por aqui</h2>
        </div>
        <div className="quick-actions">
          <a href="#/sales/new">Nova venda</a>
          <a href="#/cash">Abrir caixa</a>
          <a href="#/inventory">Entrada de estoque</a>
          <a href="#/customers">Cadastrar cliente</a>
        </div>
      </div>
    </section>
  );
}
