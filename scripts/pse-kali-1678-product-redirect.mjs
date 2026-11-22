/** Owner explicitly supersedes historical Page with existing native Product 80938. */
import {chromium,request} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const ev=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
if(process.env.GITHUB_REPOSITORY!=='ngocnhanvo/psevn-actions'||process.env.GITHUB_REF!=='refs/heads/main'||ev.head_commit?.message!=='cms(pse): point Kali 1678 to existing WooCommerce product'||process.env.PSE_KALI_FRESH_BACKUP!=='yes')throw Error('Write scope denied');
const wp='https://admin-pse.webnvn.com',front='https://pse.webnvn.com',to='/san-pham/kali-phu-my-mieng-mop-1427',old='/kali-phu-my-mo-ta-va-hdsd',legacy='/hoat-dong-kinh-doanh/san-pham/dam-phu-my/8-trang-chu/1678-kali-phu-my-mo-ta-va-hdsd.html',alias=legacy.replace('/dam-phu-my/','/nhom-phan-don-va-phan-phuc-hop-phu-my/'),sha=x=>createHash('sha256').update(x).digest('hex');
for(const [k,v] of [['WC_URL',wp],['WC_URL_CLIENT',front]]){const a=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,'')).filter(x=>x.startsWith(k+'='));if(a.length!==1||new URL(a[0].slice(k.length+1).replace(/^['"]|['"]$/g,'')).origin!==v)throw Error('Origin mismatch '+k)}
const out='artifacts/pse-kali-1678-product-redirect';await mkdir(out,{recursive:true});const report={pass:false,writes:[],noProductWrites:true,noMediaWrites:true};const save=()=>writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
const b=await chromium.launch({headless:true}),net=await request.newContext({timeout:45000});
try{
 const product=await net.get(wp+'/wp-json/wp/v2/product/80938?_fields=id,slug,status,title,content,excerpt,acf,featured_media');
 const p=await product.json();
 if(product.status()!==200||p.id!==80938||p.status!=='publish'||p.slug!=='kali-phu-my-mieng-mop-1427'||!p.title?.rendered||!p.featured_media)throw Error('Native target identity mismatch');
 const targetHash=sha(JSON.stringify(p));report.product={id:p.id,slug:p.slug,title:p.title.rendered,bodySha:targetHash};
 for(const width of [1366,390]){
  const ctx=await b.newContext({viewport:{width,height:860},deviceScaleFactor:1}),page=await ctx.newPage(),r=await page.goto(front+to,{waitUntil:'domcontentloaded',timeout:60000});
  if(r?.status()!==200||page.url()!==front+to||await page.locator('link[rel=canonical]').getAttribute('href')!==front+to||await page.locator('[data-product-id="80938"]').count()!==1||await page.locator('#product-main-image').count()!==1)throw Error('Live target is not real Product');
  await page.locator('#product-main-image').evaluate(i=>i.decode());
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  if(overflow>5)throw Error('Target horizontal overflow');
  await page.screenshot({path:out+'/target-'+width+'.png',fullPage:true,timeout:45000});await ctx.close();
 }
 const ctx=await b.newContext(),admin=await ctx.newPage();
 await admin.goto(wp+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await admin.locator('#user_login').count()){
  if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error('Missing WP credentials');
  await admin.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);await admin.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
  const m=(await admin.locator('#loginform').innerText()).match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i);
  if(m){const a=+m[1],b=+m[3],v=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];const f=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();if(!await f.count())throw Error('Login challenge');await f.fill(String(v))}
  await admin.locator('#wp-submit').click();
 }
 await admin.goto(wp+'/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
 if(admin.url().includes('wp-login')||!await admin.locator('#adminmenu').count())throw Error('Admin unavailable');
 const nonce=await admin.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});if(!r.ok)throw Error('REST nonce unavailable');return(await r.text()).trim()});
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error('Bad nonce');
 const api=async(path,method='GET',body)=>{
  for(let i=0;i<(method==='GET'?3:1);i++){
   try{const r=await ctx.request.fetch(wp+'/wp-json/wp/v2/'+path,{method,timeout:45000,headers:{'X-WP-Nonce':nonce,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{data:body}:{})});return {http:r.status(),pages:Number(r.headers()['x-wp-totalpages']||1),data:await r.json().catch(()=>null)}}catch(e){if(method!=='GET'||i===2||!/ECONNRESET|ETIMEDOUT|Timeout|socket hang up/i.test(String(e.message)))throw Error('Native '+method+' '+path.split('?')[0]+' failed');await new Promise(r=>setTimeout(r,1000*(i+1)))}
  }
 };
 const pgfields='?context=edit&_fields=id,slug,status,title,acf,content,featured_media';
 const pg=await api('pages/83524'+pgfields);
 if(pg.http!==200||pg.data.id!==83524||pg.data.slug!==old.slice(1)||pg.data.acf?.key!=='pse-historical-kali-1678'||!['publish','draft'].includes(pg.data.status)||pg.data.featured_media!==83523)throw Error('Old Page identity changed');
 const uri='product_cat/1763',fields='?context=edit&_fields=id,slug,parent,count,description,meta',key='_vcs_category_rich_description',before=await api(uri+fields),raw=before.data?.meta?.[key],cnt=(s,x)=>s.split(x).length-1;
 const four=['/san-pham/dam-phu-my-chuyen-dung-cho-drone-1668','/san-pham/dam-phu-my-chuyen-dung-cho-nong-lam-truong-1669','/san-pham/sa-phu-my-1682','/san-pham/dap-phu-my-1677'];
 if(before.http!==200||before.data.slug!=='dam-phu-my'||before.data.count!==4||typeof raw!=='string'||(raw.match(/<table\b/gi)||[]).length!==10||four.some(x=>cnt(raw,x)!==1)||cnt(raw,old)+cnt(raw,to)!==1)throw Error('Category scope changed');
 const updated=cnt(raw,old)===1?raw.replace(old,to):raw;
 // Also update only the already-published owned historical 1425 crosslink.
 const canada=await api('pages/83528'+pgfields);
 if(canada.http!==200||canada.data.acf?.key!=='pse-historical-kali-1425'||canada.data.status!=='publish'||typeof canada.data.content?.raw!=='string')throw Error('1425 identity changed');
 const caRaw=canada.data.content.raw,caOld=front+old,caTo=front+to;
 if(cnt(caRaw,caOld)+cnt(caRaw,caTo)!==1)throw Error('1425 crosslink mismatch');
 const caUpdated=caRaw.replace(caOld,caTo);
 const inventory=[];
 for(let i=1;i<=40;i++){const r=await api('chuyen-huong-link?context=edit&status=any&per_page=100&page='+i+'&orderby=id&order=asc&_fields=id,status,acf');if(r.http!==200||!Array.isArray(r.data)||r.pages<1||r.pages>40)throw Error('Redirect registry incomplete');inventory.push(...r.data);if(i===r.pages)break}
 const plans=[legacy,old,alias].map(from=>({from,prior:inventory.filter(r=>r.acf?.from_link===from)}));
 for(const x of plans){if(x.prior.length>1||x.prior.some(r=>String(r.acf?.type)!=='301'||r.acf?.match_type!=='Exact'||r.acf?.enable!==true||![old,to].includes(r.acf?.to_link)))throw Error('Redirect conflict '+x.from)}
 if(plans[0].prior[0]?.id!==83526)throw Error('Original redirect identity changed');
 await writeFile(out+'/rollback.json',JSON.stringify({page:pg.data,category:before.data,canada:canada.data,redirects:plans},null,2)+'\n');
 for(const x of plans){
  let id=x.prior[0]?.id;
  if(!id){const r=await api('chuyen-huong-link','POST',{status:'draft',title:'PSE: Kali Phú Mỹ - chuyển về sản phẩm',acf:{from_link:x.from,to_link:to,type:'301',match_type:'Exact',enable:true}});if(r.http!==201||!Number.isSafeInteger(r.data?.id))throw Error('Redirect create failed');id=r.data.id;report.writes.push({type:'redirect-draft',id});await save()}
  else if(x.prior[0].acf.to_link!==to){const r=await api('chuyen-huong-link/'+id,'POST',{acf:{to_link:to}});if(r.http!==200)throw Error('Redirect update failed');report.writes.push({type:'redirect-update',id});await save()}
  const check=async()=>{const r=await api('chuyen-huong-link/'+id+'?context=edit&_fields=id,status,acf');if(r.http!==200||r.data.acf?.from_link!==x.from||r.data.acf?.to_link!==to||String(r.data.acf?.type)!=='301'||r.data.acf?.match_type!=='Exact'||r.data.acf?.enable!==true)throw Error('Redirect verification failed');return r.data.status};
  if(await check()!=='publish'){const r=await api('chuyen-huong-link/'+id,'POST',{status:'publish'});if(r.http!==200||await check()!=='publish')throw Error('Redirect publish failed');report.writes.push({type:'redirect-publish',id});await save()}
  x.id=id;
 }
 if(updated!==raw){const fresh=await api(uri+fields);if(fresh.data?.meta?.[key]!==raw)throw Error('Concurrent category edit');const r=await api(uri,'POST',{meta:{[key]:updated}});if(r.http!==200)throw Error('Category write failed');report.writes.push({type:'category-link',id:1763});await save()}
 const ca=await api(uri+fields);if(ca.data?.meta?.[key]!==updated||ca.data.count!==4||ca.data.description!==before.data.description)throw Error('Category readback mismatch');
 if(caUpdated!==caRaw){const current=await api('pages/83528'+pgfields);if(current.data?.content?.raw!==caRaw)throw Error('Concurrent Page edit');const r=await api('pages/83528','POST',{content:caUpdated});if(r.http!==200)throw Error('1425 link update failed');report.writes.push({type:'owned-page-link',id:83528});await save()}
 if((await api('pages/83528'+pgfields)).data?.content?.raw!==caUpdated)throw Error('1425 readback mismatch');
 if(pg.data.status==='publish'){const r=await api('pages/83524','POST',{status:'draft'});if(r.http!==200)throw Error('Page unpublish failed');report.writes.push({type:'page-draft',id:83524});await save()}
 const after=await api('pages/83524'+pgfields);if(after.data?.status!=='draft'||after.data.content?.raw!==pg.data.content.raw||after.data.featured_media!==83523)throw Error('Historical Page archive verification failed');
 const productAfter=await net.get(wp+'/wp-json/wp/v2/product/80938?_fields=id,slug,status,title,content,excerpt,acf,featured_media');
 if(productAfter.status()!==200||sha(JSON.stringify(await productAfter.json()))!==targetHash)throw Error('Product changed');
 report.pass=true;report.redirects=plans.map(x=>({id:x.id,from:x.from,to}));report.page={id:83524,status:'draft',preservedContent:true};console.log('PSE_KALI_PRODUCT_REDIRECT_PASS='+JSON.stringify(report));
}finally{await save();await net.dispose();await b.close()}
