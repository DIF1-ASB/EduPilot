import Database from 'better-sqlite3';
import type { SqlStatement, BatchResult } from './store';
export function runLocalBatch(file:string,statements:SqlStatement[]):BatchResult[]{
 const connection=new Database(file,{fileMustExist:true,timeout:5000});
 try{
  connection.pragma('foreign_keys = ON');
  return connection.transaction(()=>statements.map(({sql,params})=>{
   const statement=connection.prepare(sql);
   return statement.reader?{rows:statement.all(...params) as Record<string,unknown>[],changes:0}:{rows:[],changes:statement.run(...params).changes};
  })).immediate();
 }finally{connection.close();}
}
