#!/usr/bin/env node
import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/capacity-report.mjs <metrics-export.json> [--network-mbps 1000] [--max-cpu 70] [--max-memory 80] [--min-hours 24]');
  process.exit(2);
}
const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] != null ? Number(process.argv[index + 1]) : fallback;
};
let payload;
try { payload = JSON.parse(fs.readFileSync(file, 'utf8')); }
catch (error) { console.error(`Cannot read metrics export: ${error.message}`); process.exit(2); }
const samples = Array.isArray(payload) ? payload : payload.samples;
if (!Array.isArray(samples) || samples.length < 2) {
  console.error('Metrics export must contain at least two samples in an array or { "samples": [...] }.');
  process.exit(2);
}
const percentile = (values, p) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
};
const cpu = samples.filter((s) => s.cpuUsedPercent != null).map((s) => Number(s.cpuUsedPercent)).filter(Number.isFinite);
const memory = samples.filter((s) => s.memoryUsedPercent != null).map((s) => Number(s.memoryUsedPercent)).filter(Number.isFinite);
const txMbps = samples.filter((s) => s.networkTxBytesPerSecond != null).map((s) => Number(s.networkTxBytesPerSecond) * 8 / 1e6).filter(Number.isFinite);
const txTotals = samples.filter((s) => s.networkTxBytesTotal != null).map((s) => Number(s.networkTxBytesTotal)).filter(Number.isFinite);
const maxCpu = option('--max-cpu', 70);
const maxMemory = option('--max-memory', 80);
const networkMbps = option('--network-mbps', 1000);
const minHours = Math.max(0, option('--min-hours', 24));
const p95Cpu = percentile(cpu, 0.95);
const p95Memory = percentile(memory, 0.95);
const p95Tx = percentile(txMbps, 0.95);
const peakTx = txMbps.length ? Math.max(...txMbps) : null;
const totalEgressBytes = txTotals.length > 1 ? Math.max(0, txTotals.at(-1) - txTotals[0]) : null;
const durationHours = samples[0].sampledAt && samples.at(-1).sampledAt ? Number(((Date.parse(samples.at(-1).sampledAt) - Date.parse(samples[0].sampledAt)) / 3600000).toFixed(2)) : null;
const checks = [
  { name: 'Soak duration', value: durationHours, limit: minHours, unit: 'hours', pass: durationHours != null && durationHours >= minHours },
  { name: 'CPU p95', value: p95Cpu, limit: maxCpu, unit: '%', pass: p95Cpu != null && p95Cpu <= maxCpu },
  { name: 'Memory p95', value: p95Memory, limit: maxMemory, unit: '%', pass: p95Memory != null && p95Memory <= maxMemory },
  { name: 'Network TX p95', value: p95Tx, limit: networkMbps * 0.8, unit: 'Mbps', pass: p95Tx != null && p95Tx <= networkMbps * 0.8 }
];
console.log(JSON.stringify({
  sampleCount: samples.length,
  firstSampleAt: samples[0].sampledAt || null,
  lastSampleAt: samples.at(-1).sampledAt || null,
  durationHours,
  p95: { cpuPercent: p95Cpu, memoryPercent: p95Memory, networkTxMbps: p95Tx },
  peakNetworkTxMbps: peakTx,
  measuredOutboundBytes: totalEgressBytes,
  measuredOutboundDecimalGB: totalEgressBytes == null ? null : Number((totalEgressBytes / 1e9).toFixed(3)),
  checks,
  passed: checks.every((check) => check.pass),
  note: 'This report evaluates the supplied telemetry samples. A passing report is not a substitute for destination-side stream health checks or a 24/72-hour soak test.'
}, null, 2));
if (checks.some((check) => !check.pass)) process.exitCode = 1;
