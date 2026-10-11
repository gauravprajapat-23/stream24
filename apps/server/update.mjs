import crypto from 'node:crypto';

export function compareVersions(a='0.0.0',b='0.0.0'){
  const pa=String(a).replace(/^v/,'').split('.').map(n=>Number.parseInt(n,10)||0),pb=String(b).replace(/^v/,'').split('.').map(n=>Number.parseInt(n,10)||0);
  for(let i=0;i<Math.max(pa.length,pb.length);i++){const x=pa[i]||0,y=pb[i]||0;if(x<y)return -1;if(x>y)return 1;}return 0;
}
export function validateUpdateManifest(m={}){
  const version=String(m.version||'').trim(),url=String(m.url||'').trim(),sha256=String(m.sha256||'').trim().toLowerCase();
  if(!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version))throw new Error('Invalid update version.');
  let parsed;try{parsed=new URL(url);}catch{throw new Error('Invalid update URL.');}
  if(!['https:','http:'].includes(parsed.protocol))throw new Error('Update URL must use HTTP(S).');
  if(!/^[a-f0-9]{64}$/.test(sha256))throw new Error('Update manifest requires a SHA-256 checksum.');
  return {version,url,sha256,notes:String(m.notes||'').slice(0,4000),publishedAt:m.publishedAt||null};
}
export function sha256Buffer(buf){return crypto.createHash('sha256').update(buf).digest('hex');}
export async function fetchUpdateManifest(url,{fetchImpl=fetch,timeoutMs=8000}={}){
  if(!url)return {configured:false};
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeoutMs);
  try{const r=await fetchImpl(url,{signal:ctl.signal,headers:{accept:'application/json'}});if(!r.ok)throw new Error(`Update manifest HTTP ${r.status}`);return {configured:true,manifest:validateUpdateManifest(await r.json())};}
  finally{clearTimeout(timer);}
}
