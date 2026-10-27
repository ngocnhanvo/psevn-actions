/** PSE Header menu authoritative URL parity audit; no WordPress writes. */
import {chromium} from "playwright";
const vars=Object.fromEntries(String(process.env.ENV_FILE||"").split(/\r?\n/).map(v=>v.trim().replace(/^export\s+/,"")).filter(v=>/^WC_URL(_CLIENT)?=/.test(v)).map(v=>{const p=v.indexOf("="),url=new URL(v.slice(p+1).replace(/^['"]|['"]$/g,""));if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||!["","/"].includes(url.pathname))throw Error("Invalid PSE origin");return[v.slice(0,p),url.origin]}));
if(!vars.WC_URL||!vars.WC_URL_CLIENT)throw Error("PSE origin not configured");
const browser=await chromium.launch({headless:true}),p=await browser.newPage({viewport:{width:1440,height:900}});
try{
 await p.goto(vars.WC_URL+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await p.locator("#user_login").count()){
  await p.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");await p.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=await p.locator("body").innerText(),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const f=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("Login challenge absent");await f.fill(String(v))}
  await Promise.all([p.waitForLoadState("domcontentloaded"),p.locator("#wp-submit").click()]);
 }
 if(p.url().includes("wp-login"))throw Error("PSE WordPress admin access denied");
 const nonce=await p.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("REST nonce fail");return(await r.text()).trim()});
 const data=await p.evaluate(async nonce=>{const paths=["/wp-json/wp/v2/menu-items?context=edit&per_page=100","/wp-json/esc-api/v1/menus"];return Promise.all(paths.map(async path=>{const r=await fetch(path,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,"Cache-Control":"no-cache"}});return{http:r.status,path,body:await r.json().catch(()=>({}))}}))},nonce);
 const [native,esc]=data;
 if(native.http!==200||!Array.isArray(native.body)||esc.http!==200||!esc.body.success)throw Error("Both source menus unavailable");
 const menu=esc.body.menus?.Header?.vi;
 if(!menu?.id||!Array.isArray(menu.items))throw Error("WordPress authoritative Header/vi menu missing");
 const flatten=(a,p="")=>a.flatMap(x=>[{key:x.key,id:x.id,relation:p,label:x.label,href:x.href||"",slug:x.slug||"",mode:x.linkMode,type:x.linkType},...flatten(x.children||[],x.label)]);
 const linked=flatten(menu.items);
 const all=native.body.map(x=>({id:x.id,title:String(x.title?.raw||x.title?.rendered||"").trim(),parent:x.parent,wpType:x.type,wpObject:x.object,objectId:x.object_id,url:x.url||""}));
 console.log("PSE_HEADER_AUTH_MENU="+JSON.stringify({menuId:menu.id,items:linked}).slice(0,29000));
 console.log("PSE_HEADER_NATIVE_MENU="+JSON.stringify(all).slice(0,29000));
 const res=await p.goto(vars.WC_URL+"/wp-admin/nav-menus.php?action=edit&menu="+Number(menu.id),{waitUntil:"domcontentloaded",timeout:60000});
 if(res?.status()!==200||!await p.locator("#menu-to-edit").count())throw Error("WordPress Menu Editor unavailable");
 const inspected=await p.evaluate(()=>{
  const anchors=[77006,77005,77011,77012,77013,77025,77020];
  const fields=anchors.map(id=>{
   const li=document.querySelector("#menu-item-"+id);
   const esc=li?.querySelector(".esc-menu-item-fields");
   const nodes=[...(li?.querySelectorAll("input,select")||[])].map(x=>({name:x.name,type:x.type||x.tagName.toLowerCase(),value:x.value,selectedText:x.tagName==="SELECT"?x.selectedOptions?.[0]?.textContent?.trim():"",options:x.tagName==="SELECT"?[...x.options].slice(0,8).map(o=>({value:o.value,text:o.textContent?.trim()})):undefined})).filter(x=>/(menu-item-url|esc-menu-item|menu-item-type|menu-item-object)/.test(x.name));
   return{id,exists:!!li,escFields:!!esc,open:!li?.classList.contains("menu-item-edit-inactive"),nodes};
  });
  return{fields,form:!!document.querySelector("#update-nav-menu"),menuItemCount:document.querySelectorAll("#menu-to-edit > li").length};
 });
 console.log("PSE_HEADER_EDITOR_FIELDS="+JSON.stringify(inspected).slice(0,30000));
 const mismatch=linked.filter(x=>/^https?:\/\/www\.pse\.vn\//.test(x.href)||/^https?:\/\/www\.pse\.vn\//.test(x.slug));
 console.log("PSE_HEADER_AUDIT_SUMMARY="+JSON.stringify({nativeCount:all.length,escCount:linked.length,oldOriginCount:mismatch.length,oldOrigin:mismatch.map(x=>({id:x.id,label:x.label,href:x.href,slug:x.slug,mode:x.mode,type:x.type})),readOnly:true}).slice(0,22000));

 // READ-ONLY AJAX UX: simulate a menu save; every potential write request is
 // intercepted and either mocked (AJAX) or aborted (native navigation).
 if(!(await p.evaluate(()=>typeof window.escPseMenuEditorRefresh==="function")))throw Error("Native menu AJAX partial refresher not installed");
 let ajaxSave=0,legacyPost=0,navigations=0;
 const beforeUrl=p.url();
 const beforeItems=await p.locator("#menu-to-edit > li.menu-item").count();
 p.on("framenavigated",frame=>{if(frame===p.mainFrame())navigations++});
 await p.route("**/wp-admin/nav-menus.php**",async route=>{
  if(route.request().method()==="POST"){legacyPost++;await route.abort("blockedbyclient")}
  else await route.continue();
 });
 await p.route("**/wp-admin/admin-ajax.php",async route=>{
  const req=route.request();
  if(req.method()==="POST"&&(req.postData()||"").includes("esc_pse_menu_async_save")){
   ajaxSave++;
   await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({success:true,data:{message:"AJAX save mock",count:beforeItems}})});
  }else await route.continue();
 });
 const firstRoot=p.locator("#menu-to-edit > li.menu-item-depth-0").first();
 if(await firstRoot.count()){
  const expand=firstRoot.locator(".item-edit").first();
  if(await expand.count()) await expand.click();
 }
 const openBefore=await firstRoot.count()?await firstRoot.evaluate(el=>el.classList.contains("menu-item-edit-active")):null;
 await p.locator("#save_menu_header").click();
 await p.locator("#esc-pse-menu-ajax-status.notice-success").waitFor({state:"visible",timeout:15000});
 const afterItems=await p.locator("#menu-to-edit > li.menu-item").count();
 const openAfter=await firstRoot.count()?await firstRoot.evaluate(el=>el.classList.contains("menu-item-edit-active")):null;
 if(ajaxSave!==1||legacyPost!==0||navigations!==0||p.url()!==beforeUrl||afterItems!==beforeItems||openAfter!==openBefore){
  throw Error("AJAX save must update without navigation or collapsing the active editor: "+JSON.stringify({ajaxSave,legacyPost,navigations,beforeItems,afterItems,openBefore,openAfter}));
 }
 console.log("PSE_NATIVE_MENU_AJAX_READONLY_QA=PASS "+JSON.stringify({ajaxSave,legacyPost,navigations,beforeItems,afterItems,openStatePreserved:true,wordpressWrites:0}));
}finally{await browser.close()}
