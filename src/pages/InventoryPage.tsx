import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardList,
  PackageCheck,
  Search,
  TriangleAlert,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  listInventoryMovements,
  listInventoryProducts,
  registerStockMovement,
} from "../services/inventoryService";
import type { InventoryMovement, StockAction } from "../types/inventory";
import type { Product } from "../types/product";

const actionLabels: Record<StockAction, string> = {
  RETURN: "Devolução",
  ENTRY: "Entrada",
  EXIT: "Saída",
  ADJUSTMENT: "Ajuste",
  LOSS: "Perda",
};

const movementLabels: Record<string, string> = {
  PURCHASE_ENTRY: "Entrada por compra",
  SALE_EXIT: "Saída por venda",
  MANUAL_ENTRY: "Entrada manual",
  MANUAL_EXIT: "Saída manual",
  ADJUSTMENT: "Ajuste",
  LOSS: "Perda",
  RETURN: "Devolução",
  CANCELLED_SALE_RETURN: "Estorno de venda",
};

export function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [query, setQuery] = useState("");
  const [productId, setProductId] = useState("");
  const [action, setAction] = useState<StockAction>("ENTRY");
  const [quantity, setQuantity] = useState("");
  const [targetQuantity, setTargetQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [productRows, movementRows] = await Promise.all([
      listInventoryProducts(),
      listInventoryMovements(),
    ]);
    setProducts(productRows);
    setMovements(movementRows);
    if (!productId && productRows[0]) {
      setProductId(productRows[0].id);
    }
  }

  useEffect(() => {
    void load().catch(err => setError(String(err)));
  }, []);

  const selectedProduct = products.find((product) => product.id === productId);

  const filteredProducts = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    if (!term) return products;
    return products.filter((product) =>
      [product.name, product.sku ?? ""].some((value) =>
        value.toLocaleLowerCase("pt-BR").includes(term),
      ),
    );
  }, [products, query]);

  const lowStockCount = products.filter(
    (product) => product.stock_quantity <= product.minimum_stock,
  ).length;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!productId) {
      setError("Selecione um produto.");
      return;
    }

    setSaving(true);

    try {
      const result = await registerStockMovement({
        productId,
        action,
        quantity: Number(quantity.replace(",", ".")),
        targetQuantity: Number(targetQuantity.replace(",", ".")),
        reason,
      });

      setMessage(
        `Estoque atualizado: ${result.previousQuantity} → ${result.newQuantity}`,
      );
      setQuantity("");
      setTargetQuantity("");
      setReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar o estoque.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="eyebrow">Controle operacional</p>
          <h1>Estoque</h1>
          <p className="muted">
            Entradas, saídas, perdas e ajustes ficam registrados no histórico.
          </p>
        </div>
      </header>

      <div className="summary-strip">
        <div>
          <span>Produtos ativos</span>
          <strong>{products.length}</strong>
        </div>
        <div>
          <span>Estoque baixo</span>
          <strong className={lowStockCount ? "warning-text" : undefined}>
            {lowStockCount}
          </strong>
        </div>
        <div>
          <span>Movimentações recentes</span>
          <strong>{movements.length}</strong>
        </div>
      </div>

      <div className="inventory-layout">
        <div className="panel inventory-list-panel">
          <div className="panel-heading-row">
            <div>
              <p className="eyebrow">Posição atual</p>
              <h2>Produtos em estoque</h2>
            </div>
          </div>

          <label className="search-box inventory-search">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar produto ou código..."
            />
          </label>

          <div className="inventory-product-list">
            {filteredProducts.map((product) => {
              const low = product.stock_quantity <= product.minimum_stock;
              return (
                <button
                  key={product.id}
                  className={`inventory-product-row ${product.id === productId ? "selected" : ""}`}
                  onClick={() => setProductId(product.id)}
                >
                  <div>
                    <strong>{product.name}</strong>
                    <span>{product.sku || "Sem código"}</span>
                  </div>
                  <div className="inventory-qty">
                    {low && <TriangleAlert size={16} />}
                    <strong>{product.stock_quantity}</strong>
                    <span>mín. {product.minimum_stock}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <form className="panel stock-action-panel" onSubmit={submit}>
          <div className="panel-heading-row">
            <div>
              <p className="eyebrow">Movimentar</p>
              <h2>{selectedProduct?.name ?? "Selecione um produto"}</h2>
            </div>
            {selectedProduct && (
              <span className="stock-current">
                Atual: <strong>{selectedProduct.stock_quantity}</strong>
              </span>
            )}
          </div>

          <div className="action-selector">
            {([
              ["ENTRY", ArrowDownToLine],
              ["RETURN", PackageCheck],
              ["EXIT", ArrowUpFromLine],
              ["ADJUSTMENT", PackageCheck],
              ["LOSS", TriangleAlert],
            ] as const).map(([value, Icon]) => (
              <button
                type="button"
                key={value}
                className={action === value ? "selected" : ""}
                onClick={() => setAction(value)}
              >
                <Icon size={17} />
                {actionLabels[value]}
              </button>
            ))}
          </div>

          {action === "ADJUSTMENT" ? (
            <label className="field">
              <span>Quantidade real encontrada</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={targetQuantity}
                onChange={(event) => setTargetQuantity(event.target.value)}
                required
              />
            </label>
          ) : (
            <label className="field">
              <span>Quantidade</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                required
              />
            </label>
          )}

          <label className="field">
            <span>Motivo / observação</span>
            <textarea
              rows={4}
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={
                action === "LOSS"
                  ? "Ex.: produto danificado, vazamento..."
                  : "Ex.: conferência física, recebimento do fornecedor..."
              }
            />
          </label>

          {error && <div className="feedback error">{error}</div>}
          {message && <div className="feedback success">{message}</div>}

          <button className="primary-button stock-submit" disabled={saving || !productId}>
            {saving ? "Registrando..." : "Registrar movimentação"}
          </button>
        </form>
      </div>

      <div className="panel">
        <div className="panel-heading-row">
          <div>
            <p className="eyebrow">Auditoria</p>
            <h2>Histórico de movimentações</h2>
          </div>
          <ClipboardList size={20} className="muted" />
        </div>

        {movements.length === 0 ? (
          <p className="muted">Ainda não existem movimentações registradas.</p>
        ) : (
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Produto</th>
                  <th>Movimento</th>
                  <th>Quantidade</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id}>
                    <td>{new Date(movement.created_at).toLocaleString("pt-BR")}</td>
                    <td className="table-title">{movement.product_name}</td>
                    <td>{movementLabels[movement.type] ?? movement.type}</td>
                    <td className={movement.quantity >= 0 ? "positive-text" : "danger-text"}>
                      {movement.quantity >= 0 ? "+" : ""}
                      {movement.quantity}
                    </td>
                    <td>{movement.reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
