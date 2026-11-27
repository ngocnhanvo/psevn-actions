/** Add the single native 'Tất cả' child to Tin Công ty, FIRST in order, via WordPress REST + native Menu Manager save.
 * No edits to other existing menu items. Idempotent after partial previous creation. */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const marker=(await readFile(".pse-company-all-menu-apply-request","utf8")).trim();
if(!["MODE=APPLY","MODE=VERIFY"].includes(marker))throw Error("Unrecognized PSE company menu mode");
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const expected=marker==="MODE=APPLY"?"cms(pse): add company direct news all menu first":"test(pse): verify company direct news all menu";
if(String(event.head_commit?.message||"").split("\n")[0]!==expected)throw Error("WordPress menu write authorization marker mismatch");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const getOrigin=name=>{
 const val=env.filter(x=>x.startsWith(name+"="));
 if(val.length!==1)throw Error("Missing configured "+name);
 const u=new URL(val[0].slice(name.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||!u.hostname||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))
  throw Error("Invalid "+name);
 return u.origin;
};
const wp=getOrigin("WC_URL"),site=getOrigin("WC_URL_CLIENT");
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:980}});
const norm=s=>String(s||"").normalize("NFC").trim().toLocaleLowerCase("vi").replace(/\s+/g," ");
const flatten=(nodes,parent=0)=>nodes.flatMap(x=>[{...x,parentID:parent},...flatten(x.children||[],Number(x.id))]);
const report={mode:marker,time:new Date().toISOString(),actions:[]};
const categorySlug="tin-cong-ty";
try{
 await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const body=await page.locator("body").innerText();
  const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error("WP login challenge input not found");
   await field.fill(String(n));
  }
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WP authentication failed");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("REST nonce unavailable");return(await r.text()).trim();
 });
 const api=async(path,method="GET",body)=>page.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,"Cache-Control":"no-cache",Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},cache:"no-store",...(body?{body:JSON.stringify(body)}:{})});
  return{http:r.status,body:await r.json().catch(()=>null)};
 },{path,method,body,nonce});
 const load=async()=>{
  const r=await api("/wp-json/esc-api/v1/menus?_esc_preview="+Date.now());
  if(r.http!==200||r.body?.success!==true||!Array.isArray(r.body.menus?.Header?.vi?.items))throw Error("WordPress authoritative Header missing");
  const menu=r.body.menus.Header.vi;
  const roots=menu.items.filter(x=>/tin tức/i.test(norm(x.label)));
  if(roots.length!==1)throw Error("News root not unique");
  const branches=(roots[0].children||[]).filter(x=>norm(x.label)==="tin công ty");
  if(branches.length!==1)throw Error("Tin Công ty branch not unique");
  const parent=branches[0],all=(parent.children||[]).filter(x=>norm(x.label)==="tất cả");
  if(all.length>1||Number(menu.id)!==1687||Number(roots[0].id)!==76995||Number(parent.id)!==76996)
   throw Error("PSE menu identity drift; no save");
  return{menu,parent,all,flat:flatten(menu.items)};
 };
 const original=await load();
 const [cat,archive]=await Promise.all([
  api("/wp-json/wp/v2/categories?slug="+categorySlug+"&hide_empty=false&_fields=id,slug,parent,count,name"),
  api("/wp-json/wp/v2/pages/77030?context=edit&_fields=id,slug,status,acf")
 ]);
 if(cat.http!==200||!Array.isArray(cat.body)||cat.body.length!==1||
   cat.body[0]?.slug!==categorySlug||Number(cat.body[0].id)!==1742||
   archive.http!==200||archive.body?.acf?.key!=="ssr-posts"||archive.body?.status!=="publish"||
   String(archive.body.slug)!=="tin-tuc-su-kien")throw Error("PSE company archive source changed");
 const href=site+"/"+archive.body.slug+"/"+categorySlug;
 const route=await page.request.get(href,{timeout:60000,failOnStatusCode:false}).catch(()=>null);
 if(route?.status()!==200)throw Error("Existing public company archive is not HTTP 200");
 const initialChildren=(original.parent.children||[]).map(x=>({id:Number(x.id),label:x.label,href:x.href}));
 if(initialChildren.length!==4&&!(initialChildren.length===5&&original.all.length===1))
  throw Error("Unexpected company submenu cardinality "+initialChildren.length);
 if(!initialChildren.some(x=>x.id===76997)||!initialChildren.some(x=>x.id===77000))
  throw Error("Missing original company submenu anchors");
 let id=Number(original.all[0]?.id||0);
 if(id){
  if(original.all[0].linkMode!=="custom"||new URL(original.all[0].href||"",site).href.replace(/\/$/,"")!==href)
   throw Error("Existing 'Tất cả' is not the authorized native archive link; no overwrite");
 }else if(marker==="MODE=APPLY"){
  const created=await api("/wp-json/wp/v2/menu-items","POST",{
   title:"Tất cả",url:href,type:"custom",status:"publish",
   parent:Number(original.parent.id),menus:Number(original.menu.id)
  });
  if(created.http!==201||!Number.isSafeInteger(Number(created.body?.id))||
    Number(created.body?.parent)!==Number(original.parent.id)||
    Number(created.body?.menus)!==Number(original.menu.id))
   throw Error("WordPress native menu create failed; inspect before retry "+JSON.stringify({http:created.http,id:created.body?.id,error:created.body?.code}));
  id=Number(created.body.id);
  report.actions.push({created:id,via:"WP REST native menu-items"});
 }else throw Error("Native All item not created yet; read-only verify cannot pass");
 // Verify persisted unique item after any creation. Do not risk duplicate on retry.
 const afterCreate=await load();
 if(afterCreate.all.length!==1||Number(afterCreate.all[0].id)!==id||afterCreate.flat.length!==original.flat.length+(original.all.length?0:1))
  throw Error("Native menu item not uniquely persisted; do not create a second");
 const expectedOld=original.flat.map(x=>Number(x.id));
 const oldById=new Map(original.flat.map(x=>[Number(x.id),x]));
 const unchangedExceptNew=(newTree)=>{
  const nodes=newTree.flat;
  const oldNow=nodes.filter(x=>Number(x.id)!==id);
  if(oldNow.length!==expectedOld.length||oldNow.some((x,i)=>Number(x.id)!==expectedOld[i]))
   throw Error("Unexpected reorder/deletion of old WordPress menu nodes");
  for(const x of oldNow){const before=oldById.get(Number(x.id));
   if(!before||x.label!==before.label||x.href!==before.href||Number(x.parentID)!==Number(before.parentID))
    throw Error("Existing Header changed unexpectedly id="+x.id);
  }
 };
 unchangedExceptNew(afterCreate);
 if(Number(afterCreate.parent.children?.[0]?.id)!==id){
  if(marker!=="MODE=APPLY")throw Error("Tất cả does not occupy first submenu position");
  const editor=wp+"/wp-admin/nav-menus.php?action=edit&menu="+Number(original.menu.id);
  const res=await page.goto(editor,{waitUntil:"domcontentloaded",timeout:60000});
  if(res?.status()!==200||await page.locator("#update-nav-menu").count()!==1)throw Error("Native WordPress menu editor unavailable");
  const changed=await page.evaluate(({companyId,firstId,newId,oldIds})=>{
   const list=document.querySelector("#menu-to-edit"),form=document.querySelector("#update-nav-menu");
   if(!(list instanceof HTMLElement)||!(form instanceof HTMLFormElement))throw Error("Native menu form missing");
   const before=Array.from(list.children).filter(el=>el.classList.contains("menu-item"));
   if(before.length!==oldIds.length+1)throw Error("Native menu DOM is incomplete");
   const first=Array.from(list.children).find(el=>el.id==="menu-item-"+firstId);
   const inserted=Array.from(list.children).find(el=>el.id==="menu-item-"+newId);
   const parent=Array.from(list.children).find(el=>el.id==="menu-item-"+companyId);
   if(!first||!inserted||!parent)throw Error("Native menu row missing");
   const depth=Array.from(first.classList).find(c=>/^menu-item-depth-\d+$/.test(c));
   if(!depth||!inserted.classList.contains(depth))throw Error("New item is not a sibling of the first child");
   if(before.indexOf(parent)>=before.indexOf(first)||before.indexOf(inserted)<=before.indexOf(parent))throw Error("Invalid initial native item ordering");
   // Only move the single created DOM item. Core WordPress will save the entire
   // sequence after position input normalization; all prior relative order stays fixed.
   list.insertBefore(inserted,first);
   const after=Array.from(list.children).filter(el=>el.classList.contains("menu-item"));
   const ids=after.map(el=>Number(el.querySelector(".menu-item-data-db-id")?.value||0));
   if(ids.length!==before.length||new Set(ids).size!==ids.length||
      ids.filter(id=>id!==newId).join(",")!==oldIds.join(","))throw Error("Native DOM IDs/order changed");
   for(let n=0;n<after.length;n++){
    const field=after[n].querySelector(".menu-item-data-position");
    if(!(field instanceof HTMLInputElement))throw Error("Missing native menu item position");
    field.value=String(n+1);
   }
   const save=form.querySelector("#save_menu_header")||form.querySelector('input[name="save_menu"]');
   if(!(save instanceof HTMLElement))throw Error("Native WordPress Save Menu button missing");
   window.wpNavMenu&&(window.wpNavMenu.menusChanged=true);
   form.requestSubmit(save);
   return{nativeRows:after.length,first:newId,oldIdsPreserved:true};
  },{companyId:Number(original.parent.id),firstId:76997,newId:id,oldIds:expectedOld});
  report.actions.push({reorderedFirst:true,changed});
  const success=page.locator("#esc-pse-menu-ajax-status.notice-success");
  await success.waitFor({state:"visible",timeout:60000});
  await page.waitForFunction(()=>!document.querySelector("#update-nav-menu")?.classList.contains("esc-menu-ajax-saving"),{timeout:60000});
  const message=await success.innerText();
  if(!message.includes("Đã lưu menu thành công"))throw Error("Native WordPress menu save not confirmed: "+message);
 }
 const latest=await load();
 unchangedExceptNew(latest);
 if(latest.all.length!==1||Number(latest.parent.children?.[0]?.id)!==id||
   latest.parent.children?.length!==5||String(latest.all[0]?.href||"").replace(/\/$/,"")!==href)
  throw Error("WordPress native menu readback failed or 'Tất cả' not first");
 const newIds=(latest.parent.children||[]).map(x=>Number(x.id));
 if(newIds.slice(1).join(",")!=="76997,76998,76999,77000")
  throw Error("Existing four company children order changed: "+newIds);
 report.menu={menuId:Number(original.menu.id),parentId:Number(original.parent.id),createdItemId:id,
  children:newIds,href,allExistingIdsAndURLsPreserved:true,totalItems:latest.flat.length};
 report.actions.push({readAfterWrite:"PASS",frontEnd:"pending ASTRO build and route QA"});
 console.log("PSE_COMPANY_ALL_NATIVE_MENU=PASS "+JSON.stringify(report));
}finally{
 await mkdir("artifacts/pse-company-news",{recursive:true});
 await writeFile("artifacts/pse-company-news/native-menu.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
