const cloudUploadMarkup = `
<div class="panel" id="cloudUploadPanel">
  <div class="panel-head"><div><h2>Upload to cloud VPS</h2><p>Videos are stored on the VPS media volume, not your PC.</p></div><button class="ghost" id="refreshCloudUploads" type="button">Refresh</button></div>
  <label>Video files<input id="cloudVideoFiles" type="file" accept="video/*,.mp4,.m4v,.mov,.mkv,.webm,.avi,.mpeg,.mpg,.ts,.m2ts" multiple></label>
  <p class="muted" id="cloudUploadHint">Uploads are available when the server is configured with STREAM24_MEDIA_ROOT.</p>
  <div class="actions"><button class="primary" id="uploadCloudVideos" type="button">Upload selected videos</button><button class="ghost" id="useCloudUploads" type="button">Use uploaded videos in a stream</button></div>
  <div id="cloudUploadProgress" class="meta"></div><div id="cloudUploadList" class="media-list"></div>
</div>`;
const cloudUploads = new Map();
const cloudEsc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const cloudFmt = value => { const n=Number(value)||0; return n>=1024**3 ? (n/1024**3).toFixed(2)+' GB' : (n/1024**2).toFixed(1)+' MB'; };
function cloudRenderUploads(items=[]) {
  const list=document.querySelector('#cloudUploadList'); if(!list)return;
  if(!items.length){list.innerHTML='<div class="empty">No uploaded videos yet.</div>';return;}
  list.innerHTML=items.map((item,index)=>`<label class="media-card"><div class="row"><strong>${cloudEsc(item.name)}</strong><input type="checkbox" class="cloud-upload-select" data-index="${index}" checked></div><div class="meta"><span>${cloudFmt(item.sizeBytes)}</span><code class="pathline">${cloudEsc(item.path)}</code></div><button type="button" class="ghost cloud-copy-path" data-index="${index}">Copy path</button></label>`).join('');
  list.querySelectorAll('.cloud-copy-path').forEach(button=>button.addEventListener('click',async()=>{const item=items[Number(button.dataset.index)];try{await navigator.clipboard.writeText(item.path);document.querySelector('#cloudUploadProgress').textContent='Copied path: '+item.path;}catch{document.querySelector('#cloudUploadProgress').textContent=item.path;}}));
  items.forEach((item,index)=>cloudUploads.set(index,item));
}
async function cloudRefreshUploads(){
  const hint=document.querySelector('#cloudUploadHint');if(!hint)return;
  try{const response=await fetch('/api/media/uploads',{credentials:'same-origin'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Upload endpoint unavailable');hint.textContent=data.enabled?'VPS storage enabled. Select uploaded files and add them to a stream playlist.':'Cloud uploads are not enabled on this server.';cloudRenderUploads(data.items||[]);document.querySelector('#uploadCloudVideos').disabled=!data.enabled;}
  catch(error){hint.textContent=error.message;document.querySelector('#uploadCloudVideos').disabled=true;}
}
async function cloudUploadSelected(){
  const files=[...(document.querySelector('#cloudVideoFiles')?.files||[])];if(!files.length){document.querySelector('#cloudUploadProgress').textContent='Choose at least one video file first.';return;}
  const button=document.querySelector('#uploadCloudVideos');button.disabled=true;
  try{for(let i=0;i<files.length;i++){const file=files[i];document.querySelector('#cloudUploadProgress').textContent=`Uploading ${i+1}/${files.length}: ${file.name} (${cloudFmt(file.size)})`;
    const response=await fetch('/api/media/upload?filename='+encodeURIComponent(file.name),{method:'POST',credentials:'same-origin',headers:{'content-type':'application/octet-stream'},body:file});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`Upload failed for ${file.name}`);
  }document.querySelector('#cloudUploadProgress').textContent='Upload complete.';document.querySelector('#cloudVideoFiles').value='';await cloudRefreshUploads();}
  catch(error){document.querySelector('#cloudUploadProgress').textContent=error.message;}
  finally{button.disabled=false;}
}
function cloudUseSelected(){
  const selected=[...document.querySelectorAll('.cloud-upload-select:checked')].map(el=>el.closest('.media-card')?.querySelector('.pathline')?.textContent).filter(Boolean);
  if(!selected.length){document.querySelector('#cloudUploadProgress').textContent='Select at least one uploaded video.';return;}
  const dialog=document.querySelector('#streamDialog'),apply=()=>{const field=document.querySelector('#streamForm textarea[name="inputPaths"]');if(!field)return;field.value=[field.value.trim(),...selected].filter(Boolean).join('\n');document.querySelector('#pastePlaylistBtn')?.click();document.querySelector('#cloudUploadProgress').textContent='Added '+selected.length+' video(s) to the stream playlist.';};
  if(dialog?.open){apply();return;}
  document.querySelector('.open-create')?.click();setTimeout(apply,100);
}
function installCloudUploadPanel(){
  const grid=document.querySelector('#media .grid-two');if(!grid||document.querySelector('#cloudUploadPanel'))return;
  grid.insertAdjacentHTML('afterbegin',cloudUploadMarkup);
  document.querySelector('#refreshCloudUploads').addEventListener('click',cloudRefreshUploads);
  document.querySelector('#uploadCloudVideos').addEventListener('click',cloudUploadSelected);
  document.querySelector('#useCloudUploads').addEventListener('click',cloudUseSelected);
  cloudRefreshUploads();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installCloudUploadPanel,{once:true});else installCloudUploadPanel();
