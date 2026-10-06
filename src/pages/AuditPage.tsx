import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAudit } from '../services/auditService';
import { logError } from '../lib/errors';
import type { AuditPageData, AuditQuery } from '../types/audit';
import '../styles/audit.css';

const kinds = [
  ['SALE', 'Venda confirmada'], ['CANCEL_SALE', 'Cancelamento de venda'],
  ['STOCK', 'Movimento de estoque'], ['RECEIVE', 'Recebimento de caderneta'],
  ['REFUND_RECEIPT', 'Devolução de caderneta'], ['EXPENSE', 'Despesa paga'],
  ['REFUND_EXPENSE', 'Devolução de despesa'], ['OPEN_CASH', 'Abertura de caixa'],
  ['CASH_MOVE', 'Movimento de caixa'], ['CLOSE_CASH', 'Fechamento de caixa'],
  ['DEBIT', 'Débito manual'], ['PRODUCT', 'Cadastro / edição de produto'],
  ['SUPPLIER', 'Cadastro / edição de fornecedor'], ['SUPPLIER_ACTIVE', 'Situação do fornecedor'],
  ['CATEGORY', 'Cadastro de categoria'], ['UNKNOWN', 'Operação antiga ou desconhecida'],
] as const;
function initialQuery(): AuditQuery {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return { start: `${yearMonth}-01`, end: `${yearMonth}-${String(now.getDate()).padStart(2, '0')}`, kind: null, search: '', page: 1, anchor: null };
}
const dateLabel = (date: string) => date.split('-').reverse().join('/');

export function AuditPage() {
  const [filters, setFilters] = useState(initialQuery);
  const [data, setData] = useState<AuditPageData | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const lastQuery = useRef(filters);
  async function load(query: AuditQuery) {
    if (pending.current) return;
    pending.current = true;
    lastQuery.current = query;
    const current = ++generation.current;
    setBusy(true); setError(null);
    try {
      const result = await getAudit(query);
      if (current === generation.current) { setData(result); setSelected(null); }
    } catch (err) {
      if (current === generation.current) { setError(String(err)); logError(err); }
    } finally {
      if (current === generation.current) { pending.current = false; setBusy(false); }
    }
  }
  useEffect(() => {
    void load(lastQuery.current);
    return () => { ++generation.current; pending.current = false; };
  }, []);
  const item = data?.items.find(row => row.id === selected);
  return <section className="audit-page" aria-busy={busy}>
    <header className="page-header"><div><p className="eyebrow">Histórico local</p><h1>Auditoria</h1><p className="muted">Consulte operações confirmadas e os dados preservados no depósito.</p></div></header>
    <div className="panel audit-coverage"><h2>O que aparece aqui</h2>
      <p>Operações de vendas, cancelamentos, estoque, caderneta, despesas, caixa, produtos, fornecedores e categorias disponíveis no histórico local.</p>
      <p className="muted">Cadastro e situação de clientes, ativação rápida de produtos, preferências e backups não fazem parte deste histórico. Operações anteriores ao registro também podem não aparecer. Não há identificação do operador nem reconstrução de valores anteriores ausentes.</p>
    </div>
    <form className="panel audit-filters" onSubmit={event => { event.preventDefault(); void load({ ...filters, page: 1, anchor: null }); }}>
      <label className="field">De<input type="date" required value={filters.start} disabled={busy} onChange={e => setFilters(previous => ({ ...previous, start: e.target.value }))} /></label>
      <label className="field">Até<input type="date" required value={filters.end} disabled={busy} onChange={e => setFilters(previous => ({ ...previous, end: e.target.value }))} /></label>
      <label className="field audit-kind">Tipo<select aria-label="Tipo" value={filters.kind || ''} disabled={busy} onChange={e => setFilters(previous => ({ ...previous, kind: e.target.value || null }))}><option value="">Todos os tipos</option>{kinds.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
      <label className="field audit-search">Buscar no registro<input type="search" maxLength={120} value={filters.search} placeholder="ID, referência ou texto informado" disabled={busy} onChange={e => setFilters(previous => ({ ...previous, search: e.target.value }))} /></label>
      <button className="primary-button" type="submit" disabled={busy}>Consultar / atualizar</button>
      <p className="muted">Datas inclusivas, no horário local. A busca considera IDs e dados informados na operação; nomes atuais e dados acrescentados aos detalhes não entram na busca. Acentos devem ser digitados como registrados.</p>
    </form>
    {error && <div className="feedback error" role="alert">Não foi possível consultar a auditoria: {error}.{data && ' A lista abaixo é da última consulta bem-sucedida.'} <button type="button" className="ghost-button" disabled={busy} onClick={() => void load(lastQuery.current)}>Tentar novamente</button></div>}
    {busy && <p role="status">Consultando operações locais...</p>}
    {data && <>
      <p className="muted audit-period">Período consultado: {dateLabel(data.query.start)} a {dateLabel(data.query.end)} · {kinds.find(([kind]) => kind === data.query.kind)?.[1] || 'Todos os tipos'}{data.query.search && ` · Busca: ${data.query.search}`} · Consultado em {data.generatedAtLocal}.</p>
      <p>Resultado: {data.total} operações · Página {data.query.page} de {data.pageCount}.</p>
      <p className="muted">A paginação mantém os registros desta consulta. Use Consultar / atualizar para incluir novas operações.</p>
      {!data.items.length ? <p className="feedback">Nenhuma operação confirmada encontrada para estes filtros.</p> : <div className="data-table-wrapper"><table className="data-table audit-table"><thead><tr><th scope="col">Data local</th><th scope="col">Operação</th><th scope="col">Identificador</th><th scope="col">Detalhes</th></tr></thead><tbody>{data.items.map(row => <tr key={row.id}><td>{row.date || 'Data não disponível'}</td><th scope="row">{row.label}</th><td className="audit-id">{row.id}</td><td><button type="button" className="ghost-button" aria-expanded={selected === row.id} aria-controls="audit-details" onClick={() => setSelected(previous => previous === row.id ? null : row.id)}>Ver detalhes<span className="sr-only"> de {row.id}</span></button></td></tr>)}</tbody></table></div>}
      <nav className="audit-pagination" aria-label="Paginação da auditoria"><button type="button" className="ghost-button" disabled={busy || data.query.page <= 1} onClick={() => void load({ ...data.query, page: data.query.page - 1 })}>Anterior</button><span>Página {data.query.page} de {data.pageCount}</span><button type="button" className="ghost-button" disabled={busy || data.query.page >= data.pageCount} onClick={() => void load({ ...data.query, page: data.query.page + 1 })}>Próxima</button></nav>
      <div id="audit-details">{item && <article className="panel audit-detail" aria-label="Detalhes da operação"><h2>{item.label}</h2><p className="audit-id">Operação {item.id} · {item.date || 'Data não disponível'}</p>{item.warning && <p className="feedback">{item.warning}</p>}
        <dl>{item.fields.map((field, index) => <div key={index}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>
        {!item.fields.length && <p className="muted">Nenhum detalhe legível disponível neste registro.</p>}
        {item.references.map((reference, index) => <p className="audit-reference" key={index}><span>{reference.label === reference.id ? reference.id : `${reference.label} · ${reference.id}`}</span><Link to={reference.route}>{reference.linkLabel}</Link></p>)}
        <p className="muted">Nomes históricos aparecem quando preservados na operação ou no comprovante. Links para cadastros mostram a situação atual.</p>
      </article>}</div>
    </>}
  </section>;
}
