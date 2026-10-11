export function deviceOnline(device, nowMs=Date.now(), staleMs=30000){
  if(!device?.lastSeenAt) return false;
  const t=Date.parse(device.lastSeenAt);
  return Number.isFinite(t) && nowMs-t <= staleMs;
}

export function normalizeWorkerFailover(input={}, primaryDeviceId=''){
  const backups=Array.isArray(input.backupDeviceIds)?input.backupDeviceIds.map(String).filter(Boolean):[];
  const unique=[...new Set(backups.filter(id=>id!==primaryDeviceId))].slice(0,4);
  return {
    enabled:Boolean(input.enabled),
    backupDeviceIds:unique,
    takeoverAfterSeconds:Math.max(15,Math.min(300,Number(input.takeoverAfterSeconds||30))),
    autoFailback:Boolean(input.autoFailback),
    leaseGraceSeconds:Math.max(10,Math.min(120,Number(input.leaseGraceSeconds||25)))
  };
}

export function eligibleWorkers(stream, devices, nowMs=Date.now()){
  const cfg=stream.workerFailover||{enabled:false,backupDeviceIds:[]};
  const ids=[stream.deviceId,...(cfg.enabled?cfg.backupDeviceIds:[])];
  return ids.map((id,index)=>({device:devices.find(d=>d.id===id)||null,priority:index})).filter(x=>x.device&&deviceOnline(x.device,nowMs));
}

export function chooseTakeoverWorker(stream, devices, nowMs=Date.now()){
  const current=stream.activeDeviceId||stream.deviceId;
  const eligible=eligibleWorkers(stream,devices,nowMs);
  const currentRow=eligible.find(x=>x.device.id===current);
  if(currentRow) return {device:currentRow.device,reason:'current-active'};
  const next=eligible.sort((a,b)=>a.priority-b.priority)[0];
  return next?{device:next.device,reason:'active-unavailable'}:null;
}

export function newLease(stream, deviceId, randomId, nowIso){
  const epoch=Number(stream.assignmentEpoch||0)+1;
  return {
    activeDeviceId:deviceId,
    assignmentEpoch:epoch,
    leaseId:randomId('lease'),
    assignedAt:nowIso,
  };
}
