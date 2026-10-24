import {chromium} from "playwright";
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,"")).filter(x=>x.startsWith("WC_URL="));
if(env.length!==1)throw Error("Invalid WP origin config");
const url=new URL(env[0].slice(7).trim().replace(/^['"]|['"]$/g,""));
if(url.protocol!=="https:"||!url.hostname||!["","/"].includes(url.pathname))throw Error("Invalid WP HTTPS origin");
const browser=await chromium.launch({headless:true});
const context=await browser.newContext();
const page=await context.newPage();
page.on("dialog",async d=>{if(d.type()==="confirm")await d.accept();else await d.dismiss()});
try{
 const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
 if(!username||!password)throw Error("Missing WP credentials");
 await page.goto(url.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
   await page.locator("#user_login").fill(username);
   await page.locator("#user_pass").fill(password);
   const txt=await page.locator("body").innerText();
   const m=txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
   if(m){
     const a=Number(m[1]),b=Number(m[3]);
     const ans=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
     const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
     if(!await input.count())throw Error("Unsupported login challenge");
     await input.fill(String(ans));
   }
   await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("Login failed");
 const res=await page.evaluate(async()=>{
   const nonce=window.wpApiSettings?.nonce || (await (await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"})).text()).trim();
   if(!/^[a-zA-Z0-9]{8,24}$/.test(nonce))throw Error("WP REST nonce missing");
   const r=await fetch("/wp-json/wp/v2/menu-items?context=edit&per_page=100",{credentials:"same-origin",headers:{"X-WP-Nonce":nonce}});
   return {status:r.status,items:await r.json()};
 });
 if(res.status!==200||!Array.isArray(res.items))throw Error("WP menu items not readable");
 const roots=res.items.filter(x=>String(x.title?.raw||x.title?.rendered||"").trim()==="PVFCCo-PSE");
 if(roots.length!==1)throw Error("Missing unique corporate menu");
 const items=res.items.filter(x=>Number(x.parent)===Number(roots[0].id));
 if(items.length!==10)throw Error("Unexpected corporate item count "+items.length);
 const legacy=await context.newPage();
 let ok=0;
 for(const item of items){
   const target=new URL(item.url||"");
   if(target.protocol!=="https:"||target.hostname!=="www.pse.vn"||!target.pathname.startsWith("/pvfcco-pse/"))
     throw Error("Unexpected legacy URL on menu "+item.id);
   try{
     const r=await legacy.goto(target.href,{waitUntil:"domcontentloaded",timeout:35000});
     if(r?.status()!==200)throw Error("Source HTTP "+r?.status());
     const result=await legacy.evaluate(()=>{
       const selectors=[".item-page","#content .item-page",".article-content","article","#main-content"];
       return {title:document.title,candidates:selectors.map(s=>{
         const el=document.querySelector(s);
         return el?{selector:s,chars:(el.textContent||"").trim().length,images:el.querySelectorAll("img").length,
           text:(el.textContent||"").replace(/\s+/g," ").trim().slice(0,140),
           snippet:el.outerHTML.slice(0,260)}:null;
       }).filter(Boolean)};
     });
     ok++;
     console.log("PSE_SUBPAGE_ORIGIN="+JSON.stringify({id:item.id,label:item.title?.raw||item.title?.rendered,path:target.pathname,...result}));
   }catch(e){console.log("PSE_SUBPAGE_ORIGIN_ERROR="+JSON.stringify({id:item.id,path:target.pathname,error:String(e).slice(0,250)}))}
 }
 console.log("PSE_SUBPAGE_SOURCE_READ_ONLY="+(ok===10?"PASS":"PARTIAL")+"; fetched="+ok+"/10; no_wp_write=true; no_astro_build=true");
 if(ok<8)process.exitCode=1;
}finally{await browser.close()}
