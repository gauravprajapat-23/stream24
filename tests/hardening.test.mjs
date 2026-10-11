import test from 'node:test';
import assert from 'node:assert/strict';
import { agentTokenHash, RateLimiter, timingSafeHexEqual } from '../apps/server/hardening.mjs';

test('agent tokens are matched by constant-time hash comparison',()=>{
  const a=agentTokenHash('secret-token');
  assert.equal(a.length,64);
  assert.equal(timingSafeHexEqual(a,agentTokenHash('secret-token')),true);
  assert.equal(timingSafeHexEqual(a,agentTokenHash('wrong')),false);
});

test('rate limiter blocks attempts above configured limit',()=>{
  const r=new RateLimiter();
  assert.equal(r.check('x',{limit:2,windowMs:60000}).ok,true);
  assert.equal(r.check('x',{limit:2,windowMs:60000}).ok,true);
  assert.equal(r.check('x',{limit:2,windowMs:60000}).ok,false);
});
