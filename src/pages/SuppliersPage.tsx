import { Search, Truck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { listSuppliers, setSupplierActive } from "../services/supplierService";
import type { Supplier } from "../types/supplier";

function searchText(value: string) { return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR"); }

export function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const attempts = useRef(new Map<string, { active: boolean; id: string }>());

  useEffect(() => {
    let active = true;
    setLoading(true); setError(null);
    void listSuppliers().then(rows => { if (active) setSuppliers(rows); }).catch(err => { if (active) setError(String(err)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);

  const filtered = useMemo(() => {
    const term = searchText(query.trim());
    return suppliers.filter(supplier => (status === "ALL" || Boolean(supplier.active) === (status === "ACTIVE")) &&
      (!term || [supplier.name, supplier.contact_name, supplier.phone, supplier.whatsapp, supplier.document, supplier.email].some(value => searchText(value || "").includes(term))));
  }, [suppliers, query, status]);

  async function changeStatus(supplier: Supplier) {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError(null);
    const next = !Boolean(supplier.active);
    const previous = attempts.current.get(supplier.id);
    const attempt = previous?.active === next ? previous : { active: next, id: crypto.randomUUID() };
    attempts.current.set(supplier.id, attempt);
    try {
      await setSupplierActive(supplier.id, next, attempt.id);
      attempts.current.delete(supplier.id);
      setSuppliers(await listSuppliers());
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { busy.current = false; setSaving(false); }
  }

  return <section>
    <header className="page-header"><div><p className="eyebrow">Relacionamento</p><h1>Fornecedores</h1><p className="muted">Contatos e dados de quem abastece o depósito.</p></div><Link className="primary-button" to="/suppliers/new"><Truck size={18} /> Novo fornecedor</Link></header>
    {error && <div className="feedback error" role="alert">{error} <button className="ghost-button" onClick={() => setReload(value => value + 1)}>Tentar carregar novamente</button></div>}
    <div className="summary-strip"><div><span>Fornecedores cadastrados</span><strong>{suppliers.length}</strong></div><div><span>Ativos</span><strong>{suppliers.filter(s => s.active).length}</strong></div><div><span>Inativos</span><strong>{suppliers.filter(s => !s.active).length}</strong></div></div>
    <div className="panel">
      <div className="supplier-filters"><label className="search-box"><Search size={18} /><input aria-label="Buscar fornecedores" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nome, contato, telefone ou documento..." /></label><label className="field"><span>Situação</span><select aria-label="Situação" value={status} onChange={event => setStatus(event.target.value)}><option value="ALL">Todos</option><option value="ACTIVE">Ativos</option><option value="INACTIVE">Inativos</option></select></label></div>
      {loading ? <p className="muted" role="status">Carregando fornecedores...</p> : <div className="data-table-wrapper"><table className="data-table"><thead><tr><th>Fornecedor</th><th>Contato</th><th>Telefone / WhatsApp</th><th>E-mail</th><th>Situação</th><th>Ações</th></tr></thead><tbody>
        {filtered.map(supplier => <tr key={supplier.id}><td><div className="table-title">{supplier.name}</div><div className="table-subtitle">{supplier.document || "Sem documento"}</div></td><td>{supplier.contact_name || "—"}</td><td>{supplier.phone || "—"}{supplier.whatsapp && <div className="table-subtitle">WhatsApp: {supplier.whatsapp}</div>}</td><td>{supplier.email || "—"}</td><td><span className={`status-pill ${supplier.active ? "active" : "inactive"}`}>{supplier.active ? "Ativo" : "Inativo"}</span></td><td className="table-actions"><Link className="ghost-button" to={`/suppliers/${supplier.id}/edit`}>Editar</Link><button className="ghost-button" disabled={saving} onClick={() => void changeStatus(supplier)}>{supplier.active ? "Desativar" : "Ativar"}</button></td></tr>)}
        {!filtered.length && <tr><td colSpan={6} className="muted">{suppliers.length ? "Nenhum fornecedor encontrado para os filtros." : "Nenhum fornecedor cadastrado. Comece em Novo fornecedor."}</td></tr>}
      </tbody></table></div>}
    </div>
  </section>;
}
