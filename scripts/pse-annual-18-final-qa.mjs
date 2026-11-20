/** Read-only final annual source / WordPress / Astro / mobile acceptance.
 * Compare all original Joomla IDs and title metadata to CMS, validate local
 * booklet image routes, and explicitly label the HNX 2014 alternative.
 */
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const original=JSON.parse(await readFile('artifacts/pse-annual-parity-proof/report.json','utf8'));
const state=JSON.parse(await readFile('docs/pse-legacy-migration-state.json','utf8'));
if(original.schema!=='pse-annual-parity-v1'||original.sourceCount!==18||
 original.sourceArchiveIds===0||state.schema!=='pse-legacy-article-migration-v1'||
 !state.backup_verified||original.cmsCategory?.id!==1758)
 throw Error('Missing independent source evidence/verified rollback');
const ids=original.original.flatMap(x=>x.ids||[]);
if(ids.length!==18||new Set(ids).size!==18)throw Error('Joomla original list changed');
const wp='https://admin-pse.webnvn.com',front='https://pse.webnvn.com';
const browser=await chromium.launch({headless:true});
const report={schema:'pse-annual-final-source-parity-v1',original:18,wordpress:null,sourceRanks:[],
 yoastTitlesChecked:0,metaDescriptionsInvented:[],postIds:[],sourceImageCounts:{},brokenImages:[],
 localPdfChecked:[],hotlinks:[],legacy2014:{status:'UNVERIFIED'},archive:{},mobile:{},
 errors:[],status:'UNVERIFIED'};
const check=(b,m)=>{if(!b)throw Error(m)};
const ctx=await browser.newContext({viewport:{width:1366,height:850}});
try{
 const url=wp+'/wp-json/wp/v2/posts?categories=1758&per_page=100&page=1&_fields=id,slug,title,status,date,content,pse_seo_title,pse_seo_description,acf,categories';
 const response=await ctx.request.get(url,{timeout:90000,failOnStatusCode:false});
 check(response.status()===200,'WordPress category public REST HTTP '+response.status());
 check(Number(response.headers()['x-wp-total'])===18,'Category 18 source articles not yet published');
 const posts=await response.json();
 check(posts.length===18,'WordPress annual records count mismatch');
 report.wordpress=18;
 for(let i=0;i<ids.length;i++){
  const id=ids[i],stateRow=state.articles[id],proof=original.cms.find(x=>x.id===id),post=posts[i];
  check(proof?.source?.title?.endsWith(' - PSE.VN'),'Original Joomla SEO title absent '+id);
  check(stateRow?.source_url?.includes('/bao-cao-thuong-nien/'+id+'-'),'Original Joomla URL provenance missing '+id);
  check(Number.isSafeInteger(stateRow.wp_id),'Original source not migrated '+id);
  const slug=stateRow.source_url.match(/\/\d+-([^/]+)\.html$/)?.[1];
  check(post.id===stateRow.wp_id&&post.slug===slug&&post.status==='publish'&&
   post.categories?.includes(1758),'Incorrect original rank, ID or taxonomy '+id);
  report.sourceRanks.push(id);
  report.postIds.push(post.id);
  check(post.pse_seo_title===proof.source.title,'Yoast source title differs from Joomla '+id);
  report.yoastTitlesChecked++;
  const html=String(post.content?.rendered||''),links=[...html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)].map(m=>m[1].replaceAll('&amp;','&'));
  const hotlinks=links.filter(s=>/https?:\/\/(?:www\.)?pse\.vn/i.test(s));
  if(hotlinks.length)report.hotlinks.push({source:id,urls:hotlinks});
  check(!/getkredit|nunax|sigProId|vtembooklet|free-minigames|embedded image gallery/i.test(html),'Original Joomla injected plugin markup remains '+id);
  if(id==='998'||id==='1000'){
   const wanted=id==='998'?94:130;
   const images=[...html.matchAll(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]);
   check(images.length===wanted,'Original booklet missing pages '+id+' '+images.length);
   check(images.every(x=>x.startsWith('/api/files/wp-content/uploads/')),'Booklet linked outside native Astro proxy '+id);
   report.sourceImageCounts[id]=images.length;
   const sp=original.cms.find(x=>x.id===id);
   for(const k of [0,Math.floor(images.length/2),images.length-1]){
    const u=front+images[k],r=await ctx.request.get(u,{timeout:60000,failOnStatusCode:false});
    const first=(await r.body()).subarray(0,3).toString('hex');
    check(r.status()===200&&first==='ffd8ff','Source booklet JPG missing/unreadable '+id+' page '+(k+1));
   }
  }
  if(id==='1092'){
   const original2014=stateRow.verified_alternative_attachment;
   check(original2014?.provenance==='HNX via CafeF'&&
      original2014.note?.includes('Original Joomla link HTTP404')&&
      /^[a-f0-9]{64}$/.test(original2014.sha256),'2014 HNX mirror source evidence missing');
   const pdfs=links.filter(s=>/\.pdf(?:[?#]|$)/i.test(s));
   check(pdfs.length===1&&pdfs[0].startsWith('/api/files/wp-content/uploads/'),
      '2014 official alternate PDF must be locally hosted');
   check(html.includes('HNX')&&html.includes('CafeF')&&html.includes('trùng byte'),
      '2014 document provenance or original 404 warning absent');
   const r=await ctx.request.get(front+pdfs[0],{timeout:100000,failOnStatusCode:false});
   const buf=await r.body();
   check(r.status()===200&&buf.subarray(0,5).toString('latin1')==='%PDF-',
      '2014 local PDF missing or not PDF');
   report.localPdfChecked.push({source:id,bytes:buf.length,local:pdfs[0]});
   report.legacy2014={status:'HNX_CAFEF_PROVENANCE_PRESERVED',originalUrlHttp:404,
      substituteByteIdenticalToOriginal:'NOT_ASSERTED',sourceId:id,wpId:post.id};
  }
  if((id==='998'||id==='1000'||id==='1092')&&post.pse_seo_description&&
      !proof.source.metaDescription)report.metaDescriptionsInvented.push(id);
 }
 check(report.hotlinks.length===0,'Existing WordPress report links still reference old Joomla');
 check(report.metaDescriptionsInvented.length===0,'Newly restored post has invented source SEO meta description');
 for(const viewport of [{name:'desktop',width:1366,height:768},{name:'mobile',width:390,height:844}]){
  const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height}});
  const page=await context.newPage();
  const pages=[];
  try{
   for(const idx of [1,2]){
    const dest=front+'/tin-tuc-su-kien/bao-cao-thuong-nien'+(idx===2?'/2':'');
    const resp=await page.goto(dest,{waitUntil:'domcontentloaded',timeout:65000});
    const cards=await page.locator('#posts-grid h2').count();
    const info=await page.evaluate(()=>({h1:[...document.querySelectorAll('main h1')].map(n=>n.textContent.trim()),
     documentWidth:document.documentElement.scrollWidth,viewportWidth:window.innerWidth}));
    check(resp?.status()===200&&cards===(idx===1?12:6)&&info.h1.includes('Báo cáo thường niên')&&
       info.documentWidth<=info.viewportWidth+2,'Annual SSR archive pagination or horizontal overflow '+viewport.name+' '+idx);
    pages.push({page:idx,http:200,cards,overflow:info.documentWidth>info.viewportWidth+2});
   }
   for(const year of [2008,2010,2014]){
    const dest=front+'/bao-cao-thuong-nien-'+year;
    const r=await page.goto(dest,{waitUntil:'domcontentloaded',timeout:65000});
    const info=await page.evaluate(()=>({h1:[...document.querySelectorAll('main h1')].map(n=>n.textContent.trim()),
     imgs:[...document.querySelectorAll('#article-content img')].map(n=>({src:n.getAttribute('src'),alt:n.alt})),
     pdfs:[...document.querySelectorAll('#article-content a[href]')].filter(a=>/\.pdf(?:[?#]|$)/i.test(a.href)).length,
     documentWidth:document.documentElement.scrollWidth,viewportWidth:window.innerWidth}));
    check(r?.status()===200&&info.h1.some(s=>s.includes('Báo cáo thường niên '+year))&&
      info.documentWidth<=info.viewportWidth+2,'Annual article SSR invalid '+year+' '+viewport.name);
    check(info.imgs.length===(year===2008?94:year===2010?130:0),'Booklet image count invalid '+year);
    if(year===2014)check(info.pdfs===1,'2014 local PDF link missing');
    if(year!==2014){
     const first=page.locator('#article-content img').first();
     await first.scrollIntoViewIfNeeded();
     const loaded=await first.evaluate(el=>new Promise(resolve=>{
      if(el.complete)return resolve(el.naturalWidth>0);
      el.addEventListener('load',()=>resolve(true),{once:true});
      el.addEventListener('error',()=>resolve(false),{once:true});
      setTimeout(()=>resolve(false),40000);
     }));
     check(loaded,'Actual first JPEG not loaded on '+viewport.name+' '+year);
    }
    pages.push({year,http:200,images:info.imgs.length,pdfs:info.pdfs,overflow:false});
   }
  }finally{await context.close()}
  report[viewport.name==='mobile'?'mobile':'archive']=pages;
 }
 report.status='PASS_18_SOURCE_PARITY';
}catch(e){report.errors.push(String(e).slice(0,600));report.status='PARTIAL';
 console.error('PSE_ANNUAL_FINAL_QA_ERROR='+String(e))}
finally{
 await mkdir('artifacts/pse-annual-final-qa',{recursive:true});
 await writeFile('artifacts/pse-annual-final-qa/report.json',JSON.stringify(report,null,2)+'\n');
 await browser.close();
}
console.log('PSE_ANNUAL_FINAL_PARITY='+JSON.stringify({status:report.status,original:18,
 wordpress:report.wordpress,yoast:report.yoastTitlesChecked,
 ranked:report.sourceRanks.length,images:report.sourceImageCounts,
 pdfs:report.localPdfChecked,errors:report.errors}));
if(report.status!=='PASS_18_SOURCE_PARITY')process.exitCode=1;
