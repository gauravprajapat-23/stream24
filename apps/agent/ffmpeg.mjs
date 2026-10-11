import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function ffmpegAvailable(binary = 'ffmpeg') {
  const result = spawnSync(binary, ['-version'], { stdio: 'ignore', windowsHide: true });
  return result.status === 0;
}

function concatEscape(p=''){return String(p).replace(/'/g,"'\\''");}

function outputArgs(config){
  const ds=(Array.isArray(config.destinations)&&config.destinations.length?config.destinations:[{rtmpUrl:config.rtmpUrl,streamKey:config.streamKey}]).filter(d=>d?.rtmpUrl&&d?.streamKey);
  if(!ds.length)throw new Error('No enabled RTMP destination is configured.');
  const urls=ds.map(d=>`${String(d.rtmpUrl).replace(/\/$/,'')}/${d.streamKey}`);
  if(urls.length===1)return ['-f','flv',urls[0]];
  const esc=v=>String(v).replace(/\\/g,'\\\\').replace(/\|/g,'\\|').replace(/:/g,'\\:');
  return ['-f','tee',ds.map((d,i)=>`[f=flv:onfail=${(d.role==='PRIMARY'||i===0)?'abort':'ignore'}]${esc(urls[i])}`).join('|')];
}

export class FfmpegRunner {
  constructor({ binary = 'ffmpeg', onExit = () => {}, onLog = () => {}, onItem = () => {}, onProgress = () => {} } = {}) {
    this.binary = binary; this.proc = null; this.streamId = null; this.config = null; this.index = 0;
    this.stopping = false; this.control = null; this.onExit = onExit; this.onLog = onLog; this.onItem = onItem;
    this.manifestPath = null; this.pipelineStartedAt = 0; this.pipelineBaseIndex = 0; this.itemTimer = null; this.lastReportedIndex = -1; this.onProgress = onProgress; this.progressBuffer='';
  }
  get running() { return Boolean(this.proc && this.proc.exitCode === null); }
  get currentIndex() { return this.#estimatedIndex(); }

  start(config) {
    if (this.running) throw new Error('A stream is already running on this agent.');
    const playlist = Array.isArray(config.playlist) && config.playlist.length ? config.playlist : [config.inputPath].filter(Boolean);
    if (!playlist.length) throw new Error('No playlist media provided.');
    this.config = { ...config, playlist }; this.streamId = config.streamId;
    this.index = Math.max(0, Math.min(Number(config.startIndex || 0), playlist.length - 1));
    this.stopping = false; this.control = null; (config.pipelineMode==='sequential'?this.#spawnSequential():this.#spawnPersistent());
  }

  #estimatedIndex(){
    if(!this.config)return this.index;
    const media=Array.isArray(this.config.media)?this.config.media:[];
    if(!this.pipelineStartedAt||media.length!==this.config.playlist.length)return this.index;
    const durations=media.map(m=>Math.max(0,Number(m.durationSeconds||0)));
    const total=durations.reduce((a,b)=>a+b,0);if(!total)return this.index;
    let elapsed=(Date.now()-this.pipelineStartedAt)/1000;
    const ordered=[...durations.slice(this.pipelineBaseIndex),...durations.slice(0,this.pipelineBaseIndex)];
    if(this.config.loop!==false)elapsed%=total;
    let acc=0;for(let offset=0;offset<ordered.length;offset++){acc+=ordered[offset];if(elapsed<acc)return (this.pipelineBaseIndex+offset)%durations.length;}
    return (this.pipelineBaseIndex+ordered.length-1)%durations.length;
  }

  #createManifest(){
    this.#cleanupManifest();
    const ordered=[...this.config.playlist.slice(this.index),...this.config.playlist.slice(0,this.index)];
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stream24-'));
    const manifest=path.join(dir,'playlist.ffconcat');
    const lines=['ffconcat version 1.0',...ordered.map(p=>`file '${concatEscape(path.resolve(p))}'`)];
    fs.writeFileSync(manifest,lines.join('\n'),'utf8');this.manifestPath=manifest;return manifest;
  }
  #cleanupManifest(){if(!this.manifestPath)return;try{fs.rmSync(path.dirname(this.manifestPath),{recursive:true,force:true});}catch{}this.manifestPath=null;}

  #spawnPersistent() {
    if (!this.config) return;
    const config = this.config, outputs=outputArgs(config);
    const branding = config.branding || {}, useOverlay = Boolean(branding.enabled && branding.imagePath);
    const transcode = config.mode === 'transcode' || useOverlay;
    const manifest=this.#createManifest();
    const base=['-hide_banner','-loglevel','warning','-fflags','+genpts'];
    if(config.loop!==false)base.push('-stream_loop','-1');
    base.push('-re','-f','concat','-safe','0','-i',manifest);
    const mediaArgs = transcode
      ? ['-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p','-b:v',`${config.videoBitrateKbps||4000}k`,'-maxrate',`${config.videoBitrateKbps||4000}k`,'-bufsize',`${(config.videoBitrateKbps||4000)*2}k`,'-g','60','-keyint_min','60','-sc_threshold','0','-c:a','aac','-b:a',`${config.audioBitrateKbps||128}k`,'-ar','44100']
      : ['-c','copy'];
    let args;
    if (useOverlay) {
      const pos = branding.position || 'top-right';
      const xy = { 'top-left':['20','20'], 'top-right':['W-w-20','20'], 'bottom-left':['20','H-h-20'], 'bottom-right':['W-w-20','H-h-20'] }[pos] || ['W-w-20','20'];
      const width = Math.max(40, Math.min(1000, Number(branding.width || 220)));
      const opacity = Math.max(0.1, Math.min(1, Number(branding.opacity || 0.9)));
      const filter = `[1:v]scale=${width}:-1,format=rgba,colorchannelmixer=aa=${opacity}[wm];[0:v][wm]overlay=${xy[0]}:${xy[1]}:format=auto[vout]`;
      args = [...base,'-loop','1','-i',branding.imagePath,'-filter_complex',filter,'-map','[vout]','-map','0:a?','-shortest',...mediaArgs,'-avoid_negative_ts','make_zero',...outputs];
    } else args = [...base,'-map','0:v?','-map','0:a?',...mediaArgs,'-avoid_negative_ts','make_zero',...outputs];

    this.pipelineBaseIndex=this.index;this.pipelineStartedAt=Date.now();this.lastReportedIndex=-1;
    args.splice(args.length-3,0,'-progress','pipe:1','-nostats');
    this.#startItemTimer();
    this.proc = spawn(this.binary,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
    this.#bindProgress();
    this.proc.stderr.setEncoding('utf8'); this.proc.stderr.on('data',c=>this.onLog(String(c).trim()));
    this.proc.on('error',err=>this.onLog(`FFmpeg error: ${err.message}`));
    this.proc.on('exit',(code,signal)=>{
      this.proc = null;this.#stopItemTimer();this.#cleanupManifest();
      if (this.stopping) { const id=this.streamId; this.streamId=null; this.config=null; this.control=null; this.onExit({streamId:id,code,signal,expected:true,playlistEnded:false}); return; }
      if (this.control && this.config) {
        const action=this.control; this.control=null;
        if(action==='skip')this.index=(this.#estimatedIndex()+1)%this.config.playlist.length;
        else this.index=this.#estimatedIndex();
        setTimeout(()=>this.config?.pipelineMode==='sequential'?this.#spawnSequential():this.#spawnPersistent(),25); return;
      }
      const id=this.streamId; this.streamId=null; this.config=null;
      this.onExit({streamId:id,code,signal,expected:false,playlistEnded:code===0});
    });
  }

  #spawnSequential() {
    if (!this.config) return;
    const config=this.config,inputPath=config.playlist[this.index],outputs=outputArgs(config);
    const branding=config.branding||{},useOverlay=Boolean(branding.enabled&&branding.imagePath),transcode=config.mode==='transcode'||useOverlay;
    const mediaArgs=transcode?['-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p','-b:v',`${config.videoBitrateKbps||4000}k`,'-maxrate',`${config.videoBitrateKbps||4000}k`,'-bufsize',`${(config.videoBitrateKbps||4000)*2}k`,'-g','60','-keyint_min','60','-sc_threshold','0','-c:a','aac','-b:a',`${config.audioBitrateKbps||128}k`,'-ar','44100']:['-c','copy'];
    const base=['-hide_banner','-loglevel','warning','-fflags','+genpts','-re','-i',inputPath];let args;
    if(useOverlay){const pos=branding.position||'top-right',xy={'top-left':['20','20'],'top-right':['W-w-20','20'],'bottom-left':['20','H-h-20'],'bottom-right':['W-w-20','H-h-20']}[pos]||['W-w-20','20'];const width=Math.max(40,Math.min(1000,Number(branding.width||220))),opacity=Math.max(.1,Math.min(1,Number(branding.opacity||.9))),filter=`[1:v]scale=${width}:-1,format=rgba,colorchannelmixer=aa=${opacity}[wm];[0:v][wm]overlay=${xy[0]}:${xy[1]}:format=auto[vout]`;args=[...base,'-loop','1','-i',branding.imagePath,'-filter_complex',filter,'-map','[vout]','-map','0:a?','-shortest',...mediaArgs,'-avoid_negative_ts','make_zero',...outputs];}else args=[...base,'-map','0:v?','-map','0:a?',...mediaArgs,'-avoid_negative_ts','make_zero',...outputs];
    args.splice(args.length-3,0,'-progress','pipe:1','-nostats');
    this.pipelineStartedAt=Date.now();this.pipelineBaseIndex=this.index;this.onItem({streamId:this.streamId,index:this.index,inputPath});
    this.proc=spawn(this.binary,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});this.#bindProgress();this.proc.stderr.setEncoding('utf8');this.proc.stderr.on('data',c=>this.onLog(String(c).trim()));this.proc.on('error',err=>this.onLog(`FFmpeg error: ${err.message}`));
    this.proc.on('exit',(code,signal)=>{this.proc=null;if(this.stopping){const id=this.streamId;this.streamId=null;this.config=null;this.control=null;this.onExit({streamId:id,code,signal,expected:true,playlistEnded:false});return;}if(this.control&&this.config){const action=this.control;this.control=null;if(action==='skip')this.index=(this.index+1)%this.config.playlist.length;setTimeout(()=>this.#spawnSequential(),25);return;}if(code===0&&this.config){const hasNext=this.index+1<this.config.playlist.length;if(hasNext||this.config.loop!==false){this.index=hasNext?this.index+1:0;setTimeout(()=>this.#spawnSequential(),25);return;}}const id=this.streamId;this.streamId=null;this.config=null;this.onExit({streamId:id,code,signal,expected:false,playlistEnded:code===0});});
  }


  #bindProgress(){
    if(!this.proc?.stdout)return;this.progressBuffer='';this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data',chunk=>{this.progressBuffer+=String(chunk);let i;while((i=this.progressBuffer.indexOf('\n'))>=0){const line=this.progressBuffer.slice(0,i).trim();this.progressBuffer=this.progressBuffer.slice(i+1);if(!line)continue;const [k,...rest]=line.split('=');const v=rest.join('=');if(k==='progress'){this.onProgress({streamId:this.streamId,index:this.#estimatedIndex(),at:Date.now(),progress:v});}else{this._progress ||= {};this._progress[k]=v;if(k==='speed'||k==='fps'||k==='out_time_ms')this.onProgress({streamId:this.streamId,index:this.#estimatedIndex(),at:Date.now(),progress:'continue',fps:Number(this._progress.fps||0),speed:this._progress.speed||null,outTimeMs:Number(this._progress.out_time_ms||0)});}}});
  }

  #startItemTimer(){this.#stopItemTimer();const tick=()=>{if(!this.config)return;const idx=this.#estimatedIndex();if(idx!==this.lastReportedIndex){this.lastReportedIndex=idx;this.onItem({streamId:this.streamId,index:idx,inputPath:this.config.playlist[idx]});}};tick();this.itemTimer=setInterval(tick,1000);}
  #stopItemTimer(){if(this.itemTimer)clearInterval(this.itemTimer);this.itemTimer=null;}

  async #killForControl(action) {
    if (!this.running) throw new Error('No active FFmpeg process.');
    this.control=action; const proc=this.proc; proc.kill('SIGTERM');
    await new Promise(resolve=>{ const timer=setTimeout(()=>{if(proc.exitCode===null)proc.kill('SIGKILL');resolve();},4000); proc.once('exit',()=>{clearTimeout(timer);resolve();}); });
  }
  async skip() { await this.#killForControl('skip'); }
  async restartCurrent() { await this.#killForControl('restart'); }

  async stop() {
    this.stopping=true; this.control=null;this.#stopItemTimer();
    if (!this.running) { this.streamId=null; this.config=null;this.#cleanupManifest(); return; }
    const proc=this.proc; proc.kill('SIGTERM');
    await new Promise(resolve=>{const timer=setTimeout(()=>{if(proc.exitCode===null)proc.kill('SIGKILL');resolve();},5000);proc.once('exit',()=>{clearTimeout(timer);resolve();});});
  }
}
