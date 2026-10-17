const fs=require('node:fs');
const path=require('node:path');
const {spawnSync,execFileSync}=require('node:child_process');
const {createHash,randomBytes}=require('node:crypto');
const Database=require('better-sqlite3');
const {captureManifest,compareManifest}=require('./data-manifest.cjs');

function validateArchiveEntries(names,types) {
  if(!names.length||names.length!==types.length)throw new Error('Invalid archive listing');
  for(let i=0;i<names.length;i++) {
    const name=names[i].replace(/^\.\//,'');
    if(!['-','d'].includes(types[i])||name.includes('\\')||name.split('/').includes('..')||!(/^(edupilot\.db|storage\/?|storage\/[a-f0-9]{64})$/.test(name)))throw new Error('Unsafe archive entry');
    if((name==='edupilot.db'||/^storage\/[a-f0-9]{64}$/.test(name))&&types[i]!=='-')throw new Error('Expected regular archive file');
    if(/^storage\/?$/.test(name)&&types[i]!=='d')throw new Error('Expected storage directory');
  }
  if(names.filter(name=>name.replace(/^\.\//,'')==='edupilot.db').length!==1)throw new Error('Archive must contain exactly one database');
}
function assertRehearsalPaths(backup,output) {
  if(!fs.existsSync(backup)||fs.lstatSync(backup).isSymbolicLink()||!fs.statSync(backup).isFile())throw new Error('Backup must exist as a regular file');
  if(!path.isAbsolute(output))throw new Error('Output must be absolute');
  const forward=output.replaceAll('\\','/').replace(/^[A-Za-z]:/,'');
  if(forward==='/var/lib/edupilot'||forward.startsWith('/var/lib/edupilot/'))throw new Error('Live data paths are forbidden');
  if(fs.existsSync(output))throw new Error('Rehearsal requires a new directory');
  const parent=fs.realpathSync(path.dirname(output)),target=path.join(parent,path.basename(output));
  if(target.replaceAll('\\','/').includes('/var/lib/edupilot/'))throw new Error('Live data symlink target is forbidden');
  return {backup:fs.realpathSync(backup),output:target};
}
function rehearseMigration(backup,output) {
  const targets=assertRehearsalPaths(backup,output);
  const names=execFileSync('tar',['-tzf',targets.backup],{encoding:'utf8',maxBuffer:16*1024*1024}).trim().split(/\r?\n/);
  const verbose=execFileSync('tar',['-tvzf',targets.backup],{encoding:'utf8',maxBuffer:16*1024*1024}).trim().split(/\r?\n/);
  validateArchiveEntries(names,verbose.map(line=>line[0]));
  fs.mkdirSync(targets.output,{mode:0o700});
  execFileSync('tar',['-xzf',targets.backup,'-C',targets.output],{stdio:'pipe'});
  const databasePath=path.join(targets.output,'edupilot.db'),storagePath=path.join(targets.output,'storage');
  const database=new Database(databasePath,{readonly:true,fileMustExist:true});
  try {
    const history=database.prepare('SELECT migration_name,checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL').all();
    if(!history.length)throw new Error('Unrecognized migration history');
    for(const item of history) {
      if(!/^[0-9]{12,}_[a-z0-9_]+$/.test(item.migration_name))throw new Error('Invalid migration name');
      const sql=fs.readFileSync(path.resolve('prisma/migrations',item.migration_name,'migration.sql'));
      if(createHash('sha256').update(sql).digest('hex')!==item.checksum)throw new Error('Applied migration checksum differs');
    }
  } finally {database.close();}
  const key=randomBytes(32);fs.writeFileSync(path.join(targets.output,'manifest.key'),key,{mode:0o600,flag:'wx'});
  const before=captureManifest(databasePath,{storagePath,key});
  fs.writeFileSync(path.join(targets.output,'before.json'),JSON.stringify(before),{mode:0o600,flag:'wx'});
  if(before.integrity!=='ok'||before.foreignKeyViolations)throw new Error('Source backup integrity failed');
  const result=spawnSync(process.execPath,[path.resolve('node_modules/prisma/build/index.js'),'migrate','deploy'],{
    env:{...process.env,DATABASE_URL:'file:'+databasePath.replaceAll('\\','/'),STORAGE_DIRECTORY:storagePath,AI_MODE:'mock'},encoding:'utf8',maxBuffer:4*1024*1024,
  });
  fs.writeFileSync(path.join(targets.output,'migration.log'),(result.stdout||'')+(result.stderr||''),{mode:0o600,flag:'wx'});
  if(result.status!==0)throw new Error('Copy migration failed; source backup unchanged');
  const after=captureManifest(databasePath,{storagePath,key,columnsByTable:Object.fromEntries(before.tables.map(table=>[table.name,table.columns]))});
  fs.writeFileSync(path.join(targets.output,'after.json'),JSON.stringify(after),{mode:0o600,flag:'wx'});
  const compared=compareManifest(before,after);
  fs.writeFileSync(path.join(targets.output,'report.json'),JSON.stringify(compared),{mode:0o600,flag:'wx'});
  if(!compared.ok)throw new Error('Migration changed prior user data');
  return {ok:true,tables:before.tables.length,rows:before.tables.reduce((sum,table)=>sum+table.rows,0),files:before.files.length};
}
module.exports={validateArchiveEntries,assertRehearsalPaths,rehearseMigration};
if(require.main===module) {
  try {
    const args=process.argv.slice(2);
    if(!args.includes('--backup')||!args.includes('--output'))throw new Error('Required: --backup --output');
    console.log(JSON.stringify(rehearseMigration(args[args.indexOf('--backup')+1],args[args.indexOf('--output')+1])));
  } catch {console.error('Rehearsal refused or failed. Source backup and live database were not overwritten; inspect the protected rehearsal report.');process.exitCode=1;}
}
