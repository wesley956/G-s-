import { invoke } from '@tauri-apps/api/core';
import { getDb } from '../lib/db';
import type { AuditPageData, AuditQuery } from '../types/audit';

export async function getAudit(query: AuditQuery) {
  await getDb();
  return invoke<AuditPageData>('get_audit', { query });
}
