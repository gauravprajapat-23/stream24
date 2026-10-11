export function streamAnalytics(stream){
  const seconds=Math.max(0,Number(stream.analytics?.totalLiveSeconds||0));
  const video=Number(stream.videoBitrateKbps||4000),audio=Number(stream.audioBitrateKbps||128);
  const estimatedBytes=Math.round(seconds*(video+audio)*1000/8);
  return {streamId:stream.id,name:stream.name,totalLiveSeconds:seconds,estimatedBytes,starts:Number(stream.analytics?.starts||0),reconnects:Number(stream.analytics?.reconnects||0),failures:Number(stream.analytics?.failures||0),lastLiveAt:stream.analytics?.lastLiveAt||null};
}
export function analyticsSummary(streams=[]){
  const items=streams.map(streamAnalytics);return {totalLiveSeconds:items.reduce((a,x)=>a+x.totalLiveSeconds,0),estimatedBytes:items.reduce((a,x)=>a+x.estimatedBytes,0),starts:items.reduce((a,x)=>a+x.starts,0),reconnects:items.reduce((a,x)=>a+x.reconnects,0),failures:items.reduce((a,x)=>a+x.failures,0),streams:items};
}
