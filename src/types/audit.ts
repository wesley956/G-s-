export interface AuditQuery {
  start: string; end: string; kind: string | null; search: string;
  page: number; anchor: number | null;
}
export interface AuditItem {
  id: string; kind: string; label: string; date: string | null;
  fields: { label: string; value: string }[];
  references: { id: string; label: string; route: string; linkLabel: string }[];
  warning: string | null;
}
export interface AuditPageData {
  query: AuditQuery; generatedAtLocal: string; total: number; pageCount: number;
  items: AuditItem[];
}
