import { ArrowLeft, Save } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getSupplier, saveSupplier } from "../services/supplierService";
import type { SupplierFormData } from "../types/supplier";

const initial: SupplierFormData = { name: "", contactName: "", phone: "", whatsapp: "", document: "", email: "", address: "", notes: "", active: true };

export function SupplierFormPage() {
  const { supplierId } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(initial);
  const [ready, setReady] = useState(!supplierId);
  const [missing, setMissing] = useState(false);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const attempt = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null); setMissing(false); setReady(!supplierId); setForm(initial); attempt.current = null;
    if (supplierId) void getSupplier(supplierId).then(row => {
      if (!active) return;
      if (!row) { setMissing(true); return; }
      setForm({ name: row.name, contactName: row.contact_name || "", phone: row.phone || "", whatsapp: row.whatsapp || "", document: row.document || "", email: row.email || "", address: row.address || "", notes: row.notes || "", active: Boolean(row.active) });
      setReady(true);
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : String(err)); });
    return () => { active = false; };
  }, [supplierId, reload]);

  function update<K extends keyof SupplierFormData>(key: K, value: SupplierFormData[K]) { setForm(current => ({ ...current, [key]: value })); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || busy.current) return;
    busy.current = true; setSaving(true); setError(null);
    try {
      // Keep one attempt across errors. If a response was lost after creation,
      // changing fields must not accidentally create a second supplier.
      attempt.current ??= crypto.randomUUID();
      await saveSupplier(form, supplierId, attempt.current);
      navigate("/suppliers");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message === "A operação já foi usada com outros dados." ? "Este fornecedor já foi salvo. Volte à lista para conferir e editar o cadastro." : message);
    }
    finally { busy.current = false; setSaving(false); }
  }

  return <section className="form-page">
    <header className="page-header"><div className="header-with-back"><Link className="icon-button" to="/suppliers" aria-label="Voltar para fornecedores"><ArrowLeft size={19} /></Link><div><p className="eyebrow">Fornecedores</p><h1>{supplierId ? "Editar fornecedor" : "Novo fornecedor"}</h1><p className="muted">Identificação, contatos e observações para a rotina do depósito.</p></div></div></header>
    {error && <div className="feedback error" role="alert">{error}{!ready && <button className="ghost-button" onClick={() => setReload(value => value + 1)}>Tentar carregar novamente</button>}</div>}
    {missing ? <div className="panel"><p>Fornecedor não encontrado.</p><Link className="secondary-button" to="/suppliers">Voltar para a lista</Link></div> : <form onSubmit={submit}>
      {!ready && !error && <p className="muted" role="status">Carregando fornecedor...</p>}
      <fieldset className="supplier-fields" disabled={!ready || saving}>
        <div className="form-section"><div className="form-section-heading"><strong>Identificação e contato</strong><span>Somente o nome é obrigatório.</span></div><div className="form-grid">
          <label className="field"><span>Nome do fornecedor *</span><input autoFocus required maxLength={160} value={form.name} onChange={e => update("name", e.target.value)} /></label>
          <label className="field"><span>Nome do contato</span><input maxLength={120} value={form.contactName} onChange={e => update("contactName", e.target.value)} /></label>
          <label className="field"><span>Telefone</span><input type="tel" maxLength={40} value={form.phone} onChange={e => update("phone", e.target.value)} /></label>
          <label className="field"><span>WhatsApp</span><input type="tel" maxLength={40} value={form.whatsapp} onChange={e => update("whatsapp", e.target.value)} /></label>
          <label className="field"><span>CPF/CNPJ</span><input maxLength={40} value={form.document} onChange={e => update("document", e.target.value)} /></label>
          <label className="field"><span>E-mail</span><input type="email" maxLength={254} value={form.email} onChange={e => update("email", e.target.value)} /></label>
          <label className="field span-2"><span>Endereço</span><input maxLength={500} value={form.address} onChange={e => update("address", e.target.value)} /></label>
          <label className="field span-2"><span>Observações</span><textarea rows={4} maxLength={4000} value={form.notes} onChange={e => update("notes", e.target.value)} /></label>
          <label className="toggle-field"><input type="checkbox" checked={form.active} onChange={e => update("active", e.target.checked)} /><div><strong>Fornecedor ativo</strong><span>Desative para manter o cadastro fora da lista de ativos.</span></div></label>
        </div></div>
      </fieldset>
      <div className="form-actions"><Link className="secondary-button" to="/suppliers">Cancelar</Link><button className="primary-button" disabled={!ready || saving}><Save size={18} />{saving ? "Salvando..." : "Salvar fornecedor"}</button></div>
    </form>}
  </section>;
}
