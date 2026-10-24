/** Read-only PSE Vision & Mission WordPress and public DOM inspection. */
import {chromium} from "playwright";
const cfg=k=>{const rows=String(process.env.ENV_FILE||"").split(/\r?\n/).filter(x=>x.trim().startsWith(k+"="));if(rows.length!==1)throw Error("Missing "+k);const u=new URL(rows[0].trim().slice(k.length+1).replace(/^['"]|['"]$/g,""));if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid "+k);return u.origin};
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const front=await page.goto(cfg("WC_URL_CLIENT")+"/tam-nhin-su-menh",{waitUntil:"domcontentloaded",timeout:65000});
 if(front?.status()!==200)throw Error("Frontend HTTP "+front?.status());
 const live=await page.evaluate(()=>{
  const e=document.querySelector("main.pse-public-page .article-content");if(!e)throw Error("PublicPage absent");
  return {top:[...e.children].map(x=>({tag:x.tagName,cls:x.className,html:x.outerHTML.slice(0,1500)})),
   tables:[...e.querySelectorAll("table")].map(t=>({html:t.outerHTML.slice(0,16000),rows:t.rows.length,cells:t.querySelectorAll("td,th").length})),
   images:[...e.querySelectorAll("img")].map(i=>({src:i.getAttribute("src"),alt:i.getAttribute("alt"),loaded:i.complete&&i.naturalWidth>0})),
   overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2};
 });console.log("PSE_VISION_PUBLIC_AUDIT="+JSON.stringify(live));
 await page.goto(cfg("WC_URL")+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const txt=await page.locator("body").innerText();
  const m=txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("WP math input missing");await f.fill(String(v));}
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WP authentication failed");
 const nonce=await page.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("Nonce HTTP "+r.status);return (await r.text()).trim()});
 const obj=await page.evaluate(async n=>{const r=await fetch("/wp-json/wp/v2/pages/79303?context=edit&_fields=id,slug,status,acf,content,modified",{credentials:"same-origin",headers:{"X-WP-Nonce":n}});return {http:r.status,data:await r.json().catch(()=>({}))}},nonce);
 if(obj.http!==200||obj.data?.id!==79303||obj.data.slug!=="tam-nhin-su-menh"||obj.data.status!=="publish"||obj.data.acf?.key!=="pse-company-tam-nhin-su-menh"||obj.data.acf?.action!=="PublicPage")throw Error("Page identity mismatch");
 const raw=String(obj.data.content?.raw||"");
 const cms=await page.evaluate(html=>{const d=document.createElement("div");d.innerHTML=html;return {top:[...d.children].map(x=>({tag:x.tagName,html:x.outerHTML.slice(0,1800)})),tables:[...d.querySelectorAll("table")].map(t=>({rows:t.querySelectorAll("tr").length,html:t.outerHTML.slice(0,16000),cells:[...t.querySelectorAll("td,th")].map(c=>({text:(c.textContent||"").replace(/\s+/g," ").trim().slice(0,4000),html:c.innerHTML.slice(0,5000)}))})),images:[...d.querySelectorAll("img")].map(i=>({src:i.getAttribute("src"),alt:i.getAttribute("alt")})),text:(d.textContent||"").replace(/\s+/g," ").trim().slice(0,7000)}},raw);
 console.log("PSE_VISION_WP_AUDIT="+JSON.stringify({http:obj.http,id:obj.data.id,modified:obj.data.modified,rawLength:raw.length,action:obj.data.acf.action,key:obj.data.acf.key,...cms,readOnly:true,noBuild:true}));
}finally{await browser.close()}
