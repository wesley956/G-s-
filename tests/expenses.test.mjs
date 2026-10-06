import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDb } from './sql-mock.mjs';
import { listExpenses } from '../src/services/expenseService.ts';
test('expense filters include period endpoints and inactive supplier history with original snapshot',async()=>{
 const db=resetDb();db.exec("INSERT INTO cash_sessions(id,status) VALUES ('cash','OPEN'); INSERT INTO suppliers(id,name,active) VALUES ('vendor','Nome novo',0)");
 for(const [id,date] of [['before','2026-01-09 12:00:00'],['start','2026-01-10 12:00:00'],['end','2026-01-11 12:00:00'],['after','2026-01-12 12:00:00']]){
  db.prepare("INSERT INTO cash_transactions(id,cash_session_id,type,payment_method,amount_cents,description,created_at) VALUES (?,'cash','EXPENSE','PIX',1234,'Entrega',?)").run(id,date);
  db.prepare("INSERT INTO expenses(id,cash_transaction_id,category,supplier_id,supplier_name_snapshot,origin) VALUES (?,?,'Transporte','vendor','Nome original','MODULE')").run(id,id);
 }
 const rows=await listExpenses({start:'2026-01-10',end:'2026-01-11',supplierId:'vendor'});
 assert.deepEqual(rows.map(r=>r.id),['end','start']);assert.equal(rows[0].supplier_name_snapshot,'Nome original');assert.equal(rows[0].payment_method,'PIX');
 assert.equal((await listExpenses({start:'',end:'',supplierId:'missing'})).length,0);
});
test('legacy expense is read once with cash fallback and cancellation points to current cash',async()=>{
 const db=resetDb();db.exec("INSERT INTO cash_sessions(id,status) VALUES ('old','CLOSED'),('new','OPEN'); INSERT INTO cash_transactions(id,cash_session_id,type,amount_cents) VALUES ('expense','old','EXPENSE',500),('refund','new','SUPPLY',500); INSERT INTO expenses(id,cash_transaction_id,category,origin) VALUES ('expense','expense','Outras','LEGACY'); INSERT INTO expense_refunds(expense_id,cash_transaction_id,reason) VALUES ('expense','refund','Valor devolvido')");
 const rows=await listExpenses({start:'',end:'',supplierId:''});assert.equal(rows.length,1);assert.equal(rows[0].cash_session_id,'old');assert.equal(rows[0].refund_cash_session_id,'new');assert.equal(rows[0].payment_method,'CASH');assert.equal(rows[0].cancellation_reason,'Valor devolvido');
});
