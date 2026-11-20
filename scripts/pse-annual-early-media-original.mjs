/** Original PSE 2008 and 2010 annual booklets: source asset inventory + byte limits. READ ONLY. */
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const st=JSON.parse(await readFile('docs/pse-legacy-migration-state.json','utf8'));
const specs=[{id:'998',folder:'bctn-2008',expected:94},{id:'1000',folder:'bctn-2010',expected:130}];
if(st.schema!=='pse-legacy-article-migration-v1'||!st.backup_verified)throw Error('Untrusted source state/backup');
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1366,height:900}});
await ctx.route(/\.(?:png|jpe?g|gif|webp|woff2?|ttf)(?:\?.*)?$/i,r=>r.abort());
const result={schema:'pse-annual-early-booklets-original-v1',mode:'READ_ONLY',reports:[],errors:[]};
try{
 for(const sp of specs){
  const original=st.articles[sp.id]?.source_url;
  if(!original?.startsWith('https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-thuong-nien/'+sp.id+'-'))
   throw Error('Source identity '+sp.id);
  const p=await ctx.newPage();
  let list=[];
  try{
   const res=await p.goto(original,{waitUntil:'domcontentloaded',timeout:60000});
   if(res?.status()!==200)throw Error('Source HTTP '+res?.status());
   list=await p.evaluate(()=>{
    const root=document.querySelector('[itemprop="articleBody"]');
    if(!root)throw Error('No original article body');
    return [...root.querySelectorAll('img[src]')].map(img=>new URL(img.getAttribute('src'),location.href).href);
   });
  }finally{await p.close()}
  const prefix='https://www.pse.vn/images/flippingbook/'+sp.folder+'/';
  if(list.length!==sp.expected||new Set(list).size!==sp.expected||list.some(u=>!u.startsWith(prefix)||!/\.jpe?g$/i.test(new URL(u).pathname)))
    throw Error('Original booklet pages changed '+sp.id+' '+list.length);
  const item={id:sp.id,source:original,folder:sp.folder,expected:sp.expected,images:list,
   sampled:[],allHeadVerified:false,totalBytes:0,issues:[]};
  // Validate every source file's HTTP/size. This is metadata only: no downloads retained or uploads.
  let next=0;
  async function worker(){
   while(next<list.length){const ix=next++,url=list[ix];try{
    const r=await ctx.request.head(url,{timeout:25000,failOnStatusCode:false});
    const t=String(r.headers()['content-type']||''),bytes=Number(r.headers()['content-length']||0);
    if(r.status()!==200||!t.toLowerCase().includes('image/jpeg')||bytes<1000||bytes>30_000_000)
     throw Error('HEAD '+r.status()+' MIME '+t+' size '+bytes);
    item.totalBytes+=bytes;
    if([0,1,Math.floor(sp.expected/2),sp.expected-2,sp.expected-1].includes(ix))
     item.sampled.push({index:ix,url,bytes,mime:t});
   }catch(e){item.issues.push({index:ix,url,error:String(e).slice(0,160)})}
   }
  }
  await Promise.all(Array.from({length:5},worker));
  item.sampled.sort((a,b)=>a.index-b.index);
  item.allHeadVerified=item.issues.length===0;
  result.reports.push(item);
  console.log('PSE_ANNUAL_EARLY_MEDIA='+JSON.stringify({id:item.id,count:list.length,totalBytes:item.totalBytes,valid:item.allHeadVerified,
   issues:item.issues.slice(0,4),samples:item.sampled}));
 }
 result.status=result.reports.every(x=>x.allHeadVerified)?'ALL_224_SOURCE_IMAGES_VERIFIED':'PARTIAL';
}finally{await mkdir('artifacts/pse-annual-early-media',{recursive:true});
 await writeFile('artifacts/pse-annual-early-media/report.json',JSON.stringify(result,null,2)+'\n');await browser.close()}
console.log('PSE_ANNUAL_EARLY_MEDIA_SUMMARY='+JSON.stringify({status:result.status,reports:result.reports.length,errors:result.errors}));
