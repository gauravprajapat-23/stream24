import test from 'node:test';
import assert from 'node:assert/strict';
import { provisionYoutubeLive } from '../apps/server/youtube.mjs';

test('YouTube provisioning creates stream, broadcast, then binds', async()=>{
  const calls=[]; const old=global.fetch;
  global.fetch=async (url,opts={})=>{calls.push({url:String(url),method:opts.method||'GET',body:opts.body});
    if(String(url).includes('/liveStreams?')) return new Response(JSON.stringify({id:'ls1',cdn:{ingestionInfo:{ingestionAddress:'rtmp://a.rtmp.youtube.com/live2',streamName:'abc-123'}}}),{status:200,headers:{'content-type':'application/json'}});
    if(String(url).includes('/liveBroadcasts?part=snippet,status,contentDetails')) return new Response(JSON.stringify({id:'bc1',snippet:{title:'Test'}}),{status:200,headers:{'content-type':'application/json'}});
    if(String(url).includes('/liveBroadcasts/bind?')) return new Response(JSON.stringify({id:'bc1'}),{status:200,headers:{'content-type':'application/json'}});
    return new Response(JSON.stringify({error:{message:'unexpected'}}),{status:400,headers:{'content-type':'application/json'}});
  };
  try{const r=await provisionYoutubeLive('token',{title:'Test'});assert.equal(r.broadcast.id,'bc1');assert.equal(r.liveStream.id,'ls1');assert.equal(r.ingest.streamKey,'abc-123');assert.equal(calls.length,3);assert.match(calls[2].url,/streamId=ls1/);}finally{global.fetch=old;}
});
