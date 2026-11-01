import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('capacity planner calculates 15-stream egress with headroom', () => {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/capacity-plan.mjs'), '--streams', '15'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.requestedCapacity.aggregateMbps, 69.42);
  assert.ok(report.requestedCapacity.monthlyOutboundWithHeadroomTB > report.requestedCapacity.monthlyOutboundTB);
});

test('capacity report passes a complete one-hour sample window when configured', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stream24-capacity-'));
  const file = path.join(dir, 'metrics.json');
  try {
    fs.writeFileSync(file, JSON.stringify({ samples: [
      { sampledAt: '2026-01-01T00:00:00.000Z', cpuUsedPercent: 40, memoryUsedPercent: 50, networkTxBytesPerSecond: 1000000, networkTxBytesTotal: 1000 },
      { sampledAt: '2026-01-01T01:00:00.000Z', cpuUsedPercent: 60, memoryUsedPercent: 70, networkTxBytesPerSecond: 2000000, networkTxBytesTotal: 7200001000 }
    ] }));
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/capacity-report.mjs'), file, '--min-hours', '1'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(JSON.parse(result.stdout).passed, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('capacity report rejects missing resource metrics and short soak windows', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stream24-capacity-'));
  const file = path.join(dir, 'metrics.json');
  try {
    fs.writeFileSync(file, JSON.stringify({ samples: [
      { sampledAt: '2026-01-01T00:00:00.000Z', cpuUsedPercent: null, memoryUsedPercent: null, networkTxBytesPerSecond: null },
      { sampledAt: '2026-01-01T00:05:00.000Z', cpuUsedPercent: null, memoryUsedPercent: null, networkTxBytesPerSecond: null }
    ] }));
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/capacity-report.mjs'), file], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.passed, false);
    assert.ok(report.checks.some((check) => check.name === 'Soak duration' && !check.pass));
    assert.ok(report.checks.some((check) => check.name === 'CPU p95' && !check.pass));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
