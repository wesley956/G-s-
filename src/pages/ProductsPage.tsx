import { PackagePlus, Search, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ensureDefaultCategories } from "../lib/db";
import { formatCurrency, listProducts, setProductActive } from "../services/productService";
import type { Product } from "../types/product";

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { await ensureDefaultCategories(); setProducts(await listProducts()); }
    catch(err) { setError(String(err)); } finally { setLoading(false); }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    if (!term) return products;
    return products.filter((product) =>
      [product.name, product.sku ?? ""].some((value) =>
        value.toLocaleLowerCase("pt-BR").includes(term),
      ),
    );
  }, [products, query]);

  const lowStockCount = products.filter(
    (product) => product.active && product.stock_quantity <= product.minimum_stock,
  ).length;

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="eyebrow">Cadastro e preços</p>
          <h1>Produtos</h1>
          <p className="muted">
            Cadastre uma única vez e mantenha preços separados para Portaria e Entrega.
          </p>
        </div>

        <Link className="primary-button" to="/products/new">
          <PackagePlus size={18} />
          Novo produto
        </Link>
      </header>

      {error && <div className="feedback error">{error}</div>}
      <div className="summary-strip">
        <div>
          <span>Produtos cadastrados</span>
          <strong>{products.length}</strong>
        </div>
        <div>
          <span>Ativos</span>
          <strong>{products.filter((product) => product.active).length}</strong>
        </div>
        <div>
          <span>Estoque baixo</span>
          <strong className={lowStockCount ? "danger-text" : undefined}>{lowStockCount}</strong>
        </div>
      </div>

      <div className="panel">
        <div className="toolbar">
          <label className="search-box">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por produto ou código..."
            />
          </label>
        </div>

        {loading ? (
          <p className="muted">Carregando produtos...</p>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <PackagePlus size={34} />
            <strong>Nenhum produto encontrado</strong>
            <span>Cadastre o primeiro item do depósito para começar.</span>
          </div>
        ) : (
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Estoque</th>
                  <th>Portaria</th>
                  <th>Entrega</th>
                  <th>Situação</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => {
                  const lowStock = product.stock_quantity <= product.minimum_stock;
                  return (
                    <tr key={product.id}>
                      <td>
                        <div className="table-title">{product.name}</div>
                        <div className="table-subtitle">{product.sku || "Sem código"}</div>
                      </td>
                      <td>
                        <div className="stock-cell">
                          {lowStock && <TriangleAlert size={16} />}
                          <span>{product.stock_quantity}</span>
                        </div>
                      </td>
                      <td>{formatCurrency(product.counter_price_cents)}</td>
                      <td>{formatCurrency(product.delivery_price_cents)}</td>
                      <td>
                        <span className={product.active ? "status-pill active" : "status-pill inactive"}>
                          {product.active ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="table-actions">
                        <Link className="ghost-button" to={`/products/${product.id}/edit`}>Editar</Link>
                        <button
                          className="ghost-button"
                          onClick={async () => {
                            try { await setProductActive(product.id, !Boolean(product.active)); await load(); } catch(err) { setError(String(err)); }
                          }}
                        >
                          {product.active ? "Desativar" : "Ativar"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
