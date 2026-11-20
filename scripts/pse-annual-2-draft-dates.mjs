/** Independently seek Joomla publication-date evidence for unresolved annual drafts. READ ONLY. */
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {searchDate} from './pse-legacy-search-date.mjs';
const state=JSON.parse(await readFile('docs/pse-legacy-migration-state.json','utf8'));
if(state.schema!=='pse-legacy-article-migration-v1')throw Error('Unknown migration checkpoint');
const ids=['1041','1546'];
const browser=await chromium.launch({headless:true});
const out=[];
try{
 const ctx=await browser.newContext({viewport:{width:1280,height:800}});
 await ctx.route(/\.(?:png|jpe?g|gif|webp|svg|woff2?|ttf)(?:\?.*)?$/i,r=>r.abort());
 for(const id of ids){
  const record=state.articles[id];
  if(!record?.source_url?.startsWith('https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-thuong-nien/'+id+'-')||
     record.group_hint!=='shareholder'||!Number.isSafeInteger(record.wp_id))
   throw Error('Annual source identity missing '+id);
  const page=await ctx.newPage();
  const row={id,wp_id:record.wp_id,source:record.source_url,date:record.source_date||null};
  try{
   const response=await page.goto(record.source_url,{waitUntil:'domcontentloaded',timeout:50000});
   if(response?.status()!==200)throw Error('Source detail '+response?.status());
   const s=await page.evaluate(()=>{
    const root=document.querySelector('[itemprop="articleBody"]')||document.querySelector('.item-page');
    return {heading:document.querySelector('.item-page h1, .item-page h2, .page-header h2, .page-header h1')?.textContent?.trim()||'',
     docTitle:(document.title||'').replace(/\s*-\s*PSE\.VN\s*$/i,'').trim(),
     opening:(root?.textContent||'').replace(/\s+/g,' ').trim().slice(0,1200),
     metaDescription:document.querySelector('meta[name="description" i]')?.content||''};
   });
   row.sourceArticle=s;
   const title=s.heading||s.docTitle;
   if(!title)throw Error('No Joomla title');
   row.dateEvidence=await searchDate(page,{id:Number(id),sourceUrl:record.source_url,title,opening:s.opening});
   row.status=row.dateEvidence?.day?'SEARCH_CREATED_DATE_VERIFIED':'DATE_STILL_UNVERIFIED';
  }catch(e){row.status='SOURCE_PROBE_FAILED';row.error=String(e).slice(0,260)}
  finally{await page.close()}
  out.push(row);console.log('PSE_ANNUAL_DATE='+JSON.stringify(row));
 }
 await mkdir('artifacts/pse-annual-date',{recursive:true});
 await writeFile('artifacts/pse-annual-date/report.json',JSON.stringify({mode:'READ_ONLY',records:out},null,2)+'\n');
}finally{await browser.close()}
