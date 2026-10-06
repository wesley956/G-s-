import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { server, db } from './browser-harness.mjs';
import { nativeOperation } from './native-bridge.mjs';
process.env.TZ = 'America/Sao_Paulo';
const require=createRequire(process.env.GAS_PLAYWRIGHT_MODULE ? import.meta.url : process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/' : import.meta.url);
const { chromium }=require(process.env.GAS_PLAYWRIGHT_MODULE || 'playwright');
const op=(kind,data)=>nativeOperation('tmp/browser-test.db',{id:crypto.randomUUID(),kind,data});
const tables=['sales','sale_items','payments','cash_sessions','cash_transactions','customer_account_entries','account_payment_allocations','account_payment_receipts','account_payment_refunds','expenses','expense_refunds','operation_results','products','suppliers'];
const financialState=()=>JSON.stringify(tables.map(table=>db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
// Parse quoted, rectangular CSV including embedded semicolons/newlines/quotes.
function parseCsv(text) {
 const rows=[];let row=[],field='',quoted=false;
 for(let i=1;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(!quoted&&c===';'){row.push(field);field='';}else if(!quoted&&c==='\r'&&text[i+1]==='\n'){row.push(field);rows.push(row);row=[];field='';i++;}else field+=c;}
 assert.equal(quoted,false);assert.equal(field,'');return rows;
}
let browser,page;
try {
 await mkdir('tmp/screenshots',{recursive:true});
 // Boundary: 02:59:59 UTC is still Jan 9 locally; 03:00 UTC begins Jan 10.
 db.exec("INSERT INTO cash_transactions(id,cash_session_id,type,amount_cents,created_at) VALUES ('before','cash','SUPPLY',7,'2026-01-10 02:59:59'),('boundary','cash','SUPPLY',11,'2026-01-10 03:00:00'),('after','cash','SUPPLY',13,'2026-01-11 03:00:00')");
 const boundaryFirst=await op('REPORT_READ',{start:'2026-01-10',end:'2026-01-10'});assert.equal(boundaryFirst.cash.suppliesCents,11);assert.deepEqual(boundaryFirst.movements.map(m=>m.id),['boundary']);
 const boundaryNext=await op('REPORT_READ',{start:'2026-01-11',end:'2026-01-11'});assert.equal(boundaryNext.cash.suppliesCents,13);
 db.exec("DELETE FROM cash_transactions WHERE id IN ('before','boundary','after')");
 db.exec("INSERT INTO suppliers(id,name) VALUES ('vendor','=Fornecedor; Água')");
 const sale=await op('SALE',{saleType:'DELIVERY',customerId:'customer',discountCents:1000,items:[{productId:'gas',quantity:1}],payments:[{method:'CASH',amountCents:6000,receivedCents:10000},{method:'CREDIT_CUSTOMER',amountCents:5000}],dueDate:'2026-12-01'});
 const water=await op('SALE',{saleType:'COUNTER',customerId:null,discountCents:0,items:[{productId:'water',quantity:2}],payments:[{method:'PIX',amountCents:1000},{method:'DEBIT_CARD',amountCents:1000}]});
 await op('RECEIVE',{customerId:'customer',amountCents:2000,method:'CASH'});
 const payment=db.prepare("SELECT id FROM customer_account_entries WHERE type='PAYMENT'").get().id;
 const expense=await op('EXPENSE',{sessionId:'cash',description:'=SUM(1;2)\n"Água"',category:'@Água',amountCents:1234,method:'CASH',supplierId:'vendor',notes:'Histórico'});
 for(const method of ['PIX','DEBIT_CARD','CREDIT_CARD']) await op('EXPENSE',{sessionId:'cash',description:`Conta ${method}`,category:'Contas',amountCents:101,method,supplierId:null,notes:null});
 await op('CASH_MOVE',{sessionId:'cash',type:'SUPPLY',amountCents:500});await op('CASH_MOVE',{sessionId:'cash',type:'WITHDRAWAL',amountCents:100});
 db.exec("UPDATE sales SET completed_at='2026-01-10 12:00:00'; UPDATE cash_transactions SET created_at='2026-01-10 12:00:00'; UPDATE cash_sessions SET opened_at='2026-01-10 12:00:00'");
 await op('CLOSE_CASH',{sessionId:'cash',informedCents:17165});db.exec("UPDATE cash_sessions SET closed_at='2026-01-10 13:00:00' WHERE id='cash'");
 const session=await op('OPEN_CASH',{amountCents:10000});await op('CANCEL_SALE',{saleId:water.saleId,reason:'Devolução da água'});await op('REFUND_RECEIPT',{customerId:'customer',paymentId:payment,reason:'Cliente recebeu dinheiro'});await op('REFUND_EXPENSE',{expenseId:expense,sessionId:session,reason:'Fornecedor devolveu dinheiro'});
 db.exec("UPDATE sales SET cancelled_at='2026-01-11 12:00:00' WHERE status='CANCELLED'; UPDATE cash_transactions SET created_at='2026-01-11 12:00:00' WHERE cash_session_id<>'cash'; UPDATE cash_sessions SET opened_at='2026-01-11 12:00:00' WHERE status='OPEN'; UPDATE products SET name='Gás atualizado',active=0 WHERE id='gas'; UPDATE suppliers SET name='Nome atualizado',active=0 WHERE id='vendor'; UPDATE customers SET active=0");
 const first=await op('REPORT_READ',{start:'2026-01-10',end:'2026-01-10'});assert.equal(first.cash.suppliesCents,500);assert.equal(first.cash.netCents,7166);assert.equal(first.sales.netCents,13000);assert.equal(first.closings[0].expectedCents,17166);assert.equal(first.cash.closingDifferenceCents,-1);
 const second=await op('REPORT_READ',{start:'2026-01-11',end:'2026-01-11'});assert.equal(second.cash.netCents,-766);assert.equal(second.cash.suppliesCents,0);assert.equal(second.sales.netCents,-2000);assert.equal(second.accounts[0].balanceCents,5000);assert.equal(second.expenses[0].refundedCents,1234);
 const before=financialState();
 browser=await chromium.launch({executablePath:process.env.GAS_BROWSER_EXECUTABLE,headless:true,args:['--no-sandbox']});page=await browser.newPage({viewport:{width:1280,height:900},locale:'pt-BR',timezoneId:'America/Sao_Paulo'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:1420/#/reports');await page.getByRole('button',{name:'Consultar',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('button[type=submit]')?.disabled);
 async function query(start,end){await page.getByLabel('Data inicial',{exact:true}).fill(start);await page.getByLabel('Data final',{exact:true}).fill(end);await page.getByRole('button',{name:'Consultar',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('button[type=submit]')?.disabled);}
 await query('2026-01-10','2026-01-10');await page.locator('.metric-card').filter({hasText:'Vendas líquidas'}).getByText(/130,00/).waitFor();await page.screenshot({path:'tmp/screenshots/relatorios-resumo.png',fullPage:true});
 for(const width of [1280,1024]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.locator('.report-metrics strong').evaluateAll(nodes=>nodes.some(n=>n.scrollWidth>n.clientWidth)),false);}
 await page.getByRole('button',{name:'Produtos',exact:true}).click();await page.getByRole('row').filter({hasText:'Gás P13'}).waitFor();assert.equal(await page.getByRole('row').filter({hasText:'Gás atualizado'}).count(),0);
 await page.getByRole('button',{name:'Despesas',exact:true}).click();await page.getByRole('row').filter({hasText:'=Fornecedor; Água'}).getByText(/12,34/).first().waitFor();
 await page.getByRole('button',{name:'Caixa',exact:true}).click();await page.getByRole('heading',{name:'Fechamentos no período'}).waitFor();await page.getByRole('row').filter({hasText:'10/01/2026 10:00:00'}).getByText(/171,66/).waitFor();await page.screenshot({path:'tmp/screenshots/relatorios-caixa.png',fullPage:true});
 await page.getByRole('button',{name:'Cadernetas',exact:true}).click();await page.getByRole('row').filter({hasText:'José da Conceição'}).getByText('Inativo',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Estoque',exact:true}).click();await page.getByRole('row').filter({hasText:'Gás atualizado'}).getByText('Inativo',{exact:true}).waitFor();
 await query('2026-01-11','2026-01-11');await page.getByRole('button',{name:'Resumo',exact:true}).click();await page.locator('.metric-card').filter({hasText:'Vendas líquidas'}).getByText(/-.*20,00/).waitFor();
 await query('2026-01-12','2026-01-10');await page.getByRole('alert').filter({hasText:'Informe um período válido'}).waitFor();
 await query('2099-01-01','2099-01-01');await page.getByText('Nenhum movimento financeiro neste período.',{exact:false}).waitFor();await page.getByRole('button',{name:'Estoque',exact:true}).click();await page.getByRole('row').filter({hasText:'Gás atualizado'}).waitFor();
 await query('2026-01-10','2026-01-11');
 await page.evaluate(()=>window.__cancelReportExport=true);await page.getByRole('button',{name:'Exportar CSV'}).click();await page.getByRole('status').filter({hasText:'Exportação cancelada'}).waitFor();await page.evaluate(()=>{window.__cancelReportExport=false;window.__failReportExport=true;});await page.getByRole('button',{name:'Exportar CSV'}).click();await page.getByRole('alert').filter({hasText:'Falha simulada ao salvar CSV'}).waitFor();await page.evaluate(()=>window.__failReportExport=false);await page.getByRole('button',{name:'Exportar CSV'}).click();const status=page.getByRole('status').filter({hasText:'CSV salvo em'});await status.waitFor();const path=(await status.innerText()).replace('CSV salvo em ','');
 const contents=await readFile(path,'utf8');const csv=parseCsv(contents);assert.equal(contents.charCodeAt(0),0xfeff);assert.ok(contents.includes("10/01/2026 a 11/01/2026"));assert.ok(csv.every(row=>row.length===9));assert.ok(csv.some(row=>row[3]==="'=Fornecedor; Água"));assert.ok(csv.some(row=>row[3]==="'=SUM(1;2)\n\"Água\""));assert.ok(csv.some(row=>row[4]==="'@Água"));assert.ok(csv.some(row=>row[5]==='Vendas líquidas no período'&&row[6]==='110,00'));assert.ok(csv.some(row=>row[5]==='Diferença'&&row[6]==='-0,01'));assert.equal(financialState(),before);
 // Export refreshes the screen from the same native snapshot used in the file.
 await page.getByRole('button',{name:'Estoque',exact:true}).click();const stockRow=page.getByRole('row').filter({hasText:'Gás atualizado'});await stockRow.getByRole('cell',{name:'9',exact:true}).waitFor();
 db.exec("UPDATE products SET stock_quantity=8 WHERE id='gas'");const changed=financialState();
 await page.getByRole('button',{name:'Exportar CSV'}).click();await status.waitFor();await stockRow.getByRole('cell',{name:'8',exact:true}).waitFor();
 const freshPath=(await status.innerText()).replace('CSV salvo em ','');assert.notEqual(freshPath,path);const fresh=parseCsv(await readFile(freshPath,'utf8'));assert.ok(fresh.some(row=>row[0]==='Estoque atual'&&row[2]==='gas'&&row[5]==='Quantidade atual'&&row[7]==='8,00'));assert.equal(financialState(),changed);
 // Native backup/reopen of the same report dataset preserves all sections.
 const recoveryDirectory=`tmp/report-recovery-${crypto.randomUUID()}`;const saved=await op('REPORT_READ',{start:'2026-01-10',end:'2026-01-11'});const backup=await op('BACKUP_CREATE',{});db.exec("UPDATE products SET stock_quantity=0 WHERE id='gas'");await op('BACKUP_RESTORE',{sourcePath:`tmp/browser-backups/${backup.id}`,recoveryDirectory});
 const restored=await nativeOperation(`${recoveryDirectory}/deposito.db`,{id:crypto.randomUUID(),kind:'REPORT_READ',data:{start:'2026-01-10',end:'2026-01-11'}});for(const key of ['sales','cash','methods','products','expenses','movements','closings','accounts','stock'])assert.deepEqual(restored[key],saved[key]);
 assert.deepEqual(errors,[]);console.log('PASS: offline reports with real Rust/SQLite, local date boundaries, mixed payments, partial fiado, late refunds, closed snapshots, historical names, current inactive accounts/stock, CSV quoting/formula protection, cancellation/failure/success, read-only financial data, backup restore, 1024/1280 layout and no console errors');
} catch(error){console.error(await page?.locator('body').innerText());throw error;} finally {await browser?.close();await server.close();}
