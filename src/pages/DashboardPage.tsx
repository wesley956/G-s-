const cards = [
  ["Caixa", "Fechado", "Abra o caixa para iniciar as vendas"],
  ["Vendas hoje", "R$ 0,00", "Nenhuma venda registrada hoje"],
  ["Fiado em aberto", "R$ 0,00", "Nenhum saldo pendente"],
  ["Estoque baixo", "0", "Nenhum produto abaixo do mínimo"],
];

export function DashboardPage() {
  return (
    <section>
      <header className="page-header">
        <div>
          <p className="eyebrow">Visão geral</p>
          <h1>Início</h1>
          <p className="muted">Acompanhe o movimento do depósito sem depender de internet.</p>
        </div>
      </header>

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
