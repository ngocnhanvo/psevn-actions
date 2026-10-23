/**
 * Check local Astro/TS imports against the actual PSE source checkout.
 * No building, publishing, network, CMS mutation, FTP or package installation.
 * Fast regression for missing modules excluded by component-only dev QA.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('source'),src=path.join(root,'src');
const sourceExts=new Set(['.astro','.ts','.tsx','.js','.jsx','.mjs','.cjs','.css','.scss']);
const moduleExtensions=['','.ts','.tsx','.astro','.js','.jsx','.mjs','.cjs','.json','.css','.scss','.svg','.png','.webp','.jpg','.jpeg','.md','.mdx','.yaml','.yml'];
const all=[];
async function crawl(dir){
  const entries=await readdir(dir,{withFileTypes:true});
  for(const e of entries){
    if(e.isDirectory()){
      if(!['node_modules','.cache','.astro','dist','.git'].includes(e.name))await crawl(path.join(dir,e.name));
    }else if(e.isFile()&&sourceExts.has(path.extname(e.name)))all.push(path.join(dir,e.name));
  }
}
await crawl(src);

async function actualFile(target){
  for(const suffix of moduleExtensions){
    const filename=target+suffix;
    try{if((await stat(filename)).isFile())return filename}catch{}
  }
  for(const suffix of moduleExtensions.slice(1)){
    const filename=path.join(target,'index'+suffix);
    try{if((await stat(filename)).isFile())return filename}catch{}
  }
  return null;
}
const missing=[],dependencies=new Map();
for(const filename of all){
  const raw=await readFile(filename,'utf8');
  // Includes regular, side-effect, type-only and dynamic imports.
  const pattern=/(?:\b(?:import|export)\s+(?:[\s\S]{0,350}?\s+from\s*)?|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;
  const found=new Set(),resolved=[];
  for(const match of raw.matchAll(pattern)){
    const spec=match[1]?.split(/[?#]/)[0]||'';
    if(!(spec.startsWith('@/')||spec.startsWith('./')||spec.startsWith('../')))continue;
    if(found.has(spec))continue;
    found.add(spec);
    const target=spec.startsWith('@/')?path.resolve(src,spec.slice(2)):path.resolve(path.dirname(filename),spec);
    if(!target.startsWith(root+path.sep)&&target!==root){
      missing.push({source:path.relative(root,filename),specifier:spec,reason:'import_outside_checked_out_repo',file:filename});
      continue;
    }
    const hit=await actualFile(target);
    if(!hit){
      missing.push({source:path.relative(root,filename),specifier:spec,reason:'unresolved_import',file:filename});
    }else if(hit.startsWith(src+path.sep)){
      resolved.push(hit);
    }
  }
  dependencies.set(filename,resolved);
}
// Astro compiler treats files under src/pages as routes. ExtractHTML's eager
// registry adds pages and TablePress components, even if an archive page is not
// explicitly navigated to. Traverse those roots to distinguish active imports
// from orphaned React template leftovers.
const active=new Set(),queue=all.filter(p=>
  /\/src\/pages\//.test(p)||/\/src\/astro\/pages\//.test(p)||
  /\/src\/astro\/tablepress\//.test(p));
for(const seed of queue)active.add(seed);
while(queue.length){
  const file=queue.shift();
  for(const dep of dependencies.get(file)||[]){
    if(!active.has(dep)){active.add(dep);queue.push(dep)}
  }
}
const relevant=missing.filter(x=>active.has(x.file));
const inactive=missing.filter(x=>!active.has(x.file));
console.log('PSE_LOCAL_IMPORT_SCAN='+JSON.stringify({
  sourceFiles:all.length,activeAstroGraphFiles:active.size,
  unresolvedActive:relevant.length,unresolvedInactive:inactive.length
}));
for(const x of relevant)console.log('PSE_ACTIVE_IMPORT_MISSING='+JSON.stringify({source:x.source,specifier:x.specifier,reason:x.reason}));
for(const x of inactive.slice(0,35))console.log('PSE_INACTIVE_TEMPLATE_IMPORT='+JSON.stringify({source:x.source,specifier:x.specifier}));
if(relevant.length)throw Error('PSE active Astro graph has '+relevant.length+' unresolved local imports');
console.log('PSE_LOCAL_IMPORT_AUDIT=PASS; NO_BUILD=true; NO_DEPLOY=true');
