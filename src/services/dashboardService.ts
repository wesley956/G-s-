import { invoke } from '@tauri-apps/api/core';
import { getDb } from '../lib/db';
import type { Dashboard } from '../types/dashboard';

export async function getDashboard() {
  await getDb();
  return invoke<Dashboard>('get_dashboard');
}
