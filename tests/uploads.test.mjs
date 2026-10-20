import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { saveUploadedVideo, listUploadedVideos } from '../apps/server/uploads.mjs';

function requestFor(filename, body) {
  const req = Readable.from([Buffer.from(body)]);
  req.url = '/api/media/upload?filename=' + encodeURIComponent(filename);
  req.headers = { 'content-length': String(Buffer.byteLength(body)) };
  return req;
}

test('uploads a video atomically and lists it for its owner', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stream24-upload-test-'));
  try {
    const result = await saveUploadedVideo(requestFor('sample.mp4', 'video bytes'), { root, ownerId: 'owner-test', maxBytes: 1024 });
    assert.equal(result.name, 'sample.mp4');
    assert.equal(result.sizeBytes, 11);
    assert.equal(fs.readFileSync(result.path, 'utf8'), 'video bytes');
    const items = listUploadedVideos({ root, ownerId: 'owner-test' });
    assert.equal(items.length, 1);
    assert.equal(items[0].path, result.path);
    assert.equal(listUploadedVideos({ root, ownerId: 'another-owner' }).length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects unsupported extensions', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stream24-upload-test-'));
  try {
    await assert.rejects(
      saveUploadedVideo(requestFor('payload.exe', 'not a video'), { root, ownerId: 'owner-test', maxBytes: 1024 }),
      error => error.statusCode === 415
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects declared uploads above the configured limit', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stream24-upload-test-'));
  try {
    await assert.rejects(
      saveUploadedVideo(requestFor('large.mp4', 'more than limit'), { root, ownerId: 'owner-test', maxBytes: 4 }),
      error => error.statusCode === 413
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
