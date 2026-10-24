/** PSE corporate Pages release. Dry-run default; verifies all ten CMS drafts
 * before publishing and converting native menu items to WordPress Page links.
 * All writes use authenticated native WordPress REST with rollback bookkeeping.
 * Does NOT trigger Astro build or modify legacy Joomla migration queue.
 */
import {chromium} from "playwright";
import {writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
const sha=s=>createHash("sha256").update(String(s)).digest("hex");
const envLines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const setting=name=>{
 const r=envLines.filter(s=>s.startsWith(name+"="));
 if(r.length!==1)throw Error("Missing unique "+name);
 const u=new URL(r[0].slice(name.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||!u.hostname||u.username||u.password||u.search||u.hash||
    !["","/"].includes(u.pathname)||u.port)throw Error("Invalid HTTPS "+name);
 return u.origin;
};
const wordpress=setting("WC_URL"),frontend=setting("WC_URL_CLIENT");
if(wordpress===frontend)throw Error("WP and Astro origins must differ");
const applying=process.env.PSE_CORPORATE_RELEASE_APPLY==="1";
const report={schema:"pse-corporate-publish-v1",mode:applying?"apply":"audit",
  checked:[],published:[],menu_updated:[],errors:[]};
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1280,height:800}});
const page=await context.newPage();
page.on("dialog",async d=>{if(d.type()==="confirm")await d.accept();else await d.dismiss()});
let api,menuSnapshot=[];
try{
 const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
 if(!username||!password)throw Error("Missing WordPress admin auth");
 await page.goto(wordpress+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
   await page.locator("#user_login").fill(username);
   await page.locator("#user_pass").fill(password);
   const text=await page.locator("body").innerText();
   const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||
     text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
   if(m){
     const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
     const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
     if(!await input.count())throw Error("Missing WP login arithmetic input");
     await input.fill(String(n));
   }
   await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WP Admin login failed");
 const nonce=await page.evaluate(async()=>{
   if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
   const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
   if(!r.ok)throw Error("REST nonce HTTP "+r.status);
   const n=(await r.text()).trim();
   if(!/^[a-zA-Z0-9]{8,24}$/.test(n)||n==="0")throw Error("REST nonce malformed");
   return n;
 });
 api=(route,method="GET",data)=>page.evaluate(async({route,method,data,nonce})=>{
   const r=await fetch(route,{method,credentials:"same-origin",headers:{
     Accept:"application/json","X-WP-Nonce":nonce,...(data?{"Content-Type":"application/json"}:{})
   },...(data?{body:JSON.stringify(data)}:{})});
   return {http:r.status,body:await r.json().catch(()=>({}))};
 },{route,method,data,nonce});
 const url=p=>"/wp-json/wp/v2/"+p;
 const [menus,pages]=await Promise.all([
   api(url("menu-items?per_page=100&context=edit")),
   api(url("pages?status=publish,draft,private&per_page=100&context=edit&_fields=id,status,slug,title,acf,content,link"))
 ]);
 if(menus.http!==200||!Array.isArray(menus.body)||pages.http!==200||!Array.isArray(pages.body))
   throw Error("PSE WP Pages/Menu REST list unavailable");
 const root=menus.body.filter(x=>String(x.title?.raw||x.title?.rendered||"").trim()==="PVFCCo-PSE");
 if(root.length!==1)throw Error("Unique original corporate menu root missing");
 const entries=menus.body.filter(x=>Number(x.parent)===Number(root[0].id)).sort((a,b)=>a.id-b.id);
 if(entries.length!==10)throw Error("Expected 10 corporate children; found "+entries.length);
 const pair=[];
 for(const menu of entries){
   const source=new URL(menu.url||"");
   if(source.protocol!=="https:"||source.hostname!=="www.pse.vn"||
      !source.pathname.startsWith("/pvfcco-pse/")||!source.pathname.endsWith(".html"))
     throw Error("Menu item is not the expected source URL: "+menu.id);
   const slug=source.pathname.split("/").at(-1).slice(0,-5);
   const match=pages.body.filter(x=>x.slug===slug);
   if(match.length!==1)throw Error("Missing or ambiguous WordPress Page: "+slug);
   const wp=match[0],html=String(wp.content?.raw||"");
   if(wp.status!=="draft"||wp.acf?.action!=="PublicPage"||
      wp.acf?.key!=="pse-company-"+slug||html.length<80)
     throw Error("Corporate Page is not a verified imported draft: "+slug);
   if(html.includes("Các bài viết khác")||/<script\b/i.test(html))
     throw Error("Legacy related block or script remains in "+slug);
   const imgs=[...html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)/gi)].map(m=>m[1]);
   if(slug==="so-do-to-chuc"&&imgs.length!==1)throw Error("Corporate diagram image mismatch");
   if(slug==="qua-trinh-hinh-thanh-phat-trien"&&imgs.length!==1)throw Error("Corporate history image mismatch");
   if(slug==="tam-nhin-su-menh"&&imgs.length!==2)throw Error("Corporate vision images mismatch");
   if(slug==="thanh-tuu"&&imgs.length!==9)throw Error("Corporate achievements images mismatch");
   for(const src of imgs){
     const link=new URL(src);
     if(link.protocol!=="https:"||link.host!==new URL(wordpress).host||
        !link.pathname.startsWith("/wp-content/uploads/"))
       throw Error("Company image does not belong to verified PSE WordPress Media: "+slug);
   }
   // Preserve exact source item fields and published state for rollback.
   const old={id:menu.id,parent:menu.parent,type:menu.type,object:menu.object,
     object_id:menu.object_id,url:menu.url,title:menu.title?.raw||menu.title?.rendered||""};
   pair.push({slug,wpId:wp.id,itemId:menu.id,title:old.title,source:source.pathname,images:imgs.length,htmlLength:html.length,htmlSha:sha(html),original:old});
   report.checked.push({slug,wpId:wp.id,itemId:menu.id,status:wp.status,images:imgs.length,sha256:sha(html)});
 }
 menuSnapshot=pair;
 console.log("PSE_CORPORATE_RELEASE_PREFLIGHT=PASS; pages=10; drafts=10; media_source=WordPress; mode="+report.mode);
 if(applying){
   // A failure before menus are switched leaves the legacy public menu intact.
   for(const p of pair){
     const res=await api(url("pages/"+p.wpId),"POST",{status:"publish"});
     if(res.http!==200||res.body?.id!==p.wpId||res.body.status!=="publish")
       throw Error("Page publish failed HTTP "+res.http+" "+p.slug);
     const saved=await api(url("pages/"+p.wpId+"?context=edit&_fields=id,status,slug,acf,content"));
     if(saved.http!==200||saved.body.status!=="publish"||saved.body.slug!==p.slug||
        saved.body.acf?.action!=="PublicPage"||saved.body.acf?.key!=="pse-company-"+p.slug||
        sha(saved.body.content?.raw||"")!==p.htmlSha)
       throw Error("WP published Page read-after-write differs "+p.slug);
     report.published.push({id:p.wpId,slug:p.slug});
     console.log("PSE_CORPORATE_PAGE_PUBLISHED="+JSON.stringify({id:p.wpId,slug:p.slug}));
   }
   for(const p of pair){
     // Convert legacy custom link to WordPress Page menu item (not a pinned hostname).
     const change=await api(url("menu-items/"+p.itemId),"POST",{
       type:"post_type",object:"page",object_id:p.wpId
     });
     if(change.http!==200||change.body?.id!==p.itemId)
       throw Error("WP Page menu item bind failed HTTP "+change.http+" "+p.slug);
     const after=await api(url("menu-items/"+p.itemId+"?context=edit"));
     if(after.http!==200||after.body.id!==p.itemId||after.body.type!=="post_type"||
        after.body.object!=="page"||Number(after.body.object_id)!==p.wpId)
       throw Error("WP Menu read-after-write mismatch "+p.slug);
     report.menu_updated.push({id:p.itemId,slug:p.slug,wpId:p.wpId});
     console.log("PSE_CORPORATE_MENU_LINKED="+JSON.stringify({id:p.itemId,slug:p.slug,wpId:p.wpId}));
   }
 }
 console.log("PSE_CORPORATE_RELEASE_SUMMARY="+JSON.stringify({mode:report.mode,checked:report.checked.length,
   published:report.published.length,menus:report.menu_updated.length,errors:0,no_astro_build:true}));
}catch(e){
 report.errors.push(String(e).slice(0,320));
 console.error("PSE_CORPORATE_RELEASE_ERROR="+String(e).slice(0,320));
 if(applying&&api){
   // Restore any partial menu links before retracting newly published pages.
   for(const changed of [...report.menu_updated].reverse()){
     const previous=menuSnapshot.find(x=>x.itemId===changed.id)?.original;
     if(!previous)continue;
     const restored=await api("/wp-json/wp/v2/menu-items/"+changed.id,"POST",{
       type:"custom",url:previous.url,title:previous.title,parent:previous.parent
     }).catch(()=>null);
     console.log("PSE_CORPORATE_MENU_ROLLBACK="+JSON.stringify({id:changed.id,http:restored?.http||null}));
   }
   for(const published of [...report.published].reverse()){
     const restored=await api("/wp-json/wp/v2/pages/"+published.id,"POST",{status:"draft"}).catch(()=>null);
     console.log("PSE_CORPORATE_PAGE_ROLLBACK="+JSON.stringify({id:published.id,http:restored?.http||null}));
   }
 }
 process.exitCode=1;
}finally{
 await mkdir("artifacts",{recursive:true});
 await writeFile("artifacts/pse-corporate-release.json",JSON.stringify(report,null,2)+"\n","utf8");
 await browser.close();
}
