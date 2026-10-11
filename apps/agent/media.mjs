import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function ffprobeAvailable(binary='ffprobe'){return spawnSync(binary,['-version'],{stdio:'ignore',windowsHide:true}).status===0;}
export function probeMedia(inputPath,binary='ffprobe'){
  if(!fs.existsSync(inputPath))throw new Error(`Media file not found: ${inputPath}`);
  const r=spawnSync(binary,['-v','error','-print_format','json','-show_format','-show_streams',inputPath],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
  if(r.error)throw r.error;if(r.status!==0)throw new Error((r.stderr||'FFprobe failed.').trim());const data=JSON.parse(r.stdout||'{}');
  const video=(data.streams||[]).find(s=>s.codec_type==='video'),audio=(data.streams||[]).find(s=>s.codec_type==='audio');
  const duration=Number(data.format?.duration||video?.duration||audio?.duration||0),compatible=Boolean(video&&video.codec_name==='h264'&&(!audio||audio.codec_name==='aac'));
  return {path:inputPath,durationSeconds:Number.isFinite(duration)?duration:0,sizeBytes:Number(data.format?.size||0),formatName:data.format?.format_name||null,
    video:video?{codec:video.codec_name,width:video.width,height:video.height,fps:video.avg_frame_rate||video.r_frame_rate||null}:null,
    audio:audio?{codec:audio.codec_name,sampleRate:audio.sample_rate?Number(audio.sample_rate):null,channels:audio.channels||null}:null,
    youtubeCopyCompatible:compatible,recommendation:compatible?'copy':'normalize'};
}
export function validatePlaylist(paths,ffprobeBinary='ffprobe'){if(!Array.isArray(paths)||!paths.length)throw new Error('Playlist must contain at least one media file.');return paths.map(p=>probeMedia(p,ffprobeBinary));}

export function normalizedOutputPath(inputPath){const ext=path.extname(inputPath);return path.join(path.dirname(inputPath),`${path.basename(inputPath,ext)}.stream24-ready.mp4`);}
export async function normalizeMedia(inputPath,{ffmpegBinary='ffmpeg',outputPath=normalizedOutputPath(inputPath),videoBitrateKbps=4000,audioBitrateKbps=128,onLog=()=>{}}={}){
  if(!fs.existsSync(inputPath))throw new Error(`Media file not found: ${inputPath}`);
  if(fs.existsSync(outputPath))throw new Error(`Output already exists: ${outputPath}`);
  const args=['-hide_banner','-y','-i',inputPath,'-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p','-b:v',`${videoBitrateKbps}k`,'-maxrate',`${videoBitrateKbps}k`,'-bufsize',`${videoBitrateKbps*2}k`,'-g','60','-c:a','aac','-b:a',`${audioBitrateKbps}k`,'-ar','44100','-movflags','+faststart',outputPath];
  await new Promise((resolve,reject)=>{const proc=spawn(ffmpegBinary,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});proc.stderr.setEncoding('utf8');proc.stderr.on('data',d=>onLog(String(d).trim()));proc.on('error',reject);proc.on('exit',code=>code===0?resolve():reject(new Error(`FFmpeg normalization failed with code ${code}`)));});
  return outputPath;
}

export function persistentPlaylistCompatible(media=[]){
  if(!Array.isArray(media)||!media.length)return false;
  const first=media[0];if(!first.video)return false;
  return media.every(m=>Boolean(m.video)
    &&m.video.codec===first.video.codec
    &&Number(m.video.width||0)===Number(first.video.width||0)
    &&Number(m.video.height||0)===Number(first.video.height||0)
    &&Boolean(m.audio)===Boolean(first.audio)
    &&(!m.audio||(m.audio.codec===first.audio.codec&&Number(m.audio.sampleRate||0)===Number(first.audio.sampleRate||0)&&Number(m.audio.channels||0)===Number(first.audio.channels||0))));
}

export function capturePreview(inputPath,{ffmpegBinary='ffmpeg',width=640,seekSeconds=2}={}){
  if(!fs.existsSync(inputPath))throw new Error(`Media file not found: ${inputPath}`);
  const r=spawnSync(ffmpegBinary,['-hide_banner','-loglevel','error','-ss',String(Math.max(0,seekSeconds)),'-i',inputPath,'-frames:v','1','-vf',`scale=${Math.max(160,Math.min(1280,Number(width)||640))}:-2`,'-f','image2pipe','-vcodec','mjpeg','pipe:1'],{windowsHide:true,maxBuffer:8*1024*1024});
  if(r.error)throw r.error;if(r.status!==0)throw new Error(String(r.stderr||'Preview capture failed.').trim());
  return {mime:'image/jpeg',dataBase64:Buffer.from(r.stdout).toString('base64')};
}

import crypto from 'node:crypto';
function sha256File(filePath){const h=crypto.createHash('sha256'),fd=fs.openSync(filePath,'r'),buf=Buffer.allocUnsafe(1024*1024);try{let n;while((n=fs.readSync(fd,buf,0,buf.length,null))>0)h.update(buf.subarray(0,n));}finally{fs.closeSync(fd);}return h.digest('hex');}
export function syncMediaItems(items=[],onLog=()=>{}){
  let copied=0,skipped=0,verified=0;const results=[];
  for(const item of items){const source=String(item.sourcePath||''),target=String(item.targetPath||'');if(!source||!target)throw new Error('Replication item is missing sourcePath or targetPath.');if(!fs.existsSync(source))throw new Error(`LAN sync source not found: ${source}`);const src=fs.statSync(source);if(!src.isFile())throw new Error(`LAN sync source is not a file: ${source}`);fs.mkdirSync(path.dirname(target),{recursive:true});let same=false;if(fs.existsSync(target)){const dst=fs.statSync(target);if(dst.isFile()&&dst.size===src.size){const a=sha256File(source),b=sha256File(target);same=a===b;if(same){skipped++;verified++;results.push({...item,sizeBytes:src.size,sha256:a,status:'VERIFIED'});onLog(`Already synchronized: ${target}`);}}}if(same)continue;const temp=`${target}.stream24-copying`;try{if(fs.existsSync(temp))fs.rmSync(temp,{force:true});fs.copyFileSync(source,temp);const sourceHash=sha256File(source),targetHash=sha256File(temp);if(sourceHash!==targetHash)throw new Error(`Hash verification failed for ${target}`);fs.renameSync(temp,target);copied++;verified++;results.push({...item,sizeBytes:src.size,sha256:sourceHash,status:'COPIED'});onLog(`Replicated and verified: ${source} -> ${target}`);}catch(err){try{if(fs.existsSync(temp))fs.rmSync(temp,{force:true});}catch{}throw err;}}
  return {copied,skipped,verified,results};
}

export async function syncMediaItemsWithProgress(items=[],onLog=()=>{},onProgress=()=>{}){
  let copied=0,skipped=0,verified=0;const results=[];let completedBytes=0;const totalBytes=items.reduce((n,item)=>{try{return n+(fs.existsSync(item.sourcePath)?fs.statSync(item.sourcePath).size:0);}catch{return n;}},0);
  for(let index=0;index<items.length;index++){
    const item=items[index],source=String(item.sourcePath||''),target=String(item.targetPath||'');if(!source||!target)throw new Error('Replication item is missing sourcePath or targetPath.');if(!fs.existsSync(source))throw new Error(`LAN sync source not found: ${source}`);const src=fs.statSync(source);if(!src.isFile())throw new Error(`LAN sync source is not a file: ${source}`);fs.mkdirSync(path.dirname(target),{recursive:true});
    if(fs.existsSync(target)){const dst=fs.statSync(target);if(dst.isFile()&&dst.size===src.size){const a=sha256File(source),b=sha256File(target);if(a===b){skipped++;verified++;completedBytes+=src.size;results.push({...item,sizeBytes:src.size,sha256:a,status:'VERIFIED'});onLog(`Already synchronized: ${target}`);onProgress({index,itemCount:items.length,fileBytes:src.size,fileCopiedBytes:src.size,completedBytes,totalBytes,status:'VERIFIED',targetPath:target});continue;}}}
    const temp=`${target}.stream24-copying`;if(fs.existsSync(temp))fs.rmSync(temp,{force:true});let fileCopiedBytes=0;const sourceHash=crypto.createHash('sha256'),targetHash=crypto.createHash('sha256');
    await new Promise((resolve,reject)=>{const rs=fs.createReadStream(source,{highWaterMark:1024*1024}),ws=fs.createWriteStream(temp);rs.on('data',chunk=>{sourceHash.update(chunk);targetHash.update(chunk);fileCopiedBytes+=chunk.length;onProgress({index,itemCount:items.length,fileBytes:src.size,fileCopiedBytes,completedBytes,totalBytes,status:'COPYING',targetPath:target});});rs.on('error',reject);ws.on('error',reject);ws.on('finish',resolve);rs.pipe(ws);});
    const a=sourceHash.digest('hex'),b=targetHash.digest('hex');if(a!==b){fs.rmSync(temp,{force:true});throw new Error(`Hash verification failed for ${target}`);}fs.renameSync(temp,target);copied++;verified++;completedBytes+=src.size;results.push({...item,sizeBytes:src.size,sha256:a,status:'COPIED'});onLog(`Replicated and verified: ${source} -> ${target}`);onProgress({index,itemCount:items.length,fileBytes:src.size,fileCopiedBytes:src.size,completedBytes,totalBytes,status:'COPIED',targetPath:target});
  }
  return {copied,skipped,verified,totalBytes,results};
}
