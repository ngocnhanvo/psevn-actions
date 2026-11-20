/** Continue only actionable verified finance source IDs, never launch unrelated migration workflows. */
import {readFile} from "node:fs/promises";
const s=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 s.schema!=="pse-legacy-article-migration-v1"||s.tracker_issue!==3)throw Error("Wrong finance recovery target");
const ids=["1738","1666","1650","1480","1148","1137","337","298","199"];
const remaining=ids.filter(id=>{
 const r=s.articles[id];return !!r&&!r.wp_id&&!r.finance_scope_terminal&&
 ["pending","media","quarantined"].includes(r.status) && Number(r.attempts||0)<3;
});
// Large source-owned PDFs cannot be uploaded via the WordPress REST request
// transport reliably (multiple 240-second timeouts). Do not keep dispatching
// fresh full-article uploads while the scoped server-side sideload is pending.
const mediaNeedsServerSideload=[
 ["1738","https://www.pse.vn/images/20261104-CV-26-83-%C4%90NB-H%C4%90QT-%C4%90%C3%ADnh_ch%C3%ADnh_th%C3%B4ng_tin_%C4%91%C3%A3_c%C3%B4ng_b%E1%BB%91_trong_BCTC_qu%C3%BD_3.2026.pdf"],
 ["1666","https://www.pse.vn/images/20260320-CV-26-16-%C4%90NB-H%C4%90QT-CBTT_BCTC_%C4%91%C3%A3_ki%E1%BB%83m_to%C3%A1n_n%C4%83m_2025.pdf"],
 ["1650","https://www.pse.vn/images/CBTT_BCTC_ban_nien.pdf"],
 ["1480","https://www.pse.vn/images/CBTT_BCTC_ban_nien.pdf"],
].filter(([id,url])=>!s.articles[id]?.wp_id && !s.media[url]?.url).map(([id])=>id);
if(mediaNeedsServerSideload.length){
 console.log("PSE_FINANCE_AUTO_NEXT=DEFER_TO_SERVER_SIDE_MEDIA; ids="+mediaNeedsServerSideload.join(",")+
 "; no_additional_wp_writes=true");
 process.exit(0);
}
const completed=ids.filter(id=>Boolean(s.articles[id]?.wp_id)),blocked=ids.filter(id=>s.articles[id]?.finance_scope_terminal);
const summary={scopeRuns:s.finance_scope_runs||0,publishedOrDraft:completed.length,blocked,remaining,globalRuns:s.runs};
console.log("PSE_FINANCE_RECOVERY_HANDOFF="+JSON.stringify(summary));
if(!remaining.length||s.finance_scope_runs>=5){console.log("PSE_FINANCE_AUTO_NEXT=STOP; no_actionable_records_or_run_budget");process.exit(0)}
const token=process.env.GITHUB_TOKEN;
if(!token)throw Error("GITHUB_TOKEN unavailable for bounded finance continuation");
const u="https://api.github.com/repos/ngocnhanvo/psevn-actions/actions/workflows/pse-finance-recover.yml/dispatches";
const response=await fetch(u,{method:"POST",headers:{
 Authorization:"Bearer "+token,Accept:"application/vnd.github+json",
 "X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"
},body:JSON.stringify({ref:"main"})});
if(response.status!==204)throw Error("Finance recovery next Actions dispatch HTTP "+response.status);
console.log("PSE_FINANCE_AUTO_NEXT=QUEUED; bounded=true; remaining="+remaining.length);
