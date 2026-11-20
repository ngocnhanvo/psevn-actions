/** Read-only browser evidence for PDF icons stretched as post-card featured images. */
import { chromium } from 'playwright';
import { mkdir,writeFile } from 'node:fs/promises';
const base='https://pse.webnvn.com';
const wp='https://admin-pse.webnvn.com';
const target='/tin-tuc-su-kien/tai-lieu-quan-tri-cong-ty/2';
const browser=await chromium.launch({headless:true});
const out={schema:'pse-pdf-listing-diagnostic-v1',target,cards:[],sources:[],errors:[]};
try{
 const ctx=await browser.newContext({viewport:{width:1366,height:850}});
 const page=await ctx.newPage();
 const res=await page.goto(base+target,{waitUntil:'domcontentloaded',timeout:50000});
 if(res?.status()!==200)throw Error('listing HTTP '+res?.status());
 out.cards=await page.locator('#posts-grid .group').evaluateAll(cards=>cards.slice(0,9).map(card=>{
  const image=card.querySelector('img.post-card-img');
  const box=image?.getBoundingClientRect();
  return {title:card.querySelector('h2')?.textContent?.trim().slice(0,160)||'',href:card.querySelector('a[href]')?.getAttribute('href')||'',imageSrc:image?.getAttribute('src')||null,
    imageAlt:image?.getAttribute('alt')||null,width:box?.width||0,height:box?.height||0,naturalWidth:image?.naturalWidth||0,naturalHeight:image?.naturalHeight||0};
 }));
 const picked=out.cards.filter(x=>/Quy chế nội bộ|Điều lệ công ty/.test(x.title)).slice(0,3);
 const api=ctx.request;
 for(const card of picked){
  const slug=decodeURIComponent(new URL(card.href,base).pathname).split('/').filter(Boolean).at(-1);
  if(!slug)continue;
  const response=await api.get(wp+'/wp-json/wp/v2/posts?slug='+encodeURIComponent(slug)+'&_embed=true');
  const rows=response.ok()?await response.json():[];
  const row=rows[0]||{};
  const snippet=String(row.content?.rendered||'');
  const imgs=[...snippet.matchAll(/<img\b[^>]*>/gi)].map(m=>m[0].slice(0,850)).slice(0,8);
  const links=[...snippet.matchAll(/<a\b[^>]*href=["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>/gi)].map(m=>m[1].slice(0,300)).slice(0,10);
  out.sources.push({slug,id:row.id,http:response.status(),ogImage:row.yoast_head_json?.og_image?.[0]?.url||null,
    featuredMedia:row._embedded?.['wp:featuredmedia']?.[0]?.source_url||null,
    featuredAlt:row._embedded?.['wp:featuredmedia']?.[0]?.alt_text||null,
    imgs,links,rawContentLength:snippet.length});
 }
 console.log('PSE_PDF_LISTING_DIAG='+JSON.stringify(out).slice(0,20000));
}catch(e){out.errors.push(String(e));console.error('PSE_PDF_LISTING_DIAG_FAIL='+String(e))}
finally{await mkdir('artifacts/pse-pdf-listing-diagnostic',{recursive:true});await writeFile('artifacts/pse-pdf-listing-diagnostic/report.json',JSON.stringify(out,null,2)+'\n');await browser.close()}
if(out.errors.length||!out.cards.length)process.exitCode=1;
