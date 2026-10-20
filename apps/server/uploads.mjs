import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';

const VIDEO_EXTENSIONS = new Set(['.mp4','.m4v','.mov','.mkv','.webm','.avi','.mpeg','.mpg','.ts','.m2ts']);
const safeName = value => path.basename(String(value || 'video')).replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 120) || 'video.mp4';

export async function saveUploadedVideo(req, { root, ownerId, maxBytes }) {
  const filename = safeName(new URL(req.url, 'http://localhost').searchParams.get('filename'));
  const ext = path.extname(filename).toLowerCase();
  if (!VIDEO_EXTENSIONS.has(ext)) throw Object.assign(new Error('Unsupported video extension. Use MP4, MOV, MKV, WebM, AVI, MPEG, or TS.'), { statusCode: 415 });
  const length = Number(req.headers['content-length'] || 0);
  if (length > maxBytes) throw Object.assign(new Error(`Upload exceeds the ${Math.floor(maxBytes / 1024 / 1024)} MB limit.`), { statusCode: 413 });
  const ownerDir = path.join(root, ownerId);
  fs.mkdirSync(ownerDir, { recursive: true });
  const storedName = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}-${filename}`;
  const target = path.join(ownerDir, storedName);
  const temp = `${target}.uploading`;
  let bytes = 0, tooLarge = false;
  const output = createWriteStream(temp, { flags: 'wx', mode: 0o600 });
  try {
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > maxBytes) { tooLarge = true; continue; }
      if (!output.write(chunk)) await once(output, 'drain');
    }
    output.end();
    await once(output, 'finish');
    if (tooLarge) throw Object.assign(new Error('Upload exceeds the configured size limit.'), { statusCode: 413 });
    if (!bytes) throw Object.assign(new Error('Uploaded file is empty.'), { statusCode: 400 });
    fs.renameSync(temp, target);
    return { name: filename, path: target, sizeBytes: bytes, uploadedAt: new Date().toISOString() };
  } catch (error) {
    output.destroy();
    try { fs.rmSync(temp, { force: true }); } catch {}
    throw error;
  }
}

export function listUploadedVideos({ root, ownerId }) {
  const ownerDir = path.join(root, ownerId);
  if (!fs.existsSync(ownerDir)) return [];
  return fs.readdirSync(ownerDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) && !entry.name.endsWith('.uploading'))
    .map(entry => {
      const fullPath = path.join(ownerDir, entry.name);
      const stat = fs.statSync(fullPath);
      return { name: entry.name.replace(/^\d+-[a-f0-9]+-/, ''), path: fullPath, sizeBytes: stat.size, uploadedAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt));
}
