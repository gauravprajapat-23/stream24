import fs from 'node:fs';
import path from 'node:path';

export function setupChecklist({root,devices=[],streams=[],developmentMasterKey=false}={}){
  const ffmpegScript=fs.existsSync(path.join(root,'scripts','windows','install-ffmpeg.ps1'));
  const installer=fs.existsSync(path.join(root,'scripts','windows','setup-stream24.ps1'));
  return {
    masterKey:{ok:!developmentMasterKey,label:developmentMasterKey?'Using development master key':'Production master key configured'},
    owner:{ok:true,label:'Owner account configured'},
    worker:{ok:devices.length>0,label:devices.length?`${devices.length} worker(s) configured`:'Create and pair a worker'},
    ffmpeg:{ok:devices.some(d=>d.ffmpeg===true),label:devices.some(d=>d.ffmpeg===true)?'FFmpeg detected by a worker':'FFmpeg not yet reported by a worker'},
    stream:{ok:streams.length>0,label:streams.length?`${streams.length} stream(s) configured`:'Create your first stream'},
    installer:{ok:installer&&ffmpegScript,label:installer&&ffmpegScript?'Windows setup scripts present':'Windows setup scripts missing'}
  };
}

export function checklistProgress(checks={}){
  const rows=Object.values(checks); const passed=rows.filter(x=>x?.ok).length;
  return {passed,total:rows.length,percent:rows.length?Math.round(passed/rows.length*100):0,complete:rows.length>0&&passed===rows.length};
}
