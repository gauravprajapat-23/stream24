import crypto from 'node:crypto';
const MAGIC='STREAM24_BACKUP_V1';
export function createEncryptedBackup(data,key,{version='unknown'}={}){
  if(!key)throw new Error('APP_MASTER_KEY is required.');
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const payload=Buffer.from(JSON.stringify({magic:MAGIC,version,createdAt:new Date().toISOString(),data}),'utf8');
  const encrypted=Buffer.concat([cipher.update(payload),cipher.final()]),tag=cipher.getAuthTag();
  return {format:MAGIC,algorithm:'AES-256-GCM',iv:iv.toString('base64url'),tag:tag.toString('base64url'),data:encrypted.toString('base64url')};
}
export function openEncryptedBackup(bundle,key){
  if(!bundle||bundle.format!==MAGIC)throw new Error('Unsupported Stream24 backup format.');
  if(!key)throw new Error('APP_MASTER_KEY is required.');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(bundle.iv,'base64url'));
  decipher.setAuthTag(Buffer.from(bundle.tag,'base64url'));
  let plain;try{plain=Buffer.concat([decipher.update(Buffer.from(bundle.data,'base64url')),decipher.final()]);}catch{throw new Error('Backup cannot be decrypted. APP_MASTER_KEY may be wrong or the backup is corrupted.');}
  const parsed=JSON.parse(plain.toString('utf8'));if(parsed.magic!==MAGIC||!parsed.data)throw new Error('Invalid Stream24 backup payload.');return parsed;
}
export function sanitizeRestoredDb(data,knownKeys){
  const out={};for(const key of knownKeys)out[key]=Array.isArray(data?.[key])?data[key]:[];return out;
}
