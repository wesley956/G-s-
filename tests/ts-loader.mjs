import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Node strips TypeScript; resolve Vite-style imports for the service tests.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@tauri-apps/plugin-sql") {
    return { url: new URL("./sql-mock.mjs", import.meta.url).href, shortCircuit: true };
  }
  if (specifier.startsWith(".") && context.parentURL) {
    const candidate = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(fileURLToPath(candidate))) return { url: candidate.href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
