export const OWNER='ngocnhanvo', ACTIONS='ngocnhanvo/psevn-actions', ASTRO='ngocnhanvo/psevn-astro';
export const PHASES=['waiting','running','dispatched','needs-agent','done'];
export function labels(i){return new Set((i.labels||[]).map(x=>typeof x==='string'?x:x.name))}
export function parse(i){
 if(i.user?.login!==OWNER||!i.title?.startsWith('[PSE-Q]')||i.pull_request)return null;
 const match=i.body?.match(/<!-- PSE_QUEUE_V1 (\{[^\r\n]*\}) -->/);if(!match)return null;
 let m;try{m=JSON.parse(match[1])}catch{return null}
 if(m.version!==1||!['manual','copilot'].includes(m.mode)||!Array.isArray(m.depends_on)||!m.depends_on.every(n=>Number.isSafeInteger(n)&&n>0)||m.depends_on.includes(i.number)||new Set(m.depends_on).size!==m.depends_on.length||!Number.isSafeInteger(m.priority)||m.priority<0||m.priority>100)return null;
 if(m.mode==='copilot'&&(m.target_repo!==ASTRO||m.base_branch!=='github'))return null;
 if(m.mode==='manual'&&(m.target_repo!==ACTIONS||m.base_branch!=='main'))return null;
 return {...m,issue:i}
}
export function complete(t){
 return t.issue.state==='closed'&&labels(t.issue).has('pse-queue:done')&&
 /^https:\/\/github\.com\/ngocnhanvo\/[a-z0-9-]+\/actions\/runs\/\d+$/.test(t.evidence?.qa_run||'')&&
 /^[a-f0-9]{40}$/.test(t.evidence?.commit||'')&&
 ['not-required','verified-wordpress-build'].includes(t.evidence?.build)
}
export function select(tasks){
 const byId=new Map(tasks.map(t=>[t.issue.number,t]));
 const active=tasks.filter(t=>t.issue.state==='open'&&(['running','dispatched'].some(p=>labels(t.issue).has('pse-queue:'+p))));
 if(active.length)return {status:'busy',active:active.map(t=>t.issue.number)};
 const pending=tasks.filter(t=>t.issue.state==='open').sort((a,b)=>a.priority-b.priority||a.issue.number-b.issue.number);
 for(const task of pending)if(task.depends_on.every(id=>byId.has(id)&&complete(byId.get(id))))return {status:task.mode==='manual'?'manual':'dispatch',task};
 return {status:'waiting',blocked:pending.map(t=>t.issue.number)}
}