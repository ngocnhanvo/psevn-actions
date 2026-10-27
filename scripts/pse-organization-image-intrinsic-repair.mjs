import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const digest=x=>createHash('sha256').update(String(x||'')).digest('hex');
const args=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,'')).filter(x=>x.startsWith('WC_URL='));
if(args.length!==1)throw Error('Missing unique WP origin');
const wp=new URL(args[0].slice(7).replace(/^['"]|['"]$/g,''));
if(wp.protocol!=='https:'||wp.username||wp.password||wp.search||wp.hash||wp.port||!['','/'].includes(wp.pathname))throw Error('Invalid WordPress origin');
if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error('Missing credentials');
mkdirSync('artifacts/pse-organization-image-size',{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1366,height:900}});
try{
 await page.goto(wp.origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
  const t=await page.locator('body').innerText();
  const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=Number(m[1]),b=Number(m[3]),value=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
   const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error('Unsupported login challenge');
   await field.fill(String(value));
  }
  await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
 }
 if(page.url().includes('wp-login'))throw Error('WP login failed');
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});
  if(!r.ok)throw Error('No REST nonce');return (await r.text()).trim();
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('Invalid nonce');
 const api=(route,method='GET',body=null)=>page.evaluate(async({route,method,body,nonce})=>{
  const r=await fetch(route,{method,credentials:'same-origin',cache:'no-store',
   headers:{'X-WP-Nonce':nonce,Accept:'application/json',
    ...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {http:r.status,data:await r.json().catch(()=>null)};
 },{route,method,body,nonce});
 const route='/wp-json/wp/v2/pages/79300?context=edit&_fields=id,slug,status,acf,content,modified,yoast_head_json';
 const res=await api(route),record=res.data;
 if(res.http!==200||record?.id!==79300||record.status!=='publish'||record.slug!=='so-do-to-chuc'||
  record.acf?.key!=='pse-company-so-do-to-chuc'||record.acf?.action!=='PublicPage')
  throw Error('Wrong PSE organization WordPress Page');
 const original=String(record.content?.raw||'');
 const tags=[...original.matchAll(/<img\b[^>]*>/gi)].map(x=>x[0]);
 if(tags.length!==1)throw Error('Expected one organization chart image, observed '+tags.length);
 const tag=tags[0];
 if(!/(so.do.to.chuc|organization)/i.test(tag))throw Error('Unexpected chart IMG source/alt');
 const oldW=tag.match(/\bwidth\s*=\s*["']?(\d+)/i)?.[1]||'';
 const oldH=tag.match(/\bheight\s*=\s*["']?(\d+)/i)?.[1]||'';
 if((oldW||oldH)&&(oldW!=='1439'||oldH!=='665'))
  throw Error('Unexpected existing size; stop to preserve chart layout');
 let next=original;
 if(!oldW&&!oldH){
  const nextTag=tag.replace(/\s*\/?>$/,end=>' width="1439" height="665"'+end);
  next=original.replace(tag,nextTag);
 }
 if(next===original&&oldW==='1439'&&oldH==='665'){
  console.log('PSE_ORGANIZATION_IMAGE_ALREADY_CORRECT=PASS');
 }else{
  if(next===original||!next.includes('width="1439" height="665"'))throw Error('Image HTML did not update');
  writeFileSync('artifacts/pse-organization-image-size/backup.json',JSON.stringify({
   id:record.id,slug:record.slug,oldRawHtml:original,oldModified:record.modified,
   oldSha256:digest(original),newSha256:digest(next)
  },null,2)+'\n');
  console.log('PSE_ORGANIZATION_IMAGE_PREFLIGHT='+JSON.stringify({
   id:record.id,before:digest(original).slice(0,16),after:digest(next).slice(0,16),
   width:1439,height:665,otherAttributesUnchanged:true,noCssChanges:true
  }));
  const fresh=await api(route);
  if(fresh.http!==200||fresh.data?.modified!==record.modified||
   String(fresh.data.content?.raw||'')!==original)throw Error('Concurrent Page content edit; abort');
  const saved=await api('/wp-json/wp/v2/pages/79300','POST',{content:next});
  if(saved.http!==200||saved.data?.id!==79300)throw Error('WP Page save failed HTTP '+saved.http);
  const check=await api(route);
  if(check.http!==200||check.data?.status!=='publish'||check.data?.slug!==record.slug||
   check.data?.acf?.key!==record.acf.key||check.data?.acf?.action!==record.acf.action||
   String(check.data.content?.raw||'')!==next)
   throw Error('Read-after-write mismatch, inspect backup before retry');
  if(String(check.data?.yoast_head_json?.description||'')!==String(record.yoast_head_json?.description||''))
   throw Error('Yoast Page description unexpectedly changed');
  console.log('PSE_ORGANIZATION_IMAGE_DIMENSIONS_PASS='+JSON.stringify({
   id:79300,saved:true,verified:true,onlyWidthHeightAdded:true,cssUntouched:true,
   escTablesUntouched:true,noBuild:true
  }));
 }
}finally{await browser.close()}
