import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync } from 'node:fs';
import { server, db } from './browser-harness.mjs';
const require=createRequire(process.env.GAS_PLAYWRIGHT_MODULE ? import.meta.url : process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/' : import.meta.url);
const { chromium }=require(process.env.GAS_PLAYWRIGHT_MODULE || 'playwright');
let browser;
try {
 browser=await chromium.launch({executablePath:process.env.GAS_BROWSER_EXECUTABLE,headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1366,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:1420/#/settings/backup');
 await page.getByLabel(/^Backup automático/).waitFor();
 await page.waitForFunction(async()=>{const r=await window.__TAURI_INTERNALS__.invoke('list_backups',{});return r.length===1;},{polling:100});
 assert.equal(readdirSync('tmp/browser-backups').filter(name=>name.endsWith('.sqlite')).length,1,'automatic startup backup');
 await page.getByLabel(/^Backup automático/).selectOption('off');
 await page.getByLabel(/^Intervalo entre cópias/).selectOption('6');await page.getByLabel('Cópias locais a manter').fill('3');
 await page.getByRole('button',{name:'Salvar rotina',exact:true}).click();await page.getByText('Rotina de backup salva.',{exact:true}).waitFor();
 await page.reload();await page.getByLabel(/^Backup automático/).waitFor();
 assert.equal(await page.getByLabel(/^Backup automático/).inputValue(),'off');
 assert.equal(await page.getByLabel(/^Intervalo entre cópias/).inputValue(),'6');
 assert.equal(await page.getByLabel('Cópias locais a manter').inputValue(),'3');
 await page.getByRole('button',{name:'Criar backup agora'}).click();await page.getByText('Backup criado e validado.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Salvar em outra pasta'}).first().click();await page.getByText(/Cópia salva em:/).waitFor();
 const text=await page.getByRole('status').innerText();const path=text.replace('Cópia salva em: ','');
 const copied=new DatabaseSync(path,{readOnly:true});assert.equal(copied.prepare("SELECT stock_quantity FROM products WHERE id='gas'").get().stock_quantity,10);assert.equal(copied.prepare('PRAGMA quick_check').get().quick_check,'ok');copied.close();
 // Cancelling the native file picker preserves the active database.
 db.exec("UPDATE products SET stock_quantity=3 WHERE id='gas'");
 await page.getByRole('button',{name:'Escolher arquivo para restaurar'}).click();
 await page.getByText('Restauração cancelada. Os dados atuais foram mantidos.',{exact:true}).waitFor();
 assert.equal(db.prepare("SELECT stock_quantity FROM products WHERE id='gas'").get().stock_quantity,3);
 // Native restore prepares/checks the file, makes a preventive snapshot and applies
 // it with pools closed. Only the picker, confirmation and process restart are emulated.
 await page.getByRole('button',{name:'Restaurar esta cópia'}).first().click();
 await page.getByText('Backup restaurado. A cópia preventiva está na lista de backups.',{exact:true}).waitFor();
 assert.equal(db.prepare("SELECT stock_quantity FROM products WHERE id='gas'").get().stock_quantity,10);
 const preventivePath='tmp/browser-recovery/backups/'+readdirSync('tmp/browser-recovery/backups').find(name=>name.endsWith('.sqlite'));
 const preventive=new DatabaseSync(preventivePath,{readOnly:true});assert.equal(preventive.prepare("SELECT stock_quantity FROM products WHERE id='gas'").get().stock_quantity,3);preventive.close();
 db.prepare("UPDATE app_settings SET value='broken policy' WHERE key='backup_policy'").run();
 await page.reload();await page.getByRole('alert').getByText(/Configuração de backup inválida/).waitFor();
 await page.getByRole('button',{name:'Salvar rotina',exact:true}).click();await page.getByText('Rotina de backup salva.',{exact:true}).waitFor();
 assert.equal(JSON.parse(db.prepare("SELECT value FROM app_settings WHERE key='backup_policy'").get().value).intervalHours,24);
 await page.screenshot({path:'tmp/pdfs/backup-ui.png'});assert.deepEqual(errors,[]);console.log('PASS: native automatic/manual backup, saved policy, export, cancel and restore with preventive copy');
} finally {await browser?.close();await server.close();}
