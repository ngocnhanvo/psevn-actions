/** Verify both live historical Pages against pinned originals before native exact 301 writes. */
import {chromium,request} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const ev=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
if(process.env.GITHUB_REPOSITORY!=='ngocnhanvo/psevn-actions'||process.env.GITHUB_REF!=='refs/heads/main'||!['cms(pse): redirect two verified historical Kali pages','cms(pse): redirect verified historical Kali 1425 page'].includes(ev.head_commit?.message)||process.env.PSE_KALI_FRESH_BACKUP!=='yes')throw Error('Write scope denied');
const wp='https://admin-pse.webnvn.com',front='https://pse.webnvn.com',sha=b=>createHash('sha256').update(b).digest('hex');
for(const [k,v] of [['WC_URL',wp],['WC_URL_CLIENT',front]]){const a=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,'')).filter(x=>x.startsWith(k+'='));if(a.length!==1||new URL(a[0].slice(k.length+1).replace(/^['"]|['"]$/g,'')).origin!==v)throw Error('Origin mismatch '+k)}
const original=JSON.parse(await readFile('inputs/source/report.json','utf8')),applied=JSON.parse(await readFile('inputs/applied/report.json','utf8'));
const ids=ev.head_commit?.message==='cms(pse): redirect verified historical Kali 1425 page'?[1425]:[1425,1426],expected={1425:'kali-phu-my-bot-canada-mo-ta-va-hdsd',1426:'kali-phu-my-mo-ta-cac-bien-the'};
if(!original.readOnly||!original.noCmsWrites||!applied.pass||!applied.noProductWrites||!applied.noCategoryWrites||applied.pages.length!==ids.length)throw Error('Pinned proof invalid');
const plans=[];
for(const id of ids){
 const r=original.rows.find(x=>x.id===id),p=applied.pages.find(x=>x.sourceId===id),d=JSON.parse(await readFile('inputs/source/source-'+id+'.json','utf8'));
 if(!r?.ready||!p||p.slug!==expected[id]||r.slug!==p.slug||p.bodySha!==r.fullBodySha||sha(d.full)!==r.fullBodySha||p.tables!==d.tables.length||JSON.stringify(p.images.map(x=>x.sha256))!==JSON.stringify(r.images.map(x=>x.sha256)))throw Error('Source/application mismatch '+id);
 const from=new URL(r.manifest).pathname;
 if(!from.startsWith('/hoat-dong-kinh-doanh/san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my/8-trang-chu/'+id+'-')||from!==new URL(r.source).pathname)throw Error('Unexpected original path');
 plans.push({id,from,to:'/'+p.slug,p,d});
}
const out='artifacts/pse-kali-two-historical-native-redirects';await mkdir(out,{recursive:true});
const report={pass:false,live:[],writes:[],redirects:[],noProductWrites:true,noCategoryWrites:true,noPageWrites:true};
const save=()=>writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
const b=await chromium.launch({headless:true}),net=await request.newContext({timeout:45000});
const norm=x=>String(x||'').normalize('NFKC').replace(/\s+/g,' ').trim(),compact=x=>norm(x).replace(/\s+/g,'');
try{
 for(const plan of plans){
  const {id,p,d,to}=plan;
  const native=await net.get(wp+'/wp-json/wp/v2/pages/'+p.pageId+'?_fields=id,slug,status,acf,featured_media');
  const data=await native.json();
  if(native.status()!==200||data.id!==p.pageId||data.slug!==p.slug||data.status!=='publish'||data.acf?.action!=='PublicPage'||data.acf?.key!=='pse-historical-kali-'+id||data.featured_media!==p.images[0].id)throw Error('Native Page identity changed '+id);
  const sources=[];
  for(const m of p.images){
   const u=new URL(m.url);
   if(u.origin!==wp||!u.pathname.startsWith('/wp-content/uploads/')||!u.pathname.endsWith('.png')||u.search||u.hash)throw Error('Invalid source Media');
   const raw=await net.get(m.url,{maxRedirects:0,failOnStatusCode:false}),proxy=await net.get(front+'/api/files'+u.pathname,{maxRedirects:0,failOnStatusCode:false});
   const bytes=await raw.body(),copy=await proxy.body();
   if(raw.status()!==200||proxy.status()!==200||sha(bytes)!==m.sha256||sha(copy)!==m.sha256)throw Error('Native or same-origin exact original bytes changed '+id);
   sources.push({path:u.pathname,bytes,hash:m.sha256});
  }
  for(const width of [1366,390]){
   const ctx=await b.newContext({viewport:{width,height:860},isMobile:width===390,deviceScaleFactor:1}),page=await ctx.newPage(),adminRequests=[];
   page.on('request',r=>{try{if(new URL(r.url()).origin===wp)adminRequests.push(r.url())}catch{}});
   const response=await page.goto(front+to,{waitUntil:'domcontentloaded',timeout:60000});
   if(response?.status()!==200||page.url()!==front+to||await page.locator('link[rel=canonical]').getAttribute('href')!==front+to)throw Error('Live canonical unavailable '+id);
   const root=page.locator('.pse-historical-kali-'+id);
   if(await root.count()!==1||await root.locator('img').count()!==sources.length)throw Error('Live content/image count mismatch '+id);
   const result=await root.evaluate(el=>({text:el.textContent,tables:[...el.querySelectorAll('table')].map(t=>[...t.rows].map(r=>[...r.cells].map(c=>c.textContent))),links:[...el.querySelectorAll('a[href]')].map(a=>a.href),overflow:document.documentElement.scrollWidth-innerWidth}));
   // Owner has since superseded only #1678's old Page link with native Woo Product80938.
   // Pinned #1425 source proof remains immutable; validate this single authorized
   // link change exactly, and require every other source-proven link unchanged.
   const owner1678='/hoat-dong-kinh-doanh/san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my/8-trang-chu/1678-kali-phu-my-mo-ta-va-hdsd.html';
   const ownerOld=front+'/kali-phu-my-mo-ta-va-hdsd';
   const ownerTarget=front+'/san-pham/kali-phu-my-mieng-mop-1427';
   if(id===1425&&p.links.filter(l=>l.from===owner1678&&l.to===ownerOld).length!==1)
    throw Error('Pinned old owner 1678 reference changed');
   const expectedLinks=p.links.map(l=>id===1425&&l.from===owner1678&&l.to===ownerOld?ownerTarget:l.to);
   if(compact(result.text)!==compact(d.full)||JSON.stringify(result.tables.map(t=>t.map(r=>r.map(compact))))!==JSON.stringify(d.tables.map(t=>t.map(r=>r.map(compact))))||result.overflow>5||expectedLinks.some(l=>!result.links.includes(l))||result.links.includes(ownerOld))throw Error('Live body/table/link/overflow mismatch '+id+' '+width);
   const images=[];
   for(let i=0;i<sources.length;i++){
    const el=root.locator('img').nth(i),o=sources[i];
    await el.scrollIntoViewIfNeeded();await el.evaluate(e=>e.decode());
    const img=new URL(await el.evaluate(e=>e.currentSrc||e.src));
    if(img.origin!==front)throw Error('Foreign live image origin');
    const match=img.pathname.match(/^\/api\/images\/(40|150|300|480|640|768|1024|1536|2560)\/png(\/wp-content\/uploads\/.+\.webp)$/);
    const runtime=match&&match[2]===o.path.replace(/\.png$/,'.webp');
    const proxyPath='/api/files'+o.path;
    if(!runtime&&img.pathname!==proxyPath)throw Error('Live image path not source-derived '+img.pathname);
    const raw=await ctx.request.get(img.href,{maxRedirects:0,failOnStatusCode:false}),bytes=await raw.body();
    if(raw.status()!==200)throw Error('Live image HTTP '+raw.status());
    if(sha(bytes)===o.hash){images.push({sha:o.hash,mode:'exact'});continue}
    if(!runtime||bytes.subarray(0,4).toString()!=='RIFF'||bytes.subarray(8,12).toString()!=='WEBP')throw Error('Unexpected image rendition');
    const metrics=await page.evaluate(async({a,b})=>{
     const decode=async s=>{const i=new Image();i.src=s;await i.decode();return i};
     const x=await decode('data:image/png;base64,'+a),y=await decode('data:image/webp;base64,'+b);
     const pixels=i=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,64,64);g.drawImage(i,0,0,64,64);return g.getImageData(0,0,64,64).data};
     const u=pixels(x),v=pixels(y);let sum=0,sq=0,n=0;for(let j=0;j<u.length;j++){if(j%4===3)continue;const z=Math.abs(u[j]-v[j]);sum+=z;sq+=z*z;n++}
     return {width:y.naturalWidth,height:y.naturalHeight,mae:sum/n,rmse:Math.sqrt(sq/n),aspectError:Math.abs(x.naturalWidth/x.naturalHeight-y.naturalWidth/y.naturalHeight)};
    },{a:o.bytes.toString('base64'),b:bytes.toString('base64')});
    if(metrics.width<40||metrics.width>Number(match[1])||metrics.aspectError>0.025||metrics.mae>8||metrics.rmse>18)throw Error('Live WebP mismatch '+id+' '+JSON.stringify(metrics));
    images.push({sha:o.hash,mode:'verified-responsive-webp',...metrics});
   }
   if(adminRequests.length)throw Error('Admin-origin frontend requests '+id);
   await page.screenshot({path:out+'/'+id+'-'+width+'.png',fullPage:true,timeout:45000});
   report.live.push({id,width,http:200,canonical:front+to,tables:d.tables.length,images,overflow:result.overflow});await save();await ctx.close();
  }
 }
 const ctx=await b.newContext(),admin=await ctx.newPage();
 await admin.goto(wp+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await admin.locator('#user_login').count()){
  if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error('Missing credentials');
  await admin.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);await admin.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
  const m=(await admin.locator('#loginform').innerText()).match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i);
  if(m){const a=+m[1],b=+m[3],v=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];const f=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();if(!await f.count())throw Error('Login challenge');await f.fill(String(v))}
  await admin.locator('#wp-submit').click();
 }
 await admin.goto(wp+'/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
 if(admin.url().includes('wp-login')||!await admin.locator('#adminmenu').count())throw Error('No WP session');
 const nonce=await admin.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});if(!r.ok)throw Error('REST nonce unavailable');return(await r.text()).trim()});
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error('Bad nonce');
 const api=async(path,method='GET',body)=>{const r=await ctx.request.fetch(wp+'/wp-json/wp/v2/'+path,{method,headers:{'X-WP-Nonce':nonce,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{data:body}:{})});return {http:r.status(),pages:Number(r.headers()['x-wp-totalpages']||1),data:await r.json().catch(()=>null)}};
 const registry=[];
 for(let i=1;i<=40;i++){const r=await api('chuyen-huong-link?context=edit&status=any&per_page=100&page='+i+'&orderby=id&order=asc&_fields=id,status,acf');if(r.http!==200||!Array.isArray(r.data)||r.pages<1||r.pages>40)throw Error('Incomplete redirect registry');registry.push(...r.data);if(i===r.pages)break}
 const matches=(x,p)=>x.acf?.from_link===p.from&&x.acf?.to_link===p.to&&String(x.acf?.type)==='301'&&x.acf?.match_type==='Exact'&&x.acf?.enable===true;
 for(const p of plans){
  const prior=registry.filter(x=>x.acf?.from_link===p.from);
  if(prior.length>1||prior.some(x=>!matches(x,p)))throw Error('Conflicting redirect '+p.id);
  p.existing=prior[0]||null;
  // Refuse to replace a different published destination from another router.
  const current=await net.get(front+p.from,{maxRedirects:0,failOnStatusCode:false,timeout:45000});
  const code=current.status();
  const location=current.headers().location?new URL(current.headers().location,front).href:null;
  if(code!==404&&!(code===301&&location===front+p.to))
   throw Error('Existing public original URL routing conflict '+p.id+' HTTP '+code);
 }
 await writeFile(out+'/rollback.json',JSON.stringify(plans.map(({id,from,to,existing})=>({id,from,to,existing})),null,2)+'\n');
 for(const p of plans){
  let id=p.existing?.id;if(!id){const r=await api('chuyen-huong-link','POST',{status:'draft',title:'PSE: Kali Phú Mỹ - bài gốc '+p.id,acf:{from_link:p.from,to_link:p.to,type:'301',match_type:'Exact',enable:true}});if(r.http!==201||!Number.isSafeInteger(r.data?.id))throw Error('Redirect draft failed '+p.id);id=r.data.id;report.writes.push({kind:'redirect-draft',id,sourceId:p.id});await save()}
  const check=async()=>{const r=await api('chuyen-huong-link/'+id+'?context=edit&_fields=id,status,acf');if(r.http!==200||!matches(r.data,p))throw Error('Redirect readback failed '+p.id);return r.data.status};
  if(await check()!=='publish'){const r=await api('chuyen-huong-link/'+id,'POST',{status:'publish'});if(r.http!==200||await check()!=='publish')throw Error('Redirect publish failed '+p.id);report.writes.push({kind:'redirect-publish',id,sourceId:p.id});await save()}
  report.redirects.push({sourceId:p.id,redirectId:id,from:p.from,to:p.to});await save();
 }
 report.pass=true;console.log('PSE_KALI_TWO_REDIRECT_PASS='+JSON.stringify(report));
}finally{await save();await net.dispose();await b.close()}
