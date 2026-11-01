import crypto from 'node:crypto';

export function agentTokenHash(token=''){
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}
export function timingSafeHexEqual(a='',b=''){
  try{const aa=Buffer.from(String(a),'hex'),bb=Buffer.from(String(b),'hex');return aa.length===bb.length&&aa.length>0&&crypto.timingSafeEqual(aa,bb);}catch{return false;}
}
export function securityHeaders({tls=false}={}){
  const h={
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'referrer-policy':'no-referrer',
    'permissions-policy':'camera=(), microphone=(), geolocation=()',
    'content-security-policy':"default-src 'self'; img-src 'self' data: https://*.razorpay.com; style-src 'self' 'unsafe-inline'; script-src 'self' https://checkout.razorpay.com; connect-src 'self' https://*.razorpay.com; frame-src https://*.razorpay.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
  };
  if(tls)h['strict-transport-security']='max-age=31536000; includeSubDomains';
  return h;
}
export function isSameOrigin(req){
  const origin=req.headers.origin;if(!origin)return true;
  try{const u=new URL(origin),host=String(req.headers.host||'');return u.host===host;}catch{return false;}
}
export class RateLimiter{
  constructor(){this.rows=new Map();}
  check(key,{limit=10,windowMs=60000}={}){
    const t=Date.now(),old=this.rows.get(key);let row=old;
    if(!row||t-row.startedAt>=windowMs)row={startedAt:t,count:0};
    row.count+=1;this.rows.set(key,row);
    if(this.rows.size>2000)for(const [k,v] of this.rows)if(t-v.startedAt>windowMs*2)this.rows.delete(k);
    return {ok:row.count<=limit,remaining:Math.max(0,limit-row.count),retryAfterMs:Math.max(0,windowMs-(t-row.startedAt))};
  }
}
export function requestIp(req){return String(req.socket?.remoteAddress||req.headers['x-real-ip']||'unknown');}
