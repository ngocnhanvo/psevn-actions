/** Live PSE Header destination parity versus ESC API; no content or menu mutation. */
import {chromium} from "playwright";
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const root=key=>{const hit=vars.filter(v=>v.startsWith(key+"="));if(hit.length!==1)throw Error("Missing PSE "+key);const u=new URL(hit[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid PSE origin "+key);return u.origin};
const frontend=root("WC_URL_CLIENT"),wp=root("WC_URL");
const browser=await chromium.launch({headless:true});
try{
 const api=await browser.newPage();
 const source=await api.request.get(wp+"/wp-json/esc-api/v1/menus?_esc_preview="+Date.now(),{timeout:25000});
 if(!source.ok())throw Error("WordPress ESC menu unavailable HTTP "+source.status());
 const json=await source.json();const menu=json?.menus?.Header?.vi;
 if(json?.success!==true||!Array.isArray(menu?.items)||menu?.items.length<3)throw Error("WordPress Header/vi menu schema changed");
 const flatten=items=>items.flatMap(x=>[x,...flatten(x.children||[])]);
 const all=flatten(menu.items);
 if(all.length!==47)throw Error("PSE Header count changed "+all.length);
 const unwanted=all.filter(x=>{try{return new URL(x.href).hostname==="www.pse.vn"&&Number(x.id)!==77020}catch{return false}});
 if(unwanted.length)throw Error("ESC Header still has unmigrated pse.vn links "+JSON.stringify(unwanted.map(x=>({id:x.id,label:x.label,href:x.href}))));
 const expected=all.filter(x=>(x.linkMode==="page"&&String(x.slug||""))||(x.linkMode==="custom"&&String(x.href||""))).map(x=>{
   let url;
   if(x.linkMode==="page")url=frontend+"/"+String(x.slug).replace(/^\/+|\/+$/g,"")+"/";
   else url=new URL(x.href,frontend).href;
   const parsed=new URL(url);
   return{id:x.id,label:x.label,path:parsed.pathname.replace(/\/+$/,"")||"/",search:parsed.search,origin:parsed.origin};
 }).filter(x=>x.id!==77020&&x.id!==76983);
 if(expected.length<35)throw Error("Unexpected low number of actionable migrated Header links "+expected.length);
 const result=[];
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  try{
   const response=await page.goto(frontend+"/",{waitUntil:"domcontentloaded",timeout:60000});
   if(response?.status()!==200)throw Error("PSE homepage unavailable HTTP "+response?.status());
   const navId=width>=768?"#desktop-menu":"#mobile-menu-container";
   const discovered=await page.evaluate(sel=>[...document.querySelectorAll(sel+" a[href]")].map(a=>({label:(a.textContent||"").replace(/\s+/g," ").trim(),href:a.href})),navId);
   if(discovered.length<20)throw Error("Unexpectedly small frontend Header DOM on "+width+"px: "+discovered.length);
   const links=discovered.map(x=>{const u=new URL(x.href);return{...x,origin:u.origin,path:u.pathname.replace(/\/+$/,"")||"/",search:u.search,hostname:u.hostname}});
   const failures=expected.filter(x=>!links.some(y=>y.origin===x.origin&&y.path===x.path&&y.search===x.search));
   const old=links.filter(x=>x.hostname==="www.pse.vn");
   if(old.length>1||old.length===1&&!old[0].href.includes("xu-ly-khieu-nai"))
      throw Error("Frontend still includes unexpected Joomla links "+JSON.stringify(old));
   const ok=!failures.length;
   result.push({width,expected:expected.length,links:links.length,missing:failures.map(x=>({id:x.id,label:x.label,path:x.path,search:x.search})),remainingOriginalComplaint:old.length,pass:ok});
   console.log("PSE_ESC_HEADER_LIVE="+JSON.stringify(result.at(-1)).slice(0,12000));
  }finally{await page.close()}
 }
 console.log("PSE_ESC_HEADER_LIVE_SUMMARY="+JSON.stringify({checks:result.length,failed:result.filter(x=>!x.pass).length,details:result,readOnly:true}));
 if(result.some(x=>!x.pass))process.exitCode=1;
}finally{await browser.close()}
