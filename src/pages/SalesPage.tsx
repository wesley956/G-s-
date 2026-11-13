import { useEffect, useRef, useState } from "react";
import { ReceiptDialog } from "../components/receipts/ReceiptDialog";
import { formatCurrency } from "../services/productService";
import { completeDelivery, listSales } from "../services/saleService";
import { CancelSaleDialog } from "../components/CancelSaleDialog";
import type { SaleRecord } from "../types/sale";

export function SalesPage() {
  const [cancel,setCancel]=useState<SaleRecord|null>(null);
  const [delivering,setDelivering]=useState<string|null>(null);
  const deliveryAttempts=useRef<Record<string,string>>({});
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);

  async function load() {
    setSales(await listSales());
  }

  useEffect(() => { void load().catch((err) => setError(err instanceof Error ? err.message : "Não foi possível carregar as vendas.")); }, []);

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
                  <td>{sale.sale_type === "COUNTER" ? "Portaria" : "Entrega"}{sale.delivery_driver && <small className="delivery-details">{sale.delivery_driver}<br/>{sale.delivery_address}, {sale.delivery_number}<br/>{sale.delivery_status==="OUT"?"Em entrega":sale.delivery_status==="DELIVERED"?"Entrega finalizada":"Entrega cancelada"}</small>}</td>
                  <td>{formatCurrency(sale.total_cents)}</td>
                  <td>
                    <span className={sale.status === "COMPLETED" ? "status-pill active" : "status-pill cancelled"}>
                      {sale.status === "COMPLETED" ? "Finalizada" : "Cancelada"}
                    </span>
                  </td>
                  <td className="table-actions">
                    {sale.status !== "OPEN" && <button className="ghost-button" onClick={() => setReceiptId(sale.id)}>Comprovante / reimprimir</button>}
                    {sale.status==="COMPLETED" && sale.delivery_status==="OUT" && <button className="secondary-button" disabled={Boolean(delivering)} onClick={async()=>{
                      if(delivering)return;setDelivering(sale.id);setError(null);
                      deliveryAttempts.current[sale.id]??=crypto.randomUUID();
                      try{await completeDelivery(sale.id,deliveryAttempts.current[sale.id]);await load();setReceiptId(sale.id);}catch(err){setError(err instanceof Error?err.message:String(err));}finally{setDelivering(null);}
                    }}>Finalizar entrega / comprovante</button>}
                    {sale.status === "COMPLETED" && (
                      <button className="ghost-button danger-link" onClick={()=>setCancel(sale)}>Cancelar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {cancel && <CancelSaleDialog sale={cancel} onClose={()=>setCancel(null)} onSuccess={()=>{setCancel(null);void load().catch(err=>setError(String(err)));}}/>}
      {receiptId && <ReceiptDialog key={receiptId} saleId={receiptId} onClose={() => setReceiptId(null)} />}
    </section>
  );
}
