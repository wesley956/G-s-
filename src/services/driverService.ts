import { getDb } from "../lib/db";
import { writeOperation } from "../lib/operations";
export type Driver={id:string,name:string,phone:string,active:number};
export async function listDrivers(){return (await getDb()).select<Driver[]>("SELECT id,name,phone,active FROM delivery_drivers ORDER BY active DESC,name COLLATE NOCASE");}
export function saveDriver(driver:{id?:string,name:string,phone:string,active:boolean},operationId:string){return writeOperation<string>("DRIVER",driver,operationId);}
