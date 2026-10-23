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
async function present(target){
  for(const suffix of moduleExtensions){
    const filename=target+suffix;
    try{if((await stat(filename)).isFile())return true}catch{}
  }
  for(const suffix of moduleExtensions.slice(1)){
    try{if((await stat(path.join(target,'index'+suffix))).isFile())return true}catch{}
  }
  return false;
}
const issues=[],perFile=[];
for(const filename of all){
  const raw=await readFile(filename,'utf8');
  // Include multiline import/export declarations, dynamic import("x"),
  // side-effect import, and CommonJS require. Only check local specifiers.
  const pattern=/(?:\b(?:import|export)\s+(?:[\s\S]{0,350}?\s+from\s*)?|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;
  const found=new Set();
  for(const match of raw.matchAll(pattern)){
    const value=match[1]?.split(/[?#]/)[0]||'';
    if(!(value.startsWith('@/')||value.startsWith('./')||value.startsWith('../')))continue;
    // Work only inside app source, never resolve package names or remote URLs.
    const target=value.startsWith('@/')?path.resolve(src,value.slice(2)):path.resolve(path.dirname(filename),value);
    if(!target.startsWith(src+path.sep)&&target!==src){
      issues.push({source:path.relative(root,filename),specifier:value,reason:'local_path_outside_src'});
      continue;
    }
    if(found.has(value))continue;
    found.add(value);
    if(!await present(target)){
      issues.push({source:path.relative(root,filename),specifier:value,reason:'local_import_unresolved'});
    }
  }
  if(found.size)perFile.push([path.relative(root,filename),found.size]);
}
console.log('PSE_LOCAL_IMPORT_SCAN='+JSON.stringify({files:all.length,filesWithLocalImports:perFile.length,unresolved:issues.length}));
for(const error of issues.slice(0,100))console.log('PSE_IMPORT_MISSING='+JSON.stringify(error));
if(issues.length)throw Error('PSE local source imports unresolved: '+issues.length);
console.log('PSE_LOCAL_IMPORT_AUDIT=PASS; NO_BUILD=true; NO_DEPLOY=true');
