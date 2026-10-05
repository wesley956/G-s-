import { invoke } from '@tauri-apps/api/core';
import { getDb } from '../lib/db';
export type Backup = { id: string; createdAtMs: number; sizeBytes: number; warning: string | null };
export type BackupPolicy = { enabled: boolean; intervalHours: number; retention: number };
export type BackupStatus = { restoreReport: { restored: boolean; message: string; preventiveBackupId: string | null } | null; automaticError: string | null };
async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  await getDb();
  try { return await invoke<T>(name, args); } catch (error) { throw new Error(String(error)); }
}
export function listBackups() { return command<Backup[]>('list_backups'); }
export function createBackup() { return command<Backup>('create_backup'); }
export function exportBackup(id: string) { return command<string | null>('export_backup', { backupId: id }); }
export function getBackupPolicy() { return command<BackupPolicy>('get_backup_policy'); }
export function setBackupPolicy(policy: BackupPolicy) { return command<void>('set_backup_policy', { policy }); }
export function checkBackupSchedule() { return command<Backup | null>('check_backup_schedule'); }
export function getBackupStatus() { return command<BackupStatus>('backup_status'); }
export function restoreBackup(backupId: string | null) { return command<boolean>('restore_backup', { backupId }); }
