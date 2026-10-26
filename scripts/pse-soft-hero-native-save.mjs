/**
 * Register already-saved CMS cssmore changes using the native WordPress Page
 * save REST path (save_post) required by the existing VCS delta event queue.
 * This is not a force build and does not modify page title/content/CSS.
 */
import {chromium} from "playwright";
const marker="/* PSE_SHARED_SOFT_HERO_V1 */";
const apply=process.env.PSE_HERO_REGISTER_CHANGES==="true";
const expected=[
  ["hoi-dap","pse-business-hoi-dap"],
  ["duong-day-nong","pse-business-duong-day-nong"],
  ["kenh-phan-phoi","pse-business-kenh-phan-phoi"],
  ["thong-tin-tai-chinh","pse-business-thong-tin-tai-chinh"],
];
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const urls=env.filter(x=>x.startsWith("WC_URL="));
if(urls.length!==1)throw Error("WordPress origin missing/duplicate");
const o=new URL(urls[0].slice(7).replace(/^['"]|['"]$/g,""));
if(o.protocol!=="https:"||!o.hostname||o.username||o.password||o.search||o.hash||!["","/"].includes(o.pathname))
 throw Error("Invalid WordPress origin");
const origin=o.origin;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const normalize=x=>String(x||"").replace(/\r\n?/g,"\n");
try{
 await page.goto(origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
   await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
   await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
   const body=await page.locator("body").innerText();
   const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
   if(m){
     const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
     const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
     if(!await input.count())throw Error("Missing login arithmetic input");
     await input.fill(String(n));
   }
   await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WordPress login denied");
 const nonce=await page.evaluate(async()=>{
   if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
   const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
   if(!r.ok)throw Error("REST nonce HTTP "+r.status);
   return(await r.text()).trim();
 });
 const rest=(url,method="GET",body)=>page.evaluate(async({url,method,body,nonce})=>{
   const r=await fetch(url,{method,credentials:"same-origin",cache:"no-store",
      headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},
      ...(body?{body:JSON.stringify(body)}:{})});
   return{http:r.status,data:await r.json().catch(()=>null)};
 },{url,method,body,nonce});
 const read=id=>rest("/wp-json/wp/v2/pages/"+id+"?context=edit&_fields=id,slug,status,acf,content,title,modified");
 const current=[];
 for(const [slug,key] of expected){
   const r=await rest("/wp-json/wp/v2/pages?context=edit&status=publish&slug="+encodeURIComponent(slug)+"&_fields=id,slug,status,acf,content,title,modified");
   if(r.http!==200||!Array.isArray(r.data)||r.data.length!==1)throw Error("Page not unique: "+slug);
   const d=r.data[0];
   if(d.slug!==slug||d.status!=="publish"||d.acf?.action!=="PublicPage"||
      d.acf?.key!==key||!String(d.acf?.cssmore||"").includes(marker)||
      typeof d.title?.raw!=="string"||typeof d.content?.raw!=="string")
      throw Error("Unsafe Page CSS/body/identity: "+slug);
   current.push({slug,key,id:d.id,title:d.title.raw,body:d.content.raw,css:d.acf.cssmore});
 }
 const status=async()=>{
   await page.goto(origin+"/wp-admin/admin.php?page=vcs-build-trigger",{waitUntil:"domcontentloaded",timeout:60000});
   await page.waitForFunction(()=>Boolean(window.vcsBuild?.ajax_url&&window.vcsBuild?.nonce),null,{timeout:20000});
   return page.evaluate(async()=>{
      const body=new URLSearchParams({action:"vcs_check_build_status",nonce:window.vcsBuild.nonce});
      const r=await fetch(window.vcsBuild.ajax_url,{method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8"},body:body.toString()});
      const j=await r.json();
      if(!r.ok||j.success!==true)throw Error("Build queue state unavailable");
      return {pending:Number(j.data?.pending_count||0),active:j.data?.build_active===true};
   });
 };
 const beforeQueue=await status();
 if(beforeQueue.active)throw Error("Concurrent WordPress build in progress");
 console.log("PSE_HERO_NATIVE_SAVE_PREFLIGHT="+JSON.stringify({
   approvedPages:current.map(x=>({slug:x.slug,id:x.id})),pending:beforeQueue.pending,apply
 }));
 if(!apply){console.log("PSE_HERO_NATIVE_SAVE=DRY_PASS");process.exit(0);}
 // No-op if all four already appear in pending queue; never fake repeated edits.
 if(beforeQueue.pending>=4){console.log("PSE_HERO_NATIVE_SAVE=ALREADY_QUEUED "+beforeQueue.pending);process.exit(0);}
 for(const item of current){
   const latest=await read(item.id);
   if(latest.http!==200||latest.data.slug!==item.slug||
      latest.data.acf?.key!==item.key||latest.data.status!=="publish"||
      latest.data.title?.raw!==item.title||latest.data.content?.raw!==item.body||
      normalize(latest.data.acf?.cssmore)!==normalize(item.css))
      throw Error("Concurrent Page edit: "+item.slug);
   // Explicit native Page update (save_post), without changing actual title.
   const r=await rest("/wp-json/wp/v2/pages/"+item.id,"POST",{title:item.title});
   if(r.http!==200||r.data?.id!==item.id)throw Error("Page native Save failed: "+item.slug);
   const after=await read(item.id);
   if(after.http!==200||after.data.slug!==item.slug||
      after.data.status!=="publish"||after.data.title?.raw!==item.title||
      after.data.content?.raw!==item.body||
      normalize(after.data.acf?.cssmore)!==normalize(item.css))
      throw Error("Native Save changed Page data unexpectedly: "+item.slug);
   console.log("PSE_HERO_NATIVE_SAVE_PAGE=PASS "+JSON.stringify({slug:item.slug,id:item.id,contentUnchanged:true,cssUnchanged:true}));
 }
 const afterQueue=await status();
 console.log("PSE_HERO_NATIVE_SAVE_SUMMARY="+JSON.stringify({before:beforeQueue.pending,after:afterQueue.pending,pageCount:current.length,noAstroBuild:true}));
 if(afterQueue.pending<4)throw Error("WordPress source change tracker did not register four Pages; do not force build");
}finally{await browser.close();}
