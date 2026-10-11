import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const checks=[];const add=(name,ok,detail='')=>checks.push({name,ok,detail});
const must=['apps/server/server.mjs','apps/agent/agent.mjs','scripts/windows/setup-stream24.ps1','scripts/windows/install-server-service.ps1','scripts/windows/install-agent-service.ps1','scripts/windows/update-stream24.ps1','scripts/windows/stream24-doctor.ps1','INSTALL-STREAM24.cmd'];
for(const f of must)add(f,fs.existsSync(path.join(root,f)),fs.existsSync(path.join(root,f))?'present':'missing');
let pkg={};try{pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));add('package.json',pkg.version==='0.14.0',`version ${pkg.version}`);}catch(e){add('package.json',false,e.message);}
let db={};try{const dbPath=path.join(root,'data','db.json');if(!fs.existsSync(dbPath)){add('database schema',true,'runtime database not created yet (expected on clean install)');}else{db=JSON.parse(fs.readFileSync(dbPath,'utf8'));const required=['users','sessions','devices','streams','commands','events','logs','media','templates','youtubeConnections','mediaCatalog','replicationJobs','retentionPolicies'];add('database schema',required.every(k=>Array.isArray(db[k])),required.filter(k=>!Array.isArray(db[k])).join(', ')||'ok');}}catch(e){add('database schema',false,e.message);}
if(process.env.APP_MASTER_KEY)add('production master key',true,'configured in this shell');else console.log('WARN production master key — not set in this shell; setup-stream24.ps1 generates one for installed server mode.');
for(const c of checks)console.log(`${c.ok?'PASS':'FAIL'} ${c.name}${c.detail?` — ${c.detail}`:''}`);
const failures=checks.filter(x=>!x.ok&&x.name!=='production master key');
if(failures.length)process.exit(1);

