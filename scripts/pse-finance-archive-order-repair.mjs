/**
 * PSE finance source parity correction:
 * (1) restore ONE verified blank-anchor original 2023 PDF reference into the
 *     2024 Joomla article using its existing, source-hashed local Media ID;
 * (2) preserve all 76 independent source archive positions as rank metadata
 *     without changing any WordPress publication date or frontend code.
 */
import {chromium} from "playwright";
import {createHash} from "node:crypto";
import {readFile,writeFile,mkdir} from "node:fs/promises";
const original=JSON.parse(await readFile("artifacts/pse-financial-original/report.json","utf8"));
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 original.schema!=="pse-financial-report-source-parity-v1"||
 state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified||
 original.sourceArticles?.length!==76||original.sourceErrors?.length)
 throw Error("Independent PSE legacy source manifest or verified rollback unavailable");
const ref=original.sourceArticles;
const expected=["1292","1284","1282"];
const ix=expected.map(id=>ref.findIndex(x=>x.id===id));
if(ix.some(i=>i<0)||!(ix[0]+1===ix[1]&&ix[1]+1===ix[2]))
 throw Error("The verified original 2017 finance archive ordering has changed");
const sourceUrl="https://www.pse.vn/images/20230814-CV-52-DNB-HDQT-gi%E1%BA%A3i-tr%C3%ACnh-l%E1%BB%A3i-nhu%E1%BA%ADn-sau-thu%E1%BA%BF-ch%C3%AAnh-l%E1%BB%87ch-so-v%E1%BB%9Bi-th%E1%BB%B1c-hi%E1%BB%87n-c%C3%B9ng-k%E1%BB%B3.pdf";
const media=state.media[sourceUrl];
if(state.articles["1590"]?.wp_id!==77458||media?.id!==77456||
 !String(media?.url||"").includes("pse-legacy-e2e5b15404122b0e.pdf"))
 throw Error("Original blank-anchor PDF does not match checkpoint Media ID");
const wordpress="https://admin-pse.webnvn.com",publicUrl="https://pse.webnvn.com";
const browser=await chromium.launch({headless:true}),ctx=await browser.newContext({viewport:{width:1366,height:800}});
const admin=await ctx.newPage(),legacy=await ctx.newPage();
const report={schema:"pse-finance-archive-parity-repair-v1",scope:"76 source order + 1590 original blank PDF link",
 sourceCount:76,sourceArchivePosition:ix,sourceChecksum:null,mediaRepair:null,orderRepair:null,
 frontend:null,errors:[],status:"UNVERIFIED"};
try{
 await legacy.route(/\.(?:png|jpe?g|webp|svg|gif|woff2?|ttf)(?:[?#]|$)/i,r=>r.abort());
 const originPost="https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-tai-chinh/1590-20240814-cbtt-bao-cao-tai-chinh-ban-nien-2024-da-duoc-kiem-toan.html";
 const legacyRes=await legacy.goto(originPost,{waitUntil:"domcontentloaded",timeout:55000});
 if(legacyRes?.status()!==200)throw Error("Original 2024 finance article is unavailable");
 const blank=await legacy.evaluate(()=>{
  const all=[...document.querySelectorAll('a[href]')];
  const match=all.filter(x=>x.href.includes("20230814-CV-52-DNB-HDQT-gi"));
  return match.map(x=>({url:x.href,content:x.textContent?.trim()||"",parent:x.parentElement?.textContent?.slice(0,180)}));
 });
 if(blank.length!==1||blank[0].url!==sourceUrl||blank[0].content!=="")
  throw Error("Original 2024 attachment anchor is not the independently verified empty link");
 const originalHead=await ctx.request.head(sourceUrl,{timeout:60000});
 if(originalHead.status()!==200)throw Error("Original 2023 linked file unavailable");
 await admin.goto(wordpress+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=(await admin.locator("#loginform").innerText()).slice(0,700);
  const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){
   const a=+m[1],b=+m[3],answer=m[2]==="+"?a+b:m[2]==="-"?a-b:a*b;
   const field=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error("Login challenge input missing");
   await field.fill(String(answer));
  }
  await admin.locator("#wp-submit").click();
 }
 await admin.goto(wordpress+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 if(!await admin.locator("#adminmenu").count())throw Error("PSE authenticated WordPress administrator unavailable");
 const nonce=await admin.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("Cannot get WP REST nonce");
  return (await r.text()).trim();
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("Invalid REST nonce");
 const api=(path,method="GET",data)=>admin.evaluate(async({path,method,data,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json",
   ...(data?{"Content-Type":"application/json"}:{})},...(data?{body:JSON.stringify(data)}:{})});
  return{http:r.status,data:await r.json().catch(()=>null),total:Number(r.headers.get("X-WP-Total")||0)};
 },{path,method,data,nonce});
 // First: restore the one exact missing old file link without altering title, dates, or other attachments.
 const postPath="/wp-json/wp/v2/posts/77458";
 const postFields="?context=edit&_fields=id,slug,title,date,status,categories,content";
 const p=await api(postPath+postFields);
 if(p.http!==200||p.data?.id!==77458||p.data?.slug!=="20240814-cbtt-bao-cao-tai-chinh-ban-nien-2024-da-duoc-kiem-toan"||
   p.data?.status!=="publish"||!p.data?.categories?.includes(1754))throw Error("Source post 1590 WordPress identity drift");
 const assetRes=await api("/wp-json/wp/v2/media/77456?context=edit&_fields=id,source_url,slug,mime_type");
 if(assetRes.http!==200||assetRes.data?.id!==77456||assetRes.data?.mime_type!=="application/pdf")
   throw Error("Uploaded 2023 original media identity drift");
 const targetUrl=new URL(assetRes.data.source_url,wordpress);
 if(targetUrl.origin!==wordpress||!targetUrl.pathname.endsWith("pse-legacy-e2e5b15404122b0e.pdf"))
   throw Error("Expected original PDF is not hosted on WordPress");
 const localCheck=await ctx.request.head(targetUrl.href,{timeout:30000});
 if(localCheck.status()!==200||!(localCheck.headers()["content-type"]||"").includes("pdf"))
   throw Error("Existing original 2023 PDF is not a reachable local file");
 const content=String(p.data.content?.raw||"");
 const hasA=content.includes("pse-legacy-a5645625907b2c6b.pdf");
 const hasB=content.includes("pse-legacy-b234408bff661103.pdf");
 const hasC=content.includes("pse-legacy-e2e5b15404122b0e.pdf");
 if(!hasA||!hasB)throw Error("Source 2024 post no longer has both known valid PDF links");
 const order1=content.indexOf("pse-legacy-a5645625907b2c6b.pdf");
 const order3=content.indexOf("pse-legacy-b234408bff661103.pdf");
 if(order1<0||order3<=order1)throw Error("Original 2024 visible PDF order changed");
 if(!hasC){
  const pattern=/<a\b[^>]*href\s*=\s*["'][^"']*pse-legacy-b234408bff661103\.pdf["'][^>]*>/gi;
  const matches=[...content.matchAll(pattern)];
  if(matches.length!==1)throw Error("Could not uniquely locate the second original 2024 visible PDF link");
  const at=matches[0].index;
  const extra='<a href="'+targetUrl.href+'" target="_blank" rel="noopener noreferrer" class="wf_file" aria-label="Tài liệu đính kèm theo nguồn gốc 2023"><span class="wf_file_text">Tài liệu đính kèm theo website gốc (2023)</span></a> ';
  const updated=content.slice(0,at)+extra+content.slice(at);
  if(!(updated.indexOf("pse-legacy-a5645625907b2c6b.pdf")<
    updated.indexOf("pse-legacy-e2e5b15404122b0e.pdf")&&
    updated.indexOf("pse-legacy-e2e5b15404122b0e.pdf")<
    updated.indexOf("pse-legacy-b234408bff661103.pdf")))
    throw Error("Source 2024 document order became invalid");
  const write=await api(postPath,"POST",{content:updated});
  if(write.http!==200||write.data?.id!==77458)throw Error("WordPress 2024 PDF content update failed HTTP "+write.http);
 }
 const confirmed=await api(postPath+postFields);
 const html=String(confirmed.data?.content?.raw||"");
 if(confirmed.http!==200||confirmed.data?.id!==77458||
  confirmed.data.date!==p.data.date||confirmed.data.slug!==p.data.slug||
  !["pse-legacy-a5645625907b2c6b.pdf","pse-legacy-e2e5b15404122b0e.pdf","pse-legacy-b234408bff661103.pdf"].every(x=>html.includes(x))||
  !(html.indexOf("pse-legacy-a5645625907b2c6b.pdf")<html.indexOf("pse-legacy-e2e5b15404122b0e.pdf")&&
  html.indexOf("pse-legacy-e2e5b15404122b0e.pdf")<html.indexOf("pse-legacy-b234408bff661103.pdf")))
  throw Error("2024 financial document read-after-write or published date changed");
 report.mediaRepair={sourceId:1590,wpId:77458,action:hasC?"already_present":"added_existing_wordpress_media",
  mediaId:77456,sourceUrl,localUrl:targetUrl.href,status:"READBACK_PASS"};
 console.log("PSE_FINANCE_1590_ATTACHMENT="+JSON.stringify(report.mediaRepair));
 // Second: independently audited original article IDs/slug order, never a fabricated date.
 const cat=await api("/wp-json/wp/v2/categories/1754?_fields=id,slug,parent,count");
 const all=await api("/wp-json/wp/v2/posts?categories=1754&per_page=100&page=1&_fields=id,slug,date");
 if(cat.http!==200||cat.data?.slug!=="bao-cao-tai-chinh"||cat.data?.parent!==1744||
   all.http!==200||all.total!==76||all.data?.length!==76)throw Error("WordPress financial taxonomy/count drift");
 const bySlug=new Map(all.data.map(x=>[x.slug,x]));
 if(bySlug.size!==76||new Set(ref.map(x=>x.id)).size!==76)throw Error("Duplicate source or WordPress post");
 const rows=ref.map(row=>{
  const post=bySlug.get(row.slug);
  if(!/^\d{2,6}$/.test(row.id)||row.href!=="https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-tai-chinh/"+row.id+"-"+row.slug+".html"||!post)
   throw Error("Source original and WordPress mapping diverged "+row.id);
  return{id:post.id,slug:row.slug};
 });
 if(new Set(rows.map(x=>x.id)).size!==76)throw Error("Ambiguous WordPress finance post identity");
 const checksum=createHash("sha256").update(ref.map(r=>r.id+":"+r.slug).join("|")).digest("hex");
 report.sourceChecksum=checksum;
 const orderPath="/wp-json/pse-finance/v1/original-archive-order";
 const prior=await api(orderPath);
 if(prior.http!==200||!Array.isArray(prior.data?.rows)||prior.data.rows.length!==76)
  throw Error("Original archive ordering WP REST endpoint unavailable");
 const already=prior.data.active&&prior.data.source_checksum===checksum&&
   prior.data.rows.every((r,i)=>r.id===rows[i].id&&r.rank===i+1);
 if(!already){
  const result=await api(orderPath,"POST",{rows,source_checksum:checksum});
  if(result.http!==200||result.data?.status!=="source_order_committed"||
    result.data?.count!==76||result.data?.source_checksum!==checksum||!result.data?.active)
   throw Error("Original finance ordering WordPress batch save failed "+result.http+" code "+result.data?.code);
 }
 const after=await api(orderPath);
 if(after.http!==200||!after.data?.active||after.data.source_checksum!==checksum||
   after.data.rows.length!==76||after.data.rows.some((r,i)=>r.id!==rows[i].id||r.rank!==i+1))
   throw Error("Original finance ordering readback mismatch");
 const sorted=await api("/wp-json/wp/v2/posts?categories=1754&per_page=100&page=1&_fields=id,slug,date");
 if(sorted.http!==200||sorted.total!==76||sorted.data?.length!==76||
  sorted.data.some((p,i)=>p.id!==rows[i].id))
  throw Error("Live WordPress finance archive sorting differs from 76 verified original articles");
 const oldDates=new Map(all.data.map(x=>[x.id,x.date]));
 if(sorted.data.some(x=>x.date!==oldDates.get(x.id)))
  throw Error("Source ordering accidentally changed a publication date");
 report.orderRepair={action:already?"already_in_original_order":"stored_independent_source_ranks",
   matched:76,changedPublicationDates:0,sourcePositions:ix,restApi:"PASS"};
 console.log("PSE_FINANCE_ARCHIVE_ORDER="+JSON.stringify(report.orderRepair));
 for(const [key,url,count] of [
  ["first",publicUrl+"/tin-tuc-su-kien/bao-cao-tai-chinh",12],
  ["last",publicUrl+"/tin-tuc-su-kien/bao-cao-tai-chinh/7",4]]){
  const pg=await legacy.goto(url,{waitUntil:"domcontentloaded",timeout:55000});
  const actual=await legacy.locator("#posts-grid h2").count();
  const info=await legacy.locator("body").innerText();
  if(pg?.status()!==200||actual!==count||!info.includes("Tổng 76 bài viết"))
   throw Error("Finance SSR "+key+" list not refreshed or count incorrect");
 }
 report.frontend={firstHttp:200,lastHttp:200,count:76,pages:7,status:"PASS"};
 report.status="PASS";
}catch(e){report.errors.push(String(e));report.status="PARTIAL";console.error("PSE_FINANCE_ORDER_REPAIR_ERROR="+String(e))}
finally{
 await mkdir("artifacts/pse-finance-order-repair",{recursive:true});
 await writeFile("artifacts/pse-finance-order-repair/report.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
console.log("PSE_FINANCE_ORDER_REPAIR_SUMMARY="+JSON.stringify({
 status:report.status,mediaRepair:report.mediaRepair,orderRepair:report.orderRepair,
 frontend:report.frontend,errors:report.errors}));
if(report.status!=="PASS")process.exitCode=1;
