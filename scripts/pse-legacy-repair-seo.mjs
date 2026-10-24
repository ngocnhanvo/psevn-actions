/** One bounded, idempotent cleanup pass for posts CREATED by PSE migration.
 * Keeps article text, attachments, dates, status, category and the source link.
 * Saves excerpt fallback + real Yoast meta description via the authorized REST field.
 * NO Astro build and NO edits to pre-existing unrelated WordPress articles.
 */
import {chromium} from "playwright";
import {readFile,writeFile} from "node:fs/promises";

const statePath="docs/pse-legacy-migration-state.json";
const state=JSON.parse(await readFile(statePath,"utf8"));
if(state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified)throw Error("Wrong checkpoint or backup missing");
const lines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,"")).filter(s=>s.startsWith("WC_URL="));
if(lines.length!==1)throw Error("Missing unique WC_URL");
const parsed=new URL(lines[0].slice(7).trim().replace(/^['"]|['"]$/g,""));
if(parsed.protocol!=="https:"||parsed.username||parsed.password||parsed.search||parsed.hash||!["","/"].includes(parsed.pathname))throw Error("Unsafe WC_URL");
const origin=parsed.origin;
const jobs=Object.entries(state.articles).filter(([sourceId,row])=>
 /^\d{3,6}$/.test(sourceId) && Number.isSafeInteger(row.wp_id) &&
 ["imported","draft_needs_date","existing"].includes(row.status) &&
 !row.seo_cleaned && (Number(row.seo_attempts||0)<3 ||
  row.seo_error==="Post has no exact migration provenance marker" ||
  (row.seo_error==="Article content unexpectedly short after cleanup" &&
   Number(row.seo_attempts||0)===3))
).slice(0,12);
if(jobs.length===0){console.log("PSE_LEGACY_SEO_REPAIR=NO_PENDING");process.exit(0)}
if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("WP credentials missing");
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:900}});
const page=await context.newPage();
const persist=()=>writeFile(statePath,JSON.stringify(state,null,2)+"\n");
let repaired=0,failed=0,unchanged=0;
try {
 await page.goto(origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
   await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
   await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
   const text=await page.locator("body").innerText();
   const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
   if(m){
     const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
     const el=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
     if(!await el.count())throw Error("Arithmetic login field unavailable");
     await el.fill(String(n));
   }
   await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WP login failed");
 await page.goto(origin+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 const nonce=await page.evaluate(async()=>{
   if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
   const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
   if(!r.ok)throw Error("WordPress REST nonce unavailable");
   return (await r.text()).trim();
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("Invalid REST nonce");
 const api=(path,method="GET",data)=>page.evaluate(async({path,method,data,nonce})=>{
   const r=await fetch(path,{method,credentials:"same-origin",headers:{
      Accept:"application/json","X-WP-Nonce":nonce,...(data?{"Content-Type":"application/json"}:{})
     },...(data?{body:JSON.stringify(data)}:{})});
   return {status:r.status,data:await r.json().catch(()=>null)};
 },{path,method,data,nonce});
 const table=await api("/wp-json/tablepress/v1/table/pse_01_vi");
 const groups=["company","agriculture-market","shareholder"];
 if(table.status!==200||table.data?.items?.length!==groups.length)
   throw Error("Verified PSE taxonomy table unavailable for content repair");
 const categoryIds=Object.fromEntries(groups.map((group,i)=>[group,Number(table.data.items[i].categoryId)]));
 if(Object.values(categoryIds).some(id=>!Number.isSafeInteger(id)||id<=0))
   throw Error("Invalid PSE taxonomy mapping");
 for(const [sourceId,row] of jobs){
  try{
   const id=row.wp_id;
   const got=await api("/wp-json/wp/v2/posts/"+id+"?context=edit&_fields=id,slug,status,content,excerpt,title,categories,pse_seo_description");
   const post=got.data;
   if(got.status!==200||post?.id!==id||!["draft","publish"].includes(post.status))
     throw Error("WordPress post read failed");
   const oldHtml=String(post.content?.raw||"");
   const source=new URL(row.source_url);
   if(source.protocol!=="https:"||!["pse.vn","www.pse.vn"].includes(source.hostname))
     throw Error("Untrusted original source");
   // Older migration batches did not save the attribution marker consistently.
   // Verify exact migration checkpoint ID, original Joomla slug, live category and status below instead.
   const hadAttribution=oldHtml.includes("pse-legacy-attribution");
   const expectedSlug=source.pathname.match(/\/\d{3,6}-([^/]+)\.html$/i)?.[1]?.toLowerCase();
   if(!expectedSlug||post.slug!==expectedSlug)throw Error("Post slug differs from original migration");
   if(!Array.isArray(post.categories)||!post.categories.includes(categoryIds[row.group_hint]))
     throw Error("Post is not in the mapped original category");
   const transformed=await page.evaluate(html=>{
     const doc=new DOMParser().parseFromString(html,"text/html");
     const root=doc.body;
     const footer=root.querySelector("p.pse-legacy-attribution");
     const footerNode=footer?.cloneNode(true)||null;
     footer?.remove();
     const normal=s=>String(s||"").replace(/[\u00a0\s]+/g," ").trim().toLocaleLowerCase("vi");
     const heading=[...root.querySelectorAll("h1,h2,h3,h4,h5,p")].find(el=>
       normal(el.textContent)==="các bài viết khác");
     if(heading){
       const range=doc.createRange();
       range.setStartBefore(heading);
       range.setEnd(root,root.childNodes.length);
       range.deleteContents();
     }
     const visible=String(root.textContent||"").replace(/\s+/g," ").trim();
     if(footerNode)root.appendChild(footerNode);
     const verifiedDocuments=[...root.querySelectorAll("a[href]")].filter(a=>
       /\.(?:pdf|docx?|xlsx?|pptx?)(?:[?#]|$)/i.test(a.getAttribute("href")||"")).length;
     return {html:root.innerHTML.trim(),bodyText:visible,removed:!!heading,
       verifiedDocuments};
   },oldHtml);
   const normalized=transformed.bodyText.replace(/\s+/g," ").trim();
   const headingText=String(post.title?.raw||post.title?.rendered||"").replace(/<[^>]*>/g,"").trim();
   const shortDocument=normalized.length<80 && transformed.verifiedDocuments>0 &&
     headingText.length>=15;
   // Short PDF/disclosure notices often contain only a document link.
   // Reject genuinely empty/invalid pages; never fabricate missing article text.
   if(normalized.length<80 && !shortDocument)
     throw Error("Article content unexpectedly short after cleanup");
   let seo=normalized;
   if(shortDocument){
     const contextText=normalized.toLocaleLowerCase("vi")===headingText.toLocaleLowerCase("vi")
       ? headingText : headingText+": "+normalized;
     seo=contextText.length>=65?contextText:
       contextText+" — xem tài liệu đính kèm trên PSE.VN.";
   }
   const letters=Array.from(seo);
   if(letters.length>158){
     const first=letters.slice(0,158).join("");
     const at=first.lastIndexOf(" ");
     seo=(at>115?first.slice(0,at):first).trim();
   }
   if(seo.length<30||seo.length>200)throw Error("SEO description length out of range");
   const metadataAvailable=Object.prototype.hasOwnProperty.call(post,"pse_seo_description");
   if(!metadataAvailable)throw Error("PSE SEO REST bridge not deployed; retry after verified FTPS release");
   const edits={};
   if(transformed.html!==oldHtml.trim())edits.content=transformed.html;
   if(String(post.excerpt?.raw||"").trim()!==seo)edits.excerpt=seo;
   if(String(post.pse_seo_description||"").trim()!==seo)edits.pse_seo_description=seo;
   if(Object.keys(edits).length){
     const saved=await api("/wp-json/wp/v2/posts/"+id,"POST",edits);
     if(saved.status!==200||saved.data?.id!==id)throw Error("Post correction save HTTP "+saved.status);
   }
   const check=await api("/wp-json/wp/v2/posts/"+id+"?context=edit&_fields=id,status,slug,categories,content,excerpt,pse_seo_description");
   const p=check.data;
   const relatedStillPresent=await page.evaluate(html=>{
     const root=new DOMParser().parseFromString(html,"text/html");
     return [...root.querySelectorAll("h1,h2,h3,h4,h5,p")].some(el=>
       String(el.textContent||"").trim().toLocaleLowerCase("vi")==="các bài viết khác");
   },String(p?.content?.raw||""));
   if(check.status!==200||p?.status!==post.status||p.slug!==post.slug||
     JSON.stringify(p.categories)!==JSON.stringify(post.categories)||
     String(p.excerpt?.raw||"").trim()!==seo||
     String(p.pse_seo_description||"").trim()!==seo||
     (hadAttribution && !String(p.content?.raw||"").includes("pse-legacy-attribution"))||relatedStillPresent)
     throw Error("Post correction read-after-write failed");
   row.seo_cleaned=true;
   row.seo_error=null;
   if(Object.keys(edits).length)repaired++;else unchanged++;
   console.log("PSE_LEGACY_POST_SEO=PASS; source_id="+sourceId+"; wp_id="+id+
      "; removed_related="+transformed.removed+"; short_document="+shortDocument+
      "; metadata=true; post_status_preserved=true");
  }catch(e){
   row.seo_attempts=Number(row.seo_attempts||0)+1;
   row.seo_error=String(e?.message||e).slice(0,160);
   failed++;
   console.error("PSE_LEGACY_POST_SEO=RETRY; source_id="+sourceId+"; reason="+row.seo_error);
  }
  await persist();
 }
}finally{await persist();await browser.close()}
console.log("PSE_LEGACY_SEO_REPAIR=PARTIAL; changed="+repaired+"; already_clean="+unchanged+
 "; retry="+failed+"; queued="+Object.values(state.articles).filter(x=>x.wp_id&&
 ["imported","draft_needs_date","existing"].includes(x.status)&&!x.seo_cleaned).length+
 "; no_build=true");
