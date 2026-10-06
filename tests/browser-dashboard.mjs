import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { server, db } from './browser-harness.mjs';
import { nativeOperation } from './native-bridge.mjs';
process.env.TZ='America/Sao_Paulo';
const require=createRequire(process.env.GAS_PLAYWRIGHT_MODULE?import.meta.url:process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/');
const { chromium }=require(process.env.GAS_PLAYWRIGHT_MODULE || 'playwright');
const op=(kind,data={})=>nativeOperation('tmp/browser-test.db',{id:crypto.randomUUID(),kind,data});
const financial=()=>JSON.stringify(['sales','payments','sale_items','cash_sessions','cash_transactions','customer_account_entries','account_payment_refunds','expenses','expense_refunds','products','operation_results'].map(t=>db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()));
let browser,page;
try {
 await mkdir('tmp/screenshots',{recursive:true});
 // Native process uses Sao Paulo. UTC 03:00 is local midnight.
 const day=db.prepare("SELECT date('now','localtime') day").get().day;
 for(const [id,time] of [['before',`${day} 02:59:59`],['first',`${day} 03:00:00`],['last',`${day} 23:59:59`]]) db.prepare("INSERT INTO cash_transactions(id,cash_session_id,type,payment_method,amount_cents,created_at) VALUES (?,'cash','RECEIPT','PIX',1,?)").run(id,time);
 const boundary=await op('DASHBOARD_READ');assert.equal(boundary.day,day);assert.equal(boundary.methods[0].receiptsCents,2);db.exec("DELETE FROM cash_transactions WHERE id IN ('before','first','last')");
 browser=await chromium.launch({executablePath:process.env.GAS_BROWSER_EXECUTABLE,headless:true,args:['--no-sandbox']});page=await browser.newPage({viewport:{width:1280,height:1000},locale:'pt-BR',timezoneId:'America/Sao_Paulo'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>window.__failDashboard=true);
 await page.goto('http://127.0.0.1:1420/#/dashboard');await page.getByRole('alert').filter({hasText:'Falha simulada ao consultar painel'}).waitFor();assert.equal(await page.locator('.metric-card').count(),0);
 await page.evaluate(()=>window.__failDashboard=false);
 const update=page.getByRole('button',{name:'Atualizar painel'});
 async function refresh(){await update.click();await page.waitForFunction(()=>!document.querySelector('.dashboard-page')?.getAttribute('aria-busy')?.includes('true'));}
 const metric=label=>page.locator('.metric-card').filter({has:page.locator('span',{hasText:new RegExp(`^${label}$`)})}).locator('strong');
 await refresh();await page.getByText('Nenhuma venda, cancelamento ou recebimento de caderneta hoje.',{exact:false}).waitFor();assert.equal(await metric('Clientes com dívida').innerText(),'0');
 const base={saleType:'COUNTER',customerId:null,discountCents:0,items:[{productId:'water',quantity:1}],payments:[{method:'CASH',amountCents:1000,receivedCents:2000}]};
 const previous=await op('SALE',base);db.prepare("UPDATE sales SET completed_at=datetime(?,'-1 day') WHERE id=?").run(`${day} 12:00:00`,previous.saleId);await op('CANCEL_SALE',{saleId:previous.saleId,reason:'Venda de ontem devolvida hoje'});
 await op('SALE',{saleType:'COUNTER',customerId:'customer',discountCents:1001,items:[{productId:'gas',quantity:1}],payments:[{method:'CASH',amountCents:5999,receivedCents:10000},{method:'PIX',amountCents:1000},{method:'CREDIT_CUSTOMER',amountCents:4000}]});
 await op('SALE',{...base,payments:[{method:'DEBIT_CARD',amountCents:400},{method:'CREDIT_CARD',amountCents:600}]});
 await op('RECEIVE',{customerId:'customer',amountCents:1234,method:'CASH'});const payment=db.prepare("SELECT id FROM customer_account_entries WHERE type='PAYMENT'").get().id;await op('REFUND_RECEIPT',{customerId:'customer',paymentId:payment,reason:'Recebimento devolvido'});
 db.exec("UPDATE customers SET active=0; UPDATE products SET minimum_stock=stock_quantity WHERE id='gas'; UPDATE products SET active=0,stock_quantity=0,minimum_stock=1 WHERE id='water'");
 await op('RECEIVE',{customerId:'customer',amountCents:1000,method:'PIX'});
 const expense=await op('EXPENSE',{sessionId:'cash',description:'Compra local',category:'Diversos',amountCents:101,method:'CASH',supplierId:null,notes:null});await op('REFUND_EXPENSE',{expenseId:expense,sessionId:'cash',reason:'Compra devolvida'});
 const before=financial();await refresh();await metric('Vendas hoje').getByText(/119,99/).waitFor();assert.match(await metric('Cancelamentos hoje').innerText(),/10,00/);assert.match(await metric('Vendas líquidas hoje').innerText(),/109,99/);assert.match(await metric('Vendas fiado hoje').innerText(),/40,00/);assert.match(await metric('Fiado em aberto').innerText(),/30,00/);assert.equal(await metric('Clientes com dívida').innerText(),'1');assert.equal(await metric('Estoque baixo').innerText(),'1');
 const cash=page.getByRole('row').filter({has:page.getByRole('rowheader',{name:'Dinheiro',exact:true})});assert.deepEqual((await cash.getByRole('cell').allTextContents()).map(x=>x.replace(/\s/g,'')),['R$59,99','R$10,00','R$12,34','R$12,34']);
 assert.equal(financial(),before);
 for(const width of [1280,1024]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.locator('.dashboard-metrics strong').evaluateAll(nodes=>nodes.some(n=>n.scrollWidth>n.clientWidth)),false);await page.screenshot({path:`tmp/screenshots/dashboard-${width}.png`,fullPage:true});}
 await page.evaluate(()=>window.__failDashboard=true);await refresh();await page.getByRole('alert').filter({hasText:'última consulta bem-sucedida'}).waitFor();assert.match(await metric('Vendas hoje').innerText(),/119,99/);await page.evaluate(()=>window.__failDashboard=false);await refresh();assert.equal(await page.getByRole('alert').count(),0);
 // A request finishing after unmount must never replace the freshly loaded page.
 await page.evaluate(()=>window.__delayDashboard=500);await update.click();await page.getByRole('link',{name:'Cadastrar cliente',exact:true}).click();await page.getByRole('heading',{name:'Clientes',exact:true}).waitFor();await page.evaluate(()=>window.__delayDashboard=0);await page.evaluate(()=>location.hash='/dashboard');await update.waitFor();await page.waitForFunction(()=>document.querySelector('.dashboard-page')?.getAttribute('aria-busy')==='false');assert.match(await metric('Fiado em aberto').innerText(),/30,00/);
 const saved=await op('DASHBOARD_READ');const backup=await op('BACKUP_CREATE');const directory=`tmp/dashboard-recovery-${crypto.randomUUID()}`;db.exec("UPDATE products SET active=0");await op('BACKUP_RESTORE',{sourcePath:`tmp/browser-backups/${backup.id}`,recoveryDirectory:directory});const restored=await nativeOperation(`${directory}/deposito.db`,{id:crypto.randomUUID(),kind:'DASHBOARD_READ',data:{}});for(const key of Object.keys(saved).filter(k=>k!=='generatedAtLocal'))assert.deepEqual(restored[key],saved[key]);
 assert.deepEqual(errors,[]);console.log('PASS: native dashboard local day, mixed cents, late cancellation, receipts/refunds separated, inactive debtor, low stock, read-only snapshot, initial failure/retry, stale refresh warning, unmounted load, backup restore and 1024/1280 layout');
} catch(error){console.error(await page?.locator('body').innerText());throw error;} finally {await browser?.close();await server.close();}
