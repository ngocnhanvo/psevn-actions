/** Independent PSE governance source vs WordPress/Astro parity and Joomla created-date proof. READ ONLY. */
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {searchDate} from './pse-legacy-search-date.mjs';
const state=JSON.parse(await readFile('docs/pse-legacy-migration-state.json','utf8'));
if(state.schema!=='pse-legacy-article-migration-v1'||!state.backup_verified)throw Error('Untrusted migration state');
const cfg=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,''));
const origin=k=>{const rows=cfg.filter(s=>s.startsWith(k+'='));
 if(rows.length!==1)throw Error('Missing '+k);const u=new URL(rows[0].slice(k.length+1).trim().replace(/^['"]|['"]$/g,''));
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))throw Error('Unsafe origin '+k);
 return u.origin};
const cms=origin('WC_URL'),front=origin('WC_URL_CLIENT');
if(cms!=='https://admin-pse.webnvn.com'||front!=='https://pse.webnvn.com')throw Error('Wrong tenant');
const prefix='/quan-he-nha-dau-tu/tai-lieu-quan-tri-cong-ty/';
const sourceRoot='https://www.pse.vn'+prefix.slice(0,-1)+'.html';
const report={schema:'pse-governance-24-independent-parity-v1',source:[],sourceIds:[],cms:[],front:[],date92:null,errors:[],gaps:[]};
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1366,height:860}});
await ctx.route(/\.(?:jpe?g|png|webp|gif|svg|woff2?|ttf)(?:\?.*)?$/i,r=>r.abort());
const page=await ctx.newPage();
async function nav(p,url){let e;
 for(let i=0;i<2;i++){try{const r=await p.goto(url,{waitUntil:'domcontentloaded',timeout:45000});if(r?.status()===200)return r;e='HTTP '+r?.status()}catch(x){e=String(x).slice(0,130)}}
 throw Error(url+' '+e)}
let nonce='';
const api=(path)=>page.evaluate(async({path,nonce})=>{
 const r=await fetch(path,{credentials:'same-origin',headers:{Accept:'application/json','X-WP-Nonce':nonce}});
 return{http:r.status,total:r.headers.get('x-wp-total'),data:await r.json().catch(()=>null)};
},{path,nonce});
try{
 const old=await ctx.newPage();
 for(const offset of [0,5,10,15,20,25]){
  try{await nav(old,sourceRoot+(offset?'?start='+offset:''));const data=await old.evaluate(()=>{
   const root=document.querySelector('.blog');if(!root)throw Error('Joomla .blog missing');
   return [...new Map([...root.querySelectorAll('a[href]')].map(a=>{
    const m=a.href.match(/\/tai-lieu-quan-tri-cong-ty\/(\d{2,6})-([^/]+)\.html$/i);
    return m?[m[1],{id:m[1],url:a.href,slug:m[2],text:(a.textContent||'').trim()}]:null;
   }).filter(Boolean)).values()];
  });report.source.push({offset,http:200,items:data});}
  catch(e){report.source.push({offset,error:String(e).slice(0,230)});report.errors.push('SOURCE_ARCHIVE_'+offset)}
 }
 await old.close();
 const unique=new Map(report.source.flatMap(p=>p.items||[]).map(x=>[x.id,x]));
 report.sourceIds=[...unique.keys()];
 if(report.sourceIds.length!==24)report.gaps.push('SOURCE_EXPECTED_24_GOT_'+report.sourceIds.length);
 const stateRows=Object.entries(state.articles).filter(([id,x])=>x.source_url?.includes(prefix+id+'-')&&x.group_hint==='shareholder');
 if(stateRows.length!==24)throw Error('Migration checkpoint no longer contains 24 governance posts');
 await nav(page,cms+'/wp-admin/');
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const t=await page.locator('#loginform').innerText(),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){const a=+m[1],b=+m[3],ans=m[2]==='+'?a+b:m[2]==='-'?a-b:a*b;
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error('Captcha field missing');await f.fill(String(ans))}
  await page.locator('#wp-submit').click();
 }
 await nav(page,cms+'/wp-admin/post.php?post=248&action=edit');
 if(!await page.locator('#adminmenu').count())throw Error('WP administrator login unsuccessful');
 nonce=await page.evaluate(async()=>window.wpApiSettings?.nonce||await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(r=>r.text()));
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('Invalid REST nonce');
 const cat=await api('/wp-json/wp/v2/categories/1759?_fields=id,slug,parent,count');
 if(cat.http!==200||cat.data?.slug!=='tai-lieu-quan-tri-cong-ty'||cat.data?.parent!==1744)throw Error('WP governance taxonomy drift');
 report.category=cat.data;
 const all=await api('/wp-json/wp/v2/posts?categories=1759&per_page=100&context=edit&status=any&_fields=id,status,slug,date,categories');
 if(all.http!==200||!Array.isArray(all.data))throw Error('Category REST '+all.http);
 report.wpList=all.data.map(x=>({id:x.id,status:x.status,slug:x.slug,date:x.date}));report.wpCount=Number(all.total);
 const tasks=report.sourceIds.map(id=>({id,source:unique.get(id),row:state.articles[id]}));
 let cursor=0;
 const worker=async()=>{
  const p=await ctx.newPage();try{
  while(cursor<tasks.length){
   const t=tasks[cursor++];
   const d={id:t.id,source:t.source?.url,wpId:t.row?.wp_id||null,checkpoint:t.row?.status,wp:null,original:null,gaps:[]};
   if(!t.row?.source_url||t.row.source_url!==t.source?.url)d.gaps.push('SOURCE_ID_MISMATCH');
   if(!Number.isSafeInteger(t.row?.wp_id))d.gaps.push('WP_POST_MISSING');
   else{
    const a=await api('/wp-json/wp/v2/posts/'+t.row.wp_id+'?context=edit&_fields=id,status,slug,date,categories,title,content,pse_seo_title,pse_seo_description,acf');
    if(a.http!==200){d.gaps.push('WP_GET_'+a.http)}
    else{const v=a.data,html=String(v.content?.raw||'');
     const assets=[...html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)].map(x=>x[1]);
     d.wp={id:v.id,status:v.status,slug:v.slug,date:v.date,title:v.title?.raw||'',
      seoTitle:v.pse_seo_title||'',seoDescription:v.pse_seo_description||'',categories:v.categories,
      htmlLength:html.length,images:(html.match(/<img\b/gi)||[]).length,
      files:assets.filter(x=>/\.(?:pdf|docx?|xlsx?|pptx?|zip)(?:\?|#|$)/i.test(x)),
      legacyAssetLinks:assets.filter(x=>/^https?:\/\/(?:www\.)?pse\.vn\/(?:images|media|files)\//i.test(x)),
      acf:v.acf};
     if(!v.categories?.includes(1759))d.gaps.push('CATEGORY_MISSING');
     if(v.status!=='publish')d.gaps.push('UNPUBLISHED');
     if(v.acf?.action!=='PostDetails'||v.acf?.key!=='ssr-post')d.gaps.push('ACF_WRONG');
     if(d.wp.legacyAssetLinks.length)d.gaps.push('LEGACY_MEDIA_HOTLINK');
     if(!html.trim())d.gaps.push('EMPTY_CONTENT');
     if(v.slug!==t.source.slug&&!(t.id==='1184'&&v.slug==='nghi-quyet-ve-viec-chap-thuan-kh-kd-2016'))d.gaps.push('SLUG_MISMATCH');
    }
   }
   try{await nav(p,t.source.url);
    d.original=await p.evaluate(()=>{
      const root=document.querySelector('[itemprop="articleBody"]')||document.querySelector('.item-page');
      const assets=[...(root?.querySelectorAll('a[href],img[src]')||[])].map(el=>{
       const key=el.tagName==='IMG'?'src':'href';
       try{return new URL(el.getAttribute(key),location.href).href}catch{return null}
      }).filter(Boolean);
      return {title:document.title,heading:document.querySelector('.item-page h1,.item-page h2,.page-header h1,.page-header h2')?.textContent?.trim()||'',
       description:document.querySelector('meta[name="description" i]')?.content||null,
       opening:(root?.textContent||'').replace(/\s+/g,' ').trim().slice(0,700),
       files:[...new Set(assets.filter(x=>/\.(?:pdf|docx?|xlsx?|pptx?|zip)(?:\?|#|$)/i.test(x)))],
       images:[...new Set(assets.filter(x=>/\.(?:png|jpe?g|gif|webp)(?:\?|#|$)/i.test(x)))]};
    });
    if(d.wp){
     if(d.wp.seoTitle!==d.original.title)d.gaps.push('SEO_TITLE_MISMATCH');
     if(d.original.description&&d.wp.seoDescription!==d.original.description)d.gaps.push('SEO_DESCRIPTION_MISMATCH');
     if(d.original.files.length>d.wp.files.length)d.gaps.push('ORIGINAL_FILE_COUNT_GREATER_THAN_WP');
     if(d.original.images.length>d.wp.images)d.gaps.push('ORIGINAL_IMAGE_COUNT_GREATER_THAN_WP');
    }
    if(t.id==='92'){report.date92=await searchDate(p,{id:92,sourceUrl:t.source.url,title:d.original.heading||d.original.title.replace(/\s*-\s*PSE\.VN$/i,''),opening:d.original.opening});
     console.log('PSE_GOV_DATE_92='+JSON.stringify(report.date92));}
   }catch(e){d.gaps.push('SOURCE_DETAIL_UNVERIFIED');d.originalError=String(e).slice(0,170)}
   report.cms.push(d);console.log('PSE_GOV_ITEM='+JSON.stringify({id:d.id,wpId:d.wpId,status:d.wp?.status,originalFiles:d.original?.files?.length,wpFiles:d.wp?.files?.length,seo:d.gaps.filter(x=>x.includes('SEO')),gaps:d.gaps}));
  }}finally{await p.close()}};
 await Promise.all([worker(),worker(),worker()]);
 const f=await ctx.newPage();
 for(const [label,url] of [['first',front+'/tin-tuc-su-kien/tai-lieu-quan-tri-cong-ty'],['next',front+'/tin-tuc-su-kien/tai-lieu-quan-tri-cong-ty/2']]){
  try{const rr=await nav(f,url);const o=await f.evaluate(()=>({
   title:document.title,h1:document.querySelector('h1')?.textContent?.trim(),
   paths:[...new Set([...document.querySelectorAll('main a[href]')].map(a=>new URL(a.href).pathname))],
   preview:(document.querySelector('main')?.innerText||'').slice(0,600),
   paginator:[...document.querySelectorAll('a[href]')].filter(a=>/^\d+$/.test(a.textContent?.trim()||'')&&a.href.includes('tai-lieu-quan-tri-cong-ty')).map(a=>({text:a.textContent.trim(),href:a.href})).slice(0,15)
  }));report.front.push({label,url,http:rr.status(),...o});}
  catch(e){report.front.push({label,url,error:String(e).slice(0,180)})}
 }
 await f.close();
 report.cms.sort((a,b)=>report.sourceIds.indexOf(a.id)-report.sourceIds.indexOf(b.id));
 report.gaps.push(...report.cms.flatMap(x=>x.gaps.map(g=>x.id+':'+g)));
 if(report.wpCount!==24&&report.wpCount!==23)report.gaps.push('WP_CATEGORY_UNEXPECTED_'+report.wpCount);
 report.summary={source:report.sourceIds.length,wpPosts:report.cms.length,
  published:report.cms.filter(x=>x.wp?.status==='publish').length,
  drafts:report.cms.filter(x=>x.wp?.status==='draft').map(x=>x.id),
  seoMismatch:report.cms.filter(x=>x.gaps.includes('SEO_TITLE_MISMATCH')).map(x=>x.id),
  missingFiles:report.cms.filter(x=>x.gaps.includes('ORIGINAL_FILE_COUNT_GREATER_THAN_WP')).map(x=>x.id),
  firstPage:report.front[0]?.http,secondPage:report.front[1]?.http,
  date92:report.date92?.day||null,missing:report.gaps,errors:report.errors};
 console.log('PSE_GOV_2026_PARITY='+JSON.stringify(report.summary));
}finally{await mkdir('artifacts/pse-governance-2026-parity',{recursive:true});
 await writeFile('artifacts/pse-governance-2026-parity/report.json',JSON.stringify(report,null,2)+'\n');
 await browser.close()}
if(report.errors.length||report.sourceIds.length!==24||report.cms.length!==24)process.exitCode=1;
