import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatCurrency } from "../services/productService";
import { listCustomers } from "../services/customerService";
import type { Customer } from "../types/customer";

export function AccountsPage() {
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => { void listCustomers().then(setCustomers).catch(err => setError(String(err))); }, []);

  const debtors = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    return customers
      .filter((customer) => (customer.balance_cents ?? 0) > 0)
      .filter((customer) => !term || customer.name.toLocaleLowerCase("pt-BR").includes(term));
  }, [customers, query]);

  const total = debtors.reduce((sum, customer) => sum + (customer.balance_cents ?? 0), 0);

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="eyebrow">Contas de clientes</p>
          <h1>Cadernetas</h1>
          <p className="muted">Controle de fiado, notas mensais e pagamentos parciais.</p>
        </div>
      </header>

      {error && <div className="feedback error">{error}</div>}
      <div className="summary-strip">
        <div><span>Clientes devendo</span><strong>{debtors.length}</strong></div>
        <div><span>Total a receber</span><strong>{formatCurrency(total)}</strong></div>
        <div><span>Situação</span><strong>{debtors.length ? "Acompanhar" : "Em dia"}</strong></div>
      </div>

      <div className="panel">
        <label className="search-box inventory-search"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cliente..." /></label>
        <div className="account-card-list">
          {debtors.length === 0 ? <p className="muted">Nenhum saldo em aberto.</p> : debtors.map((customer) => (
            <Link to={`/accounts/${customer.id}`} className="account-customer-card" key={customer.id}>
              <div><strong>{customer.name}</strong><span>{customer.type === "BUSINESS" ? "Comércio" : "Pessoa"}</span></div>
              <div><span>Saldo em aberto</span><strong>{formatCurrency(customer.balance_cents ?? 0)}</strong></div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
