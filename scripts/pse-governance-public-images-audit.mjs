/** Public read-only QA for source-provenanced governance articles; never delete images blindly. */
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const state=JSON.parse(await readFile('docs/pse-legacy-migration-state.json','utf8'));
if(state.schema!=='pse-legacy-article-migration-v1')throw Error('Wrong PSE source');
const target='/quan-he-nha-dau-tu/tai-lieu-quan-tri-cong-ty/';
const rows=Object.entries(state.articles).filter(([id,r])=>r.wp_id&&r.source_url?.startsWith('https://www.pse.vn'+target+id+'-')).sort((a,b)=>Number(b[0])-Number(a[0]));
if(rows.length!==20)throw Error('Governance post checkpoint changed; expected 20 after two verified PDFs, got '+rows.length);
const origin='https://pse.webnvn.com';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:850}});
const page=await context.newPage();
const manifest=[];
try{
 const archive=await page.goto(origin+'/tin-tuc-su-kien/tai-lieu-quan-tri-cong-ty',{waitUntil:'domcontentloaded',timeout:60000});
 if(archive?.status()!==200)throw Error('Governance archive HTTP '+archive?.status());
 const a=await page.evaluate(()=>({title:document.title,h1:[...document.querySelectorAll('h1')].map(x=>x.textContent?.trim()),headings:[...document.querySelectorAll('h2,h3')].slice(0,20).map(x=>x.textContent?.trim().slice(0,100))}));
 console.log('PSE_GOV_PUBLIC_ARCHIVE='+JSON.stringify({http:200,h1:a.h1,headings:a.headings.slice(0,8)}));
 for(const [id,row] of rows){
  const slug=new URL(row.source_url).pathname.match(/\/\d+-([^/]+)\.html$/i)?.[1]?.toLowerCase();
  if(!slug)throw Error('Source slug unknown '+id);
  let http=0,article=null;
  try{
   const response=await page.goto(origin+'/'+slug,{waitUntil:'domcontentloaded',timeout:50000});
   http=response?.status()||0;
   article=await page.evaluate(()=>{
    const root=document.querySelector('#article-content');
    if(!root)return {found:false};
    const img=[...root.querySelectorAll('img')];
    return {found:true,textChars:(root.textContent||'').replace(/\s+/g,' ').trim().length,
      textSample:(root.textContent||'').replace(/\s+/g,' ').trim().slice(0,100),
      imgs:img.map((x,i)=>({i,src:x.getAttribute('src'),alt:x.alt||'',loading:x.loading||''})),
      pdfs:[...root.querySelectorAll('a[href]')].filter(a=>/\.pdf(?:[?#]|$)/i.test(a.href)).length,
      suspicious:/getkredit\.ru|nunax\.ru|vtembooklet|sigProId|free-minigames/i.test(root.innerText||'')};
   });
   if(article?.found&&article.imgs.length){
    article.imageResults=[];
    for(const im of article.imgs){
     const img=page.locator('#article-content img').nth(im.i);
     await img.scrollIntoViewIfNeeded({timeout:15000});
     const read=await img.evaluate(el=>new Promise(resolve=>{
      if(el.complete)return resolve({loaded:el.naturalWidth>0,width:el.naturalWidth});
      let finished=false;const finish=()=>{if(!finished){finished=true;resolve({loaded:el.complete&&el.naturalWidth>0,width:el.naturalWidth})}};
      el.addEventListener('load',finish,{once:true});el.addEventListener('error',finish,{once:true});setTimeout(finish,14000);
     }));
     article.imageResults.push({i:im.i,...read});
    }
   }
  }catch(e){article={error:String(e).slice(0,170)}}
  const result={sourceId:id,wpId:row.wp_id,slug,http,article};
  manifest.push(result);
  console.log('PSE_GOV_PUBLIC_POST='+JSON.stringify({id,wpId:row.wp_id,http,body:article?.found,images:article?.imgs?.length||0,
    broken:article?.imageResults?.filter(x=>!x.loaded)||[],pdfs:article?.pdfs,chars:article?.textChars,suspicious:article?.suspicious,error:article?.error}));
 }
 await mkdir('artifacts/pse-governance-public-images',{recursive:true});
 await writeFile('artifacts/pse-governance-public-images/report.json',JSON.stringify({archive:a,records:manifest},null,2)+'\n');
 console.log('PSE_GOV_PUBLIC_AUDIT='+JSON.stringify({tested:manifest.length,
  http200:manifest.filter(x=>x.http===200&&x.article?.found).length,
  broken:manifest.flatMap(x=>(x.article?.imageResults||[]).filter(y=>!y.loaded).map(y=>({id:x.sourceId,i:y.i,src:x.article?.imgs?.[y.i]?.src}))),
  noArticle:manifest.filter(x=>!x.article?.found).map(x=>x.sourceId),
  suspicious:manifest.filter(x=>x.article?.suspicious).map(x=>x.sourceId),
  noWrites:true,noBuild:true}));
}finally{await browser.close()}
