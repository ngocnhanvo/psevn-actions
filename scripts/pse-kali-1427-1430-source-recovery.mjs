/** Scope: exact historical article IDs 1427 and 1430 referenced by pinned 1426. No CMS writes. */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium,request} from 'playwright';
if(process.env.GITHUB_REPOSITORY!=='ngocnhanvo/psevn-actions')throw Error('Wrong repo');
const src='https://pse.vn',front='https://pse.webnvn.com',wp='https://admin-pse.webnvn.com',out='artifacts/pse-kali-1427-1430-source',sha=x=>createHash('sha256').update(x).digest('hex');
const manifest=JSON.parse(await readFile('docs/pse-legacy-migration-state.json','utf8')),d=JSON.parse(await readFile('inputs/source/source-1426.json','utf8')),proof=JSON.parse(await readFile('inputs/source/report.json','utf8')),parent=proof.rows.find(x=>x.id===1426);
if(!proof.readOnly||sha(d.full)!==parent?.fullBodySha||manifest.schema!=='pse-legacy-article-migration-v1')throw Error('Source proof mismatch');
await mkdir(out,{recursive:true});const report={readOnly:true,noCmsWrites:true,rows:[],otherLinks:[]};const save=()=>writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
const net=await request.newContext({timeout:30000}),b=await chromium.launch({headless:true}),ctx=await b.newContext({javaScriptEnabled:false});await ctx.route('**/*',r=>r.abort());const p=await ctx.newPage();
const get=async url=>{const r=await net.get(url,{maxRedirects:0,failOnStatusCode:false});if([403,429,503].includes(r.status()))throw Error('Access/rate guard '+r.status());return r};
try{
 const anchors=await p.evaluate(({html,source})=>{const root=document.createElement('div');root.innerHTML=html;return [...root.querySelectorAll('a[href]')].map(a=>({href:a.getAttribute('href'),images:[...a.querySelectorAll('img[src]')].map(i=>new URL(i.getAttribute('src'),source).pathname)}))},{html:d.html,source:parent.source});
 for(const id of [1427,1430]){
  const query='/hoat-dong-kinh-doanh/san-pham/kali-phu-my.html?id='+id,a=anchors.filter(x=>x.href===query),s=manifest.articles?.[id],expected=parent.images[id===1427?1:2];
  const row={id,query,anchors:a,manifestSource:s?.source_url??null,manifestStatus:s?.status??null,expectedImage:expected?.url,expectedSHA:expected?.sha256,probes:[],ready:false};report.rows.push(row);
  console.log('PSE_KALI_VARIANT_INVENTORY='+JSON.stringify(row));
  if(a.length!==1||a[0].images.length!==1||a[0].images[0]!==new URL(expected.url).pathname){row.reason='Anchor/image association mismatch';await save();continue}
  const paths=[];
  if(s?.source_url){const u=new URL(s.source_url);if(['pse.vn','www.pse.vn'].includes(u.hostname)&&u.pathname.includes('/'+id+'-')&&!u.search&&!u.hash)paths.push(u.pathname)}
  // Joomla core article identity endpoint is derived from explicit source anchor ID, not a guessed slug.
  paths.push('/index.php?option=com_content&view=article&id='+id);
  for(const path of [...new Set(paths)]){
   const r=await get(src+path),entry={path,http:r.status(),location:r.headers().location??null};row.probes.push(entry);
   let actual=r,base=src+path;
   if([301,302,303,307,308].includes(r.status())&&entry.location){const u=new URL(entry.location,src);if(!['pse.vn','www.pse.vn'].includes(u.hostname)||u.username||u.password||!u.pathname.includes('/'+id+'-'))continue;base=src+u.pathname;actual=await get(base);entry.targetHTTP=actual.status()}
   if(actual.status()!==200)continue;
   await p.setContent('<base href="'+base+'">'+(await actual.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{waitUntil:'domcontentloaded'});
   const c=await p.evaluate(()=>{const n=x=>String(x||'').normalize('NFKC').replace(/\s+/g,' ').trim(),root=document.querySelector('.item-page [itemprop=articleBody]');if(!root)return null;const core=root.cloneNode(true);core.querySelectorAll('.extranews_box,.extranews_separator').forEach(x=>x.remove());return {title:n(document.querySelector('.item-page h1,.item-page h2,h1')?.textContent),body:n(core.textContent),full:n(root.textContent),html:root.innerHTML,images:[...core.querySelectorAll('img[src]')].map(i=>new URL(i.getAttribute('src'),document.baseURI).pathname),tables:[...root.querySelectorAll('table')].map(t=>[...t.rows].map(r=>[...r.cells].map(x=>n(x.textContent)))),links:[...root.querySelectorAll('a[href]')].map(x=>({href:x.getAttribute('href'),url:x.href,text:n(x.textContent)})),canonical:document.querySelector('link[rel=canonical]')?.href??null}});
   if(!c){entry.reason='No article body';continue}
   entry.title=c.title;entry.bodySha=sha(c.body);entry.fullSha=sha(c.full);entry.images=c.images;entry.canonical=c.canonical;
   // Explicit core article ID 1430 returned original Bột MOP article; its
   // historical detail image is different from the newer overview packaging.
   const exact1430=id===1430&&path==='/index.php?option=com_content&view=article&id=1430'&&c.title==='Kali Phú Mỹ Bột MOP - Mô tả và HDSD'&&entry.bodySha==='cec036796daec93cad3ab8c7a19d7912f2a166bf4038f57ff1cdd5ce3cfb9417'&&entry.fullSha==='8910af2001ab1c69de8ff62adebd049981c1f86a164b538c60d6de75fd15ceb7'&&c.images.length===1&&decodeURIComponent(c.images[0].split('/').at(-1))==='5-KALI-BOT_Phu_My_2019_cai_tien.png';
   const exact1427=id===1427&&c.title==='Kali Phú Mỹ Miểng MOP - Mô tả và HDSD'&&entry.bodySha==='142705cfe65f997ec5f1ad9aaf1cda5a13a4e2a64087d473ec8a2a959dfb7cc0'&&entry.fullSha==='f50b5fcbaed629bc03fbd6725df5b2207f0d4b64b002986fba01d07374e5fb35'&&c.images.length===1&&c.images[0]===a[0].images[0];
   if(!exact1427&&!exact1430){entry.reason='Pinned exact article identity mismatch';continue}
   const ir=await get(src+a[0].images[0]);if(ir.status()!==200||sha(await ir.body())!==expected.sha256){entry.reason='Overview exact PNG mismatch';continue}
   row.detailImages=[];
   for(const image of c.images){
    if(!image.startsWith('/images/')||!image.endsWith('.png'))throw Error('Unexpected original detail path');
    const rr=await get(src+image);if(rr.status()!==200)throw Error('Detail PNG unavailable '+id);
    const bytes=await rr.body(),hash=sha(bytes);
    if(bytes.length<180||bytes.length>12000000||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Invalid PNG');
    if(id===1427&&hash!==expected.sha256)throw Error('1427 image identity changed');
    const dims=await p.evaluate(async data=>{const im=new Image();im.src='data:image/png;base64,'+data;await im.decode();return {width:im.naturalWidth,height:im.naturalHeight}},bytes.toString('base64'));
    if(!dims.width||!dims.height)throw Error('PNG decode failed');
    const fileArtifact='original-'+hash.slice(0,16)+'.png';await writeFile(out+'/'+fileArtifact,bytes);
    row.detailImages.push({url:src+image,file:decodeURIComponent(image.split('/').at(-1)),sha256:hash,bytes:bytes.length,fileArtifact,...dims});
   }
   row.identityRule=exact1430?'EXACT_EXPLICIT_JOOMLA_CORE_ARTICLE_ID_AND_PINNED_TITLE_BODY':'EXACT_MANIFEST_ARTICLE_AND_ANCHOR';
   row.overviewImageDiffers=row.detailImages[0].sha256!==expected.sha256;
   row.source=base;row.title=c.title;row.bodySha=entry.bodySha;row.fullBodySha=entry.fullSha;row.images=c.images;row.links=c.links;row.tables=c.tables.length;row.ready=true;
   await writeFile(out+'/source-'+id+'.json',JSON.stringify(c,null,2)+'\n');break;
  }
  console.log('PSE_KALI_VARIANT_SOURCE='+JSON.stringify(row));await save();
 }
 for(const l of d.links.filter(x=>!new URL(x.url).search)){
  const u=new URL(l.url);if(u.origin!==src)continue;const r=await get(front+u.pathname),s=await get(src+u.pathname);const row={href:l.href,text:l.text,sourceHTTP:s.status(),nativeHTTP:r.status(),location:r.headers().location||null};report.otherLinks.push(row);console.log('PSE_KALI_OTHER_LINK='+JSON.stringify(row));await save();
 }
}finally{await save();await b.close();await net.dispose()}
