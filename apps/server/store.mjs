import fs from 'node:fs';
import path from 'node:path';
export const EMPTY_DB={users:[],sessions:[],devices:[],streams:[],commands:[],events:[],logs:[],media:[],templates:[],youtubeConnections:[],youtubeOauthStates:[],mediaCatalog:[],replicationJobs:[],retentionPolicies:[],billingOrders:[],billingSubscriptions:[],billingPayments:[],entitlements:[],processedWebhookEvents:[]};
export class JsonStore{
  constructor(filePath){this.filePath=filePath;this.data=structuredClone(EMPTY_DB);this.load();}
  load(){fs.mkdirSync(path.dirname(this.filePath),{recursive:true});if(!fs.existsSync(this.filePath)){this.persist();return;}const raw=fs.readFileSync(this.filePath,'utf8').trim();if(!raw)return;const p=JSON.parse(raw);this.data={};for(const key of Object.keys(EMPTY_DB))this.data[key]=Array.isArray(p[key])?p[key]:[];}
  persist(){const tmp=`${this.filePath}.tmp`;fs.writeFileSync(tmp,JSON.stringify(this.data,null,2));fs.renameSync(tmp,this.filePath);}
  update(mutator){const r=mutator(this.data);this.persist();return r;}
}
