/** Read-only WordPress + frontend inspection for PSE hotline and FAQ, before ESC Table migration. */
import {chromium} from "playwright";
const env=Object.fromEntries(String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,"")).filter(s=>/^WC_URL(_CLIENT)?=/.test(s)).map(s=>{const i=s.indexOf("="),k=s.slice(0,i),url=new URL(s.slice(i+1).replace(/^['"]|['"]$/g,""));if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||!["","/"].includes(url.pathname))throw Error("Bad origin "+k);return[k,url.origin]}));
if(!env.WC_URL||!env.WC_URL_CLIENT)throw Error("Both CMS and frontend URLs required");
if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("Missing WP login secrets");
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:950}});
try {
 await page.goto(env.WC_URL+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const t=await page.locator("body").innerText(),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!(await f.count()))throw Error("WP challenge field missing");
   await f.fill(String(v));
  }
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WP auth failed");
 const nonce=await page.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("Nonce status "+r.status);return (await r.text()).trim()});
 const ask=async path=>page.evaluate(async({path,nonce})=>{const r=await fetch(path,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,"Cache-Control":"no-cache"}});return {http:r.status,total:r.headers.get("X-WP-Total"),json:await r.json().catch(()=>null)}},{path,nonce});
 for(const slug of ["duong-day-nong","hoi-dap"]){
  const r=await ask("/wp-json/wp/v2/pages?context=edit&slug="+slug+"&_fields=id,slug,status,title,content,acf,modified");
  if(r.http!==200||!Array.isArray(r.json))throw Error("Page query fail "+slug+" HTTP "+r.http);
  console.log("PSE_SUPPORT_PAGE_MATCH="+JSON.stringify({slug,candidates:r.json.map(p=>({id:p.id,status:p.status,key:p.acf?.key,action:p.acf?.action,modified:p.modified}))}));
  for(const p of r.json){
   const raw=String(p.content?.raw||"");
   const structure=await page.evaluate(raw=>{
    const root=document.createElement("div");root.innerHTML=raw;
    const sections=[...root.children].map(x=>({tag:x.tagName,cls:String(x.className||"").slice(0,120),text:(x.textContent||"").replace(/\s+/g," ").trim().slice(0,130),htmlSize:x.outerHTML.length}));
    const headings=[...root.querySelectorAll("h1,h2,h3,h4,strong,b")].slice(0,28).map(x=>({tag:x.tagName,text:(x.textContent||"").replace(/\s+/g," ").trim().slice(0,100)}));
    const tables=[...root.querySelectorAll("table")].map(t=>({rows:t.querySelectorAll("tr").length,cols:Math.max(0,...[...t.querySelectorAll("tr")].map(r=>r.children.length)),text:(t.textContent||"").replace(/\s+/g," ").trim().slice(0,210)}));
    const counts=Object.fromEntries(["p","div","section","article","table","tr","td","dl","dt","dd","a","img","iframe","form","details","summary","ul","li","h2","h3"].map(t=>[t,root.querySelectorAll(t).length]));
    const firstTags=[...root.querySelectorAll("p,div,section,article,table,details")].slice(0,24).map(n=>({tag:n.tagName,cls:String(n.className||"").slice(0,80),text:(n.textContent||"").replace(/\s+/g," ").trim().slice(0,120)}));
    const text=(root.textContent||"").replace(/\s+/g," ").trim();
    return{sections,headings,tables,counts,firstTags,textLength:text.length,excerpt:text.slice(0,2000)};
   },raw);
   console.log("PSE_SUPPORT_PAGE_STRUCTURE="+JSON.stringify({slug,id:p.id,status:p.status,key:p.acf?.key,action:p.acf?.action,modified:p.modified,rawLength:raw.length,rawPreview:raw.length<3000?raw.slice(0,3000):raw.slice(0,450),cssmoreLength:String(p.acf?.cssmore||"").length,shortcodes:[...raw.matchAll(/\[table\s+id=([^\s\]]+)/gi)].map(m=>m[1]),...structure}));
  }
  const v=await browser.newPage({viewport:{width:1440,height:900}});
  try{
   const resp=await v.goto(env.WC_URL_CLIENT+"/"+slug,{waitUntil:"domcontentloaded",timeout:60000});
   console.log("PSE_SUPPORT_FRONTEND="+JSON.stringify(await v.evaluate(({slug,http})=>{
    const main=document.querySelector("#main-content"),r=main||document.body,styles=getComputedStyle(r);
    return{slug,http,title:document.title,h1:[...r.querySelectorAll("h1")].map(n=>n.textContent?.trim()),mainClass:main?.className,sectionCount:r.querySelectorAll("section").length,cardCount:r.querySelectorAll('[class*="card"]').length,anchors:r.querySelectorAll("a").length,textLength:(r.textContent||"").trim().length,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+4,background:styles.backgroundColor,headings:[...r.querySelectorAll("h2,h3")].slice(0,12).map(n=>n.textContent?.trim().slice(0,120))};
   },{slug,http:resp?.status()})));
  }finally{await v.close()}
 }
 console.log("PSE_SUPPORT_AUDIT=PASS readOnly=true");
}finally{await browser.close()}
