/** Native WordPress menu cutover after signed public complaint page QA; no build or email. */
import {chromium} from "playwright";
const vals=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const origin=key=>{
 const arr=vals.filter(x=>x.startsWith(key+"="));
 if(arr.length!==1)throw Error("Invalid configured origin "+key);
 const url=new URL(arr[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
 if(url.protocol!=="https:"||!url.hostname||url.username||url.password||url.search||url.hash||!["","/"].includes(url.pathname))throw Error("Invalid HTTPS origin "+key);
 return url.origin;
};
const wp=origin("WC_URL"),front=origin("WC_URL_CLIENT");
if(wp===front)throw Error("WordPress/front origin collision");
const slug="xu-ly-khieu-nai-y-kien-khach-hang";
const browser=await chromium.launch({headless:true});const p=await browser.newPage();
try {
 const live=await p.goto(front+"/"+slug,{waitUntil:"domcontentloaded",timeout:60000});
 const valid=await p.evaluate(()=>document.querySelectorAll("#main-content h1").length===1
 && !!document.querySelector("#pse-complaint-form")
 && !!document.querySelector("#pse-complaint-turnstile"));
 if(live?.status()!==200||!valid)throw Error("Public complaint form not live; menu remains unchanged");
 await p.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await p.locator("#user_login").count()){
  await p.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await p.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const text=await p.locator("body").innerText(),m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],ans=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const input=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await input.count())throw Error("Missing login verification input");await input.fill(String(ans));}
  await Promise.all([p.waitForLoadState("domcontentloaded"),p.locator("#wp-submit").click()]);
 }
 if(p.url().includes("wp-login"))throw Error("Login unsuccessful");
 const nonce=await p.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("REST nonce missing");return(await r.text()).trim()});
 const api=(url,method="GET",body)=>p.evaluate(async({url,method,body,nonce})=>{
   const r=await fetch(url,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
   return{http:r.status,data:await r.json().catch(()=>null)};
 },{url,method,body,nonce});
 const [page,menu]=await Promise.all([api("/wp-json/wp/v2/pages/81087?context=edit&_fields=id,slug,status,acf"),api("/wp-json/wp/v2/menu-items/77020?context=edit")]);
 const a=page.data||{},m=menu.data||{};
 if(page.http!==200||a.id!==81087||a.slug!==slug||a.status!=="publish"
  ||a.acf?.action!=="PseComplaintPage"||a.acf?.key!=="pse-complaint"
  ||menu.http!==200||m.id!==77020||Number(m.parent)!==77004
  ||!String(m.title?.raw||m.title?.rendered||"").includes("Xử lý khiếu nại"))
   throw Error("WordPress complaint Page/menu identity mismatch");
 if(m.type==="post_type"&&m.object==="page"&&Number(m.object_id)===81087){
   console.log("PSE_COMPLAINT_MENU=ALREADY_DONE; noWrite=true");process.exit(0);
 }
 let oldPath="";
 try {oldPath=new URL(String(m.url)).pathname;}catch{}
 if(m.type!=="custom"||!oldPath.endsWith("/hoat-dong-kinh-doanh/xu-ly-khieu-nai-y-kien-khach-hang.html"))
   throw Error("Header menu no longer matches original Joomla route; no overwrite");
 const edited=await api("/wp-json/wp/v2/menu-items/77020","POST",{type:"post_type",object:"page",object_id:81087});
 if(edited.http!==200||edited.data?.type!=="post_type"||Number(edited.data.object_id)!==81087)
   throw Error("WP native menu update failed");
 const saved=await api("/wp-json/wp/v2/menu-items/77020?context=edit");
 if(saved.http!==200||saved.data?.type!=="post_type"||saved.data?.object!=="page"
   ||Number(saved.data.object_id)!==81087||Number(saved.data.parent)!==77004)
   throw Error("WordPress menu binding readback mismatch");
 console.log("PSE_COMPLAINT_MENU=PASS menu=77020 page=81087 oldHierarchyPreserved=true noEmail=true noAstroBuild=true");
} finally {await browser.close()}
