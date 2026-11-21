/** Bounded, resumable legacy Joomla -> verified PSE WordPress posts.
 * Does not touch existing content or trigger Astro build.
 * State is persisted separately by the queue's GitHub Contents checkpoint step.
 */
import {chromium} from "playwright";
import {searchDate} from "./pse-legacy-search-date.mjs";
import {createHash} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
const STATE="docs/pse-legacy-migration-state.json";
const state=JSON.parse(await readFile(STATE,"utf8"));
if(state.schema!=="pse-legacy-article-migration-v1")throw Error("Unknown state schema");
if(!state.backup_verified)throw Error("Verified rollback backup required before WordPress writes");
// Finance recovery is opt-in and confined to independently audited Joomla URLs.
const financeScope=process.env.PSE_FINANCE_RECOVERY_SCOPE==="verified-nine-2026-11-20";
const financeSourceUrls=Object.freeze({
 "1738":"20261105-cbtt-dinh-chinh-thong-tin-da-cong-bo-trong-bctc-quy-3-2026",
 "1666":"20260320-cbtt-bao-cao-tai-chinh-da-kiem-toan-nam-2025-va-giai-trinh-chenh-lech-lnst",
 "1650":"20250814-cbtt-bao-cao-tai-chinh-ban-nien-nam-2025-va-giai-trinh-chenh-lech-lnst-so-voi-cung-ky",
 "1480":"20210812-cv53-dnb-hdqt-cbtt-bctc-giua-nien-do-da-duoc-soat-xet",
 "1148":"bao-cao-tai-chinh-quy-3-2015",
 "1137":"bao-cao-tai-chinh-ban-nien-2015",
 "337":"bao-cao-tai-chinh-da-duoc-kiem-toan-nam-2012-cua-pvfcco-se",
 "298":"pvfcco-se-cong-bo-thong-tin-bao-cao-tai-chinh-ban-nien-2012-da-duoc-soat-xet",
 "199":"bao-cao-tai-chinh-6-thang-dau-nam-2011"
});
if(financeScope){
 for(const [id,slug] of Object.entries(financeSourceUrls)){
  const expected="https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-tai-chinh/"+id+"-"+slug+".html";
  const old=state.articles[id];
  if(!old){
   if(id!=="1738")throw Error("Finance checkpoint unexpectedly absent source="+id);
   state.articles[id]={source_url:expected,group_hint:"shareholder",status:"pending",attempts:0};
  }else if(old.source_url!==expected||old.group_hint!=="shareholder")
   throw Error("Finance source provenance changed "+id);
 }
 if(!state.backup_verified)throw Error("Verified rollback prerequisite absent");
}
const isFinance=(id,row)=>row?.group_hint==="shareholder" &&
 new RegExp("^https://(?:www\\.)?pse\\.vn/quan-he-nha-dau-tu/bao-cao-tai-chinh/"+id+"-[^/]+\\.html$","i").test(row.source_url||"");
const financeOversizedPdfBytes=Object.freeze({"1666":31725319,"1650":29305039,"1480":29305039});
const opts=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
function origin(name){
 const lines=opts.filter(x=>x.startsWith(name+"="));
 if(lines.length!==1)throw Error("Missing "+name);
 const url=new URL(lines[0].slice(name.length+1).trim().replace(/^['"]|['"]$/g,""));
 if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||!["","/"].includes(url.pathname))throw Error("Unsafe "+name);
 return url.origin;
}
const wp=origin("WC_URL"),source=new URL(state.source);
const GROUPS=["company","agriculture-market","shareholder"];
// Explicit owner-approved exception: ONLY these 5 audited market source images
// may be removed, after a fresh failure probe. Never omit PDFs or source text.
const BROKEN_MARKET_IMAGES=Object.freeze({
 "343":"http://nongnghiep.vn/Upload/Image/2013/3/12/12032013144852.jpg",
 "346":"http://nongnghiep.vn/Upload/Image/2013/3/17/17032013164111.JPG",
 "347":"http://nongnghiep.vn/Upload/Image/2013/3/14/14032013150031.jpg",
 "352":"http://www.bttv.org.vn/userfiles/image/bap%20lai%201.jpg",
 "360":"http://tinphanbon.com/wp-content/uploads/2013/04/san-xuat-phan-bon.jpg"
});
const mayRecoverImage=(id,v)=>Object.hasOwn(BROKEN_MARKET_IMAGES,id) &&
 v?.status==="quarantined" && v.reason==="Article contains non-local mandatory media" &&
 !v.wp_id && !v.broken_image_recovery_attempted &&
 new RegExp("^https://(?:www\\.)?pse\\.vn/hoat-dong-kinh-doanh/thong-tin-thi-truong/"+id+"-[^/]+\\.html$","i").test(v.source_url||"");
// Report archive: retry only provenance-verified broken GIFs / exact 2025 PDF;
// categorize existing posts in-place (never create a duplicate by source slug).
const annualIds=new Set(["998","999","1000","1041","1042","1043","1092","1188","1259","1307","1353","1386","1412","1511","1546","1578","1625","1667"]);
const isAnnual=(id,v)=>annualIds.has(id) && new RegExp("^https://(?:www\\.)?pse\\.vn/quan-he-nha-dau-tu/bao-cao-thuong-nien/"+id+"-[^/]+\\.html$","i").test(v?.source_url||"") && v.group_hint==="shareholder";
const brokenAnnualGifIds=new Set(["1042","1043","1188","1259"]);
const mayRecoverAnnualGif=(id,v)=>brokenAnnualGifIds.has(id)&&isAnnual(id,v)&&v.status==="quarantined"&&!v.wp_id&&!v.annual_valid_gif_recovery_attempted&&v.reason==="Annual source GIF not proven corrupt; preserve image";
const mayRecoverAnnualPdf=(id,v)=>id==="1667"&&isAnnual(id,v)&&["quarantined","pending"].includes(v.status)&&v.reason==="Original media size unsafe; bytes=33341195; ext=pdf"&&!v.wp_id&&(!v.annual_pdf_2025_attempted||!v.annual_pdf_regex_retry_attempted);
// Bounded exception: two source-verified large governance PDFs, NOT images.
const governancePdfBytes=Object.freeze({"1649":28360845,"1664":39702837});
const isGovernance=(id,v)=>v?.group_hint==="shareholder" &&
 new RegExp("^https://(?:www\\.)?pse\\.vn/quan-he-nha-dau-tu/tai-lieu-quan-tri-cong-ty/"+id+"-[^/]+\\.html$","i").test(v.source_url||"");
const mayRecoverGovernancePdf=(id,v)=>Object.hasOwn(governancePdfBytes,id)&&isGovernance(id,v)&&!v.wp_id&&
 ["quarantined","pending"].includes(v.status)&&
 v.reason==="Original media size unsafe; bytes="+governancePdfBytes[id]+"; ext=pdf"&&
 !v.governance_large_pdf_attempted;
const mayTagAnnual=(id,v)=>isAnnual(id,v)&&Number.isSafeInteger(v.wp_id)&&!v.annual_category_verified&&["existing","imported","draft_needs_date"].includes(v.status);
// Exact original disclosure scans: source document is the original JPG/PNG binary,
// not the short editorial byline. All 12 source article bodies and images
// were independently verified 20-Nov-2026, Actions run #44697939790.
const disclosureScanCounts=Object.freeze({"208":1,"302":1,"319":1,"320":1,"330":1,"1013":2,"1026":2,"1044":1,"1045":2,"1047":2,"1058":3,"1121":4});
// Three exact two-digit Joomla governance source IDs were visited but excluded
// by the old 3+ digit crawler. Read-only proof: PSE governance run 40524872807.
// Seed only the source URLs already present in 'seen'; never synthesize documents.
const verifiedGovernanceTwoDigitSources=Object.freeze({
 "90":"https://www.pse.vn/quan-he-nha-dau-tu/tai-lieu-quan-tri-cong-ty/90-quy-che-quan-tri-cong-ty-14-01-2016.html",
 "91":"https://www.pse.vn/quan-he-nha-dau-tu/tai-lieu-quan-tri-cong-ty/91-quy-trinh-cong-bo-thong-tin.html",
 "92":"https://www.pse.vn/quan-he-nha-dau-tu/tai-lieu-quan-tri-cong-ty/92-dieu-le-cong-ty-co-phan-phan-bon-va-hoa-chat-dau-khi-dong-nam-bo.html"
});
for(const [id,original] of Object.entries(verifiedGovernanceTwoDigitSources)){
 if(financeScope)break;
 if(!state.seen?.includes(original))throw Error("Two-digit governance source absent from original crawler visit "+id);
 if(state.articles[id]){
  if(state.articles[id].source_url!==original||state.articles[id].group_hint!=="shareholder")throw Error("Two-digit governance checkpoint identity drift "+id);
 }else{
  state.articles[id]={source_url:original,group_hint:"shareholder",status:"pending",attempts:0};
  console.log("PSE_GOV_TWO_DIGIT_SEEDED=PASS; source_id="+id+"; exact_source_verified=true");
 }
}
// 2013 governance resolution contains a source-owned scanned JPG plus a short
// editorial byline; verify the scan binary before counting it as an article.
const governance376Image="https://www.pse.vn/images/web/quanhe-codong/tin-tuc/NghiQuyet2012/106-nq-nb.jpg";
const canVerifyGovernance376=(id,v)=>id==="376"&&isGovernance(id,v)&&!v.wp_id&&
 v.status==="quarantined"&&v.reason==="Source content incomplete or oversized"&&
 !v.governance_376_image_recovery_attempted;
// Joomla repeated the exact 2015 audit resolution as disclosure #1127 and
// company news #1129. The already-imported #1129 owns the only WP slug.
// Reuse its identical PDF+icon, preserving existing categories and article.
const mayRetagDisclosure1127=(id,r)=>
 id==="1127" && r?.status==="quarantined" && !r.wp_id &&
 r.reason==="WP slug occupied by unrelated or empty content" &&
 r.source_url==="https://www.pse.vn/quan-he-nha-dau-tu/tin-tuc-co-dong/ban-cong-bo-thong-tin/1127-nghi-quyet-ve-viec-phe-duyet-don-vi-kiem-toan-bao-cao-tai-chinh-nam-2015.html";
// A fresh source binary audit independently proved all four #1670 PDFs;
// the old quarantined reason only reflects the previous 24-MB limit.
const mayRetryVerifiedDisclosure1670=(id,r)=>id==="1670" && r?.group_hint==="shareholder" &&
 r.source_url==="https://www.pse.vn/quan-he-nha-dau-tu/tin-tuc-co-dong/ban-cong-bo-thong-tin/1670-20260403-cbtt-thu-moi-tai-lieu-dhdcd-va-thong-bao-de-cu-ung-cu-thanh-vien-hdqt-bks-nhiem-ky-2026-2031.html" &&
 !r.wp_id && r.status==="quarantined" && r.reason==="Unexpected oversized disclosure asset" &&
 !r.disclosure_four_pdf_retry_attempted;
const VERIFIED_2025_REMOTE=Object.freeze({
  "1641": {
    "day": "2025-05-14",
    "title": "“Miền Đông khúc ca tự hào” - Từ bản hùng ca lịch sử đến khát vọng phát triển tương lai",
    "source": "https://www.pse.vn/21-tin-tuc-su-kien/tin-cong-ty/1641-mien-dong-khuc-ca-tu-hao-tu-ban-hung-ca-lich-su-den-khat-vong-phat-trien-tuong-lai.html",
    "media": {
      "https://cdn.petrotimes.vn/stores/news_dataimages/2025/042025/29/08/in_article/421a759520250429080639.jpg?rt=20250429080724": 260790,
      "https://cdn.petrotimes.vn/stores/news_dataimages/2025/042025/29/08/in_article/421a753420250429080637.jpg?rt=20250429080738": 168609,
      "https://cdn.petrotimes.vn/stores/news_dataimages/2025/042025/29/08/421a761020250429080642.jpg?rt=20250429091645": 404803
    }
  },
  "1651": {
    "day": "2025-08-18",
    "title": "Ứng dụng “Phú Mỹ”: Gia tăng tương tác và trải nghiệm cho bà con nông dân",
    "source": "https://www.pse.vn/21-tin-tuc-su-kien/tin-cong-ty/1651-ung-dung-phu-my-gia-tang-tuong-tac-va-trai-nghiem-cho-ba-con-nong-dan.html",
    "media": {
      "https://www.dpm.vn/public_folder/files_upload/202508/1755251403-ung-dung-phu-my-tich-diem-doi-qua-gia-tang-tuong-tac-va-trai-nghiem-cho-ba-con-nong-danpng.webp": 80656,
      "https://www.dpm.vn/public_folder/files_upload/202508/1755251374-qr-de-tai-app-phu-mypng.webp": 54338
    }
  }
});
const candidates=financeScope
 ? ["1738","1148","337","199","1666","1650","1480","298","1137"].filter(id=>
  !state.articles[id]?.wp_id&&(!state.articles[id]?.finance_scope_terminal||
    (id==="1137"&&!state.articles[id]?.finance_exception_attempted)))
 : Object.keys(state.articles).filter(id=>
 mayTagAnnual(id,state.articles[id]) || mayRecoverAnnualGif(id,state.articles[id]) || mayRecoverAnnualPdf(id,state.articles[id]) || mayRecoverGovernancePdf(id,state.articles[id]) || canVerifyGovernance376(id,state.articles[id]) ||
 mayRetryVerifiedDisclosure1670(id,state.articles[id]) || mayRetagDisclosure1127(id,state.articles[id]) || mayRecoverImage(id,state.articles[id]) ||
 ((["pending","media"].includes(state.articles[id].status) &&
    (state.articles[id].attempts||0)<3) ||
   (state.articles[id].status==="quarantined" &&
    state.articles[id].reason==="WP slug occupied by unrelated content" &&
    (state.articles[id].attempts||0)<3) ||
   (state.articles[id].status==="quarantined" &&
    /^Original media size unsafe; bytes=\d+; ext=pdf$/.test(state.articles[id].reason||"") &&
    Number((state.articles[id].reason||"").match(/bytes=(\d+)/)?.[1])>80 &&
    Number((state.articles[id].reason||"").match(/bytes=(\d+)/)?.[1])<24_000_000) ||
   (state.articles[id].status==="quarantined" &&
    state.articles[id].reason==="Source content incomplete or oversized" &&
    !state.articles[id].short_content_rechecked))
).sort((a,b)=>Number(b)-Number(a));
const continuing=candidates.filter(id=>state.articles[id].status==="media");
const fresh=candidates.filter(id=>state.articles[id].status!=="media");
// Limit work per run, spread across recent and historical source pages, and
// prioritize finishing a previously-started media-heavy record. No parallel
// WordPress writers: serialized by the dedicated Actions concurrency group.
const MAX_ARTICLES_PER_RUN=8;
const MAX_WORK_MS=14*60*1000;
const workerStarted=Date.now();
const freshChoices=fresh.length>=4?
 [fresh[0], fresh[Math.floor(fresh.length/3)],
  fresh[Math.floor(2*fresh.length/3)], fresh.at(-1)] : fresh;
// Balance unfinished media uploads with fresh articles; do not let a large
// legacy PDF gallery starve simpler text posts.
const picked=[...continuing.slice(0,2),...freshChoices,...fresh.slice(1),...continuing.slice(2)];
const ids=picked.filter((id,i)=>id&&picked.indexOf(id)===i).slice(0,MAX_ARTICLES_PER_RUN);
if(!ids.length){
 console.log("PSE_MIGRATION_BATCH=NO_PENDING; discovered="+Object.keys(state.articles).length);
 process.exit(0);
}
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:900}});
const admin=await context.newPage();
const persist=async()=>await writeFile(STATE,JSON.stringify(state,null,2)+"\n","utf8");
let imported=0,existing=0,partial=0,failed=0;
try{
 if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("WP credentials unavailable");
 // WordPress admin occasionally times out while its DB is under load.
 // Retry only the non-mutating login navigation; never retry an uncertain POST.
 for(let attempt=1;attempt<=3;attempt++){
  try{
   const access=await admin.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:45000});
   if(!access||access.status()>=500)throw Error("WordPress admin HTTP "+access?.status());
   break;
  }catch(e){
   if(attempt===3)throw Error("WordPress admin unavailable after three GET attempts: "+String(e).slice(0,160));
   console.warn("PSE_LEGACY_WP_ADMIN_RETRY; attempt="+attempt+"; no_wp_write=true");
   await admin.waitForTimeout(attempt*3000);
  }
 }
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  // Reuse the proven Updraft login flow: parse the login form, not unrelated body text.
  const loginText=(await admin.locator("#loginform").innerText()).slice(0,500);
  const m=loginText.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){
   const a=Number(m[1]),b=Number(m[3]),res=m[2]==="+"?a+b:m[2]==="-"?a-b:a*b;
   const input=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(await input.count())await input.fill(String(res));
  }
  await admin.locator("#wp-submit").click();
 }
 // Login redirect can still be pending after click; verify the protected admin page.
 await admin.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 if(admin.url().includes("wp-login")||!(await admin.locator("#adminmenu").count()))
  throw Error("WordPress admin login rejected after protected-page verification");
 const nonce=await admin.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("No WP REST nonce");
  return (await r.text()).trim();
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("Invalid REST nonce");
 const api=async(path,method="GET",data)=>admin.evaluate(async({path,method,data,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{
    "Accept":"application/json","X-WP-Nonce":nonce,...(data?{"Content-Type":"application/json"}:{})
   },...(data?{body:JSON.stringify(data)}:{})});
  return {status:r.status,data:await r.json().catch(()=>null)};
 },{path,method,data,nonce});
 // Resolve categories already configured in PSE; never create invented taxonomy.
 const table=await api("/wp-json/tablepress/v1/table/pse_01_vi");
 if(table.status!==200||table.data?.items?.length!==GROUPS.length)
  throw Error("PSE WordPress news category table unavailable");
 const cats={};
 for(const [i,group] of GROUPS.entries()){
  const row=table.data.items[i];
  const slug=String(row?.categorySlug||"").trim();
  const expectedId=Number(row?.categoryId);
  if(!slug||!Number.isSafeInteger(expectedId)||expectedId<=0)
   throw Error("PSE WordPress category not configured: "+group);
  const r=await api("/wp-json/wp/v2/categories?slug="+encodeURIComponent(slug)+"&_fields=id,slug");
  if(r.status!==200||r.data?.length!==1||r.data[0].id!==expectedId||
     r.data[0].slug!==slug)
   throw Error("PSE news category slug lookup mismatch: "+group);
  cats[group]=expectedId;
 }
 // Date backfill runs independently; importer never modifies existing post dates.
 for(const id of ids){
  if(Date.now()-workerStarted>MAX_WORK_MS){
    console.log("PSE_LEGACY_BATCH_TIME_BUDGET=STOP; unprocessed_records_remain_queued=true");
    break;
  }
  const item=state.articles[id];
  const proof2025=VERIFIED_2025_REMOTE[id];
  const verified2025=!!proof2025&&item.remote_verified_proof_run===44851880729&&
    item.source_url===proof2025.source&&item.source_created_date===proof2025.day&&
    item.date_source==="joomla_com_search_created"&&item.date_precision==="day"&&
    item.group_hint==="company";
  if(proof2025&&!verified2025)throw Error("Unverified 2025 original Joomla source "+id);
  // Exact source 1137 is a title-only report without linked document.
  if(financeScope&&id==="1137"&&isFinance(id,item)&&item.finance_scope_terminal&&!item.finance_exception_attempted){
   item.finance_exception_attempted=true;
   delete item.finance_scope_terminal;
   item.status="pending";item.attempts=0;
   await persist();
  }
  if(mayRetryVerifiedDisclosure1670(id,item)){
   item.disclosure_four_pdf_retry_attempted=true;
   item.status="pending";item.attempts=0;delete item.reason;
   console.log("PSE_DISCLOSURE_1670_RETRY=SOURCE_VERIFIED; four_pdf_binary_audit=PASS; reset_old_limit_only=true");
   await persist();
  }
  const brokenImageUrl=mayRecoverImage(id,item)?BROKEN_MARKET_IMAGES[id]:null;
  const annualTagOnly=mayTagAnnual(id,item);
  const recoverAnnualGif=mayRecoverAnnualGif(id,item);
  const recoverAnnualPdf=mayRecoverAnnualPdf(id,item);
  const recoverGovernancePdf=mayRecoverGovernancePdf(id,item);
  const recoverGovernance376=canVerifyGovernance376(id,item);
  if(brokenImageUrl){item.broken_image_recovery_attempted=true;await persist();}
  if(recoverAnnualGif){item.annual_valid_gif_recovery_attempted=true;await persist();}
  if(recoverAnnualPdf){if(item.annual_pdf_2025_attempted)item.annual_pdf_regex_retry_attempted=true;item.annual_pdf_2025_attempted=true;await persist();}
  if(recoverGovernancePdf){item.governance_large_pdf_attempted=true;await persist();}
  if(recoverGovernance376){item.governance_376_image_recovery_attempted=true;item.attempts=2;await persist();}
  // One bounded second look for source pages that are legitimate short PDF/link notices.
  // Legacy 100-character minimum was too strict for investor disclosures.
  if(item.status==="quarantined" && item.reason==="Source content incomplete or oversized" &&
     !item.short_content_rechecked){
    item.short_content_rechecked=true;
    item.attempts=2; // Exactly one recheck; never loop indefinitely on invalid HTML.
  }
  if(item.status==="quarantined" && /^Original media size unsafe; bytes=\d+; ext=pdf$/.test(item.reason||""))item.attempts=0;
  item.attempts=(item.attempts||0)+1;
  const url=new URL(item.source_url);
  if(url.protocol!=="https:"||!["pse.vn","www.pse.vn"].includes(url.hostname)||
      !new RegExp("/"+id+"-[^/]+\\.html$","i").test(url.pathname)){
   item.status="quarantined";item.reason="Unsafe or mismatched original source URL";failed++;continue;
  }
  const path=url.pathname;
  const sourceSlug=path.match(/\/\d{2,6}-([^/]+)\.html$/i)?.[1]?.toLowerCase();
  // Two distinct Joomla news items #1601 (2024) and #1616 (2025) share a
  // headline/slug. Source and live WP body identities were proven in QA #44773915965.
  const distinct1601=id==="1601" && item.source_url==="https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/1601-pvfcco-pse-to-chuc-le-cong-bo-va-trao-quyet-dinh-ve-cong-tac-can-bo.html" &&
    item.distinct_source_verified===true && item.conflict_wp_id===77405 &&
    item.unique_slug_suffix==="2024" && state.articles["1616"]?.wp_id===77405 &&
    state.articles["1616"]?.source_url==="https://www.pse.vn/21-tin-tuc-su-kien/tin-cong-ty/1616-pvfcco-pse-to-chuc-le-cong-bo-va-trao-quyet-dinh-ve-cong-tac-can-bo.html";
  if(id==="1601" && !distinct1601)throw Error("1601 unique alias proof missing");
  const slug=distinct1601?sourceSlug+"-2024":sourceSlug;
  const cat=cats[item.group_hint];
  const disclosureSource=item.group_hint==="shareholder" &&
    /^\/quan-he-nha-dau-tu\/tin-tuc-co-dong\/ban-cong-bo-thong-tin\/\d{2,6}-[^/]+[.]html$/i.test(path);
  // Preserve legacy child taxonomy from exact Joomla source path, not keywords.
  const sourceChildSlug=isFinance(id,item)
     ? "bao-cao-tai-chinh"
     : isGovernance(id,item)
    ? "tai-lieu-quan-tri-cong-ty"
    : isAnnual(id,item)
    ? "bao-cao-thuong-nien"
    : disclosureSource
    ? "ban-cong-bo-thong-tin"
    : item.group_hint==="company"
    ? (path.startsWith("/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/")?"tin-tong-hop":
       path.startsWith("/tin-tuc-su-kien/tin-cong-ty/hoat-dong-chi-bo-hdqt-bks/")?
         "hoat-dong-chi-bo-hdqt-bks":
       path.startsWith("/tin-tuc-su-kien/tin-cong-ty/hoat-dong-cong-doan-doan-tn-nu-cong/")?
         "hoat-dong-cong-doan-doan-tn-nu-cong":
       path.startsWith("/tin-tuc-su-kien/tin-cong-ty/dang-uy/")?
         "dang-uy":null)
    : null;
  let sourceChildCategory=null;
  if(sourceChildSlug && (isFinance(id,item) || isAnnual(id,item) || isGovernance(id,item) || disclosureSource || /^\/tin-tuc-su-kien\/tin-cong-ty\/[a-z0-9-]+\/\d+-[^/]+\.html$/i.test(path))){
    const r=await api("/wp-json/wp/v2/categories?slug="+encodeURIComponent(sourceChildSlug)+"&_fields=id,slug,parent");
    if(r.status!==200||r.data?.length!==1||
      Number(r.data[0].parent)!==Number(cat)||r.data[0].slug!==sourceChildSlug)
      throw Error("Source child category missing or parent mismatched "+sourceChildSlug);
    sourceChildCategory=Number(r.data[0].id);
  }
  const articleCategories=sourceChildCategory?[cat,sourceChildCategory]:[cat];
  if(!cat||!slug){
   item.status="quarantined";item.reason="Original Joomla section cannot be mapped to verified WP taxonomy";failed++;continue;
  }
  try{
   if(distinct1601){
     // Check the conflicting live post really is the different March 2025
     // Joomla event. Correct only its mistakenly added Tin tong hop tag;
     // preserve its slug, content, date, publish status and root taxonomy.
     const oldAlias=await api("/wp-json/wp/v2/posts?status=any&context=edit&slug="+encodeURIComponent(sourceSlug)+
       "&per_page=10&_fields=id,slug,status,date,title,content,categories");
     const existingAlias=oldAlias.data?.[0];
     if(oldAlias.status!==200||oldAlias.data?.length!==1||existingAlias?.id!==77405||
       existingAlias.slug!==sourceSlug||existingAlias.status!=="publish"||
       !String(existingAlias.date||"").startsWith("2025-03-03")||
       !existingAlias.categories?.includes(cat)||sourceChildCategory!==1746||
       ![1,2].includes(existingAlias.categories.length)||
       existingAlias.categories.some(c=>![cat,sourceChildCategory].includes(c))||
       !String(existingAlias.content?.raw||"").includes("3/3/2025"))
       throw Error("1601/1616 historical collision identity cannot be verified; no write");
     if(existingAlias.categories.includes(sourceChildCategory)){
       const reclassified=await api("/wp-json/wp/v2/posts/77405","POST",{categories:[cat]});
       const verify=await api("/wp-json/wp/v2/posts/77405?context=edit&_fields=id,slug,status,date,title,content,categories");
       if(reclassified.status!==200||verify.status!==200||verify.data?.id!==77405||
         verify.data.slug!==sourceSlug||verify.data.status!==existingAlias.status||
         verify.data.date!==existingAlias.date||
         String(verify.data.content?.raw||"")!==String(existingAlias.content?.raw||"")||
         JSON.stringify(verify.data.categories)!==JSON.stringify([cat]))
         throw Error("Cannot verify safe restoration of March 2025 taxonomy");
       console.log("PSE_1616_CORRECT_CATEGORY=PASS; wp_id=77405; removed_tin_tong_hop=true; content_date_unchanged=true");
     } else console.log("PSE_1616_CORRECT_CATEGORY=ALREADY_DONE; wp_id=77405");
   }
   const before=await api("/wp-json/wp/v2/posts?status=any&context=edit&slug="+encodeURIComponent(slug)+"&per_page=100&_fields=id,status,slug,title,content,categories");
   if(before.status!==200||!Array.isArray(before.data))throw Error("Cannot verify existing WP slug");
   if(before.data.length>1)throw Error("WP duplicate slug, human review required");
   if(before.data.length===1){
    const old=before.data[0];
    if(distinct1601){
      const existingText=String(old.content?.raw||"");
      if(old.slug!==slug||old.status!=="publish"||!old.categories?.includes(cat)||
        !old.categories?.includes(sourceChildCategory)||
        !existingText.includes("30/12/2024"))throw Error("2024 alias slug occupied by unrelated content");
      item.status="imported";item.wp_id=old.id;
      item.seo_cleaned=true;item.attribution_cleaned=true;
      existing++;await persist();
      console.log("PSE_1601_DISTINCT_EXISTING=PASS; wp_id="+old.id+"; no_duplicate=true");
      continue;
    }
    if(annualTagOnly&&old.id!==item.wp_id)throw Error("Annual checkpoint WP identity mismatch");
    if(mayRetagDisclosure1127(id,item)){
     const matching=state.articles["1129"];
     const pdf= "/wp-content/uploads/2026/10/pse-legacy-6c6a510f35db5a7e.pdf";
     const icon="/wp-content/uploads/2026/10/pse-legacy-9d0398eade66fb17.png";
     const title="Nghị quyết: Về việc Phê duyệt đơn vị kiểm toán Báo cáo tài chính năm 2015";
     const content=String(old.content?.raw||"");
     if(matching?.status!=="imported"||matching?.wp_id!==82240||
        matching.source_url!=="https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/hoat-dong-chi-bo-hdqt-bks/1129-nghi-quyet-ve-viec-phe-duyet-don-vi-kiem-toan-bao-cao-tai-chinh-nam-2015.html"||
        old.id!==82240||old.slug!==slug||old.status!=="publish"||
        String(old.title?.raw||old.title?.rendered||"").trim()!==title||
        !content.includes(pdf)||!content.includes(icon)||
        !old.categories?.includes(1747)||!old.categories?.includes(1742)||
        Number(cat)!==1744||Number(sourceChildCategory)!==1753)
       throw Error("Disclosure 1127 cannot be proven identical to existing 1129; no category write");
     const categories=[...new Set([...old.categories,cat,sourceChildCategory])];
     if(!old.categories.includes(cat)||!old.categories.includes(sourceChildCategory)){
      const saved=await api("/wp-json/wp/v2/posts/82240","POST",{categories});
      if(saved.status!==200||saved.data?.id!==82240)throw Error("1127 existing category assignment rejected");
     }
     const verify=await api("/wp-json/wp/v2/posts/82240?context=edit&_fields=id,slug,status,title,content,categories");
     if(verify.status!==200||verify.data?.id!==82240||verify.data.slug!==slug||
        verify.data.status!=="publish"||
        !categories.every(c=>verify.data.categories?.includes(c))||
        String(verify.data.content?.raw||"")!==content)
       throw Error("1127 existing article readback changed; refuse duplicate");
     item.status="existing";item.wp_id=82240;
     item.seo_cleaned=true;item.attribution_cleaned=true;
     delete item.reason;
     existing++;
     console.log("PSE_DISCLOSURE_DUPLICATE=MERGED; source_id=1127; original_source_id=1129; wp_id=82240; category=1753; content_unchanged=true");
     await persist();continue;
    }

    // WP slug is unique within the same verified category. Old PSE posts
    // were imported before the source-URL marker was introduced, so requiring
    // that marker or comparing accented titles generates false conflicts.
    // Never change a matching existing post; preserve its original content.
    if(!old.categories?.includes(cat) ||
       !String(old.title?.raw||old.title?.rendered||"").trim() ||
       !String(old.content?.raw||"").trim()){
     item.status="quarantined";item.reason="WP slug occupied by unrelated or empty content";failed++;continue;
    }
    if(sourceChildCategory && !old.categories.includes(sourceChildCategory)){
      const updated=await api("/wp-json/wp/v2/posts/"+old.id,"POST",
        {categories:[...new Set([...old.categories,sourceChildCategory])]});
      if(updated.status!==200||!updated.data?.categories?.includes(sourceChildCategory))
        throw Error("Existing source child category update failed");
      const verify=await api("/wp-json/wp/v2/posts/"+old.id+"?context=edit&_fields=id,slug,status,categories");
      if(verify.status!==200||verify.data?.slug!==slug||
        !verify.data.categories?.includes(cat)||
        !verify.data.categories?.includes(sourceChildCategory))
        throw Error("Existing source child category readback failed");
    }
    if(annualTagOnly){
      item.annual_category_verified=Boolean(sourceChildCategory && old.id===item.wp_id);
      console.log("PSE_ANNUAL_CATEGORY=PASS; source_id="+id+"; wp_id="+old.id+"; category="+sourceChildCategory+"; original_status="+item.status);
    }else{item.status="existing";item.wp_id=old.id;}
    existing++;
    console.log("PSE_LEGACY_SKIP_EXISTING=PASS; source_id="+id+"; wp_id="+old.id);
    await persist();continue;
   }
   // An image may have recovered since the original audit. Never drop a
   // currently valid picture to make the migration succeed.
   if(brokenImageUrl){
    try{
     const r=await context.request.get(brokenImageUrl,{timeout:18000});
     if(r.ok()){
      const bytes=await r.body(),h=bytes.subarray(0,16);
      const signature=h.subarray(0,3).toString("hex")==="ffd8ff"||
       h.subarray(0,8).toString("hex")==="89504e470d0a1a0a"||
       ["GIF89a","GIF87a"].includes(h.subarray(0,6).toString("latin1"))||
       (h.subarray(0,4).toString("latin1")==="RIFF"&&h.subarray(8,12).toString("latin1")==="WEBP");
      if(signature&&String(r.headers()["content-type"]||"").toLowerCase().startsWith("image/"))
       throw Error("Original image recovered; preserve it");
     }
     console.log("PSE_MARKET_BAD_IMAGE_PROOF=PASS; source_id="+id+"; http="+r.status());
    }catch(e){
     if(String(e?.message||e).includes("Original image recovered;"))throw e;
     console.log("PSE_MARKET_BAD_IMAGE_PROOF=PASS; source_id="+id+"; error=NETWORK");
    }
   }
   const original=await context.newPage();
   let article;
   try{
    const resp=await original.goto(item.source_url,{waitUntil:"domcontentloaded",timeout:45000});
    let inlineTitle=null;
    // The two exact source permalinks return Joomla HTTP 500, but the original
    // category lists the complete HTML article and its mandatory images.
    // Titles, paths and source-created days were independently verified via
    // Joomla com_search. Do not use this fallback for any other source ID.
    const inlineTitles={
     "1637":"PVFCCo-PSE cùng nhau hưởng ứng hướng về ngày Lễ trọng đại, kỷ niệm 50 năm Ngày Giải phóng Miền Nam, thống nhất Đất nước (30/4/1975 – 30/4/2025)",
     "1638":"Kỷ niệm 21 năm Công đoàn PVFCCo – Hướng về 50 năm Ngày Giải phóng Miền Nam, thống nhất Đất nước"
    };
    if(resp?.status()!==200){
     if(resp?.status()!==500 || !inlineTitles[id] ||
        !/^\/tin-tuc-su-kien\/tin-cong-ty\/hoat-dong-cong-doan-doan-tn-nu-cong\/(1637|1638)-[a-z0-9-]+\.html$/i.test(path)||
        item.source_created_date!=="2025-04-28" ||
        item.date_source!=="joomla_com_search_created"||
        !item.verified_category_blog_fallback)
       throw Error("Source HTTP "+resp?.status());
     const categoryURL="https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/hoat-dong-cong-doan-doan-tn-nu-cong.html";
     const listing=await original.goto(categoryURL,{waitUntil:"domcontentloaded",timeout:60000});
     if(listing?.status()!==200)throw Error("Verified original Joomla category unavailable");
     inlineTitle=inlineTitles[id];
     console.log("PSE_LEGACY_INLINE_SOURCE=VERIFIED; source_id="+id+
       "; detail_http=500; category_http=200; source_created_day="+item.source_created_date);
    }
    // Source GIFs can be tiny but valid. Keep original markup; validate the
    // exact 49-byte binary before a narrowly scoped WordPress media upload.
    article=await original.evaluate(({expectedTitle,brokenImageUrl,disclosure1670})=>{
     let root;
     if(expectedTitle){
      const rows=[...document.querySelectorAll('.blog [itemprop="blogPost"]')].filter(e=>
       e.querySelector('h2[itemprop="name"]')?.textContent?.replace(/\s+/g," ").trim()===expectedTitle);
      if(rows.length!==1||rows[0].querySelector(".readmore,a.readmore"))
       throw Error("Inline Joomla blog article missing, truncated or ambiguous");
      root=rows[0];
     }else root=document.querySelector('[itemprop="articleBody"]');
     if(!root)throw Error("Verified Joomla source article body missing");
     const copy=root.cloneNode(true);
     if(expectedTitle)copy.querySelector(".page-header")?.remove();
     const omittedImages=[];
     // Original #1670 has one broken, textless icon link (HTTP 404) beside
     // an exact working "Ủy Quyền" link. Preserve the icon while resolving its
     // href to the original verified working PDF, without altering visible text.
     let repairedDisclosureLink=false;
     if(disclosure1670){
      const bad="https://www.pse.vn/images/uy_quyen.pdf";
      const good="https://www.pse.vn/images/Uy-Quyen.pdf";
      const anchorHref=a=>{try{return new URL(a.getAttribute("href"),location.href).href}catch{return null}};
      const anchors=[...copy.querySelectorAll("a[href]")];
      const broken=anchors.filter(a=>anchorHref(a)===bad);
      const valid=anchors.filter(a=>anchorHref(a)===good &&
        String(a.textContent||"").replace(/\s+/g," ").trim()==="Ủy Quyền");
      if(broken.length!==1||String(broken[0].textContent||"").trim()||valid.length!==1)
        throw Error("Disclosure 1670 broken icon link source no longer matches audited original");
      broken[0].setAttribute("href",good);
      repairedDisclosureLink=true;
     }
     if(brokenImageUrl){
      const originalText=(copy.textContent||"").replace(/\s+/g," ").trim();
      const images=[...copy.querySelectorAll("img[src]")];
      if(images.length!==1)throw Error("Market source photo count changed");
      const img=images[0],u=new URL(img.getAttribute("src"),location.href).href;
      if(u!==brokenImageUrl)throw Error("Market source photo URL changed");
      const parentLink=img.closest("a");
      img.remove();
      if(parentLink && !parentLink.textContent.trim()&&!parentLink.querySelector("img,svg,video"))
       parentLink.remove();
      for(const link of [...copy.querySelectorAll("a[href]")]){
       try{
        if(new URL(link.getAttribute("href"),location.href).href===brokenImageUrl)
         link.replaceWith(...link.childNodes);
       }catch{}
      }
      if((copy.textContent||"").replace(/\s+/g," ").trim()!==originalText)
       throw Error("Source text changed by photo omission");
      omittedImages.push(brokenImageUrl);
     }
     // Remove the Joomla related-articles tail before collecting text or linked media.
     const related=[...copy.querySelectorAll("h1,h2,h3,h4,h5,p")].find(el=>
       String(el.textContent||"").replace(/[\u00a0\s]+/g," ").trim().toLocaleLowerCase("vi")==="các bài viết khác");
     if(related){
       const cut=document.createRange();
       cut.setStartBefore(related);
       cut.setEnd(copy,copy.childNodes.length);
       cut.deleteContents();
     }
     copy.querySelectorAll("script,style,iframe,form,button,nav,svg,video,audio,input").forEach(el=>el.remove());
     const allowed=new Set(["P","DIV","SPAN","BR","B","STRONG","I","EM","UL","OL","LI","H2","H3","H4","TABLE","THEAD","TBODY","TR","TD","TH","A","IMG","BLOCKQUOTE","HR"]);
     for(const el of [...copy.querySelectorAll("*")].reverse()){
      if(!el.parentNode)continue;
      if(!allowed.has(el.tagName)){el.replaceWith(...el.childNodes);continue}
      for(const att of [...el.attributes]){
       if(!["href","src","alt","title","colspan","rowspan"].includes(att.name))el.removeAttribute(att.name);
      }
      for(const attr of ["href","src"]){
       if(!el.hasAttribute(attr))continue;
       const value=el.getAttribute(attr);
       try{
        const u=new URL(value,location.href);
        if(!["https:","http:"].includes(u.protocol)){el.removeAttribute(attr);continue}
        el.setAttribute(attr,u.href);
       }catch{el.removeAttribute(attr)}
      }
     }
     const title=expectedTitle||(document.title||"").replace(/\s+-\s+PSE\.VN\s*$/i,"").trim();
     const rawDates=[
       ...document.querySelectorAll('meta[property="article:published_time"],meta[itemprop="datePublished"],meta[name="date"],meta[name="DC.date.issued"],time[datetime],[itemprop="datePublished"],.article-info dd.published,.article-info dd.created')
     ].map(e=>e.getAttribute("content")||e.getAttribute("datetime")||e.textContent||"");
     // Remove empty editor blocks only at the article tail.
     const isBlank=node=>node.nodeType===Node.TEXT_NODE
       ? !String(node.textContent||"").replace(/[\u00a0\s]/g,"")
       : node.nodeType===Node.ELEMENT_NODE && node.matches("p,div,br") &&
         !node.querySelector("a,img,iframe,object,embed,table,hr") &&
         !String(node.textContent||"").replace(/[\u00a0\s]/g,"");
     while(copy.lastChild && isBlank(copy.lastChild))copy.lastChild.remove();
     const rawText=(copy.textContent||"").replace(/\s+/g," ").trim();
     const assets=[...new Set([...copy.querySelectorAll("img[src],a[href]")].map(el=>el.getAttribute(el.tagName==="IMG"?"src":"href")).filter(x=>x&&
       /\.(png|jpe?g|webp|gif|pdf|docx?|xlsx?|pptx?)(\?|#|$)/i.test(x)))];
     const sourceHeading=(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent||"").replace(/\s+/g," ").trim();
     return {title,sourceHeading,html:copy.innerHTML.trim(),bodyText:rawText,chars:rawText.length,dates:expectedTitle?[]:rawDates,assets,omittedImages,repairedDisclosureLink};
    },{expectedTitle:inlineTitle,brokenImageUrl,disclosure1670:id==="1670"&&disclosureSource});
   }finally{await original.close()}
   if(verified2025){
    if(article.sourceHeading!==proof2025.title||article.chars<500)
      throw Error("Joomla 2025 verified title or body unexpectedly changed "+id);
    article.title=article.sourceHeading;
   }
   if(id==="1670"&&disclosureSource){
    if(!article.repairedDisclosureLink||article.assets.length!==4||
       article.assets.includes("https://www.pse.vn/images/uy_quyen.pdf"))
      throw Error("Disclosure 1670 audited four attachments not preserved");
    console.log("PSE_DISCLOSURE_1670_BROKEN_LINK=SOURCE_REPAIRED; original_four_pdfs_preserved=true");
   }
   if(brokenImageUrl){
    if(article.omittedImages?.length!==1||article.chars<200||article.assets.includes(brokenImageUrl)||article.html.includes(brokenImageUrl))
     throw Error("Approved photo exclusion not verified");
    item.omitted_broken_source_images=[brokenImageUrl];
    console.log("PSE_MARKET_BAD_IMAGE_REMOVED=PASS; source_id="+id+"; text_chars="+article.chars);
    await persist();
   }
   // Short source notices are valid when they have substantial text (65+ chars)
   // or 20+ chars backed by actual linked media. Never synthesize an article body.
   // A genuine Joomla document notice may consist solely of "Download" and a PDF.
   // The attachment must pass the source HTTP/size/signature checks below.
   const verifiedPdfNotice=article.chars>=7 &&
     /(?:download|tải|\.pdf|chi tiết)/i.test(article.bodyText) &&
     article.assets.some(u=>/\.pdf(?:[?#]|$)/i.test(u));
   let verifiedScan376=false;
   if(recoverGovernance376 && article.bodyText==="H.H"&&article.assets.length===1&&
      article.assets[0]===governance376Image&&article.html.includes(governance376Image)){
     const image=await context.request.get(governance376Image,{timeout:30000});
     const bytes=await image.body();
     const final=new URL(image.url());
     verifiedScan376=image.status()===200&&bytes.length>=256&&bytes.length<=24_000_000&&
       bytes.subarray(0,3).toString("hex")==="ffd8ff"&&
       String(image.headers()["content-type"]||"").toLowerCase().startsWith("image/jpeg")&&
       final.hostname==="www.pse.vn"&&final.protocol==="https:";
     if(verifiedScan376)console.log("PSE_GOV_376_SCAN_PROOF=PASS; bytes="+bytes.length+"; text_preserved=true");
   }
   const verifiedDisclosureScan=disclosureSource && Object.hasOwn(disclosureScanCounts,id) &&
     article.assets.length===disclosureScanCounts[id] && /<img\b/i.test(article.html) &&
     article.assets.every(x=>{try{const u=new URL(x);return u.protocol==="https:" &&
       ["pse.vn","www.pse.vn"].includes(u.hostname) && u.pathname.startsWith("/images/") &&
       /[.](?:png|jpg|jpeg)$/i.test(u.pathname)}catch{return false}});
   if(verifiedDisclosureScan)console.log("PSE_DISCLOSURE_SCAN=SOURCE_VERIFIED; id="+id+"; media="+article.assets.length);
   const originalMediafire298="http://www.mediafire.com/file/mn5v49y1db5me3h/scan0001.pdf";
   const financeSource1137Empty=financeScope&&id==="1137"&&isFinance(id,item)&&
     article.title==="Báo cáo tài chính bán niên 2015"&&
     !article.bodyText.trim()&&article.assets.length===0&&
     !article.html.replace(/<[^>]+>|&nbsp;|&#160;|\s/gi,"").trim();
   const financeSource298External=financeScope&&id==="298"&&isFinance(id,item)&&
     article.title==="PVFCCo SE công bố thông tin Báo cáo tài chính bán niên 2012 đã được soát xét."&&
     article.bodyText.trim()==="Báo cáo tài chính đã được soát xét"&&
     article.assets.length===1&&article.assets[0]===originalMediafire298&&
     article.html.includes(originalMediafire298);
   if(financeSource1137Empty)article.html="";
   if(financeSource298External){
    // External MediaFire file is a third-party link, never synthesize its bytes.
    article.assets=[];
    item.financial_external_media_preserved=originalMediafire298;
   }
   const verifiedShortNotice=financeSource1137Empty||financeSource298External||article.chars>=65 ||
     (article.chars>=20 && article.assets.length>0) || verifiedPdfNotice || verifiedScan376 || verifiedDisclosureScan;
   if(!article.title||!verifiedShortNotice||article.chars>150000||article.html.length>550000)
    throw Error("Source content incomplete or oversized");
   const iso=article.dates.map(x=>String(x).trim()).find(x=>/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(x));
   let originalDate=iso ? iso.slice(0,19).replace(" ","T") : null;

   let discoveredDate=null;
   // Joomla article pages frequently omit published metadata. In that case
   // query legacy com_search and REQUIRE the exact source article ID+title.
   // This recovers the Joomla created DAY, which the owner accepts as the
   // preserved WordPress publication day (not a claimed historical time).
   if(!originalDate && article.assets.length<=75){
    const lookupPage=await context.newPage();
    try{
     discoveredDate=await searchDate(lookupPage,{
      id:Number(id),sourceUrl:item.source_url,title:article.title,
      opening:article.bodyText.slice(0,300)
     });
     if(discoveredDate.day){
      originalDate=discoveredDate.day+"T00:00:00";
      console.log("PSE_LEGACY_SEARCH_DATE=VERIFIED; source_id="+id+
       "; day="+discoveredDate.day+"; precision="+discoveredDate.precision);
     }
    }finally{await lookupPage.close()}
   }
   // Preserve incomplete source dates as reviewable draft instead of fabricating.
   if(article.assets.length>75){
    item.status="quarantined";item.reason="Excessive media count; special batch required";failed++;continue;
   }
   // Provenance-restricted exception for two exact 2013 Joomla market articles:
   // Original third-party image binaries returned HTTP 200 and valid image
   // signatures in read-only source audit #40486975333, and their Joomla
   // created days were independently verified in audit #40488038617.
   // Refuse any extra/different external URL; do not generalize to all hosts.
   const recoveredRemoteBySource={
    "1641":{day:VERIFIED_2025_REMOTE["1641"].day,urls:Object.keys(VERIFIED_2025_REMOTE["1641"].media)},
    "1651":{day:VERIFIED_2025_REMOTE["1651"].day,urls:Object.keys(VERIFIED_2025_REMOTE["1651"].media)},
    "1363":{
     day:"2019-07-16",
     urls:[
      "https://petrovietnam.petrotimes.vn/stores/news_dataimages/buihienanh/072019/13/12/khai-truong-khu-luu-niem-cong-trinh-dau-khi-dau-tien-tai-viet-nam_1.jpg",
      "https://petrovietnam.petrotimes.vn/stores/news_dataimages/buihienanh/072019/13/12/khai-truong-khu-luu-niem-cong-trinh-dau-khi-dau-tien-tai-viet-nam.jpg",
      "https://petrovietnam.petrotimes.vn/stores/news_dataimages/buihienanh/072019/13/12/khai-truong-khu-luu-niem-cong-trinh-dau-khi-dau-tien-tai-viet-nam_3.jpg",
      "https://petrovietnam.petrotimes.vn/stores/news_dataimages/buihienanh/072019/13/12/khai-truong-khu-luu-niem-cong-trinh-dau-khi-dau-tien-tai-viet-nam_2.jpg"
     ]
    },
    "342":{
     day:"2013-03-13",
     urls:["http://giacaphe.com/wp-content/uploads/2013/03/85362_cf1.jpg"]
    },
    "351":{
     day:"2013-03-25",
     urls:[
      "http://giacaphe.com/wp-content/uploads/2013/03/707b3_cf1.jpg",
      "http://giacaphe.com/wp-content/uploads/2013/03/357c8_cf21.jpg",
      "http://giacaphe.com/gia-ca-phe.gif"
     ]
    }
   };
   const verifiedRemote=recoveredRemoteBySource[id];
   // #1363 has independent source-date + four JPEG byte/signature proof in
   // GitHub Actions run 44835072340. This does not authorize other external hosts.
   const verified1363=id==="1363" && item.source_url==="https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/1363-khai-truong-khu-luu-niem-cong-trinh-dau-khi-dau-tien-tai-viet-nam.html" &&
      item.remote_verified_proof_run===44835072340;
   const marketExternalCase=item.source_url.startsWith("https://www.pse.vn/hoat-dong-kinh-doanh/thong-tin-thi-truong/"+id+"-");
   const remoteAllowed=!!verifiedRemote&&(verified1363||marketExternalCase||verified2025)&&
      item.source_created_date===verifiedRemote.day&&
      item.date_source==="joomla_com_search_created"&&item.date_precision==="day";
   const expectedRemote=remoteAllowed?new Set(verifiedRemote.urls):new Set();
   if(verified2025 && article.assets.filter(u=>expectedRemote.has(u)).length!==expectedRemote.size)
     throw Error("Verified original 2025 media asset list changed "+id);
   if(!originalDate && remoteAllowed && verifiedRemote.day===item.source_created_date){
    // Dates are NOT guesses; independently evidenced original Joomla search result.
    originalDate=verifiedRemote.day+"T00:00:00";
    console.log("PSE_LEGACY_VERIFIED_MARKET_DAY="+id+"; day="+verifiedRemote.day);
   }
   if(verified2025 && (!originalDate||originalDate.slice(0,10)!==proof2025.day))
     throw Error("Verified 2025 source-created day did not survive import "+id);
   const actualRemote=article.assets.filter(u=>{
    try{const x=new URL(u);return !["pse.vn","www.pse.vn"].includes(x.hostname)}
    catch{return true}
   });
   if(actualRemote.some(u=>!expectedRemote.has(u))||
      (expectedRemote.size>0&&(actualRemote.length!==expectedRemote.size||
        [...expectedRemote].some(u=>!actualRemote.includes(u))))){
    item.status="quarantined";item.reason="Article contains non-local mandatory media";failed++;continue
   }
   const outstanding=article.assets.filter(x=>!state.media[x]);
   if(outstanding.length){
    // Four verified annual booklets have 52-67 indispensable images/docs each.
    // Advance their media checkpoints faster, still serial and within 14-min budget.
    const annualBookletMedia=isAnnual(id,item) && ["1042","1043","1188","1259"].includes(id) && item.status==="media" && item.annual_valid_gif_recovery_attempted===true;
    const subset=outstanding.slice(0,annualBookletMedia?12:6);
    for(const assetUrl of subset){
     const download=await context.request.get(assetUrl,{timeout:45000});
     if(!download.ok())throw Error("Original media HTTP "+download.status());
     const buf=await download.body();
     const annual2025Pdf=recoverAnnualPdf && id==="1667" && isAnnual(id,item) && /\.pdf(?:[?#]|$)/i.test(assetUrl);
     const financeLargePdf=financeScope&&isFinance(id,item) &&
        Object.hasOwn(financeOversizedPdfBytes,id) &&
        buf.length===financeOversizedPdfBytes[id] &&
        /\.pdf(?:[?#]|$)/i.test(assetUrl);
      if(financeLargePdf){
       const orig=new URL(assetUrl),finalUrl=new URL(download.url());
       if(orig.protocol!=="https:"||finalUrl.protocol!=="https:"||
          !["pse.vn","www.pse.vn"].includes(orig.hostname)||
          !["pse.vn","www.pse.vn"].includes(finalUrl.hostname)||
          !String(download.headers()["content-type"]||"").toLowerCase().includes("pdf")||
          !buf.subarray(0,8).toString("latin1").startsWith("%PDF-"))
        throw Error("Finance PDF size/MIME/origin/signature verification failed: "+id);
       console.log("PSE_FINANCE_SOURCE_BIG_PDF="+JSON.stringify({id,bytes:buf.length,url:assetUrl}));
      }
      const governanceBigPdf=(recoverGovernancePdf||item.governance_large_pdf_attempted===true)&&
       isGovernance(id,item) && Object.hasOwn(governancePdfBytes,id) && /\.pdf(?:[?#]|$)/i.test(assetUrl);
     const disclosure1670PdfBytes=Object.freeze({
       "https://www.pse.vn/images/Tai_lieu_%C4%90H%C4%90C%C4%90_2026_-_TV.pdf":36078003,
       "https://www.pse.vn/images/Tai_lieu_%C4%90H%C4%90C%C4%90_2026_-_TA.pdf":36917621,
       "https://www.pse.vn/images/CBTT_v%E1%BB%81_vi%E1%BB%87c_%E1%BB%A9ng_c%E1%BB%AD_%C4%91%E1%BB%81_c%E1%BB%AD_v%C3%A0o_H%C4%90QT_BKS_nhi%E1%BB%87m_k%E1%BB%B3_2026-2031.pdf":9099077,
       "https://www.pse.vn/images/Uy-Quyen.pdf":1887034
     });
     const verifiedDisclosurePdf=id==="1670" && disclosureSource &&
       Object.hasOwn(disclosure1670PdfBytes,assetUrl) &&
       buf.length===disclosure1670PdfBytes[assetUrl];
     const disclosureLargePdf=verifiedDisclosurePdf && buf.length>24_000_000;
     if(id==="1670" && disclosureSource){
       if(!verifiedDisclosurePdf)throw Error("Disclosure 1670 original media is not one of four audited PDFs");
       const original=new URL(assetUrl),final=new URL(download.url());
       if(original.protocol!=="https:"||!["pse.vn","www.pse.vn"].includes(original.hostname)||
          final.protocol!=="https:"||!["pse.vn","www.pse.vn"].includes(final.hostname)||
          !String(download.headers()["content-type"]||"").toLowerCase().includes("pdf")||
          !buf.subarray(0,8).toString("latin1").startsWith("%PDF-"))
         throw Error("Disclosure original PDF signature/MIME/origin proof failed");
       console.log("PSE_DISCLOSURE_PDF=SOURCE_VERIFIED; id=1670; bytes="+buf.length+"; file="+original.pathname);
     }
     if(verifiedDisclosureScan){
       const original=new URL(assetUrl),final=new URL(download.url()),h=buf.subarray(0,16);
       const ext=original.pathname.split(".").at(-1).toLowerCase();
       const signature=ext==="png"?h.subarray(0,8).toString("hex")==="89504e470d0a1a0a":
         ["jpg","jpeg"].includes(ext)&&h.subarray(0,3).toString("hex")==="ffd8ff";
       if(!signature||original.protocol!=="https:"||!["pse.vn","www.pse.vn"].includes(original.hostname)||
          final.protocol!=="https:"||!["pse.vn","www.pse.vn"].includes(final.hostname)||
          !String(download.headers()["content-type"]||"").toLowerCase().startsWith("image/"))
         throw Error("Disclosure original scanned image signature/MIME/origin proof failed");
     }
     const annualTinyGif=(recoverAnnualGif||item.annual_valid_gif_recovery_attempted===true) && isAnnual(id,item) && /\.gif(?:[?#]|$)/i.test(assetUrl) && buf.length>=35 && buf.length<80;
     if(annualTinyGif){
       const origin=new URL(assetUrl),finalUrl=new URL(download.url());
       const trusted=u=>["pse.vn","www.pse.vn"].includes(u.hostname)&&["https:","http:"].includes(u.protocol);
       if(!trusted(origin)||!trusted(finalUrl)||!["GIF89a","GIF87a"].includes(buf.subarray(0,6).toString("latin1"))||
         !String(download.headers()["content-type"]||"").toLowerCase().startsWith("image/gif"))
         throw Error("Small annual GIF failed origin, MIME or binary proof; preserve source");
       console.log("PSE_ANNUAL_TINY_GIF_VALID=PASS; source_id="+id+"; bytes="+buf.length+"; image_preserved=true");
     }
     if(governanceBigPdf){
       const original=new URL(assetUrl),final=new URL(download.url());
       if(!["pse.vn","www.pse.vn"].includes(original.hostname)||original.protocol!=="https:"||
          !["pse.vn","www.pse.vn"].includes(final.hostname)||final.protocol!=="https:"||
          buf.length!==governancePdfBytes[id]||
          !String(download.headers()["content-type"]||"").toLowerCase().includes("pdf")||
          !buf.subarray(0,8).toString("latin1").startsWith("%PDF-"))
         throw Error("Governance original large PDF origin/size/MIME/signature mismatch "+id);
       console.log("PSE_GOV_PDF_PROOF=PASS; source_id="+id+"; bytes="+buf.length);
     }
     if((buf.length<80&&!annualTinyGif)||buf.length>(governanceBigPdf?42_000_000:((annual2025Pdf||disclosureLargePdf||financeLargePdf)?40_000_000:24_000_000)))
       throw Error("Original media size unsafe; bytes="+buf.length+"; ext="+new URL(assetUrl).pathname.split(".").at(-1));
     const ext=new URL(assetUrl).pathname.split(".").at(-1).toLowerCase();
     if(ext==="pdf" && !buf.subarray(0,8).toString("latin1").startsWith("%PDF-"))
       throw Error("Original PDF signature invalid");
     if(expectedRemote.has(assetUrl)){
      if(verified2025 && buf.length!==proof2025.media[assetUrl])
        throw Error("2025 source photo byte size differs from independent audit "+id);
      // No HTML/placeholder/redirected fake assets are accepted as photos.
      const head=buf.subarray(0,16);
      const validImage=(["jpg","jpeg"].includes(ext)&&head.subarray(0,3).toString("hex")==="ffd8ff")||
       (ext==="png"&&head.subarray(0,8).toString("hex")==="89504e470d0a1a0a")||
       (ext==="gif"&&["GIF89a","GIF87a"].includes(head.subarray(0,6).toString("latin1")))||
       (ext==="webp"&&head.subarray(0,4).toString("latin1")==="RIFF"&&
         head.subarray(8,12).toString("latin1")==="WEBP");
      if(!validImage||!String(download.headers()["content-type"]||"").toLowerCase().startsWith("image/"))
       throw Error("Verified external source image rejected id="+id);
      const finalUrl=new URL(download.url());
      const hosts=verified1363?["petrovietnam.petrotimes.vn"]:
       verified2025?[id==="1641"?"cdn.petrotimes.vn":"www.dpm.vn"]:
       ["giacaphe.com","www.giacaphe.com"];
      if(!["http:","https:"].includes(finalUrl.protocol)||!hosts.includes(finalUrl.hostname))
       throw Error("Verified source asset redirected outside approved host");
     }
     const types={png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",
       gif:"image/gif",pdf:"application/pdf",doc:"application/msword",
       docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
       xls:"application/vnd.ms-excel",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
       ppt:"application/vnd.ms-powerpoint",pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation"};
     if(!types[ext])throw Error("Unsupported media extension "+ext);
     const hash=createHash("sha256").update(assetUrl).digest("hex").slice(0,16);
     const assetSlug="pse-legacy-"+hash;
     const originalName=decodeURIComponent(new URL(assetUrl).pathname.split("/").at(-1)||"");
     if(!originalName.toLowerCase().endsWith("."+ext)||/["\r\n]/.test(originalName))
      throw Error("Unsafe original finance asset filename");
     const match=await api("/wp-json/wp/v2/media?context=edit&slug="+assetSlug+"&per_page=5&_fields=id,slug,source_url");
     if(match.status!==200||!Array.isArray(match.data)||match.data.length>1)
      throw Error("WordPress media lookup invalid");
     let obj=match.data[0];
     if(financeScope){
      // Check exact source filename and previous deterministic source URL media name before writing.
      const existing=await api("/wp-json/wp/v2/media?context=edit&search="+
        encodeURIComponent(originalName.slice(0,35))+"&per_page=100&_fields=id,slug,source_url");
      if(existing.status!==200||!Array.isArray(existing.data))
       throw Error("Existing WordPress finance media filename lookup unavailable");
      const exact=existing.data.filter(m=>{
       try{return decodeURIComponent(new URL(m.source_url,wp).pathname.split("/").at(-1)||"").toLowerCase()===originalName.toLowerCase()}
       catch{return false}
      });
      if(exact.length>1||(obj&&exact.length&&exact[0].id!==obj.id))
       throw Error("Ambiguous or conflicting WordPress finance filename");
      obj=obj||exact[0];
     }
     if(!obj){
      const filename=financeScope?Buffer.from(originalName,"utf8").toString("latin1"):assetSlug+"."+ext;
      const up=await context.request.post(wp+"/wp-json/wp/v2/media",{
       headers:{"X-WP-Nonce":nonce,"Content-Disposition":'attachment; filename="'+filename+'"',"Content-Type":types[ext]},
       // Readback by SHA-256 below protects large original media uploads.
       data:buf,timeout:((disclosureSource && ["1670","1742"].includes(id) && ext==="pdf")||financeLargePdf)?240000:80000
      });
      if(up.status()!==201)throw Error("WordPress media upload HTTP "+up.status()+" source "+id);
      obj=await up.json();
     }
     if(financeScope){
      const uploaded=new URL(String(obj.source_url||""),wp);
      if(uploaded.origin!==wp||!uploaded.pathname.startsWith("/wp-content/uploads/"))
       throw Error("Finance media not stored locally in WordPress");
      const check=await context.request.get(uploaded.href,{timeout:150000});
      if(check.status()!==200||
       createHash("sha256").update(await check.body()).digest("hex")!==
       createHash("sha256").update(buf).digest("hex"))
       throw Error("Finance media source/local binary mismatch");
     }
     if(!obj?.id||!obj.source_url)throw Error("WP Media returned no URL");
     if(verified2025){
      const saved=new URL(obj.source_url,wp);
      if(saved.origin!==wp||!saved.pathname.startsWith("/wp-content/uploads/"))
       throw Error("2025 source media was not uploaded to local WordPress");
      const actual=await context.request.get(saved.href,{timeout:90000});
      if(actual.status()!==200 ||
       createHash("sha256").update(await actual.body()).digest("hex")!==
       createHash("sha256").update(buf).digest("hex"))
       throw Error("2025 source/local uploaded media binary differs "+id);
     }
     state.media[assetUrl]={id:obj.id,url:obj.source_url,sha256:createHash("sha256").update(buf).digest("hex"),
       ...(financeScope?{source_filename:decodeURIComponent(new URL(assetUrl).pathname.split("/").at(-1))}:{})};
     console.log("PSE_LEGACY_MEDIA=PASS; article="+id+"; media_id="+obj.id);
     await persist();
    }
    const stillMissing=article.assets.filter(asset=>!state.media[asset]);
    if(stillMissing.length){
      item.status="media";
      item.attempts=0; // Progress through large galleries is not a failed retry.
      partial++;
      console.log("PSE_LEGACY_BATCH_MEDIA_PARTIAL; source_id="+id+"; remaining="+stillMissing.length);
      await persist();
      continue;
    }
    // Last asset has just uploaded: finish creating/verifying the post NOW,
    // not on a second six-minute Actions run.
    console.log("PSE_LEGACY_MEDIA_READY=PASS; source_id="+id+
      "; assets="+article.assets.length+"; same_batch_finalize=true");
    await persist();
   }
   let html=article.html;
   for(const [originalURL,meta] of Object.entries(state.media)){
    if(html.includes(originalURL))html=html.split(originalURL).join(meta.url);
   }
   if(article.assets.some(x=>html.includes(x)))throw Error("Mandatory media still linked to source");
   // Always stage as a draft first: public publication happens only after
   // WordPress REST readback verifies links, title, category and original date.
   const normalized=String(article.bodyText||"").replace(/\s+/g," ").trim();
   // SEO description for a short document notice uses ONLY its source title
   // and exact visible source text; no invented financial/legal details.
   const seoText=article.chars<100?article.title+". "+normalized:normalized;
   const units=Array.from(seoText);
   const candidate=units.slice(0,158).join("");
   const space=candidate.lastIndexOf(" ");
   const seoDescription=(units.length>158 && space>115?candidate.slice(0,space):candidate).trim();
   if(!financeScope&&(seoDescription.length<35||seoDescription.length>200))
     throw Error("Cannot derive a grounded SEO description from original article body");
   // Financial source has no SEO meta-description; never invent one in Yoast.
   const data=financeScope
     ? {title:article.title,slug,categories:articleCategories,content:html.trim(),
        excerpt:normalized,status:"draft"}
     : {title:article.title,slug,categories:articleCategories,content:html.trim(),
        excerpt:seoDescription,pse_seo_description:seoDescription,status:"draft"};
   if(originalDate)data.date=originalDate;
   const created=await api("/wp-json/wp/v2/posts","POST",data);
   if(created.status!==201||!Number.isSafeInteger(created.data?.id))throw Error("WordPress draft create HTTP "+created.status);
   const postId=created.data.id;
   item.status="draft_verify";item.wp_id=postId;
   await persist();
   const check=await api("/wp-json/wp/v2/posts/"+postId+"?context=edit&_fields=id,slug,status,categories,content,date,title,excerpt,pse_seo_description");
   const raw=String(check.data?.content?.raw||"");
   if(!financeScope&&(check.data?.pse_seo_description!==seoDescription||
     String(check.data?.excerpt?.raw||"").trim()!==seoDescription))
     throw Error("WordPress Yoast SEO description/excerpt readback did not match");
   if(financeScope&&String(check.data?.excerpt?.raw||"").trim()!==normalized)
     throw Error("Finance original excerpt did not survive WP REST readback");
   if(check.status!==200||check.data.slug!==slug||!articleCategories.every(id=>check.data.categories?.includes(id))||
      check.data.status!=="draft"||(!raw.trim()&&!financeSource1137Empty)||
      (financeSource1137Empty&&raw.trim()!=="")||
      (financeSource298External&&!raw.includes(originalMediafire298))||
      !String(check.data.title?.raw||"").trim() ||
      article.assets.some(x=>!raw.includes(state.media[x].url)))
    throw Error("WordPress staged draft did not preserve all source/media links");
   let finalStatus="draft";
   if(originalDate){
     const published=await api("/wp-json/wp/v2/posts/"+postId,"POST",{status:"publish",date:originalDate});
     if(published.status!==200||published.data?.status!=="publish")throw Error("WordPress publication rejected");
     const verify=await api("/wp-json/wp/v2/posts/"+postId+"?context=edit&_fields=id,status,date");
     if(verify.status!==200||verify.data.status!=="publish"||verify.data.date!==originalDate)
       throw Error("Published post REST verification failed");
     finalStatus="publish";
   }
   item.status=originalDate?"imported":"draft_needs_date";
   if(isAnnual(id,item))item.annual_category_verified=true;
   if(brokenImageUrl||recoverAnnualGif||recoverAnnualPdf||recoverGovernancePdf||verifiedScan376||item.annual_valid_gif_recovery_attempted)delete item.reason;
   item.seo_cleaned=true;
   item.attribution_cleaned=true; // New imported posts do not contain a source footer.
   item.verified_date=originalDate||null;
   if(discoveredDate?.day){
    item.date_source="joomla_com_search_created";
    item.date_precision=discoveredDate.precision;
    item.source_created_date=discoveredDate.day;
   }
   if(!originalDate)item.reason="Original source lacks independently verifiable publish timestamp";
   imported++;
   console.log("PSE_LEGACY_POST=PASS; source_id="+id+"; wp_id="+postId+"; status="+finalStatus+"; media="+article.assets.length);
   await persist();
  }catch(e){
   const reason=e instanceof Error?e.message:String(e);
   if(financeScope&&isFinance(id,item)&&/^(Source content incomplete or oversized|Article contains non-local mandatory media)/.test(reason))item.finance_scope_terminal=true;
   item.reason=reason.slice(0,190);
   if(item.wp_id || item.attempts>=3){item.status="quarantined";failed++}
   else {item.status="pending";partial++}
   console.error("PSE_LEGACY_RECORD_ERROR; source_id="+id+"; reason="+item.reason);
   await persist();
  }
 }
}finally{await persist();await browser.close()}
console.log("PSE_MIGRATION_BATCH=PARTIAL; imported="+imported+"; existing="+existing+
 "; waiting_media_or_retry="+partial+"; quarantined="+failed+"; source_total="+Object.keys(state.articles).length+
 "; no_build=true; state_checkpoint_required=true");
