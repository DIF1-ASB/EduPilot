import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,readdirSync,rmSync,realpathSync} from 'node:fs';
import {resolve,join} from 'node:path';import {pathToFileURL} from 'node:url';
if(process.argv.slice(2).join(' ')!=='--local')throw Error('Only --local is supported. No remote mode exists.');
if(Number(process.versions.node.split('.')[0])<22)throw Error('Local Wrangler contract requires Node >=22. Use a separate compatible runtime; do not replace existing native node_modules.');
process.env.WRANGLER_SEND_METRICS='false';process.env.CLOUDFLARE_CF_FETCH_ENABLED='false';process.env.WRANGLER_WRITE_LOGS='false';
const {getPlatformProxy,unstable_splitSqlQuery}=await import('wrangler'),{build}=await import('esbuild');
const parent=resolve('.wrangler');mkdirSync(parent,{recursive:true});const root=mkdtempSync(join(parent,'assessment-contract-'));let proxy;
try{
 writeFileSync(join(root,'worker.mjs'),'export default {fetch(){return new Response("local contract only")}};');
 writeFileSync(join(root,'wrangler.json'),JSON.stringify({name:'edupilot-local-assessment-contract',main:'worker.mjs',compatibility_date:'2026-05-15',compatibility_flags:['nodejs_compat'],d1_databases:[{binding:'DB',database_name:'edupilot-synthetic-contract',database_id:'00000000-0000-4000-8000-000000000000',remote:false}]}));
 proxy=await getPlatformProxy({configPath:join(root,'wrangler.json'),envFiles:[],persist:{path:join(root,'state')},remoteBindings:false});
 const binding=proxy.env.DB;
 for(const name of readdirSync('prisma/migrations').filter(n=>/^\d/.test(n)).sort())for(const sql of unstable_splitSqlQuery(readFileSync(`prisma/migrations/${name}/migration.sql`,'utf8')))await binding.prepare(sql).run();
 const bundle=await build({stdin:{contents:`export {runAssessmentD1Contract} from ${JSON.stringify(resolve('tests/helpers/d1-assessment-contract.ts').replaceAll('\\','/'))};`,resolveDir:process.cwd(),loader:'ts',sourcefile:'d1-contract.ts'},bundle:true,platform:'node',format:'esm',packages:'external',write:false,alias:{'@local-db':resolve('lib/local-database-cloud.ts'),'@assessment-local-store':resolve('lib/assessment/local-store-cloud.ts')}});
 const entry=join(root,'contract.mjs');writeFileSync(entry,bundle.outputFiles[0].text);
 const {runAssessmentD1Contract}=await import(pathToFileURL(entry).href),result=await runAssessmentD1Contract(binding);
 console.log(JSON.stringify({ok:true,backend:'Wrangler local D1',...result}));
}finally{
 await proxy?.dispose();const target=realpathSync(root);
 if(!target.startsWith(join(realpathSync(parent),'assessment-contract-')))throw Error('Unsafe cleanup path');rmSync(target,{recursive:true,force:true});
}
