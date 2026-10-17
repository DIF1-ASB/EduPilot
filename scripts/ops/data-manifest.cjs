const fs = require('node:fs');
const path = require('node:path');
const {createHmac} = require('node:crypto');
const Database = require('better-sqlite3');
const quote = name => '"' + name.replaceAll('"', '""') + '"';
const canonical = value => JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? {bigint:String(item)} : Buffer.isBuffer(item) ? {bytes:item.toString('base64')} : item);

function captureManifest(dbPath, {storagePath, key, columnsByTable}) {
  if (!Buffer.isBuffer(key) || key.length < 32) throw new Error('A private HMAC key of at least 32 bytes is required');
  if (!fs.existsSync(dbPath) || !fs.existsSync(storagePath)) throw new Error('Database/storage must already exist');
  if (fs.lstatSync(dbPath).isSymbolicLink() || fs.lstatSync(storagePath).isSymbolicLink()) throw new Error('Database/storage symlinks are not accepted');
  const database = new Database(dbPath, {readonly:true, fileMustExist:true});
  try {
    const names=database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'_prisma_migrations' ORDER BY name").all().map(row=>row.name);
    const wanted=columnsByTable ? Object.keys(columnsByTable).sort() : names;
    const tables=wanted.map(name=>{
      if(!names.includes(name)) throw new Error('A prior table is missing');
      const info=database.prepare(`PRAGMA table_info(${quote(name)})`).all();
      const columns=columnsByTable?.[name] || info.map(column=>column.name);
      if(!columns.length || columns.some(column=>!info.some(i=>i.name===column))) throw new Error('A prior column is missing');
      const sort=info.filter(column=>column.pk).sort((a,b)=>a.pk-b.pk).map(column=>column.name);
      const hmac=createHmac('sha256',key);let rows=0;
      for(const row of database.prepare(`SELECT ${columns.map(quote).join(',')} FROM ${quote(name)} ORDER BY ${(sort.length?sort:columns).map(quote).join(',')}`).iterate()) {
        const encoded=canonical(columns.map(column=>row[column]));hmac.update(String(Buffer.byteLength(encoded))+':'+encoded);rows++;
      }
      return {name,columns,rows,digest:hmac.digest('hex')};
    });
    const files=[];
    for(const record of database.prepare('SELECT storageKey,size FROM FileAttachment ORDER BY storageKey').iterate()) {
      if(!/^[a-f0-9]{64}$/.test(record.storageKey)) throw new Error('Invalid attachment storage key');
      const file=path.join(storagePath,record.storageKey);
      if(!fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink() || !fs.statSync(file).isFile()) throw new Error('Missing or unsafe attachment file');
      const bytes=fs.readFileSync(file);
      if(bytes.length!==record.size) throw new Error('Attachment file size differs');
      files.push({storageKey:record.storageKey,size:bytes.length,digest:createHmac('sha256',key).update(bytes).digest('hex')});
    }
    return {tables,files,integrity:database.pragma('integrity_check',{simple:true}),foreignKeyViolations:database.pragma('foreign_key_check').length};
  } finally {database.close();}
}
function compareManifest(before,after) {
  const differences=[];
  for(const table of before.tables) {
    const current=after.tables.find(candidate=>candidate.name===table.name);
    if(!current || canonical(table)!==canonical(current)) differences.push({table:table.name,kind:'rows-or-fields-changed'});
  }
  if(canonical(before.files)!==canonical(after.files))differences.push({table:'FileAttachment',kind:'files-changed'});
  if(after.integrity!=='ok' || after.foreignKeyViolations!==0)differences.push({table:'database',kind:'integrity-failed'});
  return {ok:differences.length===0,differences};
}
module.exports={captureManifest,compareManifest};

if(require.main===module) {
  try {
    const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1];
    for(const name of ['--database','--storage','--out'])if(!args.includes(name))throw new Error('Required: --database --storage --out');
    const keyPath=process.env.EDUPILOT_MANIFEST_KEY_FILE;
    if(!keyPath)throw new Error('EDUPILOT_MANIFEST_KEY_FILE is required');
    const previous=args.includes('--baseline')?JSON.parse(fs.readFileSync(arg('--baseline'),'utf8')):undefined;
    const result=captureManifest(arg('--database'),{storagePath:arg('--storage'),key:fs.readFileSync(keyPath),columnsByTable:previous&&Object.fromEntries(previous.tables.map(table=>[table.name,table.columns]))});
    fs.writeFileSync(arg('--out'),JSON.stringify(result),{mode:0o600,flag:'wx'});
    const compared=previous?compareManifest(previous,result):{ok:result.integrity==='ok'&&result.foreignKeyViolations===0,differences:[]};
    console.log(JSON.stringify({ok:compared.ok,tableCount:result.tables.length,rowCount:result.tables.reduce((sum,table)=>sum+table.rows,0),fileCount:result.files.length,differences:compared.differences}));
    if(!compared.ok)process.exitCode=1;
  } catch {console.error('Preservation check refused or failed; inspect protected files locally.');process.exitCode=1;}
}
