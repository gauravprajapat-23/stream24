import fs from 'node:fs';
import path from 'node:path';

const configPath = process.env.STREAM24_AGENT_CONFIG || '/run/stream24/config.json';
const token = String(process.env.STREAM24_AGENT_TOKEN || '').trim();
if (!token || token === 'PASTE_WORKER_TOKEN_HERE') {
  console.error('STREAM24_AGENT_TOKEN is required. Create a worker in Stream24 and put its one-time token in .env.');
  process.exit(1);
}
const mediaRoot = path.resolve(process.env.STREAM24_MEDIA_ROOT || '/data/media');
fs.mkdirSync(path.dirname(configPath), { recursive: true });
fs.mkdirSync(mediaRoot, { recursive: true });
const config = {
  serverUrl: process.env.STREAM24_SERVER_URL || 'http://server:3000',
  agentToken: token,
  ffmpegPath: process.env.STREAM24_FFMPEG_PATH || 'ffmpeg',
  ffprobePath: process.env.STREAM24_FFPROBE_PATH || 'ffprobe',
  autoRestart: true,
  restartDelayMs: 5000,
  recoverOnStart: true,
  watchFolders: [mediaRoot],
  watchScanIntervalMs: 60000,
  // This exception is only for the private Docker bridge network. Do not expose
  // the worker API or use this setting for a public/untrusted network.
  allowInsecureLan: true,
  caCertPath: ''
};
fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
console.log(`Stream24 cloud worker configured. Media root: ${mediaRoot}`);
const { spawn } = await import('node:child_process');
const child = spawn(process.execPath, ['apps/agent/agent.mjs'], { stdio: 'inherit', env: process.env });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
