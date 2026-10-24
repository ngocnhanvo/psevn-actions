/** Schedule next independent publication date batch, without touching import worker. */
const repo=process.env.GITHUB_REPOSITORY,token=process.env.GITHUB_TOKEN;
if(repo!=="ngocnhanvo/psevn-actions"||!token)throw Error("Wrong GitHub repository/token");
const headers={Authorization:"Bearer "+token,Accept:"application/vnd.github+json",
 "X-GitHub-Api-Version":"2022-11-28"};
const read=async file=>{
 const r=await fetch("https://api.github.com/repos/"+repo+"/contents/"+file+"?ref=main",{headers});
 if(!r.ok)throw Error("Cannot read remote checkpoint "+file+" HTTP "+r.status);
 const x=await r.json();
 return JSON.parse(Buffer.from(x.content.replace(/\s/g,""),"base64").toString("utf8"));
};
const [migration,dates]=await Promise.all([
 read("docs/pse-legacy-migration-state.json"),
 read("docs/pse-legacy-date-backfill-state.json")
]);
if(migration.schema!=="pse-legacy-article-migration-v1"||dates.schema!=="pse-legacy-date-backfill-v1")
 throw Error("Date queue checkpoint scope mismatch");
const remain=Object.entries(migration.articles).filter(([id,r])=>{
 if(r.status!=="draft_needs_date"||r.verified_date||!Number.isSafeInteger(Number(r.wp_id))||
  Number(r.wp_id)<=0)return false;
 const p=dates.records[id];
 return !p||p.wp_id!==Number(r.wp_id)||
  (!["published_preserved","source_day_applied","review"].includes(p.status)&&(p.attempts||0)<2);
}).length;
const next=remain>0&&dates.runs<120;
console.log("PSE_DATE_AUTO_NEXT; remaining="+remain+"; date_runs="+dates.runs+
 "; continue="+next+"; import_worker_independent=true");
if(!next)process.exit(0);
const url="https://api.github.com/repos/"+repo+
 "/actions/workflows/pse-legacy-date-backfill.yml/dispatches";
const response=await fetch(url,{method:"POST",headers:{...headers,"Content-Type":"application/json"},
 body:JSON.stringify({ref:"main"})});
if(response.status!==204)throw Error("Standalone date successor dispatch rejected HTTP "+response.status);
console.log("PSE_DATE_AUTO_NEXT=QUEUED; import_queue_not_touched=true; astro_build=false");
