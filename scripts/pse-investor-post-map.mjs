/** Read-only map of original PSE investor/knowledge Joomla articles to WordPress origin_page_id. */
import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const cfg=String(process.env.ENV_FILE||"").split(/\r?\n/).find(s=>s.trim().startsWith("WC_URL="));if(!cfg)throw Error("missing PSE WP origin");
const u=new URL(cfg.trim().slice(7).replace(/^['"]|['"]$/g,""));
const browser=await chromium.launch({headless:true});const wp=await browser.newPage();
try{
 await wp.goto(u.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await wp.locator("#user_login").count()){
  await wp.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");await wp.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=await wp.locator("body").innerText(),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],z=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const f=wp.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("math input");await f.fill(String(z))}
  await Promise.all([wp.waitForLoadState("domcontentloaded"),wp.locator("#wp-submit").click()]);
 }
 if(wp.url().includes("wp-login"))throw Error("WordPress login fail");
 const nonce=await wp.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});return(await r.text()).trim()});
 const api=path=>wp.evaluate(async({path,nonce})=>{const r=await fetch(path,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce}});return{http:r.status,headers:{total:r.headers.get("X-WP-Total"),pages:r.headers.get("X-WP-TotalPages")},data:await r.json().catch(()=>null)}},{path,nonce});
 const allPosts=[];const first=await api("/wp-json/wp/v2/posts?status=publish&context=edit&categories=1744&per_page=100&page=1&_fields=id,slug,title,date,categories,acf");
 if(first.http!==200||!Array.isArray(first.data))throw Error("Investor WP posts not readable");
 allPosts.push(...first.data);
 const pageCount=Number(first.headers.pages||1);
 for(let i=2;i<=pageCount;i++){const r=await api("/wp-json/wp/v2/posts?status=publish&context=edit&categories=1744&per_page=100&page="+i+"&_fields=id,slug,title,date,categories,acf");if(r.http!==200||!Array.isArray(r.data))throw Error("investor WP pages truncated");allPosts.push(...r.data)}
 console.log("PSE_INVESTOR_WP_ORIGIN_SAMPLE="+JSON.stringify({total:allPosts.length,originalIds:allPosts.filter(p=>p.acf?.origin_page_id).length,sample:allPosts.slice(0,8).map(p=>({id:p.id,slug:p.slug,originId:p.acf?.origin_page_id,title:p.title?.raw||p.title?.rendered}))}));
 const menus=await api("/wp-json/wp/v2/menu-items?context=edit&per_page=100");
 if(menus.http!==200||!Array.isArray(menus.data))throw Error("Menu read failed");
 const names=[77023,77024,77026,77027,77028];
 const page=await browser.newPage();
 const categories=[];
 for(const id of names){
  const m=menus.data.find(x=>x.id===id);if(!m||!m.url||!new URL(m.url).hostname.endsWith("pse.vn"))throw Error("Missing legacy menu "+id);
  const res=await page.goto(m.url,{waitUntil:"domcontentloaded",timeout:60000});if(res?.status()!==200)throw Error("Source unavailable "+id);
  const state=await page.evaluate(()=>{
   const blog=document.querySelector(".blog")||document.querySelector("main");
   return {title:document.title,html:(blog?.outerHTML||"").slice(0,8500),links:[...(blog?.querySelectorAll("a[href]")||[])].filter(a=>/\.html($|\?)/i.test(a.getAttribute("href")||"")||/Xem tiếp/i.test(a.textContent||"")).slice(0,50).map(a=>({title:(a.textContent||"").replace(/\s+/g," ").trim().slice(0,120),href:a.href}))};
  });
  const candidates=state.links.filter(x=>new URL(x.href).hostname==="www.pse.vn"&&new URL(x.href).pathname.includes("/quan-he-nha-dau-tu/"));
  console.log("PSE_INVESTOR_LEGACY_CLASS="+JSON.stringify({id,label:m.title?.raw||m.title?.rendered,source:m.url,links:candidates.slice(0,16),html:state.html.slice(0,1600)}));
  categories.push({id,name:m.title?.raw||m.title?.rendered,url:m.url,candidates});
 }
 await mkdir("artifacts/pse-investor-mapping",{recursive:true});
 await writeFile("artifacts/pse-investor-mapping/audit.json",JSON.stringify({wpPosts:allPosts.map(p=>({id:p.id,slug:p.slug,title:p.title?.raw||p.title?.rendered,originId:p.acf?.origin_page_id,categories:p.categories})),categories},null,2)+"\n");
 console.log("PSE_INVESTOR_MAPPING_AUDIT=PASS; no_changes=true");
}finally{await browser.close()}
