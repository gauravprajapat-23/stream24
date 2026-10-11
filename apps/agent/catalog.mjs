import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function sha256File(filePath){
  const h=crypto.createHash('sha256'),fd=fs.openSync(filePath,'r'),buf=Buffer.allocUnsafe(1024*1024);
  try{let n;while((n=fs.readSync(fd,buf,0,buf.length,null))>0)h.update(buf.subarray(0,n));}finally{fs.closeSync(fd);}return h.digest('hex');
}
export function storageStats(targetPath){
  try{const root=path.parse(path.resolve(targetPath)).root||targetPath;const s=fs.statfsSync(root);return {root,totalBytes:Number(s.blocks)*Number(s.bsize),freeBytes:Number(s.bavail)*Number(s.bsize)};}catch{return null;}
}
export function scanWatchFolders(folders=[],previous={}){
  const files=[];const seen=new Set();const exts=new Set(['.mp4','.mov','.mkv','.webm','.m4v','.ts','.png','.jpg','.jpeg','.webp']);
  for(const raw of folders){const folder=path.resolve(String(raw||''));if(!folder||!fs.existsSync(folder))continue;const stack=[folder];while(stack.length){const dir=stack.pop();for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,ent.name);if(ent.isDirectory()){stack.push(full);continue;}if(!ent.isFile()||!exts.has(path.extname(ent.name).toLowerCase()))continue;const st=fs.statSync(full),key=full.toLowerCase(),old=previous[key];let sha256=old&&old.sizeBytes===st.size&&old.mtimeMs===st.mtimeMs?old.sha256:null;if(!sha256)sha256=sha256File(full);const row={path:full,sizeBytes:st.size,mtimeMs:st.mtimeMs,sha256,updatedAt:new Date().toISOString()};files.push(row);seen.add(key);}}
  }
  return {files,cache:Object.fromEntries(files.map(x=>[x.path.toLowerCase(),x])),removed:Object.keys(previous).filter(k=>!seen.has(k))};
}
