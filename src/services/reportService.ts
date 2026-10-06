import { invoke } from '@tauri-apps/api/core';
import { getDb } from '../lib/db';
import type { Report, ReportExport, ReportPeriod } from '../types/report';

export async function getReport(period: ReportPeriod) {
  await getDb();
  return invoke<Report>('get_report', { period });
}
export async function exportReport(period: ReportPeriod) {
  await getDb();
  return invoke<ReportExport>('export_report_csv', { period });
}
