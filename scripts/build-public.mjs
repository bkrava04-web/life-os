import fs from 'node:fs/promises';
import {validateCloudConfig} from '../js/cloud-foundation.js';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
export const ROOT=fileURLToPath(new URL('../',import.meta.url));
const modules=['bootstrap','access-controller','cloud-foundation','cloud-foundation-ui','supabase-config','achievements','ai-intent','ai-manager','app','body-photos','body-ui','body','calendar','copilot','full-backup-ui','full-backup','markdown','organization-ui','organization','pwa','runtime-config','schedule','sports-actions','sports-adaptation-ui','sports-adaptation','sports-feedback','sports-lifecycle','sports-planner','sports-ui','sports','storage','task-editor','task-manager','tasks'];
export const FILES=['index.html','css/style.css','manifest.webmanifest','assets/workout-program.schema.json',...['icon-192','icon-512','icon-maskable','apple-touch-icon'].map(x=>`assets/icons/${x}.png`),...modules.map(x=>`js/${x}.js`)];
export async function audit(directory){
 const expected=new Set([...FILES,'sw.js','.nojekyll']);const files=[];
 async function walk(folder){for(const item of await fs.readdir(folder,{withFileTypes:true})){const full=path.join(folder,item.name);if(item.isSymbolicLink())throw Error('Symlink forbidden');if(item.isDirectory())await walk(full);else files.push(path.relative(directory,full));}}await walk(directory);
 for(const file of files){if(!expected.has(file))throw Error('Forbidden public file: '+file);if(!file.endsWith('.png')){
  const text=await fs.readFile(path.join(directory,file),'utf8');
  if(/(?:sb_secret_[A-Za-z0-9_-]{8,}|(?:ghp_|github_pat_)[A-Za-z0-9_]{12,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|Bearer\s+[A-Za-z0-9._-]{16,}|(?:api[_-]?key|password|token|secret|service_role)['"]?\s*[=:]\s*['"][A-Za-z0-9_./+-]{16,}['"])/i.test(text))throw Error('Possible credential: '+file);
  if(/eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/.test(text))throw Error('Possible JWT: '+file);
  if(/ai-proxy\.local\.json|192\.168\.\d+\.\d+|https?:\/\/127\.0\.0\.1|https?:\/\/localhost/i.test(text))throw Error('Private config/address: '+file);
 }}
 for(const file of expected)if(!files.includes(file))throw Error('Missing public file: '+file);
 if(!(await fs.readFile(path.join(directory,'js/runtime-config.js'),'utf8')).includes('PUBLIC_BUILD = true'))throw Error('AI public guard missing');return files.sort();
}
export async function readPublicConfiguration(configPath) {
 let value;
 if(configPath === undefined && (process.env.SUPABASE_URL !== undefined || process.env.SUPABASE_PUBLISHABLE_KEY !== undefined)){
  value={enabled:true,url:process.env.SUPABASE_URL,publishableKey:process.env.SUPABASE_PUBLISHABLE_KEY};
  if(!value.url || !value.publishableKey)throw Error('Both public Supabase parameters are required');
 }
 configPath ??= path.join(ROOT,'supabase.public.local.json');try{if(!value)value=JSON.parse(await fs.readFile(configPath,'utf8'));}catch(failure){if(failure.code==='ENOENT')return {enabled:false,url:'https://bbshunblrtroepmwnshy.supabase.co',publishableKey:''};throw Error('Invalid public Supabase configuration');}
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='enabled,publishableKey,url'||typeof value.enabled!=='boolean')throw Error('Invalid public Supabase configuration');
 const checked=validateCloudConfig(value);return checked?{enabled:true,url:checked.url,publishableKey:checked.key}:{enabled:false,url:'https://bbshunblrtroepmwnshy.supabase.co',publishableKey:''};
}
export async function build(directory=path.join(ROOT,'dist'),{configPath}={}){
 // Read only the explicit static allowlist; never walk private project directories.
 const publicConfig=await readPublicConfiguration(configPath);
 const staged=new Map();for(const file of FILES){const src=path.join(ROOT,file);if((await fs.lstat(src)).isSymbolicLink())throw Error('Source symlink forbidden');let bytes=await fs.readFile(src);if(file==='js/schedule.js')bytes=Buffer.from(bytes.toString().replace(/DEFAULT_CYCLE_START = '\d{4}-\d{2}-\d{2}'/,"DEFAULT_CYCLE_START = '2000-01-01'"));if(file==='js/runtime-config.js')bytes=Buffer.from(bytes.toString().replace('PUBLIC_BUILD = false','PUBLIC_BUILD = true'));if(file==='js/supabase-config.js')bytes=Buffer.from('export const SUPABASE_CONFIG=Object.freeze('+JSON.stringify(publicConfig)+');\nexport async function loadSupabaseConfig(){return SUPABASE_CONFIG;}\n');staged.set(file,bytes);}
 const hash=crypto.createHash('sha256');for(const [name,bytes] of staged){hash.update(name);hash.update(bytes);}const version=hash.digest('hex').slice(0,16);
 const resources=FILES.map(x=>'./'+x+(x.endsWith('.js')?'?v=stage9.3.3':''));
 const worker=`// Generated static allowlist. No API, authentication or personal data caching.\nconst BASE=self.registration.scope;\nconst PREFIX='life-os-shell-'+encodeURIComponent(new URL(BASE).pathname)+'-';\nconst CACHE=PREFIX+'${version}';\nconst FILES=${JSON.stringify(resources)};\nconst ALLOWED=new Set(FILES.map(x=>new URL(x,BASE).href));\nself.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES.map(x=>new Request(new URL(x,BASE),{cache:'reload'}))))));\nself.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));\nself.addEventListener('fetch',event=>{const request=event.request;if(request.method!=='GET')return;const url=new URL(request.url);if(url.origin!==new URL(BASE).origin||!url.href.startsWith(BASE))return;if(request.mode==='navigate'&&(url.pathname===new URL(BASE).pathname||url.pathname===new URL('index.html',BASE).pathname)){event.respondWith(caches.open(CACHE).then(cache=>cache.match(new URL('index.html',BASE))).then(result=>result||fetch(request)));return;}if(!ALLOWED.has(url.href))return;event.respondWith(caches.open(CACHE).then(cache=>cache.match(request)).then(result=>result||fetch(request)));});\n`;
 // No skipWaiting: an installed update waits until all old tabs close.
 staged.set('sw.js',Buffer.from(worker));staged.set('.nojekyll',Buffer.alloc(0));
 const temporary=directory+'.building';await fs.rm(temporary,{recursive:true,force:true});for(const [file,bytes] of staged){await fs.mkdir(path.dirname(path.join(temporary,file)),{recursive:true});await fs.writeFile(path.join(temporary,file),bytes);}await audit(temporary);await fs.rm(directory,{recursive:true,force:true});await fs.rename(temporary,directory);return {version,files:staged.size};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){if(process.argv.includes('--require-auth')){const source=await fs.readFile(path.join(ROOT,'dist/js/supabase-config.js'),'utf8');if(!source.includes('\"enabled\":true'))throw Error('Publication requires configured Supabase Auth');}if(process.argv.includes('--check'))console.log('Public static audit passed:',(await audit(path.join(ROOT,'dist'))).length,'files');else{const result=await build();console.log('Public static build verified:',result.files,'files; version',result.version);}}
