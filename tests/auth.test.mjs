import test from 'node:test';import assert from 'node:assert/strict';
import {hashPassword,verifyPassword,normalizeEmail,createSessionToken,tokenHash} from '../apps/server/auth.mjs';
test('password hashing and verification',()=>{const h=hashPassword('ChangeMe123!');assert.equal(verifyPassword('ChangeMe123!',h),true);assert.equal(verifyPassword('wrongpass',h),false);assert.notEqual(h,'ChangeMe123!');});
test('email and session helpers',()=>{assert.equal(normalizeEmail(' Test@Email.COM '),'test@email.com');const t=createSessionToken();assert.ok(t.length>30);assert.equal(tokenHash(t),tokenHash(t));});
