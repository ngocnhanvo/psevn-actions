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
