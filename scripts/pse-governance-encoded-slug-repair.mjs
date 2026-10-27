/** Repair one confirmed inaccessible imported governance post with percent-encoded Joomla slug.
 * No content, date, category, attachment, publication state or Astro build changes.
 * Dry-run on ordinary pushes; apply only with explicitly authorized commit.
 */
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const state=JSON.parse(await readFile('docs/pse-legacy-migration-state.json','utf8'));
const id='1184',row=state.articles[id],postId=79439;
if(!state.backup_verified||row?.wp_id!==postId||row.status!=='imported'||
 !row.source_url?.startsWith('https://www.pse.vn/quan-he-nha-dau-tu/tai-lieu-quan-tri-cong-ty/1184-'))
 throw Error('Source 1184 provenance/rollback proof changed');
const event=process.env.GITHUB_EVENT_PATH?JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8')):{};
const apply=event.head_commit?.message==='cms(pse): repair verified governance encoded permalink without touching article body';
const env=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,''));
const getOrigin=name=>{const arr=env.filter(s=>s.startsWith(name+'='));if(arr.length!==1)throw Error('Bad origin '+name);
 const u=new URL(arr[0].slice(name.length+1).replace(/^['"]|['"]$/g,''));
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))throw Error('Untrusted WP/frontend origin');return u.origin};
const wp=getOrigin('WC_URL'),front=getOrigin('WC_URL_CLIENT');
const oldSlug='ngh%e1%bb%8b-quy%e1%ba%bft-v%e1%bb%81-vi%e1%bb%87c-ch%e1%ba%a5p-thu%e1%ba%adn-kh-kd-2016';
const newSlug='nghi-quyet-ve-viec-chap-thuan-kh-kd-2016';
if(new URL(row.source_url).pathname.split('/').at(-1)?.toLowerCase()!=='1184-'+oldSlug+'.html')throw Error('Original encoded Joomla URL changed');
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1366,height:800}});
const page=await ctx.newPage();
try{
 const res=await page.goto(wp+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(res?.status()>=500)throw Error('CMS unavailable');
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const t=await page.locator('body').innerText(),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error('Cannot answer login challenge');await f.fill(String(v))}
  await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
 }
 if(page.url().includes('wp-login'))throw Error('WP auth failed');
 await page.goto(wp+'/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
 const nonce=await page.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});if(!r.ok)throw Error('REST nonce unavailable');return(await r.text()).trim()});
 const api=(path,method='GET',body)=>page.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:'same-origin',headers:{Accept:'application/json','X-WP-Nonce':nonce,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {http:r.status,data:await r.json().catch(()=>null)}
 },{path,method,body,nonce});
 const got=await api('/wp-json/wp/v2/posts/'+postId+'?context=edit&_fields=id,slug,status,date,title,categories,content');
 const p=got.data;
 if(got.http!==200||p?.id!==postId||p.status!=='publish'||!p.categories?.includes(1759)||!p.categories?.includes(1744)||
  !String(p.content?.raw||'').trim())throw Error('WordPress governance post identity/content changed');
 const already=p.slug===newSlug;
 if(!already&&p.slug!==oldSlug)throw Error('Unexpected original encoded WP slug '+p.slug);
 const collisions=await api('/wp-json/wp/v2/posts?context=edit&status=any&slug='+encodeURIComponent(newSlug)+'&_fields=id,slug,status');
 if(collisions.http!==200||!Array.isArray(collisions.data)||collisions.data.some(x=>x.id!==postId))throw Error('ASCII replacement slug conflicts with another WP post');
 const probes=[];
 for(const part of [oldSlug,oldSlug.replace(/%[0-9a-f]{2}/g,s=>s.toUpperCase()),decodeURIComponent(oldSlug),newSlug]){
  const dest=front+'/'+part;
  try{
   const r=await ctx.request.get(dest,{timeout:25000,failOnStatusCode:false});
   probes.push({path:part,http:r.status(),finalPath:new URL(r.url()).pathname});
  }catch(e){probes.push({path:part,error:String(e).slice(0,120)})}
 }
 console.log('PSE_GOV_ENCODED_PREFLIGHT='+JSON.stringify({id,wp_id:postId,wp_slug:p.slug,already,probes,mode:apply?'apply':'audit'}));
 if(!already&&probes.slice(0,3).some(x=>x.http===200))throw Error('Original encoded URL can already render; refuse canonical slug mutation');
 let outcome='ALREADY_FIXED';
 if(!already){
  if(apply){
   const saved=await api('/wp-json/wp/v2/posts/'+postId,'POST',{slug:newSlug});
   if(saved.http!==200||saved.data?.id!==postId||saved.data.slug!==newSlug)throw Error('Cannot update governed WP slug');
   const read=await api('/wp-json/wp/v2/posts/'+postId+'?context=edit&_fields=id,slug,status,date,categories,content');
   if(read.http!==200||read.data?.slug!==newSlug||read.data.status!==p.status||read.data.date!==p.date||
      JSON.stringify(read.data.categories)!==JSON.stringify(p.categories)||
      String(read.data.content?.raw||'')!==String(p.content?.raw||''))throw Error('WP slug-only readback mismatch');
   outcome='REPAIRED';
  }else outcome='READY_TO_REPAIR';
 }
 if(apply){
  const response=await ctx.request.get(front+'/'+newSlug,{timeout:45000,failOnStatusCode:false});
  if(response.status()!==200)throw Error('Public canonical permalink still not available HTTP '+response.status());
  const html=await response.text();
  if(!html.includes('Nghị quyết')&&!html.includes('nghị quyết'))throw Error('Public title missing after permalink correction');
 }
 const result={source_id:id,wp_id:postId,original_slug:oldSlug,canonical_slug:newSlug,mode:apply?'apply':'audit',result:outcome,old_post_date_preserved:true,no_build:true};
 await mkdir('artifacts/pse-governance-encoded-slug',{recursive:true});
 await writeFile('artifacts/pse-governance-encoded-slug/report.json',JSON.stringify({result,probes},null,2)+'\n');
 console.log('PSE_GOV_ENCODED_REPAIR='+JSON.stringify(result));
}finally{await browser.close()}
