/** Read-only proof for Joomla #1363: exact source article, 4 verified Petrotimes JPEGs and created date. */
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {searchDate} from './pse-legacy-search-date.mjs';
const state=JSON.parse(await readFile('docs/pse-legacy-migration-state.json','utf8'));
const id='1363',record=state.articles?.[id];
const source='https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/1363-khai-truong-khu-luu-niem-cong-trinh-dau-khi-dau-tien-tai-viet-nam.html';
if(state.schema!=='pse-legacy-article-migration-v1'||record?.source_url!==source||
  record.status!=='quarantined'||record.reason!=='Article contains non-local mandatory media')
 throw Error('Historic PSE 1363 checkpoint mismatch');
const URLs=['_1','','_3','_2'].map(s=>'https://petrovietnam.petrotimes.vn/stores/news_dataimages/buihienanh/072019/13/12/khai-truong-khu-luu-niem-cong-trinh-dau-khi-dau-tien-tai-viet-nam'+s+'.jpg');
const report={schema:'pse-tin-tong-hop-1363-source-proof-v1',readonly:true,id,source,media:[],date:null,status:'STARTED',errors:[]};
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1366,height:860}});
try{
 const page=await ctx.newPage();
 const r=await page.goto(source,{waitUntil:'domcontentloaded',timeout:60000});
 if(r?.status()!==200)throw Error('Joomla source URL HTTP '+r?.status());
 const article=await page.evaluate(()=>{
  const el=document.querySelector('[itemprop="articleBody"]');
  if(!el)return null;
  return {title:(document.title||'').replace(/\s+-\s+PSE\.VN.*$/i,'').trim(),
   opening:(el.textContent||'').replace(/\s+/g,' ').trim().slice(0,500),
   images:[...new Set([...el.querySelectorAll('img[src]')].map(x=>new URL(x.getAttribute('src'),location.href).href))],
   articleLength:(el.textContent||'').length};
 });
 if(!article||article.title!=='Khai trương Khu lưu niệm công trình Dầu khí đầu tiên tại Việt Nam'||
   article.articleLength<500||article.images.length!==URLs.length||
   URLs.some((url,i)=>article.images[i]!==url))
   throw Error('Original image list/title not independently verified');
 report.title=article.title;report.articleChars=article.articleLength;
 for(const url of URLs){
  const response=await ctx.request.get(url,{timeout:45000,failOnStatusCode:false});
  if(response.status()!==200)throw Error('Original image returned '+response.status());
  const bytes=await response.body(),signature=bytes.subarray(0,3).toString('hex');
  const last=new URL(response.url());
  if(last.protocol!=='https:'||last.hostname!=='petrovietnam.petrotimes.vn'||
    !(response.headers()['content-type']||'').toLowerCase().startsWith('image/jpeg')||
    bytes.length<1000||bytes.length>6_000_000||signature!=='ffd8ff')
   throw Error('Image origin/JPEG signature invalid '+url);
  report.media.push({url,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
 }
 const query=await ctx.newPage();
 try{report.date=await searchDate(query,{id:1363,sourceUrl:source,title:article.title,opening:article.opening});}
 finally{await query.close()}
 report.status=report.date?.day?'PASS_VERIFIED_DAY_AND_FOUR_JPEG':'PARTIAL_NO_CREATED_DATE';
 console.log('PSE_1363_SOURCE_PROOF='+JSON.stringify({status:report.status,sourceHttp:r.status(),date:report.date,
  imageCount:report.media.length,imageBytes:report.media.map(x=>x.bytes),articleChars:report.articleChars}));
}catch(e){report.status='FAIL';report.errors.push(String(e?.message||e));console.error('PSE_1363_SOURCE_PROOF_ERROR='+report.errors.at(-1));throw e}
finally{await mkdir('artifacts/pse-tin-tong-hop-1363-source',{recursive:true});await writeFile('artifacts/pse-tin-tong-hop-1363-source/report.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
