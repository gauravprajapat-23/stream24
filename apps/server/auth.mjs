import crypto from 'node:crypto';

const SCRYPT_N=16384, SCRYPT_R=8, SCRYPT_P=1, KEYLEN=64;
export function normalizeEmail(value=''){return String(value).trim().toLowerCase();}
export function hashPassword(password){
  const value=String(password||'');if(value.length<8)throw Object.assign(new Error('Password must be at least 8 characters.'),{statusCode:400});
  const salt=crypto.randomBytes(16).toString('hex');
  const key=crypto.scryptSync(value,salt,KEYLEN,{N:SCRYPT_N,r:SCRYPT_R,p:SCRYPT_P,maxmem:64*1024*1024});
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${key.toString('hex')}`;
}
export function verifyPassword(password,encoded=''){
  try{const [kind,n,r,p,salt,hex]=String(encoded).split('$');if(kind!=='scrypt')return false;const expected=Buffer.from(hex,'hex');const actual=crypto.scryptSync(String(password||''),salt,expected.length,{N:Number(n),r:Number(r),p:Number(p),maxmem:64*1024*1024});return expected.length===actual.length&&crypto.timingSafeEqual(expected,actual);}catch{return false;}
}
export function createSessionToken(){return crypto.randomBytes(32).toString('base64url');}
export function tokenHash(token){return crypto.createHash('sha256').update(String(token)).digest('hex');}
export function parseCookies(header=''){const out={};for(const chunk of String(header).split(';')){const i=chunk.indexOf('=');if(i<1)continue;const k=chunk.slice(0,i).trim(),v=chunk.slice(i+1).trim();try{out[k]=decodeURIComponent(v);}catch{out[k]=v;}}return out;}
export function sessionCookie(token,{maxAge=60*60*24*30,secure=false}={}){return `stream24_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure?'; Secure':''}`;}
export function clearSessionCookie(){return 'stream24_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0';}
