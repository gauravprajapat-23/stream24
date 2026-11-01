#!/usr/bin/env node
const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] != null ? Number(args[index + 1]) : fallback;
}
const streams = Math.max(1, Math.floor(option('--streams', 15)));
const videoKbps = Math.max(1, option('--video-kbps', 4500));
const audioKbps = Math.max(0, option('--audio-kbps', 128));
const hoursPerDay = Math.max(0, Math.min(24, option('--hours-per-day', 24)));
const days = Math.max(1, option('--days', 30));
const headroomPercent = Math.max(0, option('--headroom-percent', 15));
const bitrateKbps = videoKbps + audioKbps;
const aggregateMbps = streams * bitrateKbps / 1000;
const decimalTb = aggregateMbps * 1_000_000 / 8 * hoursPerDay * 3600 * days / 1e12;
const plannedTb = decimalTb * (1 + headroomPercent / 100);
const rows = [1, 3, 5, 8, 15].map((count) => {
  const mbps = count * bitrateKbps / 1000;
  const tb = mbps * 1_000_000 / 8 * hoursPerDay * 3600 * days / 1e12;
  return { streams: count, aggregateMbps: Number(mbps.toFixed(2)), monthlyOutboundTB: Number(tb.toFixed(3)), withHeadroomTB: Number((tb * (1 + headroomPercent / 100)).toFixed(3)) };
});
console.log(JSON.stringify({
  assumptions: { streams, videoKbps, audioKbps, hoursPerDay, days, headroomPercent, units: 'decimal TB (1 TB = 1,000,000,000,000 bytes)' },
  requestedCapacity: { aggregateMbps: Number(aggregateMbps.toFixed(2)), monthlyOutboundTB: Number(decimalTb.toFixed(3)), monthlyOutboundWithHeadroomTB: Number(plannedTb.toFixed(3)) },
  comparison: rows,
  warning: 'This is an egress calculator, not a measured FFmpeg or server-capacity benchmark. Confirm actual output bitrate, destination count and provider transfer allowance.'
}, null, 2));
