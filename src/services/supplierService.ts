import { getDb } from "../lib/db";
import { writeOperation } from "../lib/operations";
import type { Supplier, SupplierFormData } from "../types/supplier";

export async function listSuppliers() {
  const db = await getDb();
  return db.select<Supplier[]>("SELECT * FROM suppliers ORDER BY active DESC, name COLLATE NOCASE, id");
}
export async function getSupplier(id: string) {
  const db = await getDb();
  const rows = await db.select<Supplier[]>("SELECT * FROM suppliers WHERE id=?", [id]);
  return rows[0] ?? null;
}
export async function saveSupplier(data: SupplierFormData, supplierId: string | undefined, operationId: string) {
  return writeOperation<string>("SUPPLIER", { ...data, ...(supplierId ? { id: supplierId } : {}) }, operationId);
}
export async function setSupplierActive(id: string, active: boolean, operationId: string) {
  return writeOperation("SUPPLIER_ACTIVE", { id, active }, operationId);
}
