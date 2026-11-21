/** Scoped original Joomla #298 PDF repair, preserving correct alternative attribution.
 * Native WP Post #82548 only; source MediaFire dead on Joomla and WP.
 * Alternative archival PDF is Stockbiz, NOT asserted identical to dead original bytes.
 * Exact owner request, fresh Updraft DB backup, scoped read-before/write-after, cleanup.
 */
import {chromium,request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
const ownerMessage="cms(pse): restore 2012 reviewed PSE PDF via verified Stockbiz alternative";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH||"","utf8"));
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main"||
 event?.head_commit?.message!==ownerMessage||
 process.env.PSE_298_FRESH_UPDRAFT_DB_VERIFIED!=="yes")
 throw Error("Wrong PSE owner marker or fresh DB rollback absent");
const manifest=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const sourceId="298",postId=82548;
const old="http://www.mediafire.com/file/mn5v49y1db5me3h/scan0001.pdf";
const source=manifest.articles?.[sourceId];
const expectedSource="https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-tai-chinh/298-pvfcco-se-cong-bo-thong-tin-bao-cao-tai-chinh-ban-nien-2012-da-duoc-soat-xet.html";
if(manifest.schema!=="pse-legacy-article-migration-v1"||!manifest.backup_verified||
 source?.source_url!==expectedSource||source?.wp_id!==postId||source.status!=="imported")
 throw Error("Exact original Joomla #298 source identity not retained");
const cfg=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const origin=key=>{const rows=cfg.filter(x=>x.startsWith(key+"="));if(rows.length!==1)throw Error("Missing "+key);
 const u=new URL(rows[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||
  u.port||!["","/"].includes(u.pathname))throw Error("Unexpected "+key);return u.origin;};
const wp=origin("WC_URL"),front=origin("WC_URL_CLIENT");
if(wp!=="https://admin-pse.webnvn.com"||front!=="https://pse.webnvn.com")
 throw Error("Production PSE hostname mismatch");
const listing="https://web.stockbiz.vn/Stocks/PSE/Downloads.aspx";
const fileName="PSE-12-Q2-Audited Financial Statements.pdf";
const archive="https://web.stockbiz.vn/Handlers/DownloadFinancialStatement.ashx?FileName="+encodeURIComponent(fileName);
const shaExpected="06d58c64257e7751df13981b383b62fd2a4b48a5afbf4a30fd6ebf8be75e6e26";
const bytesExpected=5520707;
const sha=b=>createHash("sha256").update(b).digest("hex");
const report={schema:"pse-298-native-wp-reviewed-2012-alternative-mirror-v1",readOnly:false,
 sourceId:298,wpPostId:82548,sourceSite:expectedSource,
 originalDeadMediafire:old,alternativeStockbiz:archive,
 sourceAlternativeExactOriginalBytes:false,sourceSha256:shaExpected,bytes:bytesExpected,
 backupVerified:true,wpMediaId:null,wpPostWrites:0,wpMediaWrites:0,
 recordScope:[82548],noAstroCodeChanges:true,noBuildTriggeredByWriter:true,
 changed:0,skipped_unchanged:0,temporary_created:0,cleanup_remaining:0,status:"PREFLIGHT",error:null};
const net=await request.newContext({timeout:85000}),browser=await chromium.launch({headless:true});
const page=await browser.newPage();
let api=null,mediaCreatedId=null,postUpdated=false,cleaned=false;
try{
 // Source-original identity is already archived in read-only #44918062153,
 // and alternative exact 22-page signed PSE/Deloitte PDF is #44918382814.
 // Reverify live bytes: no trust in stale single run or filename alone.
 const [sourceList,pdfResp,publicPost]=await Promise.all([
  fetch(listing,{redirect:"manual",signal:AbortSignal.timeout(45000)}),
  fetch(archive,{redirect:"manual",signal:AbortSignal.timeout(90000),
   headers:{Accept:"application/pdf,*/*;q=0.1"}}),
  net.get(wp+"/wp-json/wp/v2/posts/"+postId+
   "?_fields=id,slug,status,date,categories,acf,content,title",{timeout:45000,failOnStatusCode:false})
 ]);
 console.log("PSE_298_SAFE_SOURCE_HTTP="+JSON.stringify({
  listingHttp:sourceList.status,pdfHttp:pdfResp.status,
  wpRestHttp:publicPost.status()}));
 if(sourceList.status!==200||pdfResp.status!==200||publicPost.status()!==200)
  throw Error("Source or WP HTTP preflight status non-200; no CMS writes");
 const listHtml=await sourceList.text(),mime=String(pdfResp.headers.get("content-type")||"").toLowerCase();
 if(!listHtml.includes("PSE-12-Q2-Audited")||!listHtml.includes("PSE")||
  (!mime.includes("application/pdf")&&!mime.includes("octet-stream")))
  throw Error("Stockbiz original signed PDF listing/provenance changed");
 const len=Number(pdfResp.headers.get("content-length")||0);
 if(len>10000000)throw Error("Stockbiz PDF unexpectedly oversized");
 const bytes=Buffer.from(await pdfResp.arrayBuffer());
 if(bytes.length!==bytesExpected||bytes.subarray(0,5).toString("ascii")!=="%PDF-"||
  !bytes.subarray(-2048).toString("latin1").includes("%%EOF")||sha(bytes)!==shaExpected)
  throw Error("Source PDF signature/length/SHA256 differs from exact archived proof");
 const p=await publicPost.json();
 const slug="pvfcco-se-cong-bo-thong-tin-bao-cao-tai-chinh-ban-nien-2012-da-duoc-soat-xet";
 if(p.id!==postId||p.status!=="publish"||p.slug!==slug||
  !p.categories?.includes(1754)||String(p.content?.rendered||"").split(old).length!==2)
  throw Error("Published native source Post has drifted");
 const target=await net.get(front+"/"+slug,{maxRedirects:0,failOnStatusCode:false,timeout:30000});
 if(target.status()!==200)throw Error("Exact published frontend Post unavailable");
 const live=await target.text(),canonical=live.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1]||
  live.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical/i)?.[1]||"";
 const can=canonical?new URL(canonical,front):null;
 if(!can||can.origin!==front||can.pathname!=="/"+slug)throw Error("Published canonical altered");
 // Authenticated WordPress core REST with nonce, identical approved project flow.
 await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const loginText=(await page.locator("#loginform").innerText()).slice(0,650);
  const m=loginText.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){const a=Number(m[1]),b=Number(m[3]);
   const answer=m[2]==="+"?a+b:m[2]==="-"?a-b:a*b;
   const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error("PSE WordPress math challenge changed");
   await field.fill(String(answer));
  }
  await page.locator("#wp-submit").click();
 }
 await page.goto(wp+"/wp-admin/post.php?post=248&action=edit",
  {waitUntil:"domcontentloaded",timeout:60000});
 if(page.url().includes("wp-login")||!await page.locator("#adminmenu").count())
  throw Error("WP administrator authentication missing");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("WP protected REST nonce not issued");
  return(await r.text()).trim();
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("Protected WP REST nonce invalid");
 api=(path,method="GET",body)=>page.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{
   "X-WP-Nonce":nonce,Accept:"application/json",
   ...(body?{"Content-Type":"application/json"}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,data:await r.json().catch(()=>null)};
 },{path,method,body,nonce});
 const fields="?context=edit&_fields=id,status,slug,title,date,modified,categories,acf,content,excerpt";
 const before=await api("/wp-json/wp/v2/posts/"+postId+fields);
 const native=before.data;
 const body=String(native?.content?.raw||"");
 if(before.status!==200||native?.id!==postId||native?.slug!==slug||native.status!=="publish"||
  !native.categories?.includes(1754)||body.length<75||body.length>15000||
  body.split(old).length!==2||native.acf?.key!=="ssr-post"||
  native.acf?.action!=="PostDetails"||
  !/báo cáo tài chính bán niên 2012/i.test(String(native.title?.raw||native.title?.rendered||"")))
  throw Error("Protected exact Post #82548 read-before-write identity/HTML changed");
 const originalDate=native.date,originalCats=JSON.stringify(native.categories);
 const originalExcerpt=String(native.excerpt?.raw||"");
 report.originalDate=originalDate;
 console.log("PSE_298_REVIEWED_PDF_PREFLIGHT="+JSON.stringify({
  postId,slug,originalDate,originalBodyChars:body.length,sourcePDFBytes:bytes.length,
  sourceSha256:shaExpected,alternativeDisclosureRequired:true,backup:true
 }));
 const mediaQuery="/wp-json/wp/v2/media?context=edit&search="+
  encodeURIComponent("PSE-12-Q2-Audited")+
  "&per_page=100&_fields=id,source_url,mime_type,media_details,title,caption,description";
 const search=await api(mediaQuery);
 if(search.status!==200||!Array.isArray(search.data))throw Error("Exact alternative WordPress media registry unavailable");
 const matches=search.data.filter(x=>{
  try{return x.mime_type==="application/pdf"&&
   decodeURIComponent(new URL(x.source_url,wp).pathname.split("/").at(-1)).toLowerCase().replace(/\s+/g,"-")===
   fileName.toLowerCase().replace(/\s+/g,"-")}
  catch{return false}
 });
 if(matches.length>1)throw Error("Duplicate original 2012 archive PDF basename, unsafe");
 let media=matches[0]||null;
 if(!media){
  const upload=await page.request.post(wp+"/wp-json/wp/v2/media",{
   data:bytes,timeout:130000,failOnStatusCode:false,
   headers:{"X-WP-Nonce":nonce,"Content-Type":"application/pdf",
    "Content-Disposition":'attachment; filename="'+fileName+'"'}
  });
  if(upload.status()!==201)throw Error("WordPress native Media upload denied HTTP "+upload.status()+
   " "+(await upload.text()).slice(0,160));
  media=await upload.json();
  if(!Number.isSafeInteger(Number(media.id)))throw Error("New source media missing WordPress ID");
  mediaCreatedId=Number(media.id);report.wpMediaWrites=1;report.temporary_created=1;
 }
 const mediaId=Number(media.id);
 const url=new URL(media.source_url,wp);
 if(url.origin!==wp||!/^\/wp-content\/uploads\/\d{4}\/\d\d\/[^/]+\.pdf$/i.test(url.pathname)||
  media.mime_type!=="application/pdf")
  throw Error("WordPress alternative PDF URL/Media record invalid");
 const saved=await net.get(url.href,{timeout:100000,failOnStatusCode:false});
 if(saved.status()!==200)throw Error("Native WordPress PDF HTTP "+saved.status());
 const savedBytes=await saved.body();
 if(savedBytes.length!==bytes.length||sha(savedBytes)!==shaExpected)
  throw Error("Native uploaded PDF differs from independent Stockbiz SHA");
 report.wpMediaId=mediaId;report.mediaPath=url.pathname;
 // Store actual alternate source filename and transparent provenance in editor-owned metadata.
 if(mediaCreatedId){
  const updatedMedia=await api("/wp-json/wp/v2/media/"+mediaId,"POST",{
   title:"PSE – Báo cáo tài chính bán niên 2012 đã soát xét (Stockbiz)",
   caption:"Bản lưu thay thế từ Stockbiz; tệp MediaFire gốc đã mất, không thể xác minh trùng byte.",
   description:"Nguồn tệp: "+archive+" | Tên tại nguồn: "+fileName+
    " | Original Joomla attachment: "+old+" | SHA-256: "+shaExpected
  });
  if(updatedMedia.status!==200||Number(updatedMedia.data?.id)!==mediaId)
   throw Error("WordPress Media provenance details not saved");
 }
 const relative="/api/files"+url.pathname;
 const note='<p><em>Nguồn PDF thay thế: bản lưu báo cáo tài chính bán niên 2012 đã được soát xét của PSE tại Stockbiz. '+
  'Liên kết MediaFire trên website gốc không còn hoạt động; không thể xác minh tệp thay thế trùng byte với bản gốc.</em></p>';
 const after=body.replace(old,relative)+note;
 if(after===body||after.includes(old)||after.split(relative).length!==2||
  after.split("Nguồn PDF thay thế:").length!==2)throw Error("Original Post non-idempotent patch");
 const update=await api("/wp-json/wp/v2/posts/"+postId,"POST",{content:after});
 if(update.status!==200||Number(update.data?.id)!==postId)
  throw Error("Scoped native WP Post update refused");
 postUpdated=true;report.wpPostWrites=1;report.changed=1;
 const final=await api("/wp-json/wp/v2/posts/"+postId+fields);
 const p2=final.data;
 if(final.status!==200||p2?.status!=="publish"||p2.slug!==slug||
  p2.content?.raw!==after||p2.date!==originalDate||
  JSON.stringify(p2.categories)!==originalCats||p2.acf?.key!=="ssr-post"||
  p2.acf?.action!=="PostDetails"||String(p2.excerpt?.raw||"")!==originalExcerpt)
  throw Error("WordPress final Post read-after-write differs outside exact content scope");
 if(!String(p2.content.raw).includes(relative)||
  String(p2.content.raw).includes(old))throw Error("Original dead MediaFire still linked");
 report.status="WP_NATIVE_READBACK_PASS";report.temporary_created=0;report.cleanup_remaining=0;
 console.log("PSE_298_REVIEWED_2012_WP_APPLY_PASS="+JSON.stringify({
  sourceId:298,wpPostId:postId,wpMediaId:mediaId,bytes:savedBytes.length,
  sha256:shaExpected,relativeUrl:relative,sourceDatePreserved:originalDate,
  categoryPreserved:true,originalMediafireLinkRemoved:true,
  disclosureExplicit:true,wpPostWrites:1,wpMediaWrites:report.wpMediaWrites,
  otherPostsChanged:0,cleanupRemaining:0,
  alternativeNotClaimedOriginalByteEqual:true,buildTriggeredByWriter:false
 }));
}catch(e){
 report.status="PARTIAL";report.error=String(e?.message||e).slice(0,450);
 console.error("PSE_298_REVIEWED_PDF_APPLY_ERROR="+report.error);
 process.exitCode=1;
}finally{
 if(mediaCreatedId&&!postUpdated&&api){
  try{
   const chk=await api("/wp-json/wp/v2/media/"+mediaCreatedId+
    "?context=edit&_fields=id,status,source_url");
   if(chk.status===200&&Number(chk.data?.id)===mediaCreatedId){
    const trash=await api("/wp-json/wp/v2/media/"+mediaCreatedId,"DELETE");
    if(![200,202].includes(trash.status))throw Error("Media temp trash failed");
    const readback=await api("/wp-json/wp/v2/media/"+mediaCreatedId+
     "?context=edit&_fields=id,status");
    if(readback.status===200&&readback.data?.status==="trash"){
     cleaned=true;report.temporary_created=0;report.cleanup_remaining=0;
     console.log("PSE_298_MEDIA_TEMP_CLEANUP=PASS");
    }else throw Error("Media cleanup state unverified");
   }
  }catch(e){report.cleanup_remaining=1;process.exitCode=1;
   console.error("PSE_298_CLEANUP_FAILED=MEDIA_ID_"+mediaCreatedId+" "+String(e?.message||e).slice(0,110));}
 }
 await mkdir("artifacts/pse-298-reviewed-native",{recursive:true});
 await writeFile("artifacts/pse-298-reviewed-native/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await browser.close();
}
