/** Pinned HTML link inspection, read only. */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium,request} from 'playwright';
if(process.env.GITHUB_REPOSITORY!=='ngocnhanvo/psevn-actions')throw Error('Wrong repo');
const src='https://pse.vn',out='artifacts/pse-kali-two-link-proof',sha=s=>createHash('sha256').update(s).digest('hex');
const report={readOnly:true,rows:[],aliasProof:[]};await mkdir(out,{recursive:true});
const save=()=>writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
const original=JSON.parse(await readFile('inputs/source/report.json','utf8'));
const net=await request.newContext({timeout:25000}),b=await chromium.launch({headless:true}),ctx=await b.newContext({javaScriptEnabled:false});await ctx.route('**/*',r=>r.abort());const page=await ctx.newPage();
try{
 for(const id of [1425,1426]){
  const d=JSON.parse(await readFile('inputs/source/source-'+id+'.json','utf8')),r=original.rows.find(x=>x.id===id);
  if(!r?.ready||sha(d.full)!==r.fullBodySha)throw Error('Source pin mismatch');
  report.rows.push({id,links:d.links});
  console.log('PSE_KALI_SOURCE_LINKS='+JSON.stringify({id,links:d.links}));
 }
 const paths=[...new Set(report.rows.flatMap(r=>r.links.map(l=>l.url)))];
 for(const raw of paths){
  const u=new URL(raw);
  if(!['pse.vn','www.pse.vn'].includes(u.hostname)||u.search||u.hash)continue;
  const m=u.pathname.match(/^\/hoat-dong-kinh-doanh\/san-pham\/nhom-phan-don-va-phan-phuc-hop-phu-my\/8-trang-chu\/(1668|1669|1676|1677|1678)-[^/]+\.html$/);
  if(!m)continue;
  const alt=u.pathname.replace('/nhom-phan-don-va-phan-phuc-hop-phu-my/','/dam-phu-my/');
  const a={id:Number(m[1]),from:u.pathname,context:alt,equal:false};report.aliasProof.push(a);
  try{
   async function content(path){
    const r=await net.get(src+path,{maxRedirects:0,failOnStatusCode:false});
    if([403,429,503].includes(r.status()))throw Error('Rate/access guard '+r.status());
    if(r.status()!==200)return {http:r.status()};
    await page.setContent((await r.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{waitUntil:'domcontentloaded'});
    const d=await page.evaluate(()=>{const root=document.querySelector('.item-page [itemprop=articleBody]'),n=x=>String(x||'').normalize('NFKC').replace(/\s+/g,' ').trim();if(!root)throw Error('Source body absent');const core=root.cloneNode(true);core.querySelectorAll('.extranews_box,.extranews_separator').forEach(x=>x.remove());return {title:n(document.querySelector('.item-page h1,.item-page h2,h1')?.textContent),body:n(core.textContent),images:[...core.querySelectorAll('img[src]')].map(x=>x.getAttribute('src')),tables:[...core.querySelectorAll('table')].map(t=>[...t.rows].map(r=>[...r.cells].map(x=>n(x.textContent))))}});
    return {http:200,title:d.title,hash:sha(d.body),structure:sha(JSON.stringify([d.images,d.tables])),chars:d.body.length};
   }
   a.left=await content(u.pathname);a.right=await content(alt);a.equal=a.left.http===200&&a.right.http===200&&a.left.chars>100&&a.left.title===a.right.title&&a.left.hash===a.right.hash&&a.left.structure===a.right.structure;
   console.log('PSE_KALI_CONTEXT_ALIAS='+JSON.stringify(a));await save();
  }catch(e){a.error=String(e).slice(0,300);console.log('PSE_KALI_CONTEXT_STOP='+a.error);break}
 }
}finally{await save();await b.close();await net.dispose()}
