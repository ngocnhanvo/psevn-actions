/** Find source-created date for exactly Joomla governance article 92. READ ONLY. */
import {chromium} from 'playwright';
import {searchDate} from './pse-legacy-search-date.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const source='https://www.pse.vn/quan-he-nha-dau-tu/tai-lieu-quan-tri-cong-ty/92-dieu-le-cong-ty-co-phan-phan-bon-va-hoa-chat-dau-khi-dong-nam-bo.html';
const result={schema:'pse-governance-92-created-date-source-proof-v1',id:92,source};
const b=await chromium.launch({headless:true});
try{const c=await b.newContext({viewport:{width:1280,height:850}});
await c.route(/\.(?:png|jpe?g|gif|webp|svg|woff2?|ttf)(?:\?.*)?$/i,r=>r.abort());
const p=await c.newPage();let res;
for(let i=0;i<2;i++){try{res=await p.goto(source,{waitUntil:'domcontentloaded',timeout:40000});if(res?.status()===200)break}catch(e){result.attemptError=String(e).slice(0,160)}}
if(res?.status()!==200)throw Error('Original source unavailable '+res?.status());
const v=await p.evaluate(()=>({title:document.querySelector('.item-page h1,.item-page h2,.page-header h1,.page-header h2')?.textContent?.trim()||document.title.replace(/\s*-\s*PSE\.VN$/i,'').trim(),opening:(document.querySelector('[itemprop="articleBody"]')?.textContent||document.querySelector('.item-page')?.textContent||'').replace(/\s+/g,' ').trim().slice(0,1300),metaDescription:document.querySelector('meta[name="description" i]')?.content||null}));
result.sourceDetails=v;
result.search=await searchDate(p,{id:92,sourceUrl:source,title:v.title,opening:v.opening});
result.status=result.search.day?'VERIFIED_CREATED':'DATE_NOT_VERIFIED';
console.log('PSE_GOV_92_DATE='+JSON.stringify(result));
}catch(e){result.status='FAIL';result.error=String(e).slice(0,240);console.error('PSE_GOV_92_DATE_FAIL='+result.error)}
finally{await mkdir('artifacts/pse-governance-92-date',{recursive:true});await writeFile('artifacts/pse-governance-92-date/report.json',JSON.stringify(result,null,2)+'\n');await b.close()}
if(result.status==='FAIL')process.exitCode=1;
