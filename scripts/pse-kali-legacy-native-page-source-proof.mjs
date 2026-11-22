/** New exact non-www source availability evidence after successful #1678 source recovery.
 * Read only: compare 1425/1426 against pinned historical capture, no blind archive replay.
 */
import {chromium,request} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
if(process.env.GITHUB_REPOSITORY!=='ngocnhanvo/psevn-actions')throw Error('Wrong repository');
const state=JSON.parse(await readFile('docs/pse-legacy-migration-state.json','utf8'));
const archived=JSON.parse(await readFile('inputs/archive/report.json','utf8'));
const kali=JSON.parse(await readFile('inputs/kali/report.json','utf8'));
if(state.schema!=='pse-legacy-article-migration-v1'||!state.backup_verified||archived.schema!=='pse-kali-archived-article-native-wp-media-identity-v1'||!kali.ready||kali.sourceId!==1678)throw Error('Wrong pinned evidence');
const out='artifacts/pse-kali-legacy-native-page-source-proof';await mkdir(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex'),flat=s=>String(s||'').normalize('NFKC').replace(/\s+/g,' ').trim();
const wp='https://admin-pse.webnvn.com',front='https://pse.webnvn.com',origin='https://pse.vn';
const required={
 1425:{slug:'kali-phu-my-bot-canada-mo-ta-va-hdsd',files:['3__00059_-_Kali_Phu_My.png']},
 1426:{slug:'kali-phu-my-mo-ta-cac-bien-the',files:['3__00059_-_Kali_Phu_My.png','Kali-Phú-Mỹ-MOP_miểng-50-mat-truoc.png','Kali-Phú-Mỹ-Bột_trắng-50-mat-truoc.png']},
 1678:{slug:'kali-phu-my-mo-ta-va-hdsd',files:['4_KALI-MIENG_Phu_My_2019_cai_tien.png']}
};
const report={readOnly:true,noCmsWrites:true,rows:[],stop:null};
const save=()=>writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
const net=await request.newContext({timeout:35000}),b=await chromium.launch({headless:true}),ctx=await b.newContext({javaScriptEnabled:false});await ctx.route('**/*',r=>r.abort());const page=await ctx.newPage();
const get=async(url)=>{const r=await net.get(url,{maxRedirects:0,failOnStatusCode:false});if([403,429,503].includes(r.status()))throw Error('Source access/rate guard HTTP '+r.status());return r};
const fetched=new Map();
try{
 for(const id of [1678,1425,1426]){
  const prev=archived.sources.find(a=>a.id===id),exact=state.articles?.[id]?.source_url,u=new URL(exact);
  if(!prev||prev.original!==exact||u.origin!=='https://www.pse.vn'||!u.pathname.includes('/8-trang-chu/'+id+'-'))throw Error('Source manifest identity mismatch '+id);
  const src=origin+u.pathname,row={id,manifest:exact,source:src,slug:required[id].slug,sourceHttp:null,ready:false,images:[]};
  report.rows.push(row);
  try{
   const r=await get(src);row.sourceHttp=r.status();
   if(r.status()!==200){await save();console.log('PSE_KALI_LEGACY_SOURCE_ROW='+JSON.stringify(row));continue}
   const raw=await r.text();if(raw.length>8000000)throw Error('Source too large');
   await page.setContent('<base href="'+src+'">'+raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{waitUntil:'domcontentloaded'});
   const d=await page.evaluate(()=>{
    const n=s=>String(s||'').normalize('NFKC').replace(/\s+/g,' ').trim(),root=document.querySelector('.item-page [itemprop=articleBody]');
    if(!root)throw Error('Source article body missing');
    const full=n(root.textContent);const clone=root.cloneNode(true);clone.querySelectorAll('.extranews_box,.extranews_separator').forEach(x=>x.remove());
    return {title:n(document.querySelector('.item-page h1,.item-page h2,h1')?.textContent||document.title),body:n(clone.textContent),full,html:root.innerHTML,images:[...clone.querySelectorAll('img[src]')].map(x=>{const u=new URL(x.getAttribute('src'),document.baseURI);return {url:u.href,file:decodeURIComponent(u.pathname.split('/').at(-1))}}),tables:[...root.querySelectorAll('table')].map(t=>[...t.rows].map(r=>[...r.cells].map(c=>n(c.textContent)))),links:[...root.querySelectorAll('a[href]')].map(a=>({href:a.getAttribute('href'),url:a.href,text:n(a.textContent)}))};
   });
   row.title=d.title;row.bodySha=sha(d.body);row.fullBodySha=sha(d.full);row.archivedBodyMatch=sha(d.body).slice(0,16)===prev.bodySha256;
   row.titleMatch=flat(d.title)===flat(prev.title);
   const files=required[id].files;
   if(!row.archivedBodyMatch||!row.titleMatch||JSON.stringify(d.images.map(x=>x.file))!==JSON.stringify(files)){row.reason='Archived original title/body/image inventory mismatch';await save();console.log('PSE_KALI_LEGACY_SOURCE_ROW='+JSON.stringify(row));continue}
   await writeFile(out+'/source-'+id+'.json',JSON.stringify(d,null,2)+'\n');
   for(const img of d.images){
    const iu=new URL(img.url);
    if(!['pse.vn','www.pse.vn'].includes(iu.hostname)||!iu.pathname.startsWith('/images/')||!iu.pathname.endsWith('.png')||iu.search||iu.hash)throw Error('Unexpected source image path');
    const direct=origin+iu.pathname;
    const rec={file:img.file,url:direct};row.images.push(rec);
    if(id===1678&&direct===kali.sourceImage.url){Object.assign(rec,{http:200,sha256:kali.sourceImage.sha256,bytes:kali.sourceImage.bytes,pinnedOriginal:true});continue}
    if(fetched.has(direct)){Object.assign(rec,fetched.get(direct));continue}
    const ir=await get(direct);rec.http=ir.status();
    if(ir.status()!==200)continue;
    const bytes=await ir.body();
    if(bytes.length<180||bytes.length>12000000||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Invalid source PNG '+img.file);
    const hash=sha(bytes),file='original-'+hash.slice(0,16)+'.png';
    const decoded=await page.evaluate(async data=>{const im=new Image();im.src='data:image/png;base64,'+data;await im.decode();return {width:im.naturalWidth,height:im.naturalHeight}},bytes.toString('base64'));
    if(!decoded.width||!decoded.height)throw Error('Source PNG decode failed');
    const result={http:200,sha256:hash,bytes:bytes.length,fileArtifact:file,...decoded};await writeFile(out+'/'+file,bytes);fetched.set(direct,result);Object.assign(rec,result);
   }
   if(id===1678){
    row.sameAsRestoredPage=flat(d.full)===flat(kali.original.text)&&d.images.length===1&&row.images[0]?.sha256===kali.sourceImage.sha256;
    row.sameContextPath=new URL(kali.source).pathname===u.pathname;
    row.ready=row.sameAsRestoredPage;
   }else{
    const slug=row.slug,queries=['pages','posts','product'];
    const responses=await Promise.all(queries.map(t=>net.get(wp+'/wp-json/wp/v2/'+t+'?slug='+slug+'&_fields=id,slug,status')));
    const results=await Promise.all(responses.map(r=>r.json()));
    if(responses.some(r=>r.status()!==200)||results.some(a=>!Array.isArray(a)))throw Error('Native route inventory inaccessible');
    const live=await net.get(front+'/'+slug,{maxRedirects:0,failOnStatusCode:false});
    row.route={pages:results[0],posts:results[1],products:results[2],publicHTTP:live.status()};
    row.ready=row.images.length===files.length&&row.images.every(x=>x.sha256)&&results.every(x=>x.length===0)&&live.status()===404;
   }
   await save();console.log('PSE_KALI_LEGACY_SOURCE_ROW='+JSON.stringify(row));
  }catch(e){row.reason=String(e).slice(0,400);report.stop=row.reason;await save();console.log('PSE_KALI_LEGACY_SOURCE_STOP='+row.reason);break}
 }
}finally{await save();await b.close();await net.dispose()}
