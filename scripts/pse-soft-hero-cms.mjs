/**
 * Guarded WordPress-only soft-hero opt-in.
 * Never edits a Page's body, ESC Table, menu, build settings or CSS rules:
 * only appends the marker comment to the existing ACF cssmore field.
 */
import { chromium } from "playwright";

const marker = "/* PSE_SHARED_SOFT_HERO_V1 */";
const apply = process.env.PSE_HERO_APPLY === "true";
const specs = [
  {slug:"hoi-dap",key:"pse-business-hoi-dap"},
  {slug:"duong-day-nong",key:"pse-business-duong-day-nong"},
  {slug:"kenh-phan-phoi",key:"pse-business-kenh-phan-phoi"},
  {slug:"thong-tin-tai-chinh",key:"pse-business-thong-tin-tai-chinh"},
];
const configured = String(process.env.ENV_FILE || "").split(/\r?\n/)
  .map(line=>line.trim().replace(/^export\s+/,""))
  .filter(line=>line.startsWith("WC_URL="));
if(configured.length!==1) throw Error("Ambiguous WordPress origin");
const originUrl = new URL(configured[0].slice(7).trim().replace(/^['"]|['"]$/g,""));
if(originUrl.protocol!=="https:" || !originUrl.hostname || originUrl.username
 || originUrl.password || originUrl.search || originUrl.hash || !["","/"].includes(originUrl.pathname))
 throw Error("Invalid WordPress HTTPS origin");
const origin = originUrl.origin;
const normalizeCss = value=>String(value||"").replace(/\r\n?/g,"\n");
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1366,height:900}});
let changed=0,already=0;
try{
 if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)
   throw Error("WordPress credentials not configured");
 await page.goto(origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const body=await page.locator("body").innerText();
  const match=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)
      ||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(match){
   const a=Number(match[1]),b=Number(match[3]);
   const result=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[match[2]];
   const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error("WordPress arithmetic challenge missing");
   await field.fill(String(result));
  }
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WordPress login denied");
 const nonce=await page.evaluate(async()=>{
   if(window.wpApiSettings?.nonce) return window.wpApiSettings.nonce;
   const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
   if(!r.ok)throw Error("REST nonce unavailable "+r.status);
   return (await r.text()).trim();
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("Unexpected nonce");
 const rest=(url,method="GET",body=null)=>page.evaluate(async ({url,method,body,nonce})=>{
   const r=await fetch(url,{method,credentials:"same-origin",cache:"no-store",
     headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},
     ...(body?{body:JSON.stringify(body)}:{})});
   return {status:r.status,data:await r.json().catch(()=>null)};
 },{url,method,body,nonce});
 const byId=id=>rest("/wp-json/wp/v2/pages/"+id+"?context=edit&_fields=id,slug,status,acf,modified");
 const state=[];
 // PREFLIGHT ALL FOUR before any write.
 for(const spec of specs){
   const response=await rest("/wp-json/wp/v2/pages?context=edit&status=publish&slug="+encodeURIComponent(spec.slug)+"&_fields=id,slug,status,acf,modified");
   if(response.status!==200||!Array.isArray(response.data)||response.data.length!==1)
     throw Error("Page lookup mismatch "+spec.slug+" HTTP "+response.status);
   const data=response.data[0];
   if(data.slug!==spec.slug||data.status!=="publish"||data.acf?.action!=="PublicPage"
      ||data.acf?.key!==spec.key||typeof data.acf?.cssmore!=="string")
     throw Error("Page action/key/CSS mismatch "+spec.slug);
   state.push({spec,id:data.id,css:data.acf.cssmore,modified:data.modified});
 }
 console.log("PSE_HERO_PREFLIGHT="+JSON.stringify(state.map(x=>({
    slug:x.spec.slug,id:x.id,cssChars:x.css.length,hasMarker:x.css.includes(marker),mode:apply?"apply":"read-only"
 }))));
 for(const item of state){
   const current=await byId(item.id);
   if(current.status!==200||current.data?.slug!==item.spec.slug||
      current.data?.status!=="publish"||current.data?.acf?.key!==item.spec.key||
      current.data?.acf?.action!=="PublicPage"||
      normalizeCss(current.data?.acf?.cssmore)!==normalizeCss(item.css))
       throw Error("Concurrent WordPress change / source mismatch "+item.spec.slug);
   if(item.css.includes(marker)){already++;continue;}
   if(!apply)continue;
   const updatedCss=item.css.replace(/\s*$/,"")+"\n"+marker+"\n";
   const saved=await rest("/wp-json/wp/v2/pages/"+item.id,"POST",{acf:{cssmore:updatedCss}});
   if(saved.status!==200||saved.data?.id!==item.id)
     throw Error("WordPress CSS update refused "+item.spec.slug+" status "+saved.status);
   const after=await byId(item.id);
   if(after.status!==200||after.data?.status!=="publish"||
      after.data?.acf?.key!==item.spec.key||after.data?.acf?.action!=="PublicPage"||
      normalizeCss(after.data?.acf?.cssmore)!==normalizeCss(updatedCss))
     throw Error("WordPress CSS readback mismatch "+item.spec.slug);
   changed++;
   console.log("PSE_HERO_PAGE=SAVED_PASS "+JSON.stringify({slug:item.spec.slug,id:item.id,bodyUntouched:true,noAstroBuild:true}));
 }
 console.log("PSE_HERO_CMS=PASS "+JSON.stringify({pages:state.length,changed,already,apply,noAstroBuild:true}));
} finally {await browser.close();}
