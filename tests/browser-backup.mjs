import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { server } from './browser-harness.mjs';
const require=createRequire(process.env.GAS_PLAYWRIGHT_MODULE ? import.meta.url : process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/' : import.meta.url);
const { chromium }=require(process.env.GAS_PLAYWRIGHT_MODULE || 'playwright');
let browser;
try {
 browser=await chromium.launch({executablePath:process.env.GAS_BROWSER_EXECUTABLE,headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1366,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:1420/#/settings/backup');
 await page.getByRole('button',{name:'Criar backup agora'}).click();await page.getByText('Backup criado e validado.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Salvar em outra pasta'}).click();await page.getByText(/Cópia salva em:/).waitFor();
 const text=await page.getByRole('status').innerText();const path=text.replace('Cópia salva em: ','');
 const copied=new DatabaseSync(path,{readOnly:true});assert.equal(copied.prepare("SELECT stock_quantity FROM products WHERE id='gas'").get().stock_quantity,10);assert.equal(copied.prepare('PRAGMA quick_check').get().quick_check,'ok');copied.close();
 await page.screenshot({path:'tmp/pdfs/backup-ui.png'});assert.deepEqual(errors,[]);console.log('PASS: native consistent snapshot, backup screen and exported recoverable copy');
} finally {await browser?.close();await server.close();}
