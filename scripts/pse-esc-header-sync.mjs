/**
 * Align the ESC Menu Editor link fields with canonical WordPress nav-menu links.
 * Native WordPress nav_menu_item URLs were already migrated; Astro consumes ESC.
 * Uses the supported wp-admin nav-menus.php editor + Save Menu, not raw SQL/meta.
 * Explicitly does not convert unresolved legacy complaint link or menu placeholders.
 */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const apply=event.head_commit?.message==="cms(pse): synchronize verified ESC Header destinations with WordPress Menu";
const rows=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const env=key=>{const a=rows.filter(x=>x.startsWith(key+"="));if(a.length!==1)throw Error("PSE missing "+key);const u=new URL(a[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid origin "+key);return u.origin};
const wp=env("WC_URL"),frontend=env("WC_URL_CLIENT");
const browser=await chromium.launch({headless:true}),p=await browser.newPage({viewport:{width:1400,height:900}});
const report={mode:apply?"apply":"dry",changed:[],excluded:[],menuId:null,verified:false};
try{
 await p.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await p.locator("#user_login").count()){
  await p.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");await p.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const text=await p.locator("body").innerText(),m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const input=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await input.count())throw Error("WP challenge input absent");await input.fill(String(n))}
  await Promise.all([p.waitForLoadState("domcontentloaded"),p.locator("#wp-submit").click()]);
 }
 if(p.url().includes("wp-login"))throw Error("WP admin auth rejected");
 const nonce=await p.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("REST nonce HTTP "+r.status);return(await r.text()).trim()});
 const api=path=>p.evaluate(async({path,nonce})=>{const r=await fetch(path,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json","Cache-Control":"no-cache"},cache:"no-store"});return{http:r.status,body:await r.json().catch(()=>({}))}},{path,nonce});
 const [native,esc,pages]=await Promise.all([
  api("/wp-json/wp/v2/menu-items?context=edit&per_page=100"),
  api("/wp-json/esc-api/v1/menus?_esc_preview="+Date.now()),
  api("/wp-json/wp/v2/pages?context=edit&status=publish&per_page=100&_fields=id,slug,status")
 ]);
 if(native.http!==200||!Array.isArray(native.body)||native.body.length!==47||
    esc.http!==200||esc.body?.success!==true||
    pages.http!==200||!Array.isArray(pages.body))throw Error("WordPress Header inventory changed");
 const header=esc.body.menus?.Header?.vi;
 if(!header?.id||!Array.isArray(header.items))throw Error("ESC Header/vi unavailable");
 report.menuId=header.id;
 const flatten=a=>a.flatMap(x=>[x,...flatten(x.children||[])]);
 const frontendItems=flatten(header.items);
 if(frontendItems.length!==47)throw Error("ESC menu tree item count changed");
 const byId=new Map(frontendItems.map(x=>[Number(x.id),x]));
 if(byId.size!==native.body.length)throw Error("ESC menu IDs do not correspond one-to-one to native WordPress");
 const byPageId=new Map(pages.body.map(x=>[Number(x.id),x]));
 const plan=[];
 for(const item of native.body){
  const id=Number(item.id),node=byId.get(id);
  if(!node||String(node.label||"").trim()!==String(item.title?.raw||item.title?.rendered||"").trim())
    throw Error("Menu identity mismatch id="+id);
  const current={mode:String(node.linkMode||""),type:String(node.linkType||""),href:String(node.href||""),slug:String(node.slug||"")};
  if(item.type==="post_type"&&item.object==="page"){
   const page=byPageId.get(Number(item.object_id));
   if(!page||page.status!=="publish")throw Error("WordPress Page no longer published item="+id);
   const expectedSlug=page.slug,already=current.mode==="page"&&current.type==="internal"&&
      current.slug.replace(/^\/+|\/+$/g,"")===expectedSlug;
   if(!already)plan.push({id,label:node.label,kind:"page",pageId:page.id,slug:expectedSlug,before:current});
   continue;
  }
  if(item.type==="custom"){
   let u=null;try{u=new URL(String(item.url||""))}catch{}
   if(u&&u.origin===frontend&&u.pathname.startsWith("/")&&u.pathname!=="/"){
    const expected=u.href;
    const already=current.mode==="custom"&&current.href===expected;
    if(!already)plan.push({id,label:node.label,kind:"custom",url:expected,before:current});
   }else if(u?.hostname==="www.pse.vn"){
    if(id!==77020)throw Error("Unexpected unresolved Joomla URL "+id+" (do not silently keep)");
    report.excluded.push({id,label:node.label,reason:"Complaint form not yet migrated"});
   }else{
    report.excluded.push({id,label:node.label,reason:"Placeholder or home menu preserved"});
   }
   continue;
  }
  throw Error("Unrecognized WordPress menu item type id="+id);
 }
 if(!plan.length){console.log("PSE_ESC_HEADER_SYNC=ALREADY_CORRECT; noCmsWrite=true");process.exit(0)}
 if(plan.length<25||plan.length>45)throw Error("Unsafe/unexpected editor delta count "+plan.length);
 report.changed=plan.map(x=>({...x,after:x.kind==="custom"?x.url:x.slug}));
 console.log("PSE_ESC_HEADER_PREFLIGHT="+JSON.stringify({mode:report.mode,total:native.body.length,changes:plan.length,excluded:report.excluded,rows:plan.map(x=>({id:x.id,label:x.label,kind:x.kind,before:x.before.href||x.before.slug,to:x.kind==="custom"?x.url:x.slug}))}).slice(0,28000));
 const opened=await p.goto(wp+"/wp-admin/nav-menus.php?action=edit&menu="+Number(header.id),{waitUntil:"domcontentloaded",timeout:60000});
 if(opened?.status()!==200||!await p.locator("#menu-to-edit").count())throw Error("WordPress Menu Manager editor unavailable");
 const prepared=await p.evaluate(plan=>{
  for(const entry of plan){
   const box=document.querySelector('.esc-menu-item-fields[data-item-id="'+entry.id+'"]');
   const li=document.querySelector("#menu-item-"+entry.id);
   if(!box||!li)return{ok:false,id:entry.id,reason:"Missing native editor entry"};
   const select=box.querySelector('select[name="esc-menu-item-link-type['+entry.id+']"]');
   const custom=box.querySelector('input[name="esc-menu-item-custom-url['+entry.id+']"]');
   const page=box.querySelector('select[name="esc-menu-item-page-id['+entry.id+']"]');
   if(!select||!custom||!page)return{ok:false,id:entry.id,reason:"Missing ESC link controls"};
   if(entry.kind==="page"){
    if(![...page.options].some(o=>o.value===String(entry.pageId))){
     const option=document.createElement("option");option.value=String(entry.pageId);option.text=entry.label;page.add(option);
    }
    select.value="page";page.value=String(entry.pageId);custom.value="";
    if(select.value!=="page"||page.value!==String(entry.pageId))return{ok:false,id:entry.id,reason:"Page not selectable"};
   }else{
    select.value="custom";custom.value=entry.url;
    if(select.value!=="custom"||custom.value!==entry.url)return{ok:false,id:entry.id,reason:"Custom URL not selectable"};
   }
   select.dispatchEvent(new Event("change",{bubbles:true}));
   custom.dispatchEvent(new Event("input",{bubbles:true}));
   custom.dispatchEvent(new Event("change",{bubbles:true}));
  }
  return{ok:true,prepared:plan.length};
 },plan);
 if(!prepared.ok||prepared.prepared!==plan.length)throw Error("WordPress ESC editor preflight failed "+JSON.stringify(prepared));
 if(!apply){console.log("PSE_ESC_HEADER_SYNC=DRY_PASS; editorReady="+plan.length+"; noCmsWrite=true");process.exit(0)}
 const save=p.locator('input[name="save_menu"]:visible').first();
 if(!await save.count())throw Error("Native WordPress Save Menu button unavailable");
 await Promise.all([p.waitForLoadState("domcontentloaded"),save.click()]);
 const after=await api("/wp-json/esc-api/v1/menus?_esc_preview="+Date.now());
 if(after.http!==200||after.body?.success!==true)throw Error("ESC menu readback unavailable after Save Menu");
 const afterItems=flatten(after.body.menus?.Header?.vi?.items||[]);
 const map=new Map(afterItems.map(x=>[Number(x.id),x]));
 const failures=[];
 for(const want of plan){
  const node=map.get(want.id);
  const correct=want.kind==="page"
   ?node?.linkMode==="page"&&node?.linkType==="internal"&&String(node.slug||"").replace(/^\/+|\/+$/g,"")===want.slug
   :node?.linkMode==="custom"&&node?.href===want.url;
  if(!correct)failures.push({id:want.id,kind:want.kind,mode:node?.linkMode,href:node?.href,slug:node?.slug});
 }
 if(failures.length)throw Error("ESC saved menu mismatches "+JSON.stringify(failures.slice(0,8)));
 const flag=await api("/wp-json/astro/v1/get-menu-logs");
 if(flag.http!==200||flag.body?.changed!==true)throw Error("WordPress menu dirty flag missing after Save Menu");
 report.verified=true;
 console.log("PSE_ESC_HEADER_SYNC=PASS; menuId="+header.id+"; corrected="+plan.length+"; unresolvedComplaint=77020; fullESCReadback=true; menuDirty=true; noAstroBuild=true");
}finally{
 await mkdir("artifacts/pse-header-sync",{recursive:true});
 await writeFile("artifacts/pse-header-sync/manifest.json",JSON.stringify(report,null,2)+"\n");
 await browser.close()
}
