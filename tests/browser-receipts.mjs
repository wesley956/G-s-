import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { server } from './browser-harness.mjs';
const require=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/' : import.meta.url);
const {chromium}=require('playwright');
let browser;
try {
 browser=await chromium.launch({executablePath:process.env.GAS_BROWSER_EXECUTABLE,headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1366,height:900}});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.goto('http://127.0.0.1:1420');
 await page.waitForLoadState('networkidle');
 await page.getByRole('link',{name:'Nova Venda',exact:true}).click();
 async function sale(method='Dinheiro'){
  await page.getByRole('button',{name:/Gás P13/}).click();
  await page.getByRole('button',{name:method,exact:true}).click();
  if(method==='Dinheiro')await page.getByLabel(/Valor recebido/).fill('150,00');
  if(method==='Fiado')await page.getByLabel(/^Cliente/).selectOption('customer');
  await page.getByRole('button',{name:'Finalizar venda',exact:true}).click();
 }
 await sale();
 await page.getByRole('heading',{name:'Comprovante #1',exact:true}).waitFor();
 assert.ok((await page.locator('.receipt-paper').innerText()).includes('Troco: R$ 40,00'));
 await page.getByLabel(/^Papel/).selectOption('58mm');
 await page.getByLabel(/^Vias/).selectOption('2');
 assert.equal(await page.locator('.receipt-paper').count(),2);
 await page.getByRole('button',{name:'Imprimir 2 vias',exact:true}).click();
 await page.getByText(/Impressão solicitada/).waitFor();
 assert.equal(await page.evaluate(()=>window.__printRequests.length),1);
 assert.ok(await page.evaluate(()=>window.__printRequests[0].includes('Via 2 de 2 - Estabelecimento')));
 await page.getByRole('button',{name:'Salvar PDF',exact:true}).click();
 await page.getByText(/PDF salvo em:/).waitFor();
 await page.evaluate(()=>{window.__cancelPdf=true});
 await page.getByRole('button',{name:'Salvar PDF',exact:true}).click();
 await page.getByText(/Salvamento cancelado/).waitFor();
 await page.evaluate(()=>{window.__cancelPdf=false;window.__failPdf=true});
 await page.getByRole('button',{name:'Salvar PDF',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Falha simulada'}).waitFor();
 await page.evaluate(()=>{window.__failPdf=false});
 await page.getByRole('button',{name:'Não imprimir / fechar',exact:true}).click();
 await page.getByRole('link',{name:'Vendas',exact:true}).click();
 await page.locator('tbody tr').first().waitFor();
 assert.equal(await page.locator('tbody tr').count(),1);
 await page.getByRole('button',{name:'Comprovante / reimprimir',exact:true}).click();
 await page.getByRole('heading',{name:'Comprovante #1',exact:true}).waitFor();
 await page.getByRole('button',{name:'Não imprimir / fechar',exact:true}).click();
 for(const mode of ['AUTO_ONE','AUTO_TWO','NEVER']){
  await page.getByRole('link',{name:'Configurações',exact:true}).click();
  await page.getByLabel(/^Ao finalizar uma venda/).selectOption(mode);
  await page.getByRole('button',{name:'Salvar configurações',exact:true}).click();
  await page.getByText('Configurações salvas neste computador.',{exact:true}).waitFor();
  await page.getByRole('link',{name:'Nova Venda',exact:true}).click();
  const count=await page.evaluate(()=>window.__printRequests.length);
  await sale(mode==='NEVER'?'Fiado':'Dinheiro');
  if(mode==='NEVER'){
   await page.getByText(/Venda #4 finalizada/).waitFor();
   assert.equal(await page.getByRole('dialog').count(),0);
   assert.equal(await page.evaluate(()=>window.__printRequests.length),count);
   await page.getByRole('button',{name:'Ver / imprimir último comprovante',exact:true}).click();
   await page.getByText('Fiado registrado na caderneta. Não comprova quitação.',{exact:true}).waitFor();
  }else{
   await page.getByText(/Impressão solicitada/).waitFor();
   assert.equal(await page.evaluate(()=>window.__printRequests.length),count+1);
   assert.equal(await page.locator('.receipt-paper').count(),mode==='AUTO_TWO'?2:1);
  }
  await page.getByRole('button',{name:'Não imprimir / fechar',exact:true}).click();
 }
 await page.getByRole('link',{name:'Configurações',exact:true}).click();
 await page.getByRole('heading',{name:'Impressão e comprovantes',exact:true}).waitFor();
 await page.screenshot({path:'tmp/pdfs/configuracoes-ui.png'});
 await page.getByRole('link',{name:'Vendas',exact:true}).click();
 await page.locator('tbody tr').nth(3).waitFor();
 assert.equal(await page.locator('tbody tr').count(),4);
 page.once('dialog',dialog=>dialog.accept('Cliente desistiu'));
 await page.getByRole('button',{name:'Cancelar',exact:true}).last().click();
 await page.getByText('Cancelada',{exact:true}).waitFor();
 await page.locator('tbody tr').last().getByRole('button',{name:'Comprovante / reimprimir',exact:true}).click();
 await page.getByText('VENDA CANCELADA - SEM VALIDADE',{exact:true}).waitFor();
 const stats=await page.evaluate(async()=>{
  const result=await window.__TAURI_INTERNALS__.invoke('plugin:sql|select',{query:'SELECT (SELECT COUNT(*) FROM sales) AS sales, (SELECT stock_quantity FROM products WHERE id=?) AS stock, (SELECT COUNT(*) FROM receipt_output_events WHERE kind=?) AS pdfs',values:['gas','PDF_SAVED']});return result[0];
 });
 assert.equal(stats.sales,4);assert.equal(stats.stock,7);assert.equal(stats.pdfs,1);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({ui:'PASS',stats,printRequests:await page.evaluate(()=>window.__printRequests.length),errors}));
} finally {await browser?.close();await server.close()}
