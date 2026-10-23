/** Persist ONLY the PSE migration checkpoint through Github Contents with SHA lease.
 * Called by a single serialized Actions worker. No application source changes.
 */
import {readFile,appendFile} from "node:fs/promises";
const token=process.env.GITHUB_TOKEN,repo=process.env.GITHUB_REPOSITORY;
const file="docs/pse-legacy-migration-state.json";
if(repo!=="ngocnhanvo/psevn-actions"||!token)throw Error("Wrong GitHub context");
const local=JSON.parse(await readFile(file,"utf8"));
if(local.schema!=="pse-legacy-article-migration-v1"||local.tracker_issue!==3)throw Error("Unexpected checkpoint");
const url="https://api.github.com/repos/"+repo+"/contents/"+file;
const headers={Authorization:"Bearer "+token,Accept:"application/vnd.github+json",
 "X-GitHub-Api-Version":"2022-11-28"};
const before=await fetch(url+"?ref=main",{headers});
if(!before.ok)throw Error("Cannot load checkpoint SHA "+before.status);
const remote=await before.json();
const original=JSON.parse(Buffer.from(remote.content.replace(/\s/g,""),"base64").toString("utf8"));
if(original.schema!==local.schema||original.tracker_issue!==local.tracker_issue)throw Error("Checkpoint scope mismatch");
if((original.runs||0)>=(local.runs||0))throw Error("Stale checkpoint would overwrite newer worker progress");
const statuses={};for(const r of Object.values(local.articles))statuses[r.status]=(statuses[r.status]||0)+1;
const content=Buffer.from(JSON.stringify(local,null,2)+"\n").toString("base64");
const update=await fetch(url,{method:"PUT",headers:{...headers,"Content-Type":"application/json"},
 body:JSON.stringify({message:"chore(pse): checkpoint serialized legacy article migration batch",
  branch:"main",sha:remote.sha,content})});
if(!update.ok)throw Error("Checkpoint update rejected HTTP "+update.status+" (not overriding other writer)");
// Distinguish a real content/source/media advance from a no-op run count.
// If a batch fails to make progress, don't start endless nested workflows.
const beforeRecords=Object.keys(original.articles).length;
const afterRecords=Object.keys(local.articles).length;
const articleProgress=Object.entries(local.articles).some(([id,row])=>{
  const previous=original.articles[id];
  return !previous ||
    row.status!==previous.status ||
    Number(row.attempts||0)!==Number(previous.attempts||0) ||
    row.wp_id!==previous.wp_id;
});
const progress=local.seen.length>original.seen.length ||
  afterRecords>beforeRecords ||
  Object.keys(local.media||{}).length>Object.keys(original.media||{}).length ||
  local.queue.length!==original.queue.length ||
  articleProgress;
const pending=local.queue.length>0 || Object.values(local.articles).some(
  row=>(["pending","media"].includes(row.status) && Number(row.attempts||0)<3) ||
    (row.status==="quarantined" && row.reason==="WP slug occupied by unrelated content" &&
      Number(row.attempts||0)<3)
);
const canContinue=progress && pending && local.runs<250;
if(process.env.GITHUB_ENV)
  await appendFile(process.env.GITHUB_ENV,"PSE_IMPORT_AUTO_NEXT="+(canContinue?"yes":"no")+"\n");
console.log("PSE_LEGACY_HANDOFF_GATE="+JSON.stringify({
  progress,pending,next_run:canContinue,
  batch:local.runs,run_budget:250,
  no_progress_stop:!progress,budget_stop:local.runs>=250
}));
console.log("PSE_LEGACY_QUEUE_CHECKPOINT=PASS; discovered="+Object.keys(local.articles).length+
 "; crawl_pending="+local.queue.length+"; states="+JSON.stringify(statuses)+
 "; batch_run="+local.runs+"; finished="+(local.discovered_complete&&
  Object.values(local.articles).every(x=>!["pending","media"].includes(x.status))));
