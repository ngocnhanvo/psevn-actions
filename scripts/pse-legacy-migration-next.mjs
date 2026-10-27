/** Hand off exactly one successor job via GitHub workflow_dispatch.
 * Supported exception to the GITHUB_TOKEN recursion guard; this is an
 * import-only workflow, NEVER a WordPress/Astro website build.
 * Concurrency serializes workers, checkpoint SHA lease prevents stale writers.
 */
import {readFile} from "node:fs/promises";
const repo=process.env.GITHUB_REPOSITORY,token=process.env.GITHUB_TOKEN;
if(repo!=="ngocnhanvo/psevn-actions"||!token)throw Error("Incorrect authorized repository");
if(process.env.PSE_IMPORT_AUTO_NEXT!=="yes")throw Error("Handoff gate not approved");
const data=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(data.schema!=="pse-legacy-article-migration-v1"||data.tracker_issue!==3 ||
  !Number.isSafeInteger(data.runs) || data.runs>=250)throw Error("Invalid migration state or budget");
const annualOutstanding=Object.entries(data.articles).some(([id,row])=>{
 const annual=new Set(["998","999","1000","1041","1042","1043","1092","1188","1259","1307","1353","1386","1412","1511","1546","1578","1625","1667"]);
 if(!annual.has(id)||row.group_hint!=="shareholder"||!new RegExp("^https://(?:www\\.)?pse\\.vn/quan-he-nha-dau-tu/bao-cao-thuong-nien/"+id+"-[^/]+\\.html$","i").test(row.source_url||""))return false;
 return (row.wp_id&&["imported","existing","draft_needs_date"].includes(row.status)&&!row.annual_category_verified)||
  (["1042","1043","1188","1259"].includes(id)&&row.status==="quarantined"&&row.reason==="Original media size unsafe; bytes=49; ext=gif"&&!row.annual_gif_recovery_attempted&&!row.wp_id)||
  (id==="1667"&&["quarantined","pending"].includes(row.status)&&row.reason==="Original media size unsafe; bytes=33341195; ext=pdf"&&!row.annual_pdf_regex_retry_attempted&&!row.wp_id)||
  (["1042","1043","1188","1259"].includes(id)&&row.status==="quarantined"&&row.reason==="Annual source GIF not proven corrupt; preserve image"&&!row.annual_valid_gif_recovery_attempted&&!row.wp_id);
});
const pending=annualOutstanding || data.queue.length>0 || Object.values(data.articles).some(row=>
  (["pending","media"].includes(row.status)&&Number(row.attempts||0)<3) ||
  (row.status==="quarantined" && row.reason==="Source content incomplete or oversized" && !row.short_content_rechecked) ||
  (row.status==="quarantined" && row.reason==="WP slug occupied by unrelated content" &&
    Number(row.attempts||0)<3) ||
  (row.wp_id && ["imported","draft_needs_date","existing"].includes(row.status) &&
    !row.seo_cleaned && (Number(row.seo_attempts||0)<3 || row.seo_error==="Post has no exact migration provenance marker")) ||
  (row.wp_id && ["imported","draft_needs_date","existing"].includes(row.status) &&
    !row.attribution_cleaned && Number(row.attribution_attempts||0)<3));
if(!pending){console.log("PSE_LEGACY_AUTO_NEXT=COMPLETE; no_dispatch=true");process.exit(0)}
const url="https://api.github.com/repos/"+repo+
  "/actions/workflows/pse-legacy-article-import-queue.yml/dispatches";
const response=await fetch(url,{method:"POST",headers:{
  Authorization:"Bearer "+token,"Accept":"application/vnd.github+json",
  "X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"
},body:JSON.stringify({ref:"main"})});
if(response.status!==204)throw Error("Migration successor dispatch failed HTTP "+response.status);
console.log("PSE_LEGACY_AUTO_NEXT=QUEUED; batch="+data.runs+
  "; remaining="+Object.values(data.articles).filter(x=>x.status==="pending"||x.status==="media").length+
  "; concurrency=single_writer; astro_build=false");
