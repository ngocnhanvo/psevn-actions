/** Convert generated Header "View all" links into ordinary, editable WordPress menu items.
 * Audit and apply are deliberately separate. Never edit existing menu entries.
 */
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";

const marker=(await readFile(".pse-explicit-menu-items-cms-request","utf8")).trim();
if(!["MODE=AUDIT","MODE=APPLY"].includes(marker))throw Error("Invalid requested mode");
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const expected=marker==="MODE=APPLY"
  ?"cms(pse): migrate generated View all links to native WordPress items"
  :"audit(pse): inspect generated View all menu candidates";
if(event.head_commit?.message!==expected)throw Error("Request marker / commit message mismatch");

const configured=String(process.env.ENV_FILE||"").split(/\r?\n/)
 .map(v=>v.trim().replace(/^export\s+/,"")).filter(v=>v.startsWith("WC_URL="));
if(configured.length!==1)throw Error("WordPress origin not configured");
const origin=new URL(configured[0].slice(7).replace(/^['"]|['"]$/g,""));
if(origin.protocol!=="https:"||origin.username||origin.password||origin.port&&origin.port!=="443"||
 !["","/"].includes(origin.pathname)||origin.search||origin.hash)throw Error("Unsafe WP origin");
const site=origin.origin;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1360,height:900}});
const flatten=(items,parent=0)=>items.flatMap(item=>[{...item,wpParent:parent},...flatten(item.children||[],Number(item.id))]);
const comparable=url=> {
 const s=String(url||"").trim();if(!s||s==="#")return "";
 try {const u=new URL(s,site+"/");return u.pathname.replace(/\/+$/,"")+(u.search||"");}
 catch {return s.replace(/^\/+|\/+$/g,"");}
};
const toNativeUrl=node=>{
 const href=String(node.href||node.slug||"").trim();
 if(!href||href==="#")throw Error("Menu node has no destination");
 if(/^(https?:|mailto:|tel:)/i.test(href))return href;
 return "/"+href.replace(/^\/+/, "");
};
try {
 await page.goto(site+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(marker==="MODE=APPLY" && await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=await page.locator("body").innerText();
  const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error("Login security field not available");
   await f.fill(String(n));
  }
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(marker==="MODE=APPLY" && page.url().includes("wp-login"))throw Error("WordPress login unsuccessful; hasError="+(await page.locator("#login_error").count())+" hasMath="+(await page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i]').count()));
 const nonce=marker==="MODE=AUDIT"?"":await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("WordPress REST nonce unavailable");
  return (await r.text()).trim();
 });
 const api=async(path,method="GET",body)=>{
  return await page.evaluate(async({path,nonce,method,body})=>{
   const r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,"Cache-Control":"no-cache","Accept":"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
   return {http:r.status,data:await r.json().catch(()=>({}))};
  },{path,nonce,method,body});
 };
 const readMenus=async()=>{
  const r=await api("/wp-json/esc-api/v1/menus?_pse_nonce="+Date.now());
  if(r.http!==200||r.data?.success!==true||typeof r.data.menus!=="object")throw Error("ESC menu REST source missing HTTP "+r.http+" code="+String(r.data?.code||"none")+" json="+typeof r.data);
  return r.data.menus;
 };
 const menus=await readMenus();
 const headers=Object.values(menus.Header||{}).filter(m=>Number.isSafeInteger(Number(m.id))&&Array.isArray(m.items));
 if(headers.length===0)throw Error("No authoritative Header menus");
 const original=new Map();
 let candidates=[];
 for(const menu of headers){
  const items=flatten(menu.items);
  original.set(menu.id,new Map(items.map(x=>[Number(x.id),x])));
  for(const node of items){
   if(node.showViewAll===false||!Array.isArray(node.children)||node.children.length===0||
      node.linkType==="none"||!String(node.href||node.slug||"").trim())continue;
   const target=toNativeUrl(node);
   const duplicate=node.children.some(child=>child.linkType!=="none"&&comparable(child.href||child.slug)===comparable(target));
   if(duplicate)continue;
   if(!Number.isSafeInteger(Number(node.id))||Number(node.id)<1)throw Error("Invalid candidate id");
   const title=(menu.lang==="en"?"View all ":"Xem tất cả ")+String(node.label||"").trim();
   candidates.push({menuId:Number(menu.id),lang:menu.lang,parentId:Number(node.id),
     parentLabel:node.label,title,url:target,childCount:node.children.length});
  }
 }
 if(candidates.length>35)throw Error("Unexpected menu migration size "+candidates.length);
 console.log("PSE_NATIVE_ALL_AUDIT="+JSON.stringify({
  mode:marker,menuCount:headers.length,existingMenuItems:headers.map(m=>({lang:m.lang,count:flatten(m.items).length})),
  candidates,readOnly:marker==="MODE=AUDIT"}));
 if(marker==="MODE=AUDIT")process.exitCode=0;
 else {
  let created=[];
  for(const entry of candidates){
   const before=(await readMenus()).Header?.[entry.lang];
   if(!before||Number(before.id)!==entry.menuId)throw Error("Header changed while migrating");
   const parent=flatten(before.items).find(x=>Number(x.id)===entry.parentId);
   if(!parent||parent.linkType==="none"||parent.showViewAll===false)throw Error("Parent changed");
   if(parent.children.some(x=>comparable(x.href||x.slug)===comparable(entry.url)))continue;
   const native=await api("/wp-json/wp/v2/menu-items","POST",{
    title:entry.title,url:entry.url,type:"custom",status:"publish",
    parent:entry.parentId,menus:entry.menuId
   });
   if(native.http!==201||!Number.isSafeInteger(Number(native.data?.id))||
     Number(native.data.parent)!==entry.parentId||Number(native.data.menus)!==entry.menuId)
     throw Error("WordPress native item create failed HTTP "+native.http+" parentId="+entry.parentId+" code="+String(native.data?.code||""));
   created.push({id:Number(native.data.id),menuId:entry.menuId,parentId:entry.parentId});
  }
  const latest=await readMenus();
  let preserved=0;
  for(const menu of headers){
   const before=original.get(menu.id);
   const after=flatten(latest.Header?.[menu.lang]?.items||[]);
   for(const [id,node] of before){
    const found=after.find(x=>Number(x.id)===id);
    if(!found||found.label!==node.label||found.href!==node.href||
       Number(found.wpParent)!==Number(node.wpParent))
      throw Error("Existing menu changed unexpectedly: "+id);
    preserved++;
   }
  }
  for(const x of created){
   const menu=headers.find(m=>Number(m.id)===x.menuId);
   const item=flatten(latest.Header?.[menu.lang]?.items||[]).find(n=>Number(n.id)===x.id);
   if(!item||Number(item.wpParent)!==x.parentId||!item.label)throw Error("New menu item missing in API "+x.id);
  }
  console.log("PSE_NATIVE_ALL_APPLY=PASS preservedExisting="+preserved+" created="+JSON.stringify(created));
 }
} finally {await browser.close();}
