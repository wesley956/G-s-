import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { server, db } from './browser-harness.mjs';
import { nativeOperation } from './native-bridge.mjs';
process.env.TZ='America/Sao_Paulo';
const require=createRequire(process.env.GAS_PLAYWRIGHT_MODULE?import.meta.url:process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/');
const { chromium }=require(process.env.GAS_PLAYWRIGHT_MODULE || 'playwright');
const op=(kind,data={},id=crypto.randomUUID())=>nativeOperation('tmp/browser-test.db',{id,kind,data});
const financial=()=>JSON.stringify(['sales','payments','sale_items','sale_receipt_snapshots','cash_sessions','cash_transactions','customer_account_entries','account_payment_refunds','expenses','expense_refunds','products','suppliers','operation_results'].map(t=>db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()));
let browser,page;
try {
 await mkdir('tmp/screenshots',{recursive:true});
 const day=db.prepare("SELECT date('now','localtime') day").get().day;
 const query={start:day,end:day,kind:null,search:'',page:1,anchor:null};
 for(const [id,local] of [['boundary-before',`${day} 00:00:00`],['boundary-first',`${day} 00:00:00`],['boundary-last',`${day} 23:59:59`],['boundary-after',`${day} 23:59:59`]]) {
  let modifier=id.endsWith('before')?'-1 second':id.endsWith('after')?'+1 second':'+0 seconds';
  db.prepare("INSERT INTO operation_results(id,request_json,result_json,created_at) VALUES (?,'{}','null',datetime(?,'utc',?))").run(id,local,modifier);
 }
 const boundaries=await op('AUDIT_READ',query);assert.deepEqual(boundaries.items.map(i=>i.id),['boundary-last','boundary-first']);db.exec("DELETE FROM operation_results WHERE id LIKE 'boundary-%'");
 browser=await chromium.launch({executablePath:process.env.GAS_BROWSER_EXECUTABLE,headless:true,args:['--no-sandbox']});page=await browser.newPage({viewport:{width:1280,height:1000},locale:'pt-BR',timezoneId:'America/Sao_Paulo'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>window.__failAudit=true);await page.goto('http://127.0.0.1:1420/#/audit');await page.getByRole('alert').filter({hasText:'Falha simulada ao consultar auditoria'}).waitFor();assert.equal(await page.locator('.audit-table tbody tr').count(),0);
 await page.evaluate(()=>window.__failAudit=false);await page.getByRole('button',{name:'Tentar novamente'}).click();await page.getByText('Nenhuma operação confirmada encontrada',{exact:false}).waitFor();
 const consult=page.getByRole('button',{name:'Consultar / atualizar'});
 async function settle(){await page.waitForFunction(()=>document.querySelector('.audit-page')?.getAttribute('aria-busy')==='false');}
 async function refresh(){await consult.click();await settle();}
 const description='literal %_ registro';const debit={customerId:'customer',amountCents:101,description};const retry=crypto.randomUUID();await op('DEBIT',debit,retry);await op('DEBIT',debit,retry);await assert.rejects(op('DEBIT',{...debit,amountCents:-1}));
 for(let n=0;n<30;n++) await op('DEBIT',{customerId:'customer',amountCents:1,description:`Débito local ${n}`});
 db.exec("UPDATE products SET name='Gás P.13' WHERE id='gas'");
 const sale=await op('SALE',{saleType:'DELIVERY',customerId:'customer',discountCents:1001,items:[{productId:'gas',quantity:1}],payments:[{method:'PIX',amountCents:7999},{method:'CREDIT_CUSTOMER',amountCents:4000}]});
 await op('RECEIVE',{customerId:'customer',amountCents:4000,method:'CASH'});const payment=db.prepare("SELECT id FROM customer_account_entries WHERE type='PAYMENT'").get().id;await op('REFUND_RECEIPT',{customerId:'customer',paymentId:payment,reason:'Devolução solicitada'});
 const supplier=await op('SUPPLIER',{name:'Águas São João',active:true});const expense=await op('EXPENSE',{sessionId:'cash',description:'Compra de água',category:'Mercadorias',amountCents:1001,method:'PIX',supplierId:supplier,notes:'Pagamento original'});await op('REFUND_EXPENSE',{expenseId:expense,sessionId:'cash',reason:'Compra devolvida'});
 db.exec("UPDATE customers SET name='Cliente novo',active=0;UPDATE products SET name='Nome atual diferente',active=0 WHERE id='gas';UPDATE suppliers SET name='Fornecedor novo',active=0");
 const before=financial();await refresh();assert.equal(await page.locator('.audit-table tbody tr').count(),25);
 const total=db.prepare('SELECT COUNT(*) n FROM operation_results').get().n;await page.getByText(`Resultado: ${total} operações`,{exact:false}).waitFor();
 await page.getByRole('button',{name:'Próxima',exact:true}).click();await settle();assert.equal(await page.locator('.audit-table tbody tr').count(),total-25);
 await page.getByRole('button',{name:'Anterior',exact:true}).click();await settle();assert.equal(await page.locator('.audit-table tbody tr').count(),25);assert.equal(financial(),before);
 await page.getByLabel('Tipo',{exact:true}).selectOption('SALE');await refresh();assert.equal(await page.locator('.audit-table tbody tr').count(),1);await page.getByRole('button',{name:`Ver detalhes de ${db.prepare("SELECT id FROM operation_results WHERE json_extract(request_json,'$.kind')='SALE'").get().id}`}).click();
 const detail=page.getByRole('article',{name:'Detalhes da operação'});await detail.getByText('José da Conceição',{exact:true}).waitFor();await detail.getByText('Gás P.13 · 1,00',{exact:true}).waitFor();await detail.getByText('R$ 119,99',{exact:true}).waitFor();assert.equal(await detail.getByRole('link',{name:'Histórico de vendas'}).getAttribute('href'),'#/sales');assert.equal(await detail.getByRole('link',{name:'Caderneta atual'}).getAttribute('href'),'#/accounts/customer');assert.equal(await detail.getByText('Nome atual diferente',{exact:true}).count(),0);
 for(const width of [1280,1024]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await detail.locator('dd').evaluateAll(nodes=>nodes.some(n=>n.scrollWidth>n.clientWidth)),false);await page.screenshot({path:`tmp/screenshots/audit-${width}.png`,fullPage:true});}
 await page.getByLabel('Tipo',{exact:true}).selectOption('REFUND_EXPENSE');await refresh();await page.getByRole('button',{name:/Ver detalhes de/}).click();await detail.getByText('Águas São João',{exact:true}).waitFor();await detail.getByText('R$ 10,01',{exact:true}).waitFor();await detail.getByText('Compra devolvida',{exact:true}).waitFor();assert.equal(await detail.getByRole('link',{name:'Histórico de despesas'}).getAttribute('href'),'#/expenses');
 await page.getByLabel('Tipo',{exact:true}).selectOption('DEBIT');await page.getByLabel('Buscar no registro').fill('%_');await refresh();assert.equal(await page.locator('.audit-table tbody tr').count(),1);await page.getByRole('button',{name:`Ver detalhes de ${retry}`}).click();await detail.getByText(description,{exact:true}).waitFor();assert.equal(financial(),before);
 // Editing filters cannot change which query pagination belongs to.
 await page.getByLabel('Tipo',{exact:true}).selectOption('');await page.getByLabel('Buscar no registro').fill('');await refresh();await page.getByLabel('Tipo',{exact:true}).selectOption('SALE');await page.getByRole('button',{name:'Próxima',exact:true}).click();await settle();assert.match(await page.locator('.audit-period').innerText(),/Todos os tipos/);assert.equal(await page.locator('.audit-table tbody tr').count(),total-25);
 await op('CATEGORY',{name:'Chegou depois da consulta'});await page.getByRole('button',{name:'Anterior',exact:true}).click();await settle();await page.getByText(`Resultado: ${total} operações`,{exact:false}).waitFor();await page.getByLabel('Tipo',{exact:true}).selectOption('');await refresh();await page.getByText(`Resultado: ${total+1} operações`,{exact:false}).waitFor();
 await page.evaluate(()=>window.__failAudit=true);await refresh();await page.getByRole('alert').filter({hasText:'última consulta bem-sucedida'}).waitFor();assert.equal(await page.locator('.audit-table tbody tr').count(),25);await page.evaluate(()=>window.__failAudit=false);await page.getByRole('button',{name:'Tentar novamente'}).click();await settle();assert.equal(await page.getByRole('alert').count(),0);
 await page.evaluate(()=>window.__delayAudit=700);const response=page.waitForResponse(r=>r.url().includes('/__test_ipc')&&r.request().postDataJSON()?.command==='get_audit');await consult.click();await response;await page.getByRole('link',{name:'Clientes',exact:true}).click();await page.getByRole('heading',{name:'Clientes',exact:true}).waitFor();await op('CATEGORY',{name:'Outra operação nova'});await page.evaluate(()=>window.__delayAudit=0);await page.getByRole('link',{name:'Auditoria',exact:true}).click();await settle();await page.getByText(`Resultado: ${total+2} operações`,{exact:false}).waitFor();await page.waitForFunction(()=>window.__auditDelaysCompleted>0);await page.getByText(`Resultado: ${total+2} operações`,{exact:false}).waitFor();
 const saved=await op('AUDIT_READ',query);const backup=await op('BACKUP_CREATE');const directory=`tmp/audit-recovery-${crypto.randomUUID()}`;await op('CATEGORY',{name:'Após backup'});await op('BACKUP_RESTORE',{sourcePath:`tmp/browser-backups/${backup.id}`,recoveryDirectory:directory});const restored=await nativeOperation(`${directory}/deposito.db`,{id:crypto.randomUUID(),kind:'AUDIT_READ',data:query});assert.deepEqual(restored.items,saved.items);assert.equal(restored.total,saved.total);assert.deepEqual(restored.query,saved.query);
 assert.deepEqual(errors,[]);console.log('PASS: confirmed-operation history native SQLite, local day endpoints, replay once, rollback absent, filters/literal search, anchored pagination, historical inactive references, read-only source, initial/stale failure retry, unmounted request, backup restore and 1024/1280 layout');
} catch(error){console.error(await page?.locator('body').innerText());throw error;} finally {await browser?.close();await server.close();}
