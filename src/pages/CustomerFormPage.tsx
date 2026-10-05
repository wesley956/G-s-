import { ArrowLeft, Save } from "lucide-react";
import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { saveCustomer } from "../services/customerService";
import type { CustomerFormData } from "../types/customer";

const initial: CustomerFormData = {
  type: "PERSON",
  name: "",
  phone: "",
  whatsapp: "",
  document: "",
  address: "",
  notes: "",
  active: true,
};

export function CustomerFormPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function update<K extends keyof CustomerFormData>(key: K, value: CustomerFormData[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try { await saveCustomer(form); navigate("/customers"); } catch(err) { setError(String(err)); } finally { setSaving(false); }
  }

  return (
    <section className="form-page">
      <header className="page-header">
        <div className="header-with-back">
          <Link className="icon-button" to="/customers"><ArrowLeft size={19} /></Link>
          <div>
            <p className="eyebrow">Clientes</p>
            <h1>Novo cliente</h1>
            <p className="muted">Cadastre pessoa física ou comércio para vendas e caderneta.</p>
          </div>
        </div>
      </header>

      {error && <div className="feedback error">{error}</div>}
      <form onSubmit={submit}>
        <div className="form-section">
          <div className="form-section-heading"><strong>Identificação</strong><span>Dados principais do cliente.</span></div>
          <div className="form-grid">
            <label className="field">
              <span>Tipo</span>
              <select value={form.type} onChange={(e) => update("type", e.target.value as CustomerFormData["type"])}>
                <option value="PERSON">Pessoa</option>
                <option value="BUSINESS">Comércio / Empresa</option>
              </select>
            </label>
            <label className="field"><span>Nome *</span><input required value={form.name} onChange={(e) => update("name", e.target.value)} /></label>
            <label className="field"><span>Telefone</span><input value={form.phone} onChange={(e) => update("phone", e.target.value)} /></label>
            <label className="field"><span>WhatsApp</span><input value={form.whatsapp} onChange={(e) => update("whatsapp", e.target.value)} /></label>
            <label className="field"><span>CPF/CNPJ</span><input value={form.document} onChange={(e) => update("document", e.target.value)} /></label>
            <label className="field span-2"><span>Endereço</span><input value={form.address} onChange={(e) => update("address", e.target.value)} /></label>
            <label className="field span-2"><span>Observações</span><textarea rows={4} value={form.notes} onChange={(e) => update("notes", e.target.value)} /></label>
            <label className="toggle-field"><input type="checkbox" checked={form.active} onChange={(e) => update("active", e.target.checked)} /><div><strong>Cliente ativo</strong><span>Disponível para seleção em novas vendas.</span></div></label>
          </div>
        </div>

        <div className="form-actions">
          <Link className="secondary-button" to="/customers">Cancelar</Link>
          <button className="primary-button" disabled={saving}><Save size={18} />{saving ? "Salvando..." : "Salvar cliente"}</button>
        </div>
      </form>
    </section>
  );
}
