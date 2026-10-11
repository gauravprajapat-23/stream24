import path from 'node:path';

function norm(v=''){return String(v).trim().replace(/[\\/]+$/,'');}
function lower(v=''){return norm(v).replaceAll('/','\\').toLowerCase();}
export function normalizeMediaMappings(input=[]){
  if(!Array.isArray(input))return [];
  return input.slice(0,8).map((m,i)=>({
    id:String(m.id||`map-${i+1}`),
    canonicalRoot:norm(m.canonicalRoot),
    localRoot:norm(m.localRoot),
    syncSourceRoot:norm(m.syncSourceRoot||''),
  })).filter(m=>m.canonicalRoot&&m.localRoot);
}
export function mapPathForDevice(inputPath,mappings=[]){
  const value=String(inputPath||''); if(!value)return value;
  const matches=normalizeMediaMappings(mappings).filter(m=>{const a=lower(value),b=lower(m.canonicalRoot);return a===b||a.startsWith(`${b}\\`);}).sort((a,b)=>b.canonicalRoot.length-a.canonicalRoot.length);
  if(!matches.length)return value; const m=matches[0]; const suffix=value.slice(m.canonicalRoot.length).replace(/^[\\/]+/,'');
  return suffix?path.win32.join(m.localRoot,suffix):m.localRoot;
}
export function syncPairForDevice(canonicalPath,mappings=[]){
  const value=String(canonicalPath||'');
  const matches=normalizeMediaMappings(mappings).filter(m=>m.syncSourceRoot&&(()=>{const a=lower(value),b=lower(m.canonicalRoot);return a===b||a.startsWith(`${b}\\`);})()).sort((a,b)=>b.canonicalRoot.length-a.canonicalRoot.length);
  if(!matches.length)return null; const m=matches[0]; const suffix=value.slice(m.canonicalRoot.length).replace(/^[\\/]+/,'');
  return {canonicalPath:value,sourcePath:suffix?path.win32.join(m.syncSourceRoot,suffix):m.syncSourceRoot,targetPath:suffix?path.win32.join(m.localRoot,suffix):m.localRoot,mappingId:m.id};
}
export function mapPlaylist(paths,mappings=[]){return (paths||[]).map(p=>mapPathForDevice(p,mappings));}
export function canonicalPathForDevice(localPath,mappings=[]){
  const value=String(localPath||'');if(!value)return value;
  const matches=normalizeMediaMappings(mappings).filter(m=>{const a=lower(value),b=lower(m.localRoot);return a===b||a.startsWith(`${b}\\`);}).sort((a,b)=>b.localRoot.length-a.localRoot.length);
  if(!matches.length)return value;const m=matches[0],suffix=value.slice(m.localRoot.length).replace(/^[\\/]+/,'');return suffix?path.win32.join(m.canonicalRoot,suffix):m.canonicalRoot;
}
