import { ArrowLeft, Save } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ensureDefaultCategories } from "../lib/db";
import { getProduct, listCategories, saveCategory, saveProduct } from "../services/productService";
import type { Category, ProductFormData } from "../types/product";

const initialData: ProductFormData = {
  name: "",
  categoryId: "",
  sku: "",
  description: "",
  costPrice: "",
  counterPrice: "",
  deliveryPrice: "",
  stockQuantity: "0",
  minimumStock: "0",
  active: true,
};

export function ProductFormPage() {
  const navigate = useNavigate();
  const { productId } = useParams();
  const [error, setError] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<ProductFormData>(initialData);
  const busy = useRef(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true; setLoading(true);
    void (async () => {
      await ensureDefaultCategories();
      const [rows, p] = await Promise.all([listCategories(), productId ? getProduct(productId) : Promise.resolve(null)]);
      if (!active) return;
      setCategories(rows);
      if (productId) {
        if (!p) throw new Error("Produto não encontrado.");
        setForm({name:p.name, categoryId:p.category_id || "", sku:p.sku || "", description:p.description || "", costPrice:(p.cost_price_cents/100).toFixed(2), counterPrice:(p.counter_price_cents/100).toFixed(2), deliveryPrice:(p.delivery_price_cents/100).toFixed(2), stockQuantity:String(p.stock_quantity), minimumStock:String(p.minimum_stock), active:Boolean(p.active)});
      }
    })().catch(err => { if (active) setError(String(err)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [productId]);

  function update<K extends keyof ProductFormData>(key: K, value: ProductFormData[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current || loading || !form.name.trim()) return;
    busy.current = true;

    setSaving(true);
    setError(null);
    try { await saveProduct(form, productId); navigate("/products"); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { busy.current = false; setSaving(false); }
  }

  return (
    <section className="form-page">
      <header className="page-header">
        <div className="header-with-back">
          <Link className="icon-button" to="/products" aria-label="Voltar">
            <ArrowLeft size={19} />
          </Link>
          <div>
            <p className="eyebrow">Produtos</p>
            <h1>{productId ? "Editar produto" : "Novo produto"}</h1>
            <p className="muted">Preencha os dados usados nas vendas e no controle de estoque.</p>
          </div>
        </div>
      </header>

      {error && <div className="feedback error" role="alert">{error}</div>}
      <div className="panel"><label className="field"><span>Nova categoria</span><input disabled={loading || saving} value={categoryName} onChange={e => setCategoryName(e.target.value)} /></label>
        <button className="secondary-button" disabled={loading || !categoryName.trim() || saving} onClick={async () => {
          setSaving(true); setError(null);
          try { const id = await saveCategory(categoryName); setCategories(await listCategories()); update("categoryId", id); setCategoryName(""); }
          catch (err) { setError(String(err)); } finally { busy.current = false; setSaving(false); }
        }}>Cadastrar categoria</button>
      </div>
      <form onSubmit={submit}>
        <div className="form-section">
          <div className="form-section-heading">
            <strong>Identificação</strong>
            <span>Dados básicos do item.</span>
          </div>
          <div className="form-grid">
            <label className="field span-2">
              <span>Nome do produto *</span>
              <input disabled={loading || saving} value={form.name} onChange={(e) => update("name", e.target.value)} required />
            </label>
            <label className="field">
              <span>Categoria</span>
              <select disabled={loading || saving} value={form.categoryId} onChange={(e) => update("categoryId", e.target.value)}>
                <option value="">Sem categoria</option>
                {categories.map((category) => (
                  <option value={category.id} key={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Código / SKU</span>
              <input disabled={loading || saving} value={form.sku} onChange={(e) => update("sku", e.target.value)} />
            </label>
            <label className="field span-2">
              <span>Descrição</span>
              <textarea disabled={loading || saving} rows={3} value={form.description} onChange={(e) => update("description", e.target.value)} />
            </label>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-heading">
            <strong>Preços</strong>
            <span>O sistema escolherá automaticamente o preço conforme o tipo da venda.</span>
          </div>
          <div className="price-grid">
            <label className="field">
              <span>Preço de custo</span>
              <div className="money-input"><span>R$</span><input disabled={loading || saving} inputMode="decimal" value={form.costPrice} onChange={(e) => update("costPrice", e.target.value)} /></div>
            </label>
            <label className="field featured-field">
              <span>Preço Portaria</span>
              <div className="money-input"><span>R$</span><input disabled={loading || saving} inputMode="decimal" value={form.counterPrice} onChange={(e) => update("counterPrice", e.target.value)} /></div>
            </label>
            <label className="field featured-field">
              <span>Preço Entrega</span>
              <div className="money-input"><span>R$</span><input disabled={loading || saving} inputMode="decimal" value={form.deliveryPrice} onChange={(e) => update("deliveryPrice", e.target.value)} /></div>
            </label>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-heading">
            <strong>Estoque</strong>
            <span>{productId ? "Altere quantidades pela tela Estoque para preservar o histórico." : "Quantidade inicial e ponto de alerta."}</span>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Quantidade atual</span>
              <input type="number" min="0" disabled={loading || saving || Boolean(productId)} step="0.01" value={form.stockQuantity} onChange={(e) => update("stockQuantity", e.target.value)} />
            </label>
            <label className="field">
              <span>Estoque mínimo</span>
              <input disabled={loading || saving} type="number" min="0" step="0.01" value={form.minimumStock} onChange={(e) => update("minimumStock", e.target.value)} />
            </label>
            <label className="toggle-field">
              <input disabled={loading || saving} type="checkbox" checked={form.active} onChange={(e) => update("active", e.target.checked)} />
              <div>
                <strong>Produto ativo</strong>
                <span>Disponível para uso nas vendas.</span>
              </div>
            </label>
          </div>
        </div>

        <div className="form-actions">
          <Link className="secondary-button" to="/products">Cancelar</Link>
          <button className="primary-button" disabled={loading || saving}>
            <Save size={18} />
            {saving ? "Salvando..." : "Salvar produto"}
          </button>
        </div>
      </form>
    </section>
  );
}
