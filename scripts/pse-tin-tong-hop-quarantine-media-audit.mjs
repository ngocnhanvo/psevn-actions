/** Source and existing WP check for remaining Tin tong hop media blockers. READ ONLY. */
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const ids=['1363','1090','382','240','237','229','227','226','205','204','202','198','196','186'];
const state=JSON.parse(await readFile('docs/pse-legacy-migration-state.json','utf8'));
if(state.schema!=='pse-legacy-article-migration-v1'||!state.backup_verified||state.tracker_issue!==3)throw Error('Unsafe checkpoint');
const env=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,'')).filter(x=>x.startsWith('WC_URL='));
if(env.length!==1)throw Error('Missing unique WordPress origin');
const u=new URL(env[0].slice(7).replace(/^['"]|['"]$/g,''));
if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port||!['','/'].includes(u.pathname))throw Error('Unsafe WordPress origin');
const wp=u.origin;
const root='artifacts/pse-tin-tong-hop-media-blockers';
await mkdir(root,{recursive:true});
const report={schema:'pse-tin-tong-hop-media-blockers-v1',mode:'read-only',rows:[],status:'STARTED',errors:[]};
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1366,height:860}});
await ctx.route(/\.(woff2?|ttf)(?:[?#]|$)/i,r=>r.abort());
const page=await ctx.newPage();
const normalize=v=>String(v||'').replace(/\s+/g,' ').trim();
function suffix(url){try{const u=new URL(url);return u.pathname.split('/').at(-1)||''}catch{return ''}}
async function probeAsset(url){
 try{
   const r=await ctx.request.head(url,{timeout:12000,failOnStatusCode:false});
   return {status:r.status(),type:r.headers()['content-type']||'',bytes:Number(r.headers()['content-length'])||null};
 }catch(e){return {error:String(e?.message||e).slice(0,160)}}
}
try{
 for(const id of ids){
  const row=state.articles[id];
  if(row?.status!=='quarantined'||!row.source_url?.startsWith('https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/'+id+'-'))
    throw Error('Source status/path drift '+id);
  let source={};
  for(let attempt=0;attempt<2;attempt++){
   try{
    const res=await page.goto(row.source_url,{waitUntil:'domcontentloaded',timeout:40000});
    source=await page.evaluate(()=>{
      const el=document.querySelector('[itemprop="articleBody"]')||document.querySelector('.item-page');
      const assets=[...el?.querySelectorAll('img[src],a[href]')||[]].map(e=>{
        const kind=e.tagName==='IMG'?'image':'link';
        return {kind,url:new URL(e.getAttribute(kind==='image'?'src':'href'),location.href).href,
          alt:e.getAttribute('alt')||'',label:(e.textContent||'').trim().slice(0,80)};
      }).filter(v=>/\.(?:png|jpe?g|gif|webp|pdf|docx?|xlsx?)(?:[?#]|$)/i.test(v.url));
      return {title:document.title.replace(/\s+-\s+PSE\.VN.*$/i,''),text:el?.textContent||'',assets};
    });
    source.http=res?.status()||0;break;
   }catch(e){source={error:String(e?.message||e).slice(0,180)}}
  }
  const media=[...new Map((source.assets||[]).map(x=>[x.url,x])).values()].slice(0,15);
  const statuses=[];
  for(const a of media.slice(0,6))statuses.push({kind:a.kind,url:a.url,alt:a.alt,...await probeAsset(a.url)});
  const slug=/\/\d+-([^/]+)\.html$/i.exec(row.source_url)?.[1];
  const q=await ctx.request.get(wp+'/wp-json/wp/v2/posts?slug='+encodeURIComponent(slug||'')+
    '&per_page=100&_fields=id,slug,status,title,categories,date',{timeout:30000,failOnStatusCode:false});
  const wpRows=q.ok()?await q.json():[];
  report.rows.push({id,reason:row.reason,sourceUrl:row.source_url,sourceHttp:source.http||0,
    sourceTitle:normalize(source.title||''),sourceTextLength:normalize(source.text||'').length,
    assets:statuses,wpRows:Array.isArray(wpRows)?wpRows.map(p=>({id:p.id,slug:p.slug,categories:p.categories,date:p.date})):[],
    sourceError:source.error||null});
  console.log('PSE_TIN_TONG_HOP_MEDIA_BLOCKER='+JSON.stringify({id,reason:row.reason,
    sourceHttp:source.http||0,sourceError:source.error||null,assets:statuses.map(x=>({kind:x.kind,filename:suffix(x.url),host:new URL(x.url).hostname,status:x.status,error:x.error||null})),
    matchingWp:report.rows.at(-1).wpRows.map(p=>p.id)}));
 }
 report.status='PASS_READ_ONLY';console.log('PSE_TIN_TONG_HOP_MEDIA_BLOCKERS=PASS; inspected='+report.rows.length);
}catch(e){report.errors.push(String(e?.message||e));report.status='FAIL';console.error('PSE_TIN_TONG_HOP_MEDIA_BLOCKERS_ERROR='+report.errors.at(-1));throw e}
finally{await writeFile(root+'/report.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
