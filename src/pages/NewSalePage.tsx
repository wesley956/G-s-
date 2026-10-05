import { Minus, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { previewCents, toCents, parseDecimal } from "../lib/money";
import { ReceiptDialog } from "../components/receipts/ReceiptDialog";
import { listActiveCustomers } from "../services/customerService";
import { formatCurrency } from "../services/productService";
import { completeSale, listSaleProducts } from "../services/saleService";
import type { Customer } from "../types/customer";
import type { PaymentInput, PaymentMethod, SaleCartItem, SaleProduct, SaleType } from "../types/sale";

const paymentLabels: Record<PaymentMethod, string> = {
  CASH: "Dinheiro",
  PIX: "PIX",
  DEBIT_CARD: "Débito",
  CREDIT_CARD: "Crédito",
  CREDIT_CUSTOMER: "Fiado",
};

export function NewSalePage() {
  const [products, setProducts] = useState<SaleProduct[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<SaleCartItem[]>([]);
  const [saleType, setSaleType] = useState<SaleType>("COUNTER");
  const [query, setQuery] = useState("");
  const [discount, setDiscount] = useState("");
  const [discountMode, setDiscountMode] = useState<"VALUE" | "PERCENT">("VALUE");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [customerId, setCustomerId] = useState("");
  const [received, setReceived] = useState("");
  const [mixed, setMixed] = useState(false);
  const [split, setSplit] = useState<Partial<Record<PaymentMethod, string>>>({});
  const [dueDate, setDueDate] = useState("");
  const attempt = useRef<{signature: string; id: string} | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ saleId: string; autoCopies?: 1 | 2 } | null>(null);

  async function loadBaseData() {
    const [productRows, customerRows] = await Promise.all([
      listSaleProducts(),
      listActiveCustomers(),
    ]);
    setProducts(productRows);
    setCustomers(customerRows);
  }

  useEffect(() => {
    void loadBaseData().catch((err) => setError(err instanceof Error ? err.message : "Não foi possível carregar os dados."));
  }, []);

  const filteredProducts = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    if (!term) return products;
    return products.filter((product) =>
      [product.name, product.sku ?? ""].some((value) => value.toLocaleLowerCase("pt-BR").includes(term)),
    );
  }, [products, query]);

  const subtotal = cart.reduce((sum, item) => {
    const unit = saleType === "COUNTER" ? item.product.counter_price_cents : item.product.delivery_price_cents;
    return sum + Math.round(unit * item.quantity);
  }, 0);

  const rawDiscount = previewCents(discount) / 100;
  const discountCents = discountMode === "PERCENT"
    ? Math.round(subtotal * Math.max(0, Math.min(rawDiscount, 100)) / 100)
    : Math.round(rawDiscount * 100);
  const safeDiscount = Math.min(subtotal, Math.max(0, discountCents));
  const total = subtotal - safeDiscount;

  const receivedCents = previewCents(received);
  const cashAmount = mixed ? previewCents(split.CASH || "") : paymentMethod === "CASH" ? total : 0;
  const hasCredit = mixed ? previewCents(split.CREDIT_CUSTOMER || "") > 0 : paymentMethod === "CREDIT_CUSTOMER";
  const change = cashAmount > 0 ? Math.max(0, receivedCents - cashAmount) : 0;

  function add(product: SaleProduct) {
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock_quantity) return current;
        return current.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      if (product.stock_quantity <= 0) return current;
      return [...current, { product, quantity: Math.min(1, product.stock_quantity) }];
    });
  }

  function changeQty(productId: string, delta: number) {
    setCart((current) =>
      current
        .map((item) => {
          if (item.product.id !== productId) return item;
          const next = Math.max(0, Math.min(item.product.stock_quantity, item.quantity + delta));
          return { ...item, quantity: next };
        })
        .filter((item) => item.quantity > 0),
    );
  }

  async function finish() {
    if (savingRef.current) return;
    setError(null);
    setFeedback(null);

    let payments: PaymentInput[];
    try {
      const discountNumber = parseDecimal(discount);
      if (discountMode === "PERCENT" && discountNumber > 100) throw new Error("Desconto percentual deve estar entre 0 e 100.");
      if (discountMode === "VALUE" && toCents(discount) > subtotal) throw new Error("Desconto maior que o subtotal.");
      payments = mixed ? (Object.keys(paymentLabels) as PaymentMethod[]).flatMap(method => {
        const amountCents = toCents(split[method] || "");
        return amountCents ? [{ method, amountCents, receivedCents: method === "CASH" ? toCents(received) : null }] : [];
      }) : [{ method: paymentMethod, amountCents: total, receivedCents: paymentMethod === "CASH" ? toCents(received) : null }];
      if (hasCredit && !customerId) throw new Error("Selecione o cliente para vender fiado.");
      if (payments.reduce((sum,p) => sum+p.amountCents,0) !== total) throw new Error("A soma dos pagamentos deve ser igual ao total.");
      if (cashAmount > 0 && toCents(received) < cashAmount) throw new Error("O valor recebido em dinheiro é menor que a parcela em dinheiro.");
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); return; }
    const signature = JSON.stringify({ saleType, customerId, cart, safeDiscount, payments, dueDate });
    if (attempt.current?.signature !== signature) attempt.current = { signature, id: crypto.randomUUID() };

    savingRef.current = true;
    setSaving(true);
    try {
      const result = await completeSale({
        saleType,
        customerId: customerId || null,
        items: cart,
        discountCents: safeDiscount,
        payments, dueDate, operationId: attempt.current!.id,
      });
      setFeedback(`Venda #${result.saleNumber} finalizada — ${formatCurrency(result.totalCents)}`);
      setLastSaleId(result.saleId);
      attempt.current = null;
      setCart([]);
      setSplit({});
      setDueDate("");
      setDiscount("");
      setReceived("");
      if (paymentMethod !== "CREDIT_CUSTOMER") setCustomerId("");
      if (result.printMode !== "NEVER") {
        setReceipt({
          saleId: result.saleId,
          autoCopies: result.printMode === "AUTO_ONE" ? 1 : result.printMode === "AUTO_TWO" ? 2 : undefined,
        });
      }
      try { await loadBaseData(); }
      catch { setError("A venda foi salva, mas não foi possível atualizar a lista de produtos. Reabra a tela antes de vender novamente."); }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível finalizar a venda.");
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }

  return (
    <section className="sale-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Operação</p>
          <h1>Nova Venda</h1>
          <p className="muted">Selecione Portaria ou Entrega e monte a venda rapidamente.</p>
        </div>
      </header>

      <div className="sale-type-selector">
        <button className={saleType === "COUNTER" ? "selected" : ""} onClick={() => setSaleType("COUNTER")}>PORTARIA</button>
        <button className={saleType === "DELIVERY" ? "selected" : ""} onClick={() => setSaleType("DELIVERY")}>ENTREGA</button>
      </div>

      <div className="sale-layout">
        <div className="panel sale-catalog">
          <label className="search-box inventory-search">
            <Search size={18} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar produto ou código..." />
          </label>

          <div className="product-sale-grid">
            {filteredProducts.map((product) => {
              const price = saleType === "COUNTER" ? product.counter_price_cents : product.delivery_price_cents;
              return (
                <button key={product.id} className="sale-product-card" onClick={() => add(product)} disabled={product.stock_quantity <= 0}>
                  <strong>{product.name}</strong>
                  <span>{product.sku || "Sem código"}</span>
                  <b>{formatCurrency(price)}</b>
                  <small>Estoque: {product.stock_quantity}</small>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="panel sale-cart">
          <div className="panel-heading-row">
            <div><p className="eyebrow">Carrinho</p><h2>Venda atual</h2></div>
            <ShoppingCart size={20} className="muted" />
          </div>

          <div className="cart-items">
            {cart.length === 0 ? <p className="muted">Nenhum produto adicionado.</p> : cart.map((item) => {
              const unit = saleType === "COUNTER" ? item.product.counter_price_cents : item.product.delivery_price_cents;
              return (
                <div className="cart-item" key={item.product.id}>
                  <div><strong>{item.product.name}</strong><span>{formatCurrency(unit)} cada</span></div>
                  <div className="qty-control">
                    <button aria-label={`Diminuir ${item.product.name}`} onClick={() => changeQty(item.product.id, -1)}><Minus size={15} /></button>
                    <b>{item.quantity}</b>
                    <button aria-label={`Aumentar ${item.product.name}`} onClick={() => changeQty(item.product.id, 1)}><Plus size={15} /></button>
                    <button aria-label={`Remover ${item.product.name}`} className="remove" onClick={() => changeQty(item.product.id, -item.quantity)}><Trash2 size={15} /></button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="sale-totals">
            <div><span>Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div>
            <div className="discount-row">
              <div className="mini-toggle">
                <button className={discountMode === "VALUE" ? "selected" : ""} onClick={() => setDiscountMode("VALUE")}>R$</button>
                <button className={discountMode === "PERCENT" ? "selected" : ""} onClick={() => setDiscountMode("PERCENT")}>%</button>
              </div>
              <input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" placeholder="Desconto" />
            </div>
            <div><span>Desconto</span><strong>- {formatCurrency(safeDiscount)}</strong></div>
            <div className="grand-total"><span>TOTAL</span><strong>{formatCurrency(total)}</strong></div>
          </div>

          <div className="payment-section">
            <span className="field-label">Pagamento</span>
            <div className="payment-grid">
              {!mixed && (Object.keys(paymentLabels) as PaymentMethod[]).map((method) => (
                <button key={method} className={paymentMethod === method ? "selected" : ""} onClick={() => setPaymentMethod(method)}>
                  {paymentLabels[method]}
                </button>
              ))}
            </div>

            <label className="toggle-field"><input type="checkbox" checked={mixed} onChange={e => setMixed(e.target.checked)} /><strong>Pagamento misto</strong></label>
            {mixed && <div className="mixed-payments">
              {(Object.keys(paymentLabels) as PaymentMethod[]).map(method => <label className="field" key={method}>
                <span>{paymentLabels[method]} — parcela</span><input inputMode="decimal" value={split[method] || ""} onChange={e => setSplit(current => ({ ...current, [method]: e.target.value }))} />
              </label>)}
              <p className="muted">Falta distribuir: {formatCurrency(total - Object.values(split).reduce((sum,amount) => sum + previewCents(amount || ""),0))}</p>
            </div>}
            {hasCredit && <label className="field"><span>Vencimento do fiado (opcional)</span><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></label>}

            <label className="field sale-customer-field">
              <span>Cliente {hasCredit ? "*" : "(opcional)"}</span>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Selecione...</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.name}</option>
                ))}
              </select>
            </label>

            {cashAmount > 0 && (
              <>
                <label className="field">
                  <span>Valor recebido</span>
                  <div className="money-input"><span>R$</span><input value={received} onChange={(e) => setReceived(e.target.value)} inputMode="decimal" /></div>
                </label>
                <div className="change-box"><span>Troco</span><strong>{formatCurrency(change)}</strong></div>
              </>
            )}

            {hasCredit && (
              <div className="credit-notice">O valor será lançado automaticamente na caderneta do cliente.</div>
            )}
          </div>

          {error && <div className="feedback error">{error}</div>}
          {feedback && <div className="feedback success">{feedback}</div>}
          {lastSaleId && <button className="secondary-button" disabled={saving} onClick={() => setReceipt({ saleId: lastSaleId })}>Ver / imprimir último comprovante</button>}

          <button className="primary-button finish-sale-button" disabled={saving || cart.length === 0 || total <= 0} onClick={finish}>
            {saving ? "Finalizando..." : "Finalizar venda"}
          </button>
        </aside>
      </div>
      {receipt && <ReceiptDialog key={receipt.saleId} saleId={receipt.saleId} autoCopies={receipt.autoCopies} onClose={() => setReceipt(null)} />}
    </section>
  );
}
