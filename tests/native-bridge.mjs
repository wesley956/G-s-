import { spawn } from "node:child_process";
import { resolve } from "node:path";
export async function nativeOperation(dbPath, operation) {
  const executable = process.env.GAS_DOMAIN_RUNNER || resolve("src-tauri/domain/target/debug/domain-runner");
  return new Promise((accept, reject) => {
    const child = spawn(executable, [], { stdio: ["pipe", "pipe", "pipe"] });
    let output = "", error = "";
    child.stdout.on("data", chunk => output += chunk); child.stderr.on("data", chunk => error += chunk);
    child.on("error", reject);
    child.on("close", code => { if (code) return reject(new Error(error)); try { const result=JSON.parse(output); if(result.error) reject(new Error(result.error)); else accept(result.value); } catch(e) { reject(e); } });
    child.stdin.end(JSON.stringify({ dbPath: resolve(dbPath), operation }));
  });
}
