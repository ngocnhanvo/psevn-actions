/** Native WordPress editor save to queue an already-authored, verified Page 81043 change.
 * Only attempt on the exact saved content and published action/key; never modify its data.
 */
import {chromium} from "playwright";
import {createHash} from "node:crypto";
const sha=s=>createHash("sha256").update(String(s||"")).digest("hex");
const expected="eb0023c6956c408a1ab82b144d3cbb80cfd13ec76bcd5176d07e355738cc3a6e";
const key="pse-business-he-thong-phan-phoi-san-pham-tai-cac-tinh-mien-dong-nam-bo";
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const vars=env.filter(s=>s.startsWith("WC_URL="));
if(vars.length!==1)throw Error("No unique WP host");
const url=new URL(vars[0].slice(7).replace(/^['"]|['"]$/g,""));
if(url.protocol!=="https:"||url.username||url.password||!["","/"].includes(url.pathname)||url.search||url.hash)throw Error("Invalid PSE WP origin");
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1380,height:900}});
const page=await context.newPage();
try{
 const user=process.env.WP_ADMIN_USERNAME,pass=process.env.WP_ADMIN_PASSWORD;
 if(!user||!pass)throw Error("Missing admin credentials");
 await page.goto(url.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
   await page.locator("#user_login").fill(user);await page.locator("#user_pass").fill(pass);
   const txt=await page.locator("body").innerText();
   const m=txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
   if(m){
     const a=Number(m[1]),b=Number(m[3]),v=({"+":a+b,"-":a-b,"x":a*b,"×":a*b,"*":a*b})[m[2]];
     const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
     if(!await f.count())throw Error("WP login challenge unknown");
     await f.fill(String(v));
   }
   await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WP admin login rejected");
 const nonce=await page.evaluate(async()=>{
   if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
   const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
   if(!r.ok)throw Error("WP REST nonce "+r.status);
   return (await r.text()).trim();
 });
 const get=async route=>page.evaluate(async({route,nonce})=>{
   const r=await fetch(route,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json"}});
   return {http:r.status,payload:await r.json().catch(()=>null)};
 },{route,nonce});
 const route="/wp-json/wp/v2/pages/81043?context=edit&_fields=id,slug,status,acf,content";
 const before=await get(route);
 if(before.http!==200||before.payload?.id!==81043||before.payload?.status!=="publish"||
   before.payload?.acf?.key!==key||before.payload?.acf?.action!=="PublicPage")throw Error("PSE Page mismatch");
 const html=String(before.payload.content?.raw||"");
 if(sha(html)!==expected)throw Error("PSE Page was edited concurrently; no resave. Found "+sha(html));
 const logs=async()=>{
   const r=await get("/wp-json/astro/v1/get-page-logs");
   if(r.http!==200||!Array.isArray(r.payload))throw Error("PSE page logs API HTTP "+r.http);
   return r.payload.filter(x=>Number(x.id)===81043);
 };
 const initial=await logs();
 console.log("PSE_81043_NATIVE_SAVE_INITIAL="+JSON.stringify({present:initial.length,action:initial[0]?.action||null,sourceSha:sha(html)}));
 if(initial.some(x=>x.action==="modify"&&x.page?.id===81043)){
   console.log("PSE_81043_NATIVE_SAVE=ALREADY_QUEUED; no mutation");process.exitCode=0;
 }else{
   const finger=value=>page.evaluate(value=>{
     const el=document.createElement("div");el.innerHTML=value;
     const clean=x=>(x.textContent||"").replace(/\s+/g," ").replace(/\u00a0/g," ").trim();
     return {text:clean(el),cells:[...el.querySelectorAll("td,th")].map(c=>[clean(c),c.getAttribute("colspan"),c.getAttribute("rowspan")]),
       img:[...el.querySelectorAll("img")].map(x=>[x.getAttribute("src"),x.getAttribute("alt")]),
       links:[...el.querySelectorAll("a")].map(x=>[x.getAttribute("href"),clean(x)])};
   },value);
   const fingerprint=await finger(html);
   await page.goto(url.origin+"/wp-admin/post.php?post=81043&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
   if(page.url().includes("wp-login")||!await page.locator("#post").count()||!await page.locator("#publish").count()||
      await page.locator("#post_status").inputValue()!=="publish")throw Error("PSE WP native post editor unavailable");
   const nav=page.waitForNavigation({waitUntil:"domcontentloaded",timeout:60000}).catch(()=>null);
   await page.locator("#publish").click();
   await nav;
   const after=await get(route);
   if(after.http!==200||after.payload?.id!==81043||after.payload.status!=="publish"||after.payload.acf?.key!==key||after.payload.acf?.action!=="PublicPage")throw Error("WP native save metadata changed");
   const updated=String(after.payload.content?.raw||"");
   const afterFinger=await finger(updated);
   if(JSON.stringify(fingerprint)!==JSON.stringify(afterFinger))throw Error("Native save altered PSE page semantics; investigate revisions");
   const queue=await logs();
   const ok=queue.some(x=>x.action==="modify"&&x.page?.id===81043);
   console.log("PSE_81043_NATIVE_SAVE_RESULT="+JSON.stringify({
      originalSha:sha(html),readbackSha:sha(updated),semanticsPreserved:true,queuePresent:ok,logCount:queue.length,editor:"native"
   }));
   if(!ok)throw Error("PSE WordPress native save did not register page 81043 in Astro change queue");
 }
}finally{await browser.close()}
