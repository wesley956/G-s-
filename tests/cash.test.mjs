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
test('receipt refunds reduce receipt totals without reducing sales and count cash once',async()=>{
 const db=resetDb();db.exec("INSERT INTO cash_sessions(id,status,opening_balance_cents) VALUES ('cash','OPEN',10000); INSERT INTO customers(id,name) VALUES ('customer','José')");
 for(const method of ['CASH','PIX','DEBIT_CARD','CREDIT_CARD']){
  db.prepare("INSERT INTO customer_account_entries(id,customer_id,type,amount_cents,status) VALUES (?,'customer','PAYMENT',1000,'CANCELLED')").run(method);
  db.prepare("INSERT INTO cash_transactions(id,cash_session_id,type,payment_method,amount_cents) VALUES (?,'cash','RECEIPT',?,1000)").run(`${method}-receipt`,method);
  db.prepare("INSERT INTO cash_transactions(id,cash_session_id,type,payment_method,amount_cents) VALUES (?,'cash','REVERSAL',?,1000)").run(`${method}-refund`,method);
  db.prepare('INSERT INTO account_payment_receipts VALUES (?,?)').run(method,`${method}-receipt`);
  db.prepare('INSERT INTO account_payment_refunds(payment_id,cash_transaction_id,reason) VALUES (?,?,?)').run(method,`${method}-refund`,'Devolvido');
 }
 const result=await getCashSummary({id:'cash',opening_balance_cents:10000});
 assert.equal(result.expectedCashCents,10000);assert.equal(result.totalSalesCents,0);assert.equal(result.cashSalesCents,0);assert.equal(result.pixSalesCents,0);
 assert.equal(result.receiptCashCents,0);assert.equal(result.receiptPixCents,0);assert.equal(result.receiptDebitCents,0);assert.equal(result.receiptCreditCents,0);assert.equal(result.reversalsCents,1000);
});
test('expenses and incoming refunds keep payment methods separate from sales, receipts and supplies',async()=>{
 const db=resetDb();db.exec("INSERT INTO cash_sessions(id,status,opening_balance_cents) VALUES ('cash','OPEN',10000)");
 const put=db.prepare("INSERT INTO cash_transactions(id,cash_session_id,type,payment_method,amount_cents) VALUES (?,'cash',?,?,?)");
 put.run('sale','SALE','CASH',2500);put.run('receipt','RECEIPT','CASH',300);put.run('supply','SUPPLY',null,400);put.run('withdraw','WITHDRAWAL',null,200);
 put.run('legacy','EXPENSE',null,500);
 for(const method of ['CASH','PIX','DEBIT_CARD','CREDIT_CARD']){
  put.run(method,'EXPENSE',method,1000);
  db.prepare("INSERT INTO expenses(id,cash_transaction_id,category,origin) VALUES (?,?,'Contas','MODULE')").run(method,method);
  put.run(`${method}-refund`,'SUPPLY',method,1000);
  db.prepare('INSERT INTO expense_refunds(expense_id,cash_transaction_id,reason) VALUES (?,?,?)').run(method,`${method}-refund`,'Devolução');
 }
 let result=await getCashSummary({id:'cash',opening_balance_cents:10000});
 assert.equal(result.expectedCashCents,12500);assert.equal(result.totalSalesCents,2500);assert.equal(result.suppliesCents,400);
 assert.equal(result.expensesCents,500);assert.equal(result.cashExpensesCents,500);assert.equal(result.pixExpensesCents,0);assert.equal(result.debitExpensesCents,0);assert.equal(result.creditExpensesCents,0);assert.equal(result.receiptCashCents,300);
 db.prepare("DELETE FROM expense_refunds WHERE expense_id='PIX'").run();db.prepare("DELETE FROM cash_transactions WHERE id='PIX-refund'").run();
 result=await getCashSummary({id:'cash',opening_balance_cents:10000});assert.equal(result.expensesCents,1500);assert.equal(result.pixExpensesCents,1000);assert.equal(result.expectedCashCents,12500);
});
