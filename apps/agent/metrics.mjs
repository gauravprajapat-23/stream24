import fs from 'node:fs';
import os from 'node:os';

export function parseCpuTimes(text) {
  const line = String(text || '').split('\n').find((value) => /^cpu\s/.test(value.trim()));
  if (!line) return null;
  const values = line.trim().split(/\s+/).slice(1).map(Number);
  if (values.length < 4 || values.some((value) => !Number.isFinite(value))) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  const idle = values[3] + (values[4] || 0);
  return { total, idle };
}

export function parseNetworkCounters(text) {
  let rxBytes = 0;
  let txBytes = 0;
  let interfaces = 0;
  for (const line of String(text || '').split('\n')) {
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const name = line.slice(0, separator).trim();
    if (!name || name === 'lo') continue;
    const fields = line.slice(separator + 1).trim().split(/\s+/).map(Number);
    if (fields.length < 9 || fields.slice(0, 9).some((value) => !Number.isFinite(value))) continue;
    rxBytes += fields[0];
    txBytes += fields[8];
    interfaces += 1;
  }
  return interfaces ? { rxBytes, txBytes, interfaces } : null;
}

const readOptional = (readFile, file) => {
  try { return readFile(file, 'utf8'); } catch { return null; }
};

export function createMetricsSampler({
  readFile = fs.readFileSync,
  cpus = os.cpus,
  platform = os.platform,
  hostname = os.hostname,
  totalmem = os.totalmem,
  freemem = os.freemem,
  uptime = os.uptime,
  loadavg = os.loadavg,
  processMemory = process.memoryUsage
} = {}) {
  let previousCpu = null;
  let previousNetwork = null;
  let previousAt = null;

  return {
    sample(nowMs = Date.now()) {
      const cpuText = platform() === 'linux' ? readOptional(readFile, '/proc/stat') : null;
      const netText = platform() === 'linux' ? readOptional(readFile, '/proc/net/dev') : null;
      const cpu = cpuText ? parseCpuTimes(cpuText) : null;
      const network = netText ? parseNetworkCounters(netText) : null;
      const elapsedSeconds = previousAt == null ? null : Math.max(0.001, (nowMs - previousAt) / 1000);
      let cpuUsedPercent = null;
      if (cpu && previousCpu && cpu.total > previousCpu.total) {
        const totalDelta = cpu.total - previousCpu.total;
        const idleDelta = Math.max(0, cpu.idle - previousCpu.idle);
        cpuUsedPercent = Math.max(0, Math.min(100, Number(((totalDelta - idleDelta) / totalDelta * 100).toFixed(2))));
      } else if (!cpu) {
        const current = cpus().reduce((sum, core) => {
          const times = core.times || {};
          return { idle: sum.idle + Number(times.idle || 0), total: sum.total + Object.values(times).reduce((a, b) => a + Number(b || 0), 0) };
        }, { idle: 0, total: 0 });
        if (previousCpu && current.total > previousCpu.total) {
          const totalDelta = current.total - previousCpu.total;
          cpuUsedPercent = Math.max(0, Math.min(100, Number(((totalDelta - (current.idle - previousCpu.idle)) / totalDelta * 100).toFixed(2))));
        }
        previousCpu = current;
      }
      const memoryTotalBytes = Number(totalmem());
      const memoryFreeBytes = Number(freemem());
      const memoryUsedPercent = memoryTotalBytes > 0 ? Number(((memoryTotalBytes - memoryFreeBytes) / memoryTotalBytes * 100).toFixed(2)) : null;
      const proc = processMemory();
      const metrics = {
        hostname: hostname(),
        platform: platform(),
        arch: os.arch(),
        uptimeSeconds: Math.round(uptime()),
        cpuUsedPercent,
        memoryTotalBytes,
        memoryFreeBytes,
        memoryUsedPercent,
        processRssBytes: Number(proc.rss || 0),
        processHeapUsedBytes: Number(proc.heapUsed || 0),
        loadAverage: loadavg().map((value) => Number(value.toFixed(2))),
        networkRxBytesTotal: network?.rxBytes ?? null,
        networkTxBytesTotal: network?.txBytes ?? null,
        networkRxBytesPerSecond: null,
        networkTxBytesPerSecond: null,
        networkInterfaces: network?.interfaces ?? null,
        sampledAt: new Date(nowMs).toISOString()
      };
      if (network && previousNetwork && elapsedSeconds) {
        metrics.networkRxBytesPerSecond = Math.max(0, Number(((network.rxBytes - previousNetwork.rxBytes) / elapsedSeconds).toFixed(2)));
        metrics.networkTxBytesPerSecond = Math.max(0, Number(((network.txBytes - previousNetwork.txBytes) / elapsedSeconds).toFixed(2)));
      }
      previousCpu = cpu || previousCpu;
      previousNetwork = network || previousNetwork;
      previousAt = nowMs;
      return metrics;
    }
  };
}
