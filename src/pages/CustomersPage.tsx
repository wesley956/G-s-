import { Search, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatCurrency } from "../services/productService";
import { listCustomers, setCustomerActive } from "../services/customerService";
import type { Customer } from "../types/customer";

export function CustomersPage() {
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");

  async function load() {
    setCustomers(await listCustomers());
  }

  useEffect(() => { void load().catch(err => setError(String(err))); }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    if (!term) return customers;
    return customers.filter((customer) =>
      [customer.name, customer.phone ?? "", customer.document ?? ""]
        .some((value) => value.toLocaleLowerCase("pt-BR").includes(term)),
    );
  }, [customers, query]);

  const totalOpen = customers.reduce((sum, customer) => sum + Math.max(0, customer.balance_cents ?? 0), 0);

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="eyebrow">Relacionamento</p>
          <h1>Clientes</h1>
          <p className="muted">Pessoas e comércios com histórico e saldo de caderneta.</p>
        </div>
        <Link className="primary-button" to="/customers/new">
          <UserPlus size={18} /> Novo cliente
        </Link>
      </header>

      {error && <div className="feedback error">{error}</div>}
      <div className="summary-strip">
        <div><span>Clientes cadastrados</span><strong>{customers.length}</strong></div>
        <div><span>Ativos</span><strong>{customers.filter((c) => c.active).length}</strong></div>
        <div><span>Total em aberto</span><strong>{formatCurrency(totalOpen)}</strong></div>
      </div>

      <div className="panel">
        <label className="search-box inventory-search">
          <Search size={18} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar nome, telefone ou documento..." />
        </label>

        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr><th>Cliente</th><th>Tipo</th><th>Contato</th><th>Saldo</th><th>Situação</th><th /></tr>
            </thead>
            <tbody>
              {filtered.map((customer) => (
                <tr key={customer.id}>
                  <td><div className="table-title">{customer.name}</div><div className="table-subtitle">{customer.document || "Sem documento"}</div></td>
                  <td>{customer.type === "BUSINESS" ? "Comércio" : "Pessoa"}</td>
                  <td>{customer.phone || customer.whatsapp || "—"}</td>
                  <td className={(customer.balance_cents ?? 0) > 0 ? "warning-text" : ""}>{formatCurrency(customer.balance_cents ?? 0)}</td>
                  <td><span className={customer.active ? "status-pill active" : "status-pill inactive"}>{customer.active ? "Ativo" : "Inativo"}</span></td>
                  <td className="table-actions customer-actions">
                    <Link className="ghost-button" to={`/accounts/${customer.id}`}>Caderneta</Link>
                    <button className="ghost-button" onClick={async () => { try { await setCustomerActive(customer.id, !Boolean(customer.active)); await load(); } catch(err) { setError(String(err)); } }}>
                      {customer.active ? "Desativar" : "Ativar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
