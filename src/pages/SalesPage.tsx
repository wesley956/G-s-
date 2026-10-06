import { useEffect, useState } from "react";
import { formatCurrency } from "../services/productService";
import { cancelSale, listSales } from "../services/saleService";
import type { SaleRecord } from "../types/sale";

export function SalesPage() {
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setSales(await listSales());
  }

  useEffect(() => { void load(); }, []);

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="eyebrow">Histórico</p>
          <h1>Vendas</h1>
          <p className="muted">Consulte e cancele vendas mantendo o histórico e os estornos.</p>
        </div>
      </header>

      {error && <div className="feedback error">{error}</div>}

      <div className="panel">
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr><th>Nº</th><th>Data</th><th>Tipo</th><th>Total</th><th>Situação</th><th /></tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id}>
                  <td className="table-title">#{sale.sale_number}</td>
                  <td>{new Date(sale.created_at).toLocaleString("pt-BR")}</td>
                  <td>{sale.sale_type === "COUNTER" ? "Portaria" : "Entrega"}</td>
                  <td>{formatCurrency(sale.total_cents)}</td>
                  <td>
                    <span className={sale.status === "COMPLETED" ? "status-pill active" : "status-pill cancelled"}>
                      {sale.status === "COMPLETED" ? "Finalizada" : "Cancelada"}
                    </span>
                  </td>
                  <td className="table-actions">
                    {sale.status === "COMPLETED" && (
                      <button
                        className="ghost-button danger-link"
                        onClick={async () => {
                          const reason = window.prompt("Motivo do cancelamento:");
                          if (reason === null) return;
                          try {
                            await cancelSale(sale.id, reason);
                            await load();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Não foi possível cancelar.");
                          }
                        }}
                      >
                        Cancelar
                      </button>
                    )}
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
