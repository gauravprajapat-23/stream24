import test from 'node:test';import assert from 'node:assert/strict';
import {mapPathForDevice,syncPairForDevice,normalizeMediaMappings} from '../apps/server/pathmap.mjs';
test('maps canonical Windows root to worker local root',()=>{const m=[{canonicalRoot:'D:\\Stream24\\media',localRoot:'E:\\S24\\media'}];assert.equal(mapPathForDevice('D:\\Stream24\\media\\a\\x.mp4',m),'E:\\S24\\media\\a\\x.mp4');});
test('builds LAN replication pair',()=>{const m=[{canonicalRoot:'D:\\Stream24\\media',localRoot:'E:\\S24\\media',syncSourceRoot:'\\\\PRIMARY-PC\\Stream24'}];assert.deepEqual(syncPairForDevice('D:\\Stream24\\media\\x.mp4',m),{canonicalPath:'D:\\Stream24\\media\\x.mp4',sourcePath:'\\\\PRIMARY-PC\\Stream24\\x.mp4',targetPath:'E:\\S24\\media\\x.mp4',mappingId:'map-1'});});
test('drops incomplete mappings',()=>assert.equal(normalizeMediaMappings([{canonicalRoot:'D:\\x'}]).length,0));

import { canonicalPathForDevice } from '../apps/server/pathmap.mjs';
test('reverse maps worker local path back to canonical media path',()=>{assert.equal(canonicalPathForDevice('E:\\S24\\media\\a.mp4',[{canonicalRoot:'D:\\Stream24\\media',localRoot:'E:\\S24\\media'}]),'D:\\Stream24\\media\\a.mp4');});
