/** Read-only PSE homepage panorama diagnosis: DOM vs ESC Table vs same-origin proxies. */
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const getOrigin=name=>{
 const lines=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,'')).filter(x=>x.startsWith(name+'='));
 if(lines.length!==1)throw Error('Missing origin '+name);
 const u=new URL(lines[0].slice(name.length+1).trim().replace(/^['"]|['"]$/g,''));
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))throw Error('Unsafe origin '+name);
 return u.origin
};
const front=getOrigin('WC_URL_CLIENT'),wp=getOrigin('WC_URL');
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900}});
const page=await context.newPage();
const output={};
try{
 const res=await page.goto(front+'/trang-chu',{waitUntil:'domcontentloaded',timeout:60000});
 if(res?.status()!==200)throw Error('Public homepage unavailable '+res?.status());
 await page.locator('[data-pse-section="promise"]').waitFor({state:'attached',timeout:20000});
 output.home=await page.evaluate(()=>{
  const section=document.querySelector('[data-pse-section="promise"]');
  const img=section?.querySelector('img.pse-promise__background');
  if(!img)throw Error('Missing panorama img in promise section');
  const uri=s=>{try{const u=new URL(s,location.href);return {host:u.hostname,path:u.pathname,originIsPublic:u.origin===location.origin}}catch{return {invalid:true}}};
  const srcs=(img.getAttribute('srcset')||'').split(',').map(v=>v.trim().split(/\s+/)[0]).filter(Boolean).map(uri);
  return {path:location.pathname,h2:section?.querySelector('h2')?.textContent?.trim(),
    image:{src:uri(img.getAttribute('src')),current:uri(img.currentSrc),
      srcset:srcs,alt:img.alt,complete:img.complete,naturalWidth:img.naturalWidth},
    sectionImages:[...section.querySelectorAll('img')].map(x=>({src:uri(x.getAttribute('src')),srcset:(x.getAttribute('srcset')||'').slice(0,100)})),
    sectionHtmlHasAdmin:/admin-pse\./i.test(section.outerHTML)};
 });
 const api=await context.request.get(wp+'/wp-json/tablepress/v1/table/pse_02_vi',{timeout:40000,failOnStatusCode:false});
 output.table={http:api.status()};
 if(api.ok()){
  const t=await api.json();
  const short=x=>String(x||'').slice(0,450);
  const row=(t.items||[]).find(x=>x?.background||x?.img)||{};
  output.table={...output.table,id:t.id,rows:t.items?.length,backgroundType:typeof row.background,
    backgroundHtml:short(row.background),imgHtml:short(row.img),metaBackground:short(t.background),
    rowFields:Object.keys(row)};
 }
 const candidates=[
  '/api/files/wp-content/uploads/2026/10/pse-original-panorama-2026.jpg',
  '/api/images/1024/jpg/wp-content/uploads/2026/10/pse-original-panorama-2026.webp'
 ];
 output.proxies=[];
 for(const p of candidates){
  try{
   const r=await context.request.get(front+p,{timeout:25000,failOnStatusCode:false});
   output.proxies.push({url:p,http:r.status(),mime:String(r.headers()['content-type']||''),
    diagnostic:String(r.headers()['x-esc-image-error']||''),bytes:r.ok()?Number(r.headers()['content-length'])||null:null});
  }catch(e){output.proxies.push({url:p,error:String(e).slice(0,100)})}
 }
 await mkdir('artifacts/pse-panorama-audit',{recursive:true});
 await writeFile('artifacts/pse-panorama-audit/result.json',JSON.stringify(output,null,2)+'\n');
 console.log('PSE_PANORAMA_AUDIT='+JSON.stringify(output));
}finally{await browser.close()}
