import test from 'node:test';
import assert from 'node:assert/strict';
import { authUrl, youtubeConfigured } from '../apps/server/youtube.mjs';

test('YouTube OAuth config is optional',()=>{const a=process.env.YOUTUBE_CLIENT_ID,b=process.env.YOUTUBE_CLIENT_SECRET;delete process.env.YOUTUBE_CLIENT_ID;delete process.env.YOUTUBE_CLIENT_SECRET;assert.equal(youtubeConfigured(),false);if(a)process.env.YOUTUBE_CLIENT_ID=a;if(b)process.env.YOUTUBE_CLIENT_SECRET=b;});

test('OAuth URL contains required offline YouTube scope',()=>{process.env.YOUTUBE_CLIENT_ID='client-test';process.env.YOUTUBE_CLIENT_SECRET='secret-test';process.env.YOUTUBE_REDIRECT_URI='http://localhost:3000/api/youtube/callback';const u=new URL(authUrl('state123'));assert.equal(u.searchParams.get('client_id'),'client-test');assert.equal(u.searchParams.get('state'),'state123');assert.equal(u.searchParams.get('access_type'),'offline');assert.match(u.searchParams.get('scope'),/youtube/);delete process.env.YOUTUBE_CLIENT_ID;delete process.env.YOUTUBE_CLIENT_SECRET;delete process.env.YOUTUBE_REDIRECT_URI;});
