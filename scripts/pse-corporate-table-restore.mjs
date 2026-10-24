/** Restore exactly one PSE corporate table from verified public Joomla articleBody.
 * WordPress native Classic Visual Save removed whitespace inside table cells;
 * this uses authenticated REST only to restore content. No Page status/menu/build changes.
 */
import {chromium} from "playwright";
import {createHash} from "node:crypto";
const digest=s=>createHash("sha256").update(String(s||"")).digest("hex");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const found=env.filter(x=>x.startsWith("WC_URL="));if(found.length!==1)throw Error("Missing WP origin");
const wp=new URL(found[0].slice(7).replace(/^['"]|['"]$/g,""));
if(wp.protocol!=="https:"||wp.username||wp.password||!["","/"].includes(wp.pathname)||wp.search||wp.hash)throw Error("Unsafe WordPress origin");
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1300,height:900}});
const admin=await context.newPage();
admin.on("dialog",async d=>{if(d.type()==="confirm")await d.accept();else await d.dismiss()});
try{
 const user=process.env.WP_ADMIN_USERNAME,pass=process.env.WP_ADMIN_PASSWORD;
 if(!user||!pass)throw Error("Missing WP credentials");
 await admin.goto(wp.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(user);await admin.locator("#user_pass").fill(pass);
  const text=await admin.locator("body").innerText();
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const input=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await input.count())throw Error("WP login challenge input not found");
   await input.fill(String(n));
  }
  await Promise.all([admin.waitForLoadState("domcontentloaded"),admin.locator("#wp-submit").click()]);
 }
 if(admin.url().includes("wp-login"))throw Error("WordPress login failed");
 const nonce=await admin.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const res=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!res.ok)throw Error("Cannot get WordPress REST nonce");
  return (await res.text()).trim();
 });
 if(!/^[a-zA-Z0-9]{8,24}$/.test(nonce))throw Error("Invalid nonce");
 const api=(route,method="GET",body)=>admin.evaluate(async({route,method,body,nonce})=>{
  const r=await fetch(route,{method,credentials:"same-origin",headers:{
   "X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  return {http:r.status,payload:await r.json().catch(()=>({}))};
 },{route,method,body,nonce});
 const route="/wp-json/wp/v2/pages/79272";
 const before=await api(route+"?context=edit&_fields=id,status,slug,acf,content");
 if(before.http!==200||before.payload?.id!==79272||
    before.payload.status!=="publish"||before.payload.slug!=="ban-kiem-soat"||
    before.payload.acf?.action!=="PublicPage"||
    before.payload.acf?.key!=="pse-company-ban-kiem-soat")
   throw Error("Unverified PSE Ban kiem soat Page");
 const logs=await api("/wp-json/astro/v1/get-page-logs");
 if(logs.http!==200||!Array.isArray(logs.payload)||
    !logs.payload.some(l=>l.id===79272&&l.action==="modify"))
   throw Error("Existing incremental Page event missing; refuse standalone REST-only restore");
 const old=String(before.payload.content?.raw||"");
 const src=await context.newPage();
 const response=await src.goto("https://www.pse.vn/pvfcco-pse/ban-kiem-soat.html",
   {waitUntil:"domcontentloaded",timeout:60000});
 if(response?.status()!==200)throw Error("Legacy Joomla table source unavailable");
 const original=await src.evaluate(()=>{
   const item=document.querySelector(".item-page [itemprop=articleBody]");
   if(!item)throw Error("Original articleBody not found");
   const el=item.cloneNode(true);
   el.querySelectorAll("script,style,noscript,form,.pager,.pagination,.relateditems,.items-more,.article-info,.icons,.print-icon").forEach(n=>n.remove());
   const related=[...el.querySelectorAll("h2,h3,h4,strong")].find(n=>/^(Các bài viết khác|Other Articles)$/i.test((n.textContent||"").trim()));
   if(related){
     let cur=related.closest("h2,h3,h4")||related;
     while(cur){const next=cur.nextElementSibling;cur.remove();cur=next}
   }
   return el.innerHTML;
 });
 await src.close();
 const semantic=html=>admin.evaluate(html=>{
   const root=document.createElement("div");root.innerHTML=html;
   const content=(root.textContent||"").replace(/\s+/g," ").trim();
   const cells=[...root.querySelectorAll("td,th")].map(n=>(n.textContent||"").replace(/\s+/g," ").trim());
   root.querySelectorAll("table").forEach(n=>n.remove());
   return {chars:content.length,cells,otherText:(root.textContent||"").replace(/\s+/g," ").trim(),
    tables:html.match(/<table\b/gi)?.length||0};
 },html);
 const was=await semantic(old),target=await semantic(original);
 if(target.cells.length!==12||target.tables!==1||target.chars!==319||
    !target.cells[0]?.startsWith("Bà Chức vụ")||
    original.includes("Các bài viết khác")||
    !target.otherText.trim()==="")
   throw Error("Original verified corporate table source changed unexpectedly");
 if(JSON.stringify(was)===JSON.stringify(target)){
   console.log("PSE_CORPORATE_TABLE_RESTORE=ALREADY_MATCHES; id=79272; no_wp_write=true");
 }else{
   const result=await api(route,"POST",{content:original});
   if(result.http!==200||result.payload?.id!==79272||
      result.payload.status!=="publish")throw Error("WP source table restore HTTP "+result.http);
   const saved=await api(route+"?context=edit&_fields=id,status,slug,acf,content");
   if(saved.http!==200||saved.payload.status!=="publish"||
      saved.payload.acf?.key!=="pse-company-ban-kiem-soat"||
      JSON.stringify(await semantic(saved.payload.content?.raw||""))!==JSON.stringify(target))
     throw Error("WP restored HTML table does not preserve original Joomla cells");
   console.log("PSE_CORPORATE_TABLE_RESTORE=PASS; id=79272; cells="+target.cells.length+
     "; originalSourceSha="+digest(original).slice(0,20)+"; WordPressStatus=publish");
 }
 console.log("PSE_CORPORATE_TABLE_SOURCE=PASS; no_menu_mutation=true; no_astro_build=true");
}finally{await browser.close()}
