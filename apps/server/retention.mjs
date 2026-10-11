function norm(p){return String(p||'').replace(/\\/g,'/').replace(/\/+$/,'').toLowerCase();}
export function streamRequiredAssets(stream={}){
  const out=[];const seen=new Set();const add=p=>{const v=String(p||'').trim();const k=norm(v);if(v&&!seen.has(k)){seen.add(k);out.push(v);}};
  for(const p of (stream.basePlaylist?.length?stream.basePlaylist:stream.playlist||[]))add(p);
  for(const b of stream.programming?.blocks||[])for(const p of b.playlist||[])add(p);
  if(stream.branding?.enabled)add(stream.branding.imagePath);
  return out;
}
export function referencedPaths(streams=[],templates=[]){
  const out=new Set();
  const add=p=>{if(p)out.add(norm(p));};
  for(const s of streams){
    for(const p of (s.basePlaylist?.length?s.basePlaylist:s.playlist||[]))add(p);
    add(s.branding?.imagePath);
    for(const b of s.programming?.blocks||[])for(const p of b.playlist||[])add(p);
  }
  for(const t of templates){for(const p of t.config?.playlist||[])add(p);add(t.config?.branding?.imagePath);for(const b of t.config?.programming?.blocks||[])for(const p of b.playlist||[])add(p);}
  return out;
}
export function replicaState({stream,deviceId,catalog=[]}){
  const canonical=streamRequiredAssets(stream);
  const primary=new Map(catalog.filter(x=>x.deviceId===stream.deviceId).map(x=>[norm(x.canonicalPath),x]));
  const backup=new Map(catalog.filter(x=>x.deviceId===deviceId).map(x=>[norm(x.canonicalPath),x]));
  let verified=0;const missing=[],stale=[];
  for(const p of canonical){const key=norm(p),a=primary.get(key),b=backup.get(key);if(!a||!b){missing.push(p);continue;}if(a.sha256===b.sha256&&Number(a.sizeBytes||0)===Number(b.sizeBytes||0))verified++;else stale.push(p);}
  return {total:canonical.length,verified,missing,stale,ready:canonical.length>0&&verified===canonical.length};
}
export function backupHealth({stream,device,catalog=[],nowMs=Date.now()}){
  const rep=replicaState({stream,deviceId:device.id,catalog});let score=0,reasons=[];
  const online=device.lastSeenAt&&nowMs-Date.parse(device.lastSeenAt)<30000;if(online)score+=25;else reasons.push('worker offline');
  const fresh=device.lastCatalogAt&&nowMs-Date.parse(device.lastCatalogAt)<180000;if(fresh)score+=20;else reasons.push('catalog stale');
  const storage=Array.isArray(device.storage)?device.storage:[];const free=storage.length?Math.min(...storage.map(x=>Number(x.freeBytes||0))):0,total=storage.length?Math.max(...storage.map(x=>Number(x.totalBytes||0))):0,reserve=Math.max(1024**3,Math.round(total*.05));if(!storage.length||free>reserve)score+=15;else reasons.push('storage reserve low');
  if(rep.total){score+=Math.round(40*(rep.verified/rep.total));if(!rep.ready)reasons.push(`${rep.total-rep.verified}/${rep.total} media not verified`);}else reasons.push('no playlist media');
  return {score:Math.max(0,Math.min(100,score)),ready:score>=80&&rep.ready&&online,online,catalogFresh:fresh,storageFreeBytes:free,storageReserveBytes:reserve,replica:rep,reasons};
}
export function cleanupCandidates({ownerId,catalog=[],streams=[],templates=[],retentionDays=7,nowMs=Date.now()}){
  const refs=referencedPaths(streams.filter(s=>s.ownerId===ownerId),templates.filter(t=>t.ownerId===ownerId)),cutoff=nowMs-Math.max(1,Number(retentionDays||7))*86400000;
  return catalog.filter(x=>x.ownerId===ownerId).filter(x=>!refs.has(norm(x.canonicalPath))).filter(x=>Date.parse(x.updatedAt||x.createdAt||0)<cutoff).map(x=>({...x,reason:'UNREFERENCED_RETENTION'}));
}
