import { ArrowLeft, Save } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ensureDefaultCategories } from "../lib/db";
import { listCategories, saveProduct } from "../services/productService";
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<ProductFormData>(initialData);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      await ensureDefaultCategories();
      setCategories(await listCategories());
    })();
  }, []);

  function update<K extends keyof ProductFormData>(key: K, value: ProductFormData[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return;

    setSaving(true);
    await saveProduct(form);
    navigate("/products");
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
            <h1>Novo produto</h1>
            <p className="muted">Preencha os dados usados nas vendas e no controle de estoque.</p>
          </div>
        </div>
      </header>

      <form onSubmit={submit}>
        <div className="form-section">
          <div className="form-section-heading">
            <strong>Identificação</strong>
            <span>Dados básicos do item.</span>
          </div>
          <div className="form-grid">
            <label className="field span-2">
              <span>Nome do produto *</span>
              <input value={form.name} onChange={(e) => update("name", e.target.value)} required />
            </label>
            <label className="field">
              <span>Categoria</span>
              <select value={form.categoryId} onChange={(e) => update("categoryId", e.target.value)}>
                <option value="">Sem categoria</option>
                {categories.map((category) => (
                  <option value={category.id} key={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Código / SKU</span>
              <input value={form.sku} onChange={(e) => update("sku", e.target.value)} />
            </label>
            <label className="field span-2">
              <span>Descrição</span>
              <textarea rows={3} value={form.description} onChange={(e) => update("description", e.target.value)} />
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
              <div className="money-input"><span>R$</span><input inputMode="decimal" value={form.costPrice} onChange={(e) => update("costPrice", e.target.value)} /></div>
            </label>
            <label className="field featured-field">
              <span>Preço Portaria</span>
              <div className="money-input"><span>R$</span><input inputMode="decimal" value={form.counterPrice} onChange={(e) => update("counterPrice", e.target.value)} /></div>
            </label>
            <label className="field featured-field">
              <span>Preço Entrega</span>
              <div className="money-input"><span>R$</span><input inputMode="decimal" value={form.deliveryPrice} onChange={(e) => update("deliveryPrice", e.target.value)} /></div>
            </label>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-heading">
            <strong>Estoque</strong>
            <span>Quantidade atual e ponto de alerta.</span>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Quantidade atual</span>
              <input type="number" step="0.01" value={form.stockQuantity} onChange={(e) => update("stockQuantity", e.target.value)} />
            </label>
            <label className="field">
              <span>Estoque mínimo</span>
              <input type="number" step="0.01" value={form.minimumStock} onChange={(e) => update("minimumStock", e.target.value)} />
            </label>
            <label className="toggle-field">
              <input type="checkbox" checked={form.active} onChange={(e) => update("active", e.target.checked)} />
              <div>
                <strong>Produto ativo</strong>
                <span>Disponível para uso nas vendas.</span>
              </div>
            </label>
          </div>
        </div>

        <div className="form-actions">
          <Link className="secondary-button" to="/products">Cancelar</Link>
          <button className="primary-button" disabled={saving}>
            <Save size={18} />
            {saving ? "Salvando..." : "Salvar produto"}
          </button>
        </div>
      </form>
    </section>
  );
}
