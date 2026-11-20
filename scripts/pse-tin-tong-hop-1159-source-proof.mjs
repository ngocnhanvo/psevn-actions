/** Read-only comparison for Joomla UTF-8 percent encoded slug #1159 and WP #79852. */
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const state=JSON.parse(await readFile('docs/pse-legacy-migration-state.json','utf8'));
const id='1159',r=state.articles[id];
if(state.schema!=='pse-legacy-article-migration-v1'||r?.status!=='imported'||r.wp_id!==79852||
 r.source_created_date!=='2015-12-11'||r.group_hint!=='company'||
 !/^https:\/\/www\.pse\.vn\/tin-tuc-su-kien\/tin-cong-ty\/tin-tong-hop\/1159-[^\s/]+\.html$/.test(r.source_url))throw Error('Unexpected original source checkpoint');
const env=String(process.env.ENV_FILE||'').split(/\r?\n/).map(v=>v.trim().replace(/^export\s+/,'')).filter(v=>v.startsWith('WC_URL='));
if(env.length!==1)throw Error('Missing WordPress origin');
const wpUrl=new URL(env[0].slice(7).replace(/^['"]|['"]$/g,''));
if(wpUrl.protocol!=='https:'||wpUrl.username||wpUrl.password||wpUrl.port||wpUrl.search||wpUrl.hash||!['','/'].includes(wpUrl.pathname))throw Error('Unsafe WP');
const wp=wpUrl.origin,report={schema:'pse-tin-tong-hop-1159-source-proof-v1',readonly:true,sourceUrl:r.source_url,wordpressId:79852,status:'STARTED'};
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1366,height:860}});
const strip=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').replace(/\s+/g,' ').trim().toLowerCase();
try{
 const page=await ctx.newPage();
 const old=await page.goto(r.source_url,{waitUntil:'domcontentloaded',timeout:60000});
 if(old?.status()!==200)throw Error('Joomla origin unavailable');
 const src=await page.evaluate(()=>{
  const p=document.querySelector('[itemprop="articleBody"]');
  return {title:document.title.replace(/\s+-\s+PSE\.VN\s*$/i,'').trim(),
    body:(p?.textContent||'').replace(/\s+/g,' ').trim(),images:[...p?.querySelectorAll('img[src]')||[]].map(img=>img.src),
    documents:[...p?.querySelectorAll('a[href]')||[]].map(a=>a.href).filter(u=>/\.(pdf|docx?|xlsx?)(?:[?#]|$)/i.test(u))};
 });
 if(!src.title||src.body.length<80)throw Error('Original title or body unavailable');
 const live=await ctx.request.get(wp+'/wp-json/wp/v2/posts/79852?_fields=id,slug,status,date,title,content,categories',{
  timeout:35000,failOnStatusCode:false});
 report.wpHTTP=live.status();
 if(live.status()===200){
  const p=await live.json();
  const wpText=await page.evaluate(html=>new DOMParser().parseFromString(html,'text/html').body.textContent||'',p.content?.rendered||'');
  const a=strip(src.body).split(' ').filter(x=>x.length>=2),b=strip(wpText).split(' ').filter(x=>x.length>=2);
  const overlap=a.length?Number((a.filter(w=>b.includes(w)).length/a.length).toFixed(3)):0;
  report.original={title:src.title,bodyLength:src.body.length,images:src.images.length,documents:src.documents.length,opening:src.body.slice(0,350)};
  report.post={id:p.id,slug:p.slug,status:p.status,date:p.date,title:p.title?.rendered,categories:p.categories,bodyChars:wpText.length,opening:wpText.slice(0,350),textOverlap:overlap};
  report.sameTitle=strip(src.title)===strip(p.title?.rendered);
  report.sameSourceDate=String(p.date||'').startsWith('2015-12-11');
  report.hasSourceParent=p.categories.includes(1742);
  report.hasSourceChild=p.categories.includes(1746);
  report.status=report.sameTitle&&report.sameSourceDate&&report.hasSourceParent&&p.status==='publish'&&overlap>0.70?'PASS_MATCHED':'REVIEW';
 }else report.status='REVIEW_NOT_PUBLIC';
 console.log('PSE_TIN_TONG_HOP_1159_SOURCE_PROOF='+JSON.stringify(report));
}catch(e){report.status='FAIL';report.error=String(e?.message||e);console.error('PSE_TIN_TONG_HOP_1159_SOURCE_ERROR='+report.error);throw e}
finally{await mkdir('artifacts/pse-tin-tong-hop-1159-source',{recursive:true});await writeFile('artifacts/pse-tin-tong-hop-1159-source/report.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
