// UI-only harness: real SQLite, emulated Tauri IPC. Never imported by the app build.
import { createServer } from "vite";
import { resetDb } from "./sql-mock.mjs";
import { nativeOperation } from "./native-bridge.mjs";
import { rmSync, mkdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";

mkdirSync("tmp", {recursive:true});
const dbPath = "tmp/browser-test.db";
rmSync(dbPath,{force:true});
rmSync("tmp/browser-backups",{force:true,recursive:true});
export const db = resetDb(dbPath);
db.exec(`INSERT INTO cash_sessions (id,status,opening_balance_cents) VALUES ('cash','OPEN',10000);
  INSERT INTO products (id,name,counter_price_cents,delivery_price_cents,stock_quantity) VALUES ('gas','Gás P13',11000,12000,10);
  INSERT INTO products (id,name,counter_price_cents,delivery_price_cents,stock_quantity) VALUES ('water','Água mineral 20 litros',1000,1200,20);
  INSERT INTO customers (id,name,address,phone) VALUES ('customer','José da Conceição','Rua das Águas, 20','(19) 98888-0000');`);
const settings = { businessName: "Depósito São João", document: "12.345.678/0001-99", address: "Rua do Comércio, 100 - Nova Odessa/SP", phone: "(19) 99999-0000", footer: "Obrigado pela preferência!", paperFormat: "80mm", printMode: "ASK" };
db.prepare("INSERT INTO app_settings (key,value) VALUES ('receipt_settings',?)").run(JSON.stringify(settings));
const bridge = `<script>
window.__consoleErrors = [];
window.addEventListener('error', e => window.__consoleErrors.push(e.message));
window.addEventListener('unhandledrejection', e => window.__consoleErrors.push(String(e.reason)));
window.__printRequests = [];
window.print = () => { const root = document.querySelector('#receipt-print-root'); window.__printRequests.push(root?.innerText || 'MISSING'); };
window.__TAURI_INTERNALS__ = { invoke: async (command,args) => {
  if (command === 'save_receipt_pdf' && window.__cancelPdf) return null;
  if (command === 'save_receipt_pdf' && window.__failPdf) throw new Error('Falha simulada ao salvar PDF');
  const response = await fetch('/__test_ipc', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({command,args}) });
  const result = await response.json(); if (result.error) throw new Error(result.error);
  if (command === 'write_operation' && args.operation.kind === 'RECEIVE' && window.__losePaymentResponseOnce) { window.__losePaymentResponseOnce=false; throw new Error('Resposta interrompida após gravar recebimento'); }
  return result.value;
} };
</script>`;
export const server = await createServer({
  server: { host: "127.0.0.1", port: 1420, strictPort: true },
  plugins: [{ name: "receipt-test-bridge", transformIndexHtml: html => html.replace("<head>", `<head>${bridge}`),
    configureServer(vite) { vite.middlewares.use("/__test_ipc", async (req, res) => {
      try {
        let body = ""; for await (const chunk of req) body += chunk;
        const { command, args } = JSON.parse(body); let value;
        if (command === "log_error") value = null;
        else if (command === "plugin:sql|load") value = args.db;
        else if (command === "plugin:sql|select") value = db.prepare(args.query).all(...args.values);
        else if (command === "plugin:sql|execute") { const result = db.prepare(args.query).run(...args.values); value = [result.changes, Number(result.lastInsertRowid)]; }
        else if (command === "create_backup") value = await nativeOperation(dbPath,{id:crypto.randomUUID(),kind:"BACKUP_CREATE",data:{}});
        else if (command === "list_backups") value = await nativeOperation(dbPath,{id:crypto.randomUUID(),kind:"BACKUP_LIST",data:{}});
        else if (command === "export_backup") {
          await mkdir("tmp/exported",{recursive:true});
          const { copyFile } = await import("node:fs/promises");
          const path = `tmp/exported/${args.backupId}`;
          await copyFile(`tmp/browser-backups/${args.backupId}`,path); value=path;
        }
        else if (command === "write_operation") value = await nativeOperation(dbPath, args.operation);
        else if (command === "save_receipt_pdf") {
          await mkdir("tmp/pdfs", { recursive: true });
          const path = `tmp/pdfs/ui-sale-${args.saleNumber}.pdf`;
          await writeFile(path, Buffer.from(args.pdfBytes)); value = path;
        } else throw new Error(`Unexpected IPC command: ${command}`);
        res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ value }));
      } catch (err) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: err.message })); }
    }); },
  }],
});
await server.listen();
server.printUrls();
