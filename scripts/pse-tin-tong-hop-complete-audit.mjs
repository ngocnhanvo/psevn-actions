/** Read-only complete Joomla news archive versus live WP taxonomy / Astro SSR.
 * Never writes to WordPress; 56-page source manifest is independent of WP target.
 */
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';

const env=Object.fromEntries(String(process.env.ENV_FILE||'').split(/\r?\n/)
 .map(x=>x.trim().replace(/^export\s+/,'')).filter(x=>/^(WC_URL|WC_URL_CLIENT)=/.test(x))
 .map(x=>{const n=x.indexOf('=');return [x.slice(0,n),x.slice(n+1).replace(/^['"]|['"]$/g,'')]}));
const origin=(s)=>{const u=new URL(s);if(u.protocol!=='https:'||u.username||u.password||u.port||!['','/'].includes(u.pathname)||u.search||u.hash)throw Error('Unsafe configured origin');return u.origin};
const wp=origin(env.WC_URL),web=origin(env.WC_URL_CLIENT);
if(wp===web)throw Error('WP/Frontend share origin');
const state=JSON.parse(await readFile('docs/pse-legacy-migration-state.json','utf8'));
if(state.schema!=='pse-legacy-article-migration-v1'||state.tracker_issue!==3||state.backup_verified!==true)
 throw Error('Unverified migration checkpoint');
const old='https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop.html';
const report={schema:'pse-tin-tong-hop-full-source-parity-v1',old,wp,web,source:{},wordpress:{},astro:{},missing:[],untracked:[],errors:[],status:'STARTED'};
const root='artifacts/pse-tin-tong-hop-complete-audit';
await mkdir(root,{recursive:true});
const browser=await chromium.launch({headless:true});
async function requestJson(url){
 const response=await fetch(url,{headers:{Accept:'application/json','Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
 const json=await response.json().catch(()=>null);
 return {code:response.status,total:Number(response.headers.get('x-wp-total')||0),pages:Number(response.headers.get('x-wp-totalpages')||1),json};
}
async function getArchive(page,idx=1){
 const res=await page.goto(old+(idx===1?'':'?start='+String((idx-1)*report.source.step)),{waitUntil:'domcontentloaded',timeout:50000});
 if(res?.status()!==200)throw Error('Joomla archive page '+idx+' HTTP '+res?.status());
 return await page.evaluate(()=>{
   const root=document.querySelector('.blog')||document.querySelector('main')||document.body;
   const urls=[...root.querySelectorAll('a[href]')].map(a=>({href:a.href,label:(a.textContent||'').replace(/\s+/g,' ').trim()}));
   const articles=[...new Map(urls.map(x=>{
     let u;try{u=new URL(x.href)}catch{return [null,null]}
     const match=/\/(\d{3,6})-([a-z0-9-]+)\.html$/i.exec(u.pathname);
     if(!match||!['pse.vn','www.pse.vn'].includes(u.hostname))return [null,null];
     return [match[1],{id:match[1],slug:match[2].toLowerCase(),url:u.href,title:x.label}];
   }).filter(x=>x[0])).values()];
   const pageInfo=(root.textContent||'').match(/Page\s+(\d+)\s+of\s+(\d+)/i);
   const starts=[...new Set(urls.map(x=>{try{return new URL(x.href).searchParams.get('start')}catch{return null}})
    .filter(x=>x!==null&&/^\d+$/.test(x)).map(Number))].sort((a,b)=>a-b);
   // Some legacy Joomla entries show full body/headline directly and have no article anchor.
   // Retain these independently from numeric article URLs for review.
   const headlines=[...root.querySelectorAll('h2,h3')].map(h=>({
     title:(h.textContent||'').replace(/\s+/g,' ').trim(),
     linked:!!h.querySelector('a[href]'),
   })).filter(x=>x.title.length>=18&&x.title.length<=260);
   return {pageNumber:pageInfo?Number(pageInfo[1]):null,totalPages:pageInfo?Number(pageInfo[2]):null,
    articles,headlines,starts,layout:!!document.querySelector('.blog'),title:document.title};
 });
}
try{
 const ctx=await browser.newContext({viewport:{width:1366,height:860}});
 await ctx.route(/\.(?:woff2?|ttf|png|jpe?g|webp|svg)(?:\?.*)?$/i,route=>route.abort());
 const firstPage=await ctx.newPage();
 const first=await getArchive(firstPage);
 const total=first.totalPages;
 if(first.pageNumber!==1||!Number.isInteger(total)||total<3||total>150||first.articles.length<2)
  throw Error('Legacy archive pagination/source not verified: '+JSON.stringify(first).slice(0,250));
 const steps=first.starts.filter(n=>n>0);
 const step=steps[0];
 if(!Number.isInteger(step)||step<1||step>25)throw Error('Could not independently infer legacy per-page offset');
 report.source={totalPages:total,step,firstPageSample:first.articles.slice(0,8),pageCounts:[],articles:[]};
 const byPage=Array(total);byPage[0]=first;
 await firstPage.screenshot({path:root+'/source-page1.png',fullPage:true,timeout:45000});
 await firstPage.close();
 let cursor=2;const errors=[];
 async function worker(){
  const page=await ctx.newPage();
  try{
   while(true){
    const idx=cursor++;if(idx>total)return;
    let last='';
    for(let attempt=0;attempt<2;attempt++){
     try{
       const cur=await getArchive(page,idx);
       // Joomla's final archive page may render its last full article inline
       // without a numerical detail link. Count headings separately; never
       // invent an article URL from a heading.
       if(cur.pageNumber!==idx||cur.totalPages!==total||
          (idx!==total&&cur.articles.length===0&&cur.headlines.length===0))
        throw Error('Unexpected archive page/order '+idx+' got '+
          JSON.stringify({page:cur.pageNumber,total:cur.totalPages,links:cur.articles.length,headlines:cur.headlines.length}));
       byPage[idx-1]=cur;last='';break;
     }catch(e){last=String(e?.message||e).slice(0,180);if(attempt===0)await page.waitForTimeout(1300)}
    }
    if(last)errors.push({page:idx,error:last});
   }
  }finally{await page.close()}
 }
 await Promise.all(Array.from({length:4},worker));
 if(errors.length)throw Error('Legacy archive cannot be fully inventoried: '+JSON.stringify(errors.slice(0,8)));
 const items=byPage.flatMap((p,i)=>p.articles.map((a,index)=>({...a,sourcePage:i+1,order:index})));
 // Joomla emits both headline and "Xem tiếp..." anchors for the same article.
 // Keep the occurrence manifest but compare distinct source IDs for data parity.
 const uniqueItems=[...new Map(items.map(x=>[x.id,x])).values()];
 const sourceIds=new Set(uniqueItems.map(x=>x.id));
 const duplicateIds=items.filter((x,i)=>items.findIndex(y=>y.id===x.id)!==i).map(x=>x.id);
 report.source.pageCounts=byPage.map((p,i)=>({page:i+1,items:p.articles.length}));
 report.source.articles=items;
 report.source.uniqueArticles=sourceIds.size;
 report.source.duplicates=[...new Set(duplicateIds)];
 report.source.checkpointMatched=uniqueItems.filter(a=>state.articles[a.id]?.source_url).length;
 const category=await requestJson(wp+'/wp-json/wp/v2/categories?slug=tin-tong-hop&hide_empty=false&_fields=id,parent,slug,count,name');
 if(category.code!==200||category.json?.length!==1||category.json[0].slug!=='tin-tong-hop'||category.json[0].id!==1746)
  throw Error('Live WP child category identity mismatch');
 const cat=category.json[0];
 const firstWp=await requestJson(wp+'/wp-json/wp/v2/posts?categories=1746&per_page=100&page=1&status=publish&orderby=date&order=desc&_fields=id,slug,title,categories,date,status');
 if(firstWp.code!==200||!Array.isArray(firstWp.json))throw Error('WordPress public posts unavailable');
 const posts=[...firstWp.json];
 for(let n=2;n<=firstWp.pages;n++){
  const part=await requestJson(wp+'/wp-json/wp/v2/posts?categories=1746&per_page=100&page='+n+'&status=publish&orderby=date&order=desc&_fields=id,slug,title,categories,date,status');
  if(part.code!==200||!Array.isArray(part.json))throw Error('WordPress posts page '+n+' unavailable');
  posts.push(...part.json);
 }
 if(posts.length!==firstWp.total)throw Error('WordPress published paging truncated');
 report.wordpress={category:cat,total:firstWp.total,pages:firstWp.pages,posts:posts.map(x=>({id:x.id,slug:x.slug,date:x.date,title:x.title?.rendered?.replace(/<[^>]+>/g,'')}))};
 const postIds=new Set(posts.map(p=>p.id));const postSlugs=new Set(posts.map(p=>p.slug));
 report.missing=uniqueItems.filter(a=>{
  const mapped=state.articles[a.id];
  return !(mapped?.wp_id&&postIds.has(Number(mapped.wp_id)))&&!postSlugs.has(a.slug);
 }).map(a=>({id:a.id,title:a.title,url:a.url,sourcePage:a.sourcePage,
  checkpointStatus:state.articles[a.id]?.status||'UNTRACKED',
  reason:state.articles[a.id]?.reason||'',
  wpId:state.articles[a.id]?.wp_id||null}));
 report.untracked=uniqueItems.filter(a=>!state.articles[a.id]).map(a=>({id:a.id,title:a.title,url:a.url,sourcePage:a.sourcePage}));
 report.wordpress.unmatchedInSource=posts.filter(p=>!uniqueItems.some(a=>
  Number(state.articles[a.id]?.wp_id)===p.id||a.slug===p.slug))
  .map(p=>({id:p.id,slug:p.slug,title:p.title?.rendered?.replace(/<[^>]+>/g,'')}));
 // Normalized title comparison catches legacy full-body entries without numeric links.
 const fold=str=>String(str||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
   .replace(/[đĐ]/g,'d').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const wpHeadlineKeys=new Set(posts.map(x=>fold(x.title?.rendered?.replace(/<[^>]+>/g,' '))));
 const seenHeading=new Set();
 const headlineRows=byPage.flatMap((p,i)=>p.headlines.map(h=>({...h,sourcePage:i+1})))
  .filter(h=>{const key=fold(h.title);if(!key||seenHeading.has(key))return false;seenHeading.add(key);return true});
 const unmatchedHeadlineRows=headlineRows.filter(h=>!wpHeadlineKeys.has(fold(h.title)));
 report.source.headlines={totalUnique:headlineRows.length,unmatchedPublished:unmatchedHeadlineRows.length,
  firstPage:byPage[0].headlines.slice(0,18),
  unmatched:unmatchedHeadlineRows.slice(0,250)};

 const site=await ctx.newPage();
 const r=await site.goto(web+'/tin-tuc-su-kien/tin-tong-hop',{waitUntil:'domcontentloaded',timeout:50000});
 const visible=await site.evaluate(()=>({title:document.title,cardCount:document.querySelectorAll('#posts-grid .grid > div').length,
   body:document.querySelector('#posts-grid')?.textContent?.replace(/\s+/g,' ').slice(-350)||'',
   overflow:document.documentElement.scrollWidth-window.innerWidth}));
 await site.screenshot({path:root+'/target-page1.png',fullPage:true,timeout:45000});
 await site.close();
 report.astro={http:r?.status(),...visible};
 const countMatch=visible.body.match(/Tổng\s+(\d+)\s+bài viết/);
 if(r?.status()!==200||Number(countMatch?.[1])!==posts.length||visible.cardCount!==Math.min(12,posts.length)||
   visible.overflow>5)throw Error('Astro SSR catalog differs from WP: '+JSON.stringify(report.astro));
 report.status=report.missing.length===0&&report.untracked.length===0?'PASS_SOURCE_TO_PUBLISHED':'PARTIAL_MISSING_SOURCE';
 console.log('PSE_TIN_TONG_HOP_FULL_AUDIT='+JSON.stringify({
  status:report.status,sourcePages:total,sourceUnique:sourceIds.size,sourceDuplicates:report.source.duplicates.length,
  sourceMissingPublished:report.missing.length,untracked:report.untracked.length,
  sourceHeadlineCount:report.source.headlines?.totalUnique,
  unmatchedSourceHeadlines:report.source.headlines?.unmatchedPublished,wordpressPublished:posts.length,
  wpExtraComparedToArchive:report.wordpress.unmatchedInSource.length,astroShown:countMatch?.[1],
  missingStatuses:Object.fromEntries([...new Set(report.missing.map(x=>x.checkpointStatus))].map(s=>[s,report.missing.filter(x=>x.checkpointStatus===s).length]))
 }));
} catch(e) {
 report.errors.push(String(e?.message||e));report.status='AUDIT_FAILED';
 console.error('PSE_TIN_TONG_HOP_FULL_AUDIT_ERROR='+report.errors.at(-1));
 throw e;
} finally {
 await writeFile(root+'/report.json',JSON.stringify(report,null,2)+'\n');
 await browser.close();
}
// Audit rerun requested 2026-11-27: compare current full 57-page Joomla Tin tong hop archive, native WP taxonomy 1746 and Astro SSR before any CMS write; preserve all existing articles.
