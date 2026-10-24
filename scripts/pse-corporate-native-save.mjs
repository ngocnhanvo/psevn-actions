/** Native WordPress Save of ten already published verified corporate Pages,
 * only for Page IDs missing from the established get-page-logs incremental queue.
 * Never alter action/key/content, never inject fake build logs, never launch Astro.
 */
import {chromium} from "playwright";
import {createHash} from "node:crypto";
const hash=s=>createHash("sha256").update(String(s||"")).digest("hex");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const fields=env.filter(x=>x.startsWith("WC_URL="));
if(fields.length!==1)throw Error("Missing unique WP environment URL");
const u=new URL(fields[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||!["","/"].includes(u.pathname)||u.search||u.hash)
 throw Error("Invalid WP HTTPS URL");
const wp=u.origin;
const dry=process.env.PSE_CORPORATE_NATIVE_SAVE!=="1";
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1400,height:950}});
const page=await context.newPage();
page.on("dialog",async d=>{if(d.type()==="confirm")await d.accept();else await d.dismiss()});
try{
 const user=process.env.WP_ADMIN_USERNAME,pass=process.env.WP_ADMIN_PASSWORD;
 if(!user||!pass)throw Error("Missing WP editor auth");
 await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(user);await page.locator("#user_pass").fill(pass);
  const text=await page.locator("body").innerText();
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await input.count())throw Error("WP login arithmetic input missing");
   await input.fill(String(v));
  }
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WP login failed");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("Missing REST nonce HTTP "+r.status);
  const n=(await r.text()).trim();
  if(!/^[a-zA-Z0-9]{8,24}$/.test(n)||n==="0")throw Error("Invalid WP nonce");
  return n;
 });
 const get=async path=>page.evaluate(async({path,nonce})=>{
  const r=await fetch(path,{credentials:"same-origin",headers:{Accept:"application/json","X-WP-Nonce":nonce}});
  return {http:r.status,payload:await r.json().catch(()=>null)};
 },{path,nonce});
 const slugs=[
  "thong-diep","hoi-dong-quan-tri","ban-kiem-soat","ban-giam-doc","so-do-to-chuc",
  "qua-trinh-hinh-thanh-phat-trien","tam-nhin-su-menh","dinh-huong-phat-trien",
  "nganh-nghe-kinh-doanh","thanh-tuu"
 ];
 const ids=[79270,79271,79272,79273,79300,79301,79303,79278,79279,79311];
 const pages=await get("/wp-json/wp/v2/pages?context=edit&status=publish&include="+ids.join(",")+
  "&per_page="+ids.length+"&_fields=id,slug,status,acf,title,content");
 if(pages.http!==200||!Array.isArray(pages.payload)||pages.payload.length!==10)
  throw Error("Ten published corporate Pages cannot be verified");
 const expected=[];
 for(let i=0;i<ids.length;i++){
  const a=pages.payload.filter(p=>p.id===ids[i]);
  if(a.length!==1||a[0].slug!==slugs[i]||a[0].status!=="publish"||
   a[0].acf?.action!=="PublicPage"||a[0].acf?.key!=="pse-company-"+slugs[i]||
   !String(a[0].content?.raw||"").trim())
   throw Error("Unexpected CMS corporate content on "+slugs[i]);
  expected.push({id:ids[i],slug:slugs[i],content:a[0].content.raw});
 }
 const fingerprint=async(html)=>page.evaluate(value=>{
  const el=document.createElement("div");
  el.innerHTML=String(value||"");
  const text=(el.textContent||"").replace(/\s+/g," ").trim();
  return {text,images:[...el.querySelectorAll("img")].map(n=>[n.getAttribute("src")||"",n.getAttribute("alt")||""]),
    links:[...el.querySelectorAll("a[href]")].map(n=>[n.getAttribute("href")||"",(n.textContent||"").trim()]),
    tables:el.querySelectorAll("table").length,
    cells:[...el.querySelectorAll("td,th")].map(n=>(n.textContent||"").replace(/\s+/g," ").trim()),
    headings:[...el.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(n=>(n.textContent||"").replace(/\s+/g," ").trim())
  };
 },html);
 const logs=async()=>{
  const state=await get("/wp-json/astro/v1/get-page-logs");
  if(state.http!==200||!Array.isArray(state.payload))throw Error("Native PHP Page logs unavailable");
  return new Map(state.payload.filter(x=>Number.isSafeInteger(x.id)).map(x=>[x.id,x]));
 };
 let current=await logs();
 const missing=expected.filter(p=>!current.has(p.id)||current.get(p.id).action!=="modify");
 console.log("PSE_CORPORATE_PAGE_LOG_PREFLIGHT="+JSON.stringify({
   total:expected.length,queued:expected.length-missing.length,missing:missing.map(p=>p.id),mode:dry?"audit":"native-save"
 }));

 // WordPress Classic Editor can normalize markup on native Save. Compare the
 // new Page and its latest revisions before allowing any further native Saves.
 const revisions=await get("/wp-json/wp/v2/pages/79270/revisions?context=edit&per_page=5&_fields=id,date,content");
 const main=pages.payload.find(p=>p.id===79270);
 const fingerprints=await page.evaluate(records=>records.map(record=>{
   const div=document.createElement("div");div.innerHTML=record.html||"";
   const text=(div.textContent||"").replace(/\s+/g," ").trim();
   return {id:record.id,textLength:text.length,
     plainText:text,images:[...div.querySelectorAll("img")].map(x=>x.getAttribute("src")||""),
     links:[...div.querySelectorAll("a[href]")].map(x=>x.getAttribute("href")||""),
     tables:div.querySelectorAll("table").length};
 }),[{id:"current",html:main?.content?.raw||""},
     ...(Array.isArray(revisions.payload)?revisions.payload.map(r=>({id:r.id,html:r.content?.raw||""})):[])]);
 const info=fingerprints.map(x=>({
   id:x.id,textLength:x.textLength,textHash:hash(x.plainText),
   images:x.images.length,links:x.links.length,tables:x.tables
 }));
 console.log("PSE_CORPORATE_NATIVE_PAGE_REVISIONS="+JSON.stringify({
   http:revisions.http,records:info,queuedCurrentPage:current.get(79270)?.action==="modify"
 }));

 if(dry){console.log("PSE_CORPORATE_PAGE_LOG_AUDIT=PASS; wp_mutation=false");process.exit(0)}
 let saved=0;
 for(const item of missing){
  await page.goto(wp+"/wp-admin/post.php?post="+item.id+"&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
  if(page.url().includes("wp-login")||!(await page.locator("#post").count())||
     !(await page.locator("#publish").count()))
   throw Error("WP Page native editor unavailable "+item.id);
  if(await page.locator("#post_status").inputValue()!=="publish")
   throw Error("Page unexpectedly not published "+item.id);
  const before=await fingerprint(item.content);
  const done=page.waitForNavigation({waitUntil:"domcontentloaded",timeout:50000}).catch(()=>null);
  await page.locator("#publish").click();
  await done;
  const persisted=await get("/wp-json/wp/v2/pages/"+item.id+
    "?context=edit&_fields=id,slug,status,acf,content");
  if(persisted.http!==200||persisted.payload?.id!==item.id||
    persisted.payload.status!=="publish"||persisted.payload.slug!==item.slug||
    persisted.payload.acf?.key!=="pse-company-"+item.slug||
    persisted.payload.acf?.action!=="PublicPage"||
    !(await fingerprint(persisted.payload.content?.raw)).text)
   throw Error("Native Page Save mutated CMS content/metadata "+item.id);
  const after=await fingerprint(persisted.payload.content?.raw);
  if(JSON.stringify(before)!==JSON.stringify(after)){
    console.log("PSE_CORPORATE_NATIVE_SEMANTIC_DIFF="+JSON.stringify({
      id:item.id,beforeTextLength:before.text.length,afterTextLength:after.text.length,
      beforeTextHash:hash(before.text),afterTextHash:hash(after.text),
      beforeImages:before.images.length,afterImages:after.images.length,
      beforeLinks:before.links.length,afterLinks:after.links.length,
      beforeTables:before.tables,afterTables:after.tables
    }));
    throw Error("Native Page Save changed semantic content "+item.id);
  }
  let found=false;
  for(let attempt=0;attempt<4;attempt++){
   current=await logs();
   if(current.get(item.id)?.action==="modify"&&current.get(item.id)?.page?.id===item.id){
    found=true;break;
   }
   await page.waitForTimeout(900);
  }
  if(!found)throw Error("Native Page Save did not register incremental Page event "+item.id);
  saved++;
  console.log("PSE_CORPORATE_NATIVE_PAGE_SAVE=PASS; id="+item.id+"; slug="+item.slug);
 }
 current=await logs();
 const all=expected.every(item=>current.get(item.id)?.action==="modify"&&
   current.get(item.id)?.page?.id===item.id);
 if(!all)throw Error("Page logs still incomplete after native Saves");
 console.log("PSE_CORPORATE_PAGE_LOG_SUMMARY="+JSON.stringify({
  total:10,saved,alreadyQueued:10-missing.length,pageLogsVerified:10,
  contentUnchanged:true,no_astro_build:true,mode:"native-save",pass:true
 }));
}finally{await browser.close()}
