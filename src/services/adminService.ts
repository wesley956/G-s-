import { invoke } from "@tauri-apps/api/core";
import { getDb } from "../lib/db";
import { writeOperation } from "../lib/operations";
export async function getAdminStatus() { await getDb(); return invoke<boolean>("get_admin_status"); }
export function saveAdminPassword(configured:boolean, adminPassword:string, newPassword:string, operationId:string) {
  return writeOperation(configured ? "ADMIN_CHANGE" : "ADMIN_SETUP", {adminPassword,newPassword},operationId);
}
