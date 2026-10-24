/** Diagnose original Joomla images in newly migrated distribution WordPress Pages, without mutations. */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
const lines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,"")).filter(s=>s.startsWith("WC_URL="));
if(lines.length!==1)throw Error("Missing PSE WordPress origin");
const wp=new URL(lines[0].slice(7).replace(/^['"]|['"]$/g,""));
if(wp.protocol!=="https:"||wp.username||wp.password)throw Error("Invalid CMS origin");
const browser=await chromium.launch({headless:true});const ctx=await browser.newContext(),admin=await ctx.newPage(),apiRequest=await request.newContext({timeout:60000});
try{
 await admin.goto(wp.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const text=await admin.locator("body").innerText(),m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],ans=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const c=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await c.count())throw Error("Captcha missing");await c.fill(String(ans))}
  await Promise.all([admin.waitForLoadState("domcontentloaded"),admin.locator("#wp-submit").click()]);
 }
 if(admin.url().includes("wp-login"))throw Error("No native WP auth");
 const nonce=await admin.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("No REST nonce");return (await r.text()).trim()});
 const records=[];
 for(const id of [81039,81041,81043]){
  const result=await admin.evaluate(async({id,nonce})=>{const r=await fetch("/wp-json/wp/v2/pages/"+id+"?context=edit&_fields=id,slug,status,acf,content",{credentials:"same-origin",headers:{"X-WP-Nonce":nonce}});return{http:r.status,data:await r.json().catch(()=>null)}},{id,nonce});
  if(result.http!==200||result.data?.status!=="publish"||result.data?.acf?.action!=="PublicPage")throw Error("Wrong WP Page "+id);
  const media=await admin.evaluate(html=>{const d=document.createElement("div");d.innerHTML=html;return[...d.querySelectorAll("img[src]")].map(x=>({src:x.getAttribute("src")||"",alt:x.getAttribute("alt")||"",near:x.parentElement?.textContent?.replace(/\s+/g," ").trim().slice(0,160)||""}))},result.data.content?.raw||"");
  for(const x of media){
   let orig;try{orig=new URL(x.src,"https://www.pse.vn")}catch{continue}
   if(orig.protocol!=="https:"||!["www.pse.vn","pse.vn",wp.hostname].includes(orig.hostname))throw Error("Untrusted original distribution image URL");
   let http=0,bytes=0,sha256="",mime="",err="";
   try{
    const response=await apiRequest.get(orig.href,{timeout:55000});http=response.status();mime=response.headers()["content-type"]||"";
    if(response.ok()){const b=await response.body();bytes=b.length;sha256=createHash("sha256").update(b).digest("hex")}
   }catch(e){err=String(e).slice(0,200)}
   const row={wpId:id,page:result.data.slug,src:x.src,alt:x.alt,near:x.near,source:orig.href,http,bytes,sha256,mime,err};
   console.log("PSE_DISTRIBUTION_IMAGE="+JSON.stringify(row));records.push(row);
  }
 }
 console.log("PSE_DISTRIBUTION_IMAGE_SUMMARY="+JSON.stringify({references:records.length,available:records.filter(x=>x.http===200).length,missing:records.filter(x=>x.http!==200),readOnly:true,noBuild:true}));
}finally{await apiRequest.dispose();await browser.close()}
