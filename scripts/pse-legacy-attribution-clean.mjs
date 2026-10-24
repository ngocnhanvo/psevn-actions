/** Remove migration-only "Nguồn: PSE.VN" footers from verified imported posts.
 *  Leaves PDF/document links, article body, SEO, dates, taxonomy and statuses intact.
 *  Bounded batch, restartable via the existing serialized migration checkpoint.
 */
import {chromium} from "playwright";
import {readFile,writeFile} from "node:fs/promises";

const STATE="docs/pse-legacy-migration-state.json";
const state=JSON.parse(await readFile(STATE,"utf8"));
if(state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified)
  throw Error("Wrong PSE checkpoint or missing backup");
const line=String(process.env.ENV_FILE||"").split(/\r?\n/)
  .map(s=>s.trim().replace(/^export\s+/,"")).filter(s=>s.startsWith("WC_URL="));
if(line.length!==1)throw Error("Missing unique WC_URL");
const parsed=new URL(line[0].slice(7).trim().replace(/^['"]|['"]$/g,""));
if(parsed.protocol!=="https:"||parsed.username||parsed.password||parsed.search||parsed.hash||
   !["","/"].includes(parsed.pathname))throw Error("Unsafe WordPress URL");
const wp=parsed.origin;
const jobs=Object.entries(state.articles).filter(([sourceId,row])=>
  /^\d{3,6}$/.test(sourceId) && Number.isSafeInteger(row.wp_id) &&
  ["imported","draft_needs_date","existing"].includes(row.status) &&
  ((!row.attribution_cleaned && Number(row.attribution_attempts||0)<3) ||
   (sourceId==="1201" && !row.attribution_rechecked))
).sort((a,b)=>a[0]==="1201"?-1:b[0]==="1201"?1:Number(b[0])-Number(a[0])).slice(0,24);
if(jobs.length===0){console.log("PSE_ATTRIBUTION_CLEAN=NO_PENDING");process.exit(0)}
if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)
  throw Error("Missing authorized WordPress credentials");
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:900}});
const page=await context.newPage();
const persist=()=>writeFile(STATE,JSON.stringify(state,null,2)+"\n");
let updated=0,unchanged=0,failed=0;
try{
 await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
   await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
   await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
   const body=await page.locator("body").innerText();
   const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||
     body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
   if(m){
     const a=+m[1],b=+m[3],value=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
     const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
     if(!await input.count())throw Error("WordPress arithmetic login field missing");
     await input.fill(String(value));
   }
   await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WordPress login failed");
 await page.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 const nonce=await page.evaluate(async()=>{
   if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
   const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
   if(!r.ok)throw Error("WordPress REST nonce unavailable");
   return (await r.text()).trim();
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("Invalid WordPress REST nonce");
 const api=(path,method="GET",data)=>page.evaluate(async({path,method,data,nonce})=>{
   const r=await fetch(path,{method,credentials:"same-origin",headers:{
     Accept:"application/json","X-WP-Nonce":nonce,...(data?{"Content-Type":"application/json"}:{})
   },...(data?{body:JSON.stringify(data)}:{})});
   return {status:r.status,data:await r.json().catch(()=>null)};
 },{path,method,data,nonce});
 const table=await api("/wp-json/tablepress/v1/table/pse_01_vi");
 const groups=["company","agriculture-market","shareholder"];
 if(table.status!==200||table.data?.items?.length!==groups.length)
   throw Error("PSE taxonomy table unavailable for attribution cleanup");
 const categories=Object.fromEntries(groups.map((group,i)=>[group,Number(table.data.items[i].categoryId)]));
 for(const [sourceId,row] of jobs){
  try{
   const origin=new URL(row.source_url);
   if(origin.protocol!=="https:"||!["pse.vn","www.pse.vn"].includes(origin.hostname))
     throw Error("Untrusted original source URL");
   const slug=origin.pathname.match(/\/\d{3,6}-([^/]+)\.html$/i)?.[1]?.toLowerCase();
   const expectedCategory=categories[row.group_hint];
   if(!slug||!Number.isSafeInteger(expectedCategory)||expectedCategory<=0)
     throw Error("Source slug or category not verified");
   const result=await api("/wp-json/wp/v2/posts/"+row.wp_id+
     "?context=edit&_fields=id,slug,status,date,categories,content,excerpt,pse_seo_description");
   const post=result.data;
   if(result.status!==200||post?.id!==row.wp_id||post.slug!==slug||
      !["draft","publish"].includes(post.status)||!post.categories?.includes(expectedCategory))
     throw Error("WordPress post identity or taxonomy mismatch");
   const original=String(post.content?.raw||"");
   if(!original.trim())throw Error("WordPress article content empty");
   const transform=await page.evaluate(({html,sourceUrl})=>{
     const root=new DOMParser().parseFromString(html,"text/html").body;
     const normal=s=>String(s||"").replace(/[\u00a0\s]+/g," ").trim().toLocaleLowerCase("vi");
     const matches=p=>{
       if(p.matches("p.pse-legacy-attribution"))return true;
       const label=normal(p.textContent);
       if(!/^nguồn\s*:\s*pse\.vn$/.test(label))return false;
       const links=[...p.querySelectorAll("a[href]")];
       if(links.length!==1||normal(links[0].textContent)!=="pse.vn")return false;
       try{
         const u=new URL(links[0].getAttribute("href"),location.href),s=new URL(sourceUrl);
         return ["pse.vn","www.pse.vn"].includes(u.hostname) && u.pathname===s.pathname;
       }catch{return false}
     };
     const files=()=>[...root.querySelectorAll("a[href]")].map(x=>x.href)
       .filter(x=>/\.(?:pdf|docx?|xlsx?|pptx?)(?:[?#]|$)/i.test(x)).sort();
     const beforeFiles=files();
     const all=[...root.querySelectorAll("p,div")].filter(matches);
     const footers=all.filter(p=>!all.some(child=>child!==p&&p.contains(child)));
     footers.forEach(x=>x.remove());
     let blanks=0;
     const empty=n=>n.nodeType===Node.TEXT_NODE?
       !String(n.textContent||"").replace(/[\u00a0\s]/g,""):
       n.nodeType===Node.ELEMENT_NODE && n.matches("p,div,br") &&
       !n.querySelector("a,img,iframe,object,embed,table,hr") &&
       !String(n.textContent||"").replace(/[\u00a0\s]/g,"");
     if(footers.length || sourceUrl.includes("/1201-")){
       while(root.lastChild&&empty(root.lastChild)){root.lastChild.remove();blanks++}
       const last=root.lastElementChild;
       if(last?.matches("p,div")){
         while(last.lastChild&&(last.lastChild.nodeType===Node.TEXT_NODE&&
           !String(last.lastChild.textContent||"").replace(/[\u00a0\s]/g,"")||
           last.lastChild.nodeType===Node.ELEMENT_NODE&&last.lastChild.matches("br"))){
           last.lastChild.remove();blanks++;
         }
         while(root.lastChild&&empty(root.lastChild)){root.lastChild.remove();blanks++}
       }
     }
     const labelDetected=/nguồn\s*:/i.test(html) && /pse\.vn/i.test(html);
     return {html:root.innerHTML.trim(),removed:footers.length,blanks,labelDetected,
       filesBefore:beforeFiles,filesAfter:files()};
   },{html:original,sourceUrl:row.source_url});
   if(JSON.stringify(transform.filesBefore)!==JSON.stringify(transform.filesAfter))
     throw Error("Attribution cleanup altered attached file links");
   if(!transform.removed && transform.labelDetected && sourceId==="1201")
     console.log("PSE_LEGACY_ATTRIBUTION_DIAG; source_id=1201; marker_absent=true; label_may_be_elsewhere=true");
   if(transform.removed || transform.blanks){
     const saved=await api("/wp-json/wp/v2/posts/"+row.wp_id,"POST",{content:transform.html,date:post.date});
     if(saved.status!==200||saved.data?.id!==row.wp_id)
       throw Error("WordPress content correction failed HTTP "+saved.status);
     if(saved.data?.date!==post.date){
       const restored=await api("/wp-json/wp/v2/posts/"+row.wp_id,"POST",{date:post.date});
       if(restored.status!==200||restored.data?.date!==post.date)
         throw Error("WordPress original post date could not be restored after content edit");
     }
   }
   const verify=await api("/wp-json/wp/v2/posts/"+row.wp_id+
     "?context=edit&_fields=id,slug,status,date,categories,content,excerpt,pse_seo_description");
   const current=verify.data;
   const check=await page.evaluate(({html,sourceUrl})=>{
     const root=new DOMParser().parseFromString(html,"text/html").body;
     const normal=s=>String(s||"").replace(/[\u00a0\s]+/g," ").trim().toLocaleLowerCase("vi");
     const stillPresent=[...root.querySelectorAll("p,div")].some(p=>{
       if(p.matches("p.pse-legacy-attribution"))return true;
       if(!/^nguồn\s*:\s*pse\.vn$/.test(normal(p.textContent)))return false;
       const links=[...p.querySelectorAll("a[href]")];
       if(links.length!==1||normal(links[0].textContent)!=="pse.vn")return false;
       try{
         const u=new URL(links[0].getAttribute("href"),location.href),s=new URL(sourceUrl);
         return ["pse.vn","www.pse.vn"].includes(u.hostname)&&u.pathname===s.pathname;
       }catch{return false}
     });
     const fileLinks=[...root.querySelectorAll("a[href]")].map(x=>x.href)
       .filter(x=>/\.(?:pdf|docx?|xlsx?|pptx?)(?:[?#]|$)/i.test(x)).sort();
     // WordPress may store harmless whitespace after the final HTML element.
     // Only empty HTML blocks (<p>, <div>, <br>) render extra blank lines.
     const tail=root.lastElementChild;
     const blankTail=tail && tail.matches("p,div,br") &&
       !tail.querySelector("a,img,iframe,object,embed,table,hr") &&
       !String(tail.textContent||"").replace(/[\u00a0\s]/g,"");
     return {stillPresent,fileLinks,blankTail:!!blankTail};
   },{html:String(current?.content?.raw||""),sourceUrl:row.source_url});
   const mismatches=[
     [verify.status!==200||current?.id!==row.wp_id,"id"],
     [current?.slug!==post.slug,"slug"],
     [current?.status!==post.status,"status"],
     [current?.date!==post.date,"date"],
     [JSON.stringify(current?.categories)!==JSON.stringify(post.categories),"taxonomy"],
     [String(current?.excerpt?.raw||"")!==String(post.excerpt?.raw||""),"excerpt"],
     [String(current?.pse_seo_description||"")!==String(post.pse_seo_description||""),"seo"],
     [check.stillPresent,"footer"],
     [(transform.removed>0||transform.blanks>0)&&check.blankTail,"blank_tail"],
     [JSON.stringify(check.fileLinks)!==JSON.stringify(transform.filesBefore),"files"]
   ].filter(x=>x[0]).map(x=>x[1]);
   if(mismatches.length)throw Error("WordPress cleanup verify: "+mismatches.join(","));
   row.attribution_cleaned=true;
   if(sourceId==="1201")row.attribution_rechecked=true;
   row.attribution_error=null;
   if(transform.removed||transform.blanks)updated++;else unchanged++;
   console.log("PSE_LEGACY_ATTRIBUTION=PASS; source_id="+sourceId+
     "; wp_id="+row.wp_id+"; footer_removed="+transform.removed+
     "; trailing_empty_removed="+transform.blanks+"; attachments_preserved=true; seo_preserved=true");
  }catch(e){
   row.attribution_attempts=Number(row.attribution_attempts||0)+1;
   row.attribution_error=String(e?.message||e).slice(0,160);
   failed++;
   console.error("PSE_LEGACY_ATTRIBUTION=RETRY; source_id="+sourceId+
     "; reason="+row.attribution_error);
  }
  await persist();
 }
}finally{await persist();await browser.close()}
console.log("PSE_ATTRIBUTION_CLEAN=PARTIAL; corrected="+updated+"; unchanged="+unchanged+
  "; failed="+failed+"; pending="+Object.values(state.articles).filter(r=>
    r.wp_id&&["imported","draft_needs_date","existing"].includes(r.status)&&
    !r.attribution_cleaned&&Number(r.attribution_attempts||0)<3).length+
  "; no_build=true");
