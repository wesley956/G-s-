import { invoke } from "@tauri-apps/api/core";
import { logError } from "./errors";
import { getDb } from "./db";
export async function writeOperation<T = void>(kind: string, data: unknown, id: string = crypto.randomUUID()): Promise<T> {
  try { await getDb(); return await invoke<T>("write_operation", { operation: { id, kind, data } }); }
  catch (error) { logError(`${kind}: ${String(error)}`); throw error instanceof Error ? error : new Error(String(error)); }
}
