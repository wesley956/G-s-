import { invoke } from "@tauri-apps/api/core";
import { getDb } from "../lib/db";
import { writeOperation } from "../lib/operations";
export type AccrualPolicy={enabled:boolean;weeklyCents:number;mode:"FULL_WEEK"|"DAILY";weekdaysOnly:boolean};
export type AccrualPreview={planId:string;entryId:string;customerId:string;saleId:string|null;description:string;startDate:string;throughDate:string;weeklyCents:number;mode:AccrualPolicy["mode"];weekdaysOnly:boolean;postedCents:number;pendingCents:number};
export function localDay(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
export async function getAccrualPolicy(){await getDb();return invoke<AccrualPolicy>("get_accrual_policy");}
export async function getAccruals(customerId?:string){await getDb();return invoke<AccrualPreview[]>("get_accruals",{customerId:customerId??null});}
export async function previewAccrual(policy:AccrualPolicy,startDate:string,endDate:string){await getDb();return invoke<{days:number;cents:number}>("preview_accrual",{query:{policy,startDate,endDate}});}
export function saveAccrualPolicy(policy:AccrualPolicy,adminPassword:string,operationId:string){return writeOperation("ACCRUAL_SETTINGS",{policy,adminPassword},operationId);}
export function changeAccrualPlan(entryId:string,enabled:boolean,startDate:string,adminPassword:string,operationId:string){return writeOperation("ACCRUAL_PLAN",{entryId,enabled,startDate,adminPassword},operationId);}
