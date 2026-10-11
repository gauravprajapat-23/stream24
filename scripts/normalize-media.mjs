import { normalizeMedia } from '../apps/agent/media.mjs';
const input=process.argv.slice(2).join(' ').trim();
if(!input){console.error('Usage: npm run normalize -- "D:\\path\\video.mp4"');process.exit(1);}
console.log(`Normalizing: ${input}`);
try{const output=await normalizeMedia(input,{onLog:line=>{if(line)console.log(line)}});console.log(`Ready for Stream24 copy mode: ${output}`);}catch(err){console.error(err.message);process.exit(1);}
