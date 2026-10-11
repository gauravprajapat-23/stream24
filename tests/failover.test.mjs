import test from 'node:test';
import assert from 'node:assert/strict';
import {deviceOnline,normalizeWorkerFailover,chooseTakeoverWorker,newLease} from '../apps/server/failover.mjs';

test('normalizes backup workers and excludes primary',()=>{
  const r=normalizeWorkerFailover({enabled:true,backupDeviceIds:['a','b','a','p'],takeoverAfterSeconds:2,leaseGraceSeconds:500},'p');
  assert.deepEqual(r.backupDeviceIds,['a','b']);
  assert.equal(r.takeoverAfterSeconds,15);
  assert.equal(r.leaseGraceSeconds,120);
});

test('chooses backup when active worker is stale',()=>{
  const now=Date.now();
  const stream={deviceId:'p',activeDeviceId:'p',workerFailover:{enabled:true,backupDeviceIds:['b']}};
  const devices=[{id:'p',lastSeenAt:new Date(now-60000).toISOString()},{id:'b',lastSeenAt:new Date(now-1000).toISOString()}];
  assert.equal(deviceOnline(devices[0],now),false);
  assert.equal(chooseTakeoverWorker(stream,devices,now).device.id,'b');
});

test('lease epoch always increases',()=>{
  const lease=newLease({assignmentEpoch:4},'b',p=>`${p}_x`,'2026-10-09T00:00:00.000Z');
  assert.equal(lease.assignmentEpoch,5);
  assert.equal(lease.activeDeviceId,'b');
  assert.equal(lease.leaseId,'lease_x');
});
