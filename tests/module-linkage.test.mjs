import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
// Link, but never evaluate: app.js cannot access DOM, localStorage or IndexedDB.
const script=`
import vm from 'node:vm';
import fs from 'node:fs/promises';
const context=vm.createContext({});const cache=new Map();
async function moduleAt(url){
 if(cache.has(url.href))return cache.get(url.href);
 let source=await fs.readFile(url,'utf8');
 if(process.env.BREAK_STORAGE==='1' && url.pathname.endsWith('/storage.js'))source=source.replace('export function validateData(', 'function validateData(');
 const module=new vm.SourceTextModule(source,{context,identifier:url.href});cache.set(url.href,module);return module;
}
const app=await moduleAt(new URL('./js/bootstrap.js', 'file://'+process.cwd()+'/'));
await app.link((specifier,parent)=>moduleAt(new URL(specifier,parent.identifier)));
const privateApp=await moduleAt(new URL('./js/app.js','file://'+process.cwd()+'/'));await privateApp.link((specifier,parent)=>moduleAt(new URL(specifier,parent.identifier)));console.log('Linked '+cache.size+' modules');
`;
function link(broken){return spawnSync(process.execPath,['--experimental-vm-modules','--input-type=module','-e',script],{cwd:root,encoding:'utf8',env:{...process.env,BREAK_STORAGE:broken?'1':'0'}});}
test('complete application ES module graph links without evaluating user storage',()=>{const result=link(false);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/Linked \d+ modules/);});
test('regression checker rejects missing validateData export',()=>{const result=link(true);assert.notEqual(result.status,0);assert.match(result.stderr,/does not provide an export named 'validateData'/);});

test('HTML entry and every local module dependency use the same cache version',()=>{
 const version='?v=stage9.3.3';
 assert.ok(readFileSync(root+'index.html','utf8').includes('src="./js/bootstrap.js'+version+'"'));
 for(const name of readdirSync(root+'js').filter(x=>x.endsWith('.js'))){
  const source=readFileSync(root+'js/'+name,'utf8');
  for(const match of source.matchAll(/from\s+['"](\.\/[^'"]+)['"]/g))assert.ok(match[1].endsWith(version),name+': '+match[1]);
 }
});
