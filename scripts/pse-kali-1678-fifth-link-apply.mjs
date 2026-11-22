/** Source-backed final Kali link repair. Live Page must pass independent QA before any CMS write. */
import {chromium,request} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const ev=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
if(process.env.GITHUB_REPOSITORY!=='ngocnhanvo/psevn-actions'||process.env.GITHUB_REF!=='refs/heads/main'||ev.head_commit?.message!=='cms(pse): repair fifth Dam Phu My related link'||process.env.PSE_KALI_FRESH_BACKUP!=='yes')throw Error('Write scope denied');
const wp='https://admin-pse.webnvn.com',front='https://pse.webnvn.com',cat='/san-pham/dam-phu-my',to='/kali-phu-my-mo-ta-va-hdsd',from='/hoat-dong-kinh-doanh/san-pham/dam-phu-my/8-trang-chu/1678-kali-phu-my-mo-ta-va-hdsd.html',source='https://pse.vn'+from;
const sha=b=>createHash('sha256').update(b).digest('hex'),bodySha='21ff53b4019c5349a0d010ca5fc8b0b9ce7600097ac9ce4c2620dfdfc83e3a53',imageSha='58c823c48ee04c595116945f7bf11bb7b6aae3dbe5d22446195659f726294cee';
const proof=JSON.parse(await readFile('inputs/kali/report.json','utf8')),applied=JSON.parse(await readFile('inputs/page/report.json','utf8'));
if(!proof.ready||proof.source!==source||sha(proof.original.text)!==bodySha||proof.sourceImage.sha256!==imageSha||!applied.pass||applied.sourceId!==1678||applied.page?.id!==83524||applied.media?.id!==83523||applied.media.sha256!==imageSha)throw Error('Pinned source and apply proof failed');
const originalFour=JSON.parse(await readFile('inputs/dam/report.json','utf8'));
if(originalFour.schema!=='pse-dam-related-links-audit-v1'||originalFour.cms?.id!==1763||originalFour.cms?.tables!==10)throw Error('Original audit mismatch');
const four=[[1668,'/san-pham/dam-phu-my-chuyen-dung-cho-drone-1668'],[1669,'/san-pham/dam-phu-my-chuyen-dung-cho-nong-lam-truong-1669'],[1676,'/san-pham/sa-phu-my-1682'],[1677,'/san-pham/dap-phu-my-1677']];
const env=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,''));
for(const [k,v] of [['WC_URL',wp],['WC_URL_CLIENT',front]]){const a=env.filter(x=>x.startsWith(k+'='));if(a.length!==1||new URL(a[0].slice(k.length+1).replace(/^['"]|['"]$/g,'')).origin!==v)throw Error('Origin mismatch '+k)}
const out='artifacts/pse-kali-1678-fifth-link';await mkdir(out,{recursive:true});
const report={sourceId:1678,from,to,pageId:83524,mediaId:83523,categoryId:1763,writes:[],live:[],pass:false,noProductWrites:true};
const save=()=>writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
const net=await request.newContext({timeout:45000}),b=await chromium.launch({headless:true});
const compact=s=>String(s||'').replace(/\s+/g,'');
const expectedTables=proof.original.tables.map(t=>t.rows.map(r=>r.map(compact)));
const verifyTables=t=>JSON.stringify(t.map(x=>x.map(r=>r.map(compact))))===JSON.stringify(expectedTables);
try{
 const sr=await net.get(source,{maxRedirects:0,failOnStatusCode:false});if(sr.status()!==200)throw Error('Source unavailable');
 const parserCtx=await b.newContext({javaScriptEnabled:false});await parserCtx.route('**/*',r=>r.abort());const parser=await parserCtx.newPage();
 await parser.setContent('<base href="'+source+'">'+(await sr.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{waitUntil:'domcontentloaded'});
 const fresh=await parser.evaluate(()=>{const n=s=>String(s||'').replace(/\s+/g,' ').trim(),root=document.querySelector('.item-page [itemprop=articleBody]');if(!root)throw Error('Source root absent');return {text:n(root.textContent),tables:[...root.querySelectorAll('table')].map(t=>[...t.rows].map(r=>[...r.cells].map(c=>n(c.textContent))))}});
 if(sha(fresh.text)!==bodySha||!verifyTables(fresh.tables))throw Error('Original source body changed');
 await parserCtx.close();
 const mr=await net.get(applied.media.url,{maxRedirects:0,failOnStatusCode:false});
 if(mr.status()!==200||sha(await mr.body())!==imageSha)throw Error('Exact native image bytes no longer match');
 const pub=await net.get(wp+'/wp-json/wp/v2/pages/83524?_fields=id,slug,status,acf,featured_media,content');const data=await pub.json();
 if(pub.status()!==200||data.id!==83524||data.slug!==to.slice(1)||data.status!=='publish'||data.acf?.action!=='PublicPage'||data.acf?.key!=='pse-historical-kali-1678'||data.featured_media!==83523)throw Error('Published native Page identity mismatch');
 // Independent production QA. No writes until both viewports pass.
 for(const width of [1366,390]){
  const c=await b.newContext({viewport:{width,height:860},isMobile:width===390,deviceScaleFactor:1}),p=await c.newPage(),adminRequests=[];
  p.on('request',r=>{try{if(new URL(r.url()).origin===wp)adminRequests.push(r.url())}catch{}});
  const r=await p.goto(front+to,{waitUntil:'domcontentloaded',timeout:60000});
  if(r?.status()!==200||p.url()!==front+to)throw Error('Live Kali Page not deployed HTTP '+r?.status());
  const canonical=await p.locator('link[rel=canonical]').getAttribute('href');
  if(canonical!==front+to)throw Error('Kali canonical mismatch');
  const root=p.locator('.pse-historical-kali-1678');
  if(await root.count()!==1)throw Error('Live native content root absent');
  await root.locator('img').first().scrollIntoViewIfNeeded();
  await root.locator('img').first().evaluate(el=>el.decode());
  const result=await root.evaluate(root=>({text:root.textContent,tables:[...root.querySelectorAll('table')].map(t=>[...t.rows].map(r=>[...r.cells].map(c=>c.textContent))),images:[...root.querySelectorAll('img')].map(i=>({src:i.currentSrc||i.src,width:i.naturalWidth,height:i.naturalHeight})),links:[...root.querySelectorAll('a[href]')].map(a=>a.href),overflow:document.documentElement.scrollWidth-window.innerWidth}));
  if(compact(result.text)!==compact(proof.original.text)||!verifyTables(result.tables)||result.images.length!==1||result.images[0].width<1||result.images[0].height<1||result.overflow>5||adminRequests.length)throw Error('Live Kali content/visual mismatch width '+width+' '+JSON.stringify({tables:result.tables.length,images:result.images,overflow:result.overflow,adminRequests:adminRequests.length,textMatches:compact(result.text)===compact(proof.original.text)}));
  const img=new URL(result.images[0].src);
  if(img.origin!==front||!img.pathname.includes('pse-kali-1678-58c823c48ee0'))throw Error('Live image source identity mismatch');
  const bytes=await c.request.get(img.href,{maxRedirects:0,failOnStatusCode:false});
  if(bytes.status()!==200||sha(await bytes.body())!==imageSha)throw Error('Live original image byte mismatch');
  for(const target of [...four.map(x=>x[1]),cat])if(!result.links.includes(front+target))throw Error('Live historical crosslink missing '+target);
  await p.screenshot({path:out+'/kali-'+width+'.png',fullPage:true,timeout:45000});
  report.live.push({width,http:200,canonical,tables:2,decoded:true,imageSha,overflow:result.overflow});await save();await c.close();
 }
 const ctx=await b.newContext(),admin=await ctx.newPage();
 await admin.goto(wp+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await admin.locator('#user_login').count()){
  if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error('Missing WP credentials');
  await admin.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);await admin.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
  const m=(await admin.locator('#loginform').innerText()).match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i);
  if(m){const a=+m[1],b=+m[3],v=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];const f=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();if(!await f.count())throw Error('Unknown login challenge');await f.fill(String(v))}
  await admin.locator('#wp-submit').click();
 }
 await admin.goto(wp+'/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
 if(admin.url().includes('wp-login')||!await admin.locator('#adminmenu').count())throw Error('Admin session unavailable');
 const nonce=await admin.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});if(!r.ok)throw Error('REST nonce unavailable');return(await r.text()).trim()});
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error('Bad REST nonce');
 const api=async(path,method='GET',body)=>{const r=await ctx.request.fetch(wp+'/wp-json/wp/v2/'+path,{method,headers:{'X-WP-Nonce':nonce,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{data:body}:{})});return {http:r.status(),pages:Number(r.headers()['x-wp-totalpages']||1),data:await r.json().catch(()=>null)}};
 const uri='product_cat/1763',fields='?context=edit&_fields=id,slug,parent,count,description,meta',key='_vcs_category_rich_description';
 const before=await api(uri+fields);const raw=before.data?.meta?.[key];
 if(before.http!==200||before.data.id!==1763||before.data.slug!=='dam-phu-my'||before.data.parent!==1760||before.data.count!==4||typeof raw!=='string'||(raw.match(/<table\b/gi)||[]).length!==10)throw Error('Category identity changed');
 const count=(s,v)=>s.split(v).length-1;
 for(const [id,target] of four){const old=originalFour.rows.find(r=>r.id===id)?.sourceLink?.href;if(!old||count(raw,old)!==0||count(raw,target)!==1)throw Error('Prior verified link regressed '+id)}
 if(count(raw,from)!==1||count(raw,to)!==0)throw Error('Fifth old href not unique; inspect partial state');
 const updated=raw.replace(from,to);
 if(updated.replace(to,from)!==raw)throw Error('Unexpected content change');
 const inventory=[];
 for(let i=1;i<=40;i++){const r=await api('chuyen-huong-link?context=edit&status=any&per_page=100&page='+i+'&orderby=id&order=asc&_fields=id,status,acf');if(r.http!==200||!Array.isArray(r.data)||r.pages<1||r.pages>40)throw Error('Redirect inventory incomplete');inventory.push(...r.data);if(i===r.pages)break}
 const previous=inventory.filter(r=>r.acf?.from_link===from);
 if(previous.length>1||previous.some(r=>r.acf.to_link!==to||String(r.acf.type)!=='301'||r.acf.match_type!=='Exact'||r.acf.enable!==true))throw Error('Conflicting redirect');
 await writeFile(out+'/rollback.json',JSON.stringify({categoryId:1763,originalHtml:raw,previous},null,2)+'\n');
 let id=previous[0]?.id;
 if(!id){const r=await api('chuyen-huong-link','POST',{status:'draft',title:'PSE: Kali Phú Mỹ - bài gốc 1678',acf:{from_link:from,to_link:to,type:'301',match_type:'Exact',enable:true}});if(r.http!==201||!Number.isSafeInteger(r.data?.id))throw Error('Redirect draft failed '+r.http);id=r.data.id;report.writes.push({kind:'redirect-draft',id});await save()}
 const check=async()=>{const r=await api('chuyen-huong-link/'+id+'?context=edit&_fields=id,status,acf');if(r.http!==200||r.data.acf?.from_link!==from||r.data.acf?.to_link!==to||String(r.data.acf?.type)!=='301'||r.data.acf?.match_type!=='Exact'||r.data.acf?.enable!==true)throw Error('Exact redirect readback mismatch');return r.data.status};
 if(await check()!=='publish'){const r=await api('chuyen-huong-link/'+id,'POST',{status:'publish'});if(r.http!==200||await check()!=='publish')throw Error('Redirect publish failed');report.writes.push({kind:'redirect-publish',id});await save()}
 const latest=await api(uri+fields);if(latest.http!==200||latest.data.meta?.[key]!==raw)throw Error('Concurrent category edit');
 const write=await api(uri,'POST',{meta:{[key]:updated}});if(write.http!==200)throw Error('Category update failed '+write.http);
 report.writes.push({kind:'category-meta',id:1763});await save();
 const after=await api(uri+fields);if(after.http!==200||after.data.meta?.[key]!==updated||after.data.count!==4||after.data.description!==before.data.description)throw Error('Category readback failed');
 const rr=await net.get(wp+'/wp-json/astro/v1/get-product-categories');const cc=(await rr.json()).find(x=>x.id===1763);
 if(rr.status()!==200||!cc||(cc.description.match(/<table\b/gi)||[]).length!==10||count(cc.description,from)||count(cc.description,to)!==1||four.some(([,t])=>count(cc.description,t)!==1))throw Error('Public category API mismatch');
 report.redirectId=id;report.pass=true;console.log('PSE_KALI_FIFTH_LINK_PASS='+JSON.stringify({pageId:83524,categoryId:1763,redirectId:id,from,to,live:report.live,tables:10,relatedLinks:5,noProductWrites:true}));
}finally{await save();await net.dispose();await b.close()}
