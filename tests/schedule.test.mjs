import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRunSchedule } from '../apps/server/schedule.mjs';
const daily={enabled:true,timezone:'UTC',days:[0,1,2,3,4,5,6],startTime:'09:00',stopTime:'18:00'};
test('schedule runs inside same-day window',()=>{assert.equal(shouldRunSchedule(daily,new Date('2026-10-08T10:00:00Z')),true);assert.equal(shouldRunSchedule(daily,new Date('2026-10-08T19:00:00Z')),false);});
test('overnight schedule crosses midnight',()=>{const s={enabled:true,timezone:'UTC',days:[4],startTime:'22:00',stopTime:'06:00'};assert.equal(shouldRunSchedule(s,new Date('2026-10-08T23:00:00Z')),true);assert.equal(shouldRunSchedule(s,new Date('2026-10-09T03:00:00Z')),true);assert.equal(shouldRunSchedule(s,new Date('2026-10-09T07:00:00Z')),false);});
