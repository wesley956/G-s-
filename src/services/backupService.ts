import { invoke } from '@tauri-apps/api/core';
import { getDb } from '../lib/db';
export type Backup = {id:string; createdAtMs:number; sizeBytes:number; warning:string|null};
async function command<T>(name:string,args?:Record<string,unknown>):Promise<T> {
  await getDb();
  try {return await invoke<T>(name,args);} catch(error) {throw new Error(String(error));}
}
export function listBackups() {return command<Backup[]>('list_backups');}
export function createBackup() {return command<Backup>('create_backup');}
export function exportBackup(id:string) {return command<string|null>('export_backup',{backupId:id});}
