import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDb } from './sql-mock.mjs';
import { getCashSummary } from '../src/services/cashService.ts';
test('PIX/card/credit reversals do not consume physical cash; cash reversal counted once',async()=>{
 const db=resetDb();db.exec("INSERT INTO cash_sessions(id,status,opening_balance_cents) VALUES ('cash','OPEN',10000)");
 const put=db.prepare('INSERT INTO cash_transactions(id,cash_session_id,type,payment_method,amount_cents) VALUES (?,\'cash\',?,?,?)');
 for(const method of ['CASH','PIX','DEBIT_CARD','CREDIT_CARD','CREDIT_CUSTOMER']){
  put.run(`${method}-sale`,'SALE',method,1000);put.run(`${method}-reverse`,'REVERSAL',method,1000);
 }
 put.run('received','RECEIPT','CASH',500);put.run('pix-received','RECEIPT','PIX',300);
 const result=await getCashSummary({id:'cash',opening_balance_cents:10000});
 assert.equal(result.expectedCashCents,10500);assert.equal(result.totalSalesCents,0);assert.equal(result.pixSalesCents,0);assert.equal(result.receiptPixCents,300);
});
