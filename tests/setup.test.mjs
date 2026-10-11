import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setupChecklist, checklistProgress } from '../apps/server/setup.mjs';

test('setup checklist reports production readiness',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'s24-setup-'));
  fs.mkdirSync(path.join(root,'scripts','windows'),{recursive:true});
  fs.writeFileSync(path.join(root,'scripts','windows','install-ffmpeg.ps1'),'');
  fs.writeFileSync(path.join(root,'scripts','windows','setup-stream24.ps1'),'');
  const checks=setupChecklist({root,developmentMasterKey:false,devices:[{ffmpeg:true}],streams:[{}]});
  assert.equal(checks.masterKey.ok,true);assert.equal(checks.worker.ok,true);assert.equal(checks.ffmpeg.ok,true);assert.equal(checks.stream.ok,true);assert.equal(checks.installer.ok,true);
  const progress=checklistProgress(checks);assert.equal(progress.complete,true);assert.equal(progress.percent,100);
});

test('setup checklist exposes missing production requirements',()=>{
  const checks=setupChecklist({root:os.tmpdir(),developmentMasterKey:true,devices:[],streams:[]});
  assert.equal(checks.masterKey.ok,false);assert.equal(checks.worker.ok,false);assert.equal(checks.stream.ok,false);
  assert.ok(checklistProgress(checks).percent<100);
});
