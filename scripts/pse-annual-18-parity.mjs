/** PSE annual category inventory: source snapshots, WordPress posts, frontend. No writes. */
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const state=JSON.parse(await readFile('docs/pse-legacy-migration-state.json','utf8'));
const ids=['1667','1625','1578','1546','1511','1412','1386','1353','1307','1259','1188','1092','1043','1042','1041','1000','999','998'];
if(state.schema!=='pse-legacy-article-migration-v1')throw Error('Bad checkpoint');
const env=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,''));
function origin(k){const a=env.filter(x=>x.startsWith(k+'='));if(a.length!==1)throw Error('Missing '+k);const u=new URL(a[0].slice(k.length+1).replace(/^['"]|['"]$/g,''));if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))throw Error('Unsafe '+k);return u.origin}
const cms=origin('WC_URL'),front=origin('WC_URL_CLIENT');
if(!cms.includes('pse.')||!front.includes('pse.'))throw Error('Wrong tenant');
const r={mode:'READ_ONLY',schema:'pse-annual-parity-v1',sourceCount:ids.length,cmsCategory:1758,original:[],cms:[],issues:[],front:null};
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1366,height:900}});
await ctx.route(/\.(?:png|jpe?g|gif|webp|woff2?|ttf)(?:\?.*)?$/i,route=>route.abort());
const page=await ctx.newPage();
async function nav(p,url){let err='';for(let i=0;i<2;i++){try{const x=await p.goto(url,{waitUntil:'domcontentloaded',timeout:37000});if(x?.status()===200)return;err='HTTP '+x?.status()}catch(e){err=String(e).slice(0,180)}}throw Error(url+' '+err)}
async function wp(path){return page.evaluate(async path=>{const x=await fetch(path,{credentials:'same-origin',headers:{Accept:'application/json'}});return {status:x.status,data:await x.json().catch(()=>null)}},path)}
try{
 const archive=await ctx.newPage();
 for(const offset of [0,16]){
  const url='https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-thuong-nien.html'+(offset?'?start='+offset:'');
  try{await nav(archive,url);const found=await archive.evaluate(()=>[...new Set([...document.querySelectorAll('a[href]')].map(a=>{
   const m=a.href.match(/\/quan-he-nha-dau-tu\/bao-cao-thuong-nien\/(\d+)-[^/]+\.html$/);return m?.[1]||null}).filter(Boolean))]);
   r.original.push({offset,http:200,ids:found});}catch(e){r.original.push({offset,error:String(e).slice(0,200)});r.issues.push('SOURCE_ARCHIVE_'+offset)}
 }
 await archive.close();
 await nav(page,cms+'/wp-admin/');
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const t=await page.locator('body').innerText(),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],ans=({'+':a+b,'-':a-b,'x':a*b,'×':a*b,'*':a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error('Login captcha missing');await f.fill(String(ans))}
  await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
 }
 await nav(page,cms+'/wp-admin/post.php?post=248&action=edit');
 if(!await page.locator('#adminmenu').count())throw Error('Admin login missing after navigation');
 const c=await wp('/wp-json/wp/v2/categories/1758?_fields=id,slug,count,parent');
 if(c.status!==200||c.data?.slug!=='bao-cao-thuong-nien')throw Error('CMS annual category mismatch');
 r.cmsCategory=c.data;
 const all=await wp('/wp-json/wp/v2/posts?categories=1758&context=edit&per_page=100&status=publish,draft,pending,private,future&_fields=id,slug,title,status,date,categories');
 if(all.status!==200||!Array.isArray(all.data))throw Error('WP annual listing '+all.status);
 r.cmsList=all.data.map(x=>({id:x.id,slug:x.slug,status:x.status,date:x.date}));
 const workers=2;let next=0;
 async function scan(){const p=await ctx.newPage();try{while(next<ids.length){
  const id=ids[next++],x=state.articles[id];
  if(!x?.source_url?.includes('/bao-cao-thuong-nien/'+id+'-'))throw Error('Wrong source identity '+id);
  const q={id,checkpoint:{status:x.status,reason:x.reason||null,wp_id:x.wp_id||null,annualCategory:x.annual_category_verified||false},source:{},wp:{},gaps:[]};
  if(Number.isSafeInteger(x.wp_id)){
   const z=await wp('/wp-json/wp/v2/posts/'+x.wp_id+'?context=edit&_fields=id,status,slug,title,content,date,categories,pse_seo_title,pse_seo_description,acf');
   if(z.status!==200){q.gaps.push('CMS_GET_'+z.status)}else{
    const v=z.data,h=String(v.content?.raw||v.content?.rendered||''),links=[...h.matchAll(/(?:href|src)=["']([^"']+)["']/gi)].map(m=>m[1]);
    q.wp={id:v.id,slug:v.slug,status:v.status,date:v.date,title:v.title?.raw||v.title?.rendered,categories:v.categories,
     acf:v.acf,seoTitle:v.pse_seo_title||'',seoDescription:v.pse_seo_description||'',
     htmlChars:h.length,images:(h.match(/<img\b/gi)||[]).length,pdfs:links.filter(u=>/\.pdf(?:[?#]|$)/i.test(u)),
     hotlinks:links.filter(u=>/https?:\/\/(?:www\.)?pse\.vn/i.test(u)),
     spam:/getkredit|nunax|sigProId|vtembooklet|free-minigames|embedded image gallery/i.test(h)};
    if(v.status!=='publish')q.gaps.push('UNPUBLISHED');
    if(!v.categories?.includes(1758))q.gaps.push('WRONG_CATEGORY');
    if(v.acf?.action!=='PostDetails'||v.acf?.key!=='ssr-post')q.gaps.push('WRONG_ACF');
    if(q.wp.spam)q.gaps.push('SPAM');
    if(q.wp.hotlinks.length)q.gaps.push('HOTLINKS');
   }
  }else q.gaps.push('MISSING_POST');
  try{await nav(p,x.source_url);const data=await p.evaluate(()=>{
   const root=document.querySelector('[itemprop="articleBody"]')||document.querySelector('.item-page');
   return {title:document.title,metaDescription:document.querySelector('meta[name="description" i]')?.content||null,
    text:(root?.textContent||'').replace(/\s+/g,' ').trim().slice(0,180),
    images:[...(root?.querySelectorAll('img[src]')||[])].map(el=>new URL(el.getAttribute('src'),location.href).href),
    docs:[...(root?.querySelectorAll('a[href]')||[])].map(a=>({url:new URL(a.getAttribute('href'),location.href).href,label:(a.textContent||'').trim()})).filter(v=>/\.pdf(?:\?|$)/i.test(v.url))};
  });
   q.source={http:200,title:data.title,metaDescription:data.metaDescription,text:data.text,images:data.images.length,
    pdfs:data.docs,firstImage:data.images[0]||null,lastImage:data.images.at(-1)||null};
   const mandatory=[...data.images,...data.docs.map(x=>x.url)];
   const missing=mandatory.filter(u=>!state.media?.[u]);
   q.source.unmappedCount=missing.length;q.source.unmappedSamples=missing.slice(0,3);
   if(q.wp.status==='publish'){
    if(data.images.length>=10&&q.wp.images<Math.min(5,data.images.length))q.gaps.push('BOOKLET_IMAGES_MISSING');
    for(const d of data.docs){const mapped=state.media?.[d.url]?.url;if(mapped&&!q.wp.pdfs.some(u=>u.includes(mapped)))q.gaps.push('PDF_MISSING')}
    if(data.title&&!q.wp.seoTitle)q.gaps.push('SEO_TITLE_MISSING');
   }
  }catch(e){q.source={error:String(e).slice(0,190)};q.gaps.push('SOURCE_UNAVAILABLE')}
  r.cms.push(q);console.log('PSE_ANNUAL_ITEM='+JSON.stringify({id,checkpoint:q.checkpoint,wp:q.wp,source:q.source,gaps:q.gaps}));
  }}finally{await p.close()}}
 await Promise.all(Array.from({length:workers},()=>scan()));
 try{const p=await ctx.newPage();await nav(p,front+'/tin-tuc-su-kien/bao-cao-thuong-nien');
  r.front=await p.evaluate(()=>({http:200,title:document.title,h1:[...document.querySelectorAll('h1')].map(x=>x.textContent.trim()),
   links:[...new Set([...document.querySelectorAll('a[href]')].filter(a=>a.href.includes('/bao-cao-thuong-nien-')).map(a=>a.href))]}));await p.close();
 }catch(e){r.front={error:String(e).slice(0,200)};r.issues.push('PUBLIC_UNAVAILABLE')}
 r.cms.sort((a,b)=>ids.indexOf(a.id)-ids.indexOf(b.id));
 const missing=r.cms.filter(x=>x.gaps.length).map(x=>({id:x.id,gaps:x.gaps}));
 r.summary={cmsItems:r.cmsList.length,sourceArchiveIds:[...new Set(r.original.flatMap(x=>x.ids||[]))].length,
  currentPublished:r.cms.filter(x=>x.wp.status==='publish').length,missing,issues:r.issues};
 console.log('PSE_ANNUAL_PARITY='+JSON.stringify(r.summary));
}finally{await mkdir('artifacts/pse-annual-parity',{recursive:true});
 await writeFile('artifacts/pse-annual-parity/report.json',JSON.stringify(r,null,2)+'\n');await browser.close()}
