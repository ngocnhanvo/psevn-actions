/** Remove only empty Joomla spacer paragraphs from published PSE page 81043.
 * No figure, table, image, action/key or build alterations. Backup and readback.
 */
import {chromium} from "playwright";
import {createHash} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
const sha=s=>createHash("sha256").update(String(s)).digest("hex");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const rows=env.filter(s=>s.startsWith("WC_URL="));
if(rows.length!==1)throw Error("Missing unique WordPress origin");
const target=new URL(rows[0].slice(7).replace(/^['"]|['"]$/g,""));
if(target.protocol!=="https:"||target.username||target.password||!["","/"].includes(target.pathname)||target.search||target.hash)throw Error("Invalid WP origin");
const apply=process.env.PSE_81043_APPLY==="1";
const expectedSha="4744854c7e7585112147877be9e6baaa22aaeb151619511d3673f384b238d433";
const expectedKey="pse-business-he-thong-phan-phoi-san-pham-tai-cac-tinh-mien-dong-nam-bo";
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:900}});
const page=await context.newPage();
const dir="artifacts/pse-page-81043-cleanup";
await mkdir(dir,{recursive:true});
try{
 const user=process.env.WP_ADMIN_USERNAME,pass=process.env.WP_ADMIN_PASSWORD;
 if(!user||!pass)throw Error("Missing WP credentials");
 await page.goto(target.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(user);
  await page.locator("#user_pass").fill(pass);
  const body=await page.locator("body").innerText();
  const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,"x":a*b,"×":a*b,"*":a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error("Unknown login challenge");
   await f.fill(String(v));
  }
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WP login rejected");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("Missing REST nonce "+r.status);
  const n=(await r.text()).trim();if(!/^[a-zA-Z0-9]{8,24}$/.test(n)||n==="0")throw Error("Invalid nonce");return n;
 });
 const api=async(method,payload)=>page.evaluate(async({method,payload,nonce})=>{
  const r=await fetch("/wp-json/wp/v2/pages/81043?context=edit",{
   method,credentials:"same-origin",headers:{Accept:"application/json","X-WP-Nonce":nonce,
    ...(payload?{"Content-Type":"application/json"}:{})},...(payload?{body:JSON.stringify(payload)}:{})});
  return {http:r.status,payload:await r.json().catch(()=>null)};
 },{method,payload,nonce});
 const pre=await api("GET");
 if(pre.http!==200||pre.payload?.id!==81043||pre.payload.type!=="page"||pre.payload.status!=="publish"||
    pre.payload.acf?.action!=="PublicPage"||pre.payload.acf?.key!==expectedKey)
  throw Error("Unexpected PSE page 81043 identity/status; no write");
 const raw=String(pre.payload.content?.raw||"");
 if(sha(raw)!==expectedSha)throw Error("WP content changed since read-only audit. Expected "+expectedSha+"; got "+sha(raw)+". No write");
 const fragments=raw.match(/<p\b[^>]*>[\s\S]*?<\/p\s*>/gi)||[];
 const empty=await page.evaluate(fragments=>fragments.filter(fragment=>{
   const div=document.createElement("div");div.innerHTML=fragment;
   const p=div.querySelector("p");
   if(!p)return false;
   const text=(p.textContent||"").replace(/[\s\u00a0\u200b\ufeff]/g,"");
   return !text&&!p.querySelector("img,svg,video,iframe,a,input,hr,object,embed,canvas,audio");
 }),fragments);
 const blocked=new Set(empty);
 const afterRaw=raw.replace(/<p\b[^>]*>[\s\S]*?<\/p\s*>/gi,match=>blocked.has(match)?"":match);
 if(empty.length!==5||afterRaw===raw)throw Error("Expected exactly five removable empty paragraphs, found "+empty.length);
 const finger=async value=>page.evaluate(value=>{
   const el=document.createElement("div");el.innerHTML=value;
   const norm=e=>(e?.textContent||"").replace(/\s+/g," ").replace(/\u00a0/g," ").trim();
   return {text:norm(el),tables:el.querySelectorAll("table").length,
     rows:[...el.querySelectorAll("tr")].map(e=>[...e.children].filter(n=>/^(TH|TD)$/.test(n.tagName)).map(c=>[norm(c),c.getAttribute("rowspan"),c.getAttribute("colspan")])),
     imgs:[...el.querySelectorAll("img")].map(e=>[e.getAttribute("src"),e.getAttribute("alt")]),
     links:[...el.querySelectorAll("a[href]")].map(e=>[e.getAttribute("href"),norm(e)])};
 },value);
 const before=await finger(raw),after=await finger(afterRaw);
 if(JSON.stringify(before)!==JSON.stringify(after))throw Error("Semantic table/content signature changed; abort");
 await writeFile(dir+"/original.json",JSON.stringify({id:81043,sha:sha(raw),content:raw},null,2));
 const audit={id:81043,mode:apply?"apply":"dry-run",oldSha:sha(raw),newSha:sha(afterRaw),
   removedEmptyParagraphs:empty.length,textLength:before.text.length,tables:before.tables,
   preserved:true,bytesBefore:raw.length,bytesAfter:afterRaw.length};
 console.log("PSE_81043_CMS_CLEANUP_PREFLIGHT="+JSON.stringify(audit));
 if(!apply){await writeFile(dir+"/report.json",JSON.stringify(audit,null,2));process.exitCode=0;}
 else{
   const write=await api("POST",{content:afterRaw});
   if(write.http!==200||write.payload?.id!==81043||write.payload?.status!=="publish")throw Error("WP page update failed HTTP "+write.http);
   const read=await api("GET");
   if(read.http!==200||read.payload?.id!==81043)throw Error("WordPress post-save readback failed HTTP "+read.http);
   const saved=String(read.payload.content?.raw||"");
   const savedFinger=await finger(saved);
   if(JSON.stringify(savedFinger)!==JSON.stringify(before))throw Error("Saved WP content semantic parity FAILED; original backup in artifact");
   if(read.payload.acf?.key!==expectedKey||read.payload.acf?.action!=="PublicPage")throw Error("PSE action/key changed unexpectedly");
   const result={...audit,readbackSha:sha(saved),publishStatus:read.payload.status,
     textEqual:true,tablesEqual:true,imagesEqual:true,linksEqual:true,verified:true};
   console.log("PSE_81043_CMS_CLEANUP_APPLIED="+JSON.stringify(result));
   await writeFile(dir+"/report.json",JSON.stringify(result,null,2));
 }
}finally{await browser.close()}
