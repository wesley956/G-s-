import { invoke } from '@tauri-apps/api/core';
export function logError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  void invoke('log_error', {message}).catch(() => console.error('Não foi possível registrar o erro local.'));
}
