/** Scope and lease a single bounded finance recovery attempt AFTER a verified fresh DB backup. */
import {readFile,writeFile} from "node:fs/promises";
const file="docs/pse-legacy-migration-state.json",s=JSON.parse(await readFile(file,"utf8"));
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 s.schema!=="pse-legacy-article-migration-v1"||s.tracker_issue!==3||!s.backup_verified)
 throw Error("Wrong project or no verified rollback base");
const ids=["1738","1666","1650","1480","1148","1137","337","298","199"];
for(const id of ids){
 const r=s.articles[id];
 if(id==="1738"&&!r)continue;
 if(!r||r.group_hint!=="shareholder"||
 !new RegExp("^https://(?:www\\.)?pse\\.vn/quan-he-nha-dau-tu/bao-cao-tai-chinh/"+id+"-[^/]+\\.html$").test(r.source_url||""))
  throw Error("Finance checkpoint source does not match exact original "+id);
}
const prev=Number(s.finance_scope_runs||0),runs=Number(s.runs||0);
if(!Number.isSafeInteger(prev)||prev<0||prev>=5||!Number.isSafeInteger(runs)||runs<0)
 throw Error("Finance recovery attempts/budget invalid");
s.finance_scope_runs=prev+1;
s.runs=runs+1;
await writeFile(file,JSON.stringify(s,null,2)+"\n");
console.log("PSE_FINANCE_PREPARED="+JSON.stringify({scope:"9-source-IDs",run:s.finance_scope_runs,globalCheckpointRun:s.runs,readonly:false,build:false}));
