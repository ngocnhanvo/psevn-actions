/** Create the shared footer's native ESC Table without inventing certification/legal claims. */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const rows=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const entry=rows.filter(s=>s.startsWith("WC_URL="));
if(entry.length!==1)throw Error("WordPress origin missing");
const u=new URL(entry[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid WP origin");
if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("WP login secrets absent");
const origin=u.origin, tableId="pub_footer_assets_vi";
const keys=["group","label","image","value","href","visible"];
const beforePath="artifacts/pse-footer/esc-before.json";
const browser=await chromium.launch({headless:true});
const p=await browser.newPage({viewport:{width:1440,height:980}});
p.on("dialog",async d=>d.type()==="confirm"?d.accept():d.dismiss());
try {
 await p.goto(origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await p.locator("#user_login").count()){
  await p.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await p.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const text=await p.locator("body").innerText();
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3];
   const n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const captcha=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await captcha.count())throw Error("WP arithmetic challenge control absent");
   await captcha.fill(String(n));
  }
  await p.locator("#wp-submit").click({noWaitAfter:true,timeout:25000});
  await p.waitForFunction(()=>location.pathname.startsWith("/wp-admin") && !document.querySelector("#loginform"),null,{timeout:45000});
 }
 if(p.url().includes("wp-login"))throw Error("WP login failed");
 const nonce=await p.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("WP REST nonce failed");
  return (await r.text()).trim();
 });
 const get=route=>p.evaluate(async({route,nonce})=>{
  const r=await fetch(route,{credentials:"same-origin",cache:"no-store",headers:{"X-WP-Nonce":nonce,"Cache-Control":"no-cache"}});
  return {http:r.status,data:await r.json().catch(()=>({}))};
 },{route,nonce});

 const sources=[
  {slug:'pse-footer-gcerti-original',file:'pse-footer-gcerti-original.png',path:'/images/footer/1.G-Certin.png',alt:'Logo G-CERTI System Service – theo footer PSE gốc'},
  {slug:'pse-footer-ias-original',file:'pse-footer-ias-original.png',path:'/images/footer/2-IAS.png',alt:'Logo IAS Accredited – theo footer PSE gốc'},
  {slug:'pse-footer-iaf-original',file:'pse-footer-iaf-original.png',path:'/images/footer/3-IAF.png',alt:'Logo IAF – theo footer PSE gốc'},
 ];
 const ref=new URL(process.env.PSE_REFERENCE_ORIGIN||'');
 if(ref.protocol!=='https:'||ref.username||ref.password||ref.search||ref.hash||!['','/'].includes(ref.pathname))throw Error('Invalid reference site origin');
 const mediaList=await get('/wp-json/wp/v2/media?context=edit&search=pse-footer-&per_page=80');
 if(mediaList.http!==200||!Array.isArray(mediaList.data))throw Error('Cannot check media inventory');
 await mkdir('artifacts/pse-footer',{recursive:true});
 await writeFile('artifacts/pse-footer/media-before.json',JSON.stringify(mediaList.data.map(m=>({id:m.id,slug:m.slug,alt:m.alt_text,url:m.source_url})),null,2)+'\n');
 for(const item of sources){
  let media=mediaList.data.filter(m=>m.slug===item.slug||String(m.source_url||'').includes('/'+item.file));
  if(media.length>1)throw Error('Duplicate original Media slug: '+item.slug);
  if(media.length===1){
   console.log('PSE_FOOTER_MEDIA=EXISTS; key='+item.slug+'; id='+media[0].id);
   continue;
  }
  const source=ref.origin+item.path;
  const response=await p.request.get(source,{timeout:40000});
  const bytes=await response.body();
  if(response.status()!==200||!String(response.headers()['content-type']||'').startsWith('image/png')||
   bytes.length<1000||bytes.length>1000000||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Original PNG validation failed: '+item.slug);
  const uploaded=await p.evaluate(async ({encoded,file,alt})=>{
   const nonce=window.wpApiSettings?.nonce || await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(r=>r.text());
   const binary=Uint8Array.from(atob(encoded),x=>x.charCodeAt(0));
   const r=await fetch('/wp-json/wp/v2/media',{method:'POST',credentials:'same-origin',headers:{
     'X-WP-Nonce':nonce,'Content-Disposition':'attachment; filename="'+file+'"','Content-Type':'image/png'
   },body:binary});
   const data=await r.json().catch(()=>({}));
   if(r.status!==201)throw Error('WordPress media upload HTTP '+r.status+' '+String(data?.message||'').slice(0,120));
   const s=await fetch('/wp-json/wp/v2/media/'+data.id,{method:'POST',credentials:'same-origin',headers:{'X-WP-Nonce':nonce,'Content-Type':'application/json'},body:JSON.stringify({alt_text:alt})});
   if(!s.ok)throw Error('Failed writing media ALT: HTTP '+s.status);
   return {id:data.id,slug:data.slug,alt_text:alt,source_url:data.source_url};
  },{encoded:bytes.toString('base64'),file:item.file,alt:item.alt});
  const verify=await get('/wp-json/wp/v2/media/'+uploaded.id+'?context=edit');
  if(verify.http!==200||verify.data?.alt_text!==item.alt)throw Error('Media save readback mismatch');
  console.log('PSE_FOOTER_MEDIA=UPLOADED; key='+item.slug+'; id='+uploaded.id+'; bytes='+bytes.length);
 }
 console.log('PSE_FOOTER_MEDIA_MIGRATION=PASS; originals=3; target=WordPress; no_astro_build=true');
}finally{await browser.close()}
