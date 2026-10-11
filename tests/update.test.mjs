import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, validateUpdateManifest, sha256Buffer, fetchUpdateManifest } from '../apps/server/update.mjs';

test('semantic version comparison handles newer and older builds',()=>{
  assert.equal(compareVersions('0.14.0','0.15.0'),-1);
  assert.equal(compareVersions('1.2.3','1.2.3'),0);
  assert.equal(compareVersions('2.0.0','1.9.9'),1);
});

test('update manifest requires http url and sha256',()=>{
  const sha='a'.repeat(64);const m=validateUpdateManifest({version:'0.15.0',url:'https://example.test/stream24.zip',sha256:sha,notes:'next'});
  assert.equal(m.version,'0.15.0');assert.equal(m.sha256,sha);
  assert.throws(()=>validateUpdateManifest({version:'x',url:'file:///x',sha256:'bad'}));assert.throws(()=>validateUpdateManifest({version:'0.15.0',url:'http://example.test/update.zip',sha256:sha}),/HTTPS/);assert.equal(validateUpdateManifest({version:'0.15.0',url:'http://localhost:8080/update.zip',sha256:sha}).version,'0.15.0');
});

test('sha256 helper is deterministic',()=>{assert.equal(sha256Buffer(Buffer.from('abc')),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');});

test('manifest fetch validates returned payload',async()=>{
  const fake=async()=>({ok:true,json:async()=>({version:'0.15.0',url:'https://example.test/update.zip',sha256:'b'.repeat(64)})});
  const r=await fetchUpdateManifest('https://example.test/manifest.json',{fetchImpl:fake});
  assert.equal(r.configured,true);assert.equal(r.manifest.version,'0.15.0');
});
