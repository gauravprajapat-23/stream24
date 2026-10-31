import test from 'node:test';
import assert from 'node:assert/strict';
import { createMetricsSampler, parseCpuTimes, parseNetworkCounters } from '../apps/agent/metrics.mjs';

test('parses aggregate Linux CPU counters', () => {
  assert.deepEqual(parseCpuTimes('cpu  100 2 30 400 5 0 0 0 0 0\ncpu0 50 1 15 200 2 0 0 0 0 0'), { total: 537, idle: 405 });
  assert.equal(parseCpuTimes('cpu broken'), null);
});

test('aggregates network counters and excludes loopback', () => {
  const value = parseNetworkCounters('Inter-| Receive | Transmit\n face |bytes packets errs drop fifo frame compressed multicast|bytes packets errs drop fifo colls carrier compressed\n lo: 100 1 0 0 0 0 0 0 200 1 0 0 0 0 0 0\n eth0: 1000 10 0 0 0 0 0 0 2000 20 0 0 0 0 0 0');
  assert.deepEqual(value, { rxBytes: 1000, txBytes: 2000, interfaces: 1 });
});

test('samples CPU and network deltas without negative rates', () => {
  let cpu = 'cpu 100 0 50 800 0 0 0 0 0 0';
  let net = 'eth0: 1000 0 0 0 0 0 0 0 2000 0 0 0 0 0 0 0';
  const sampler = createMetricsSampler({
    readFile: (file) => file === '/proc/stat' ? cpu : net,
    platform: () => 'linux',
    totalmem: () => 1000,
    freemem: () => 250,
    uptime: () => 10,
    loadavg: () => [0.1, 0.2, 0.3],
    processMemory: () => ({ rss: 50, heapUsed: 20 })
  });
  const first = sampler.sample(1000);
  assert.equal(first.cpuUsedPercent, null);
  assert.equal(first.networkTxBytesPerSecond, null);
  cpu = 'cpu 200 0 100 900 0 0 0 0 0 0';
  net = 'eth0: 1100 0 0 0 0 0 0 0 2400 0 0 0 0 0 0 0';
  const second = sampler.sample(2000);
  assert.equal(second.cpuUsedPercent, 50);
  assert.equal(second.memoryUsedPercent, 75);
  assert.equal(second.networkRxBytesPerSecond, 100);
  assert.equal(second.networkTxBytesPerSecond, 400);
  assert.equal(second.processRssBytes, 50);
});
