import { OWNER,ACTIONS,ASTRO,PHASES,labels,parse,select } from './pse-queue-core.mjs';
const TOKEN=process.env.GITHUB_TOKEN, PAT=process.env.SOURCE_REPO_PAT;
if(!TOKEN||process.env.GITHUB_REPOSITORY!==ACTIONS)throw Error('Invalid repository/token');
async function request(path,method='GET',body=null,token=TOKEN){
 const r=await fetch('https://api.github.com'+path,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(!r.ok)throw Error('GitHub '+method+' '+path.split('?')[0]+' HTTP '+r.status);
 return r.status===204?null:r.json()
}
async function all(repo){
 const out=[];
 for(let page=1;page<=10;page++){const a=await request('/repos/'+repo+'/issues?state=all&per_page=100&page='+page,'GET',null,repo===ACTIONS?TOKEN:PAT);out.push(...a.filter(i=>!i.pull_request));if(a.length<100)return out}
 throw Error('More than 1000 issues; refusing unsafe non-idempotent dispatch')
}
async function phases(){
 const seen=new Set((await request('/repos/'+ACTIONS+'/labels?per_page=100')).map(l=>l.name));
 for(const phase of PHASES){const n='pse-queue:'+phase;if(!seen.has(n))await request('/repos/'+ACTIONS+'/labels','POST',{name:n,color:phase==='done'?'0e8a16':'d4c5f9'})}
}
async function update(issue,phase){
 const current=labels(issue),next=[...current].filter(x=>!x.startsWith('pse-queue:'));next.push('pse-queue:'+phase);
 if(current.size===next.length&&next.every(x=>current.has(x)))return;
 await request('/repos/'+ACTIONS+'/issues/'+issue.number,'PATCH',{labels:next})
}
async function comment(issue,msg){
 const p='/repos/'+ACTIONS+'/issues/'+issue.number+'/comments';
 const old=await request(p+'?per_page=100');
 if(!old.some(c=>c.body===msg))await request(p,'POST',{body:msg})
}
async function dispatch(t){
 const q=t.issue;
 if(!PAT){await update(q,'needs-agent');await comment(q,'READY nhưng thiếu SOURCE_REPO_PAT: chưa thể gọi coding agent. Không coi là đã bắt đầu.');return}
 const marker='PSE_QUEUE_ORIGIN='+ACTIONS+'#'+q.number;
 let issue=(await all(ASTRO)).find(x=>x.body?.includes(marker));
 if(!issue)issue=await request('/repos/'+ASTRO+'/issues','POST',{
  title:'[PSE] '+q.title.replace(/^\[PSE-Q\]\s*/,''),
  body:'Task Queue nguồn: '+q.html_url+'\n\n<!-- '+marker+' -->\n\nBắt buộc đọc repo knowledge trước khi thực hiện. Chỉ sửa ngocnhanvo/psevn-astro branch github; không tự build Astro qua Actions. PR phải được kiểm thử; chỉ dùng WordPress/PHP Build Website khi có quyền.\n\n'+q.body.replace(/<!-- PSE_QUEUE_V1 [^\r\n]* -->/,'')
 },PAT);
 if(!(issue.assignees||[]).some(u=>u.login==='copilot-swe-agent[bot]')){
  await request('/repos/'+ASTRO+'/issues/'+issue.number+'/assignees','POST',{
    assignees:['copilot-swe-agent[bot]'],agent_assignment:{target_repo:ASTRO,base_branch:'github',custom_instructions:'Read AGENTS.md and Knowledge. Work only on the requested UI. Do not trigger independent Astro builds.'}
  },PAT)
 }
 await update(q,'dispatched');
 await comment(q,'Đã giao coding agent: '+issue.html_url+'. Chờ PR, kiểm thử, WordPress Build Website (nếu cần), rồi đóng task kèm chứng cứ.');
 console.log('PSE_QUEUE_DISPATCHED '+q.number+' '+issue.html_url)
}
await phases();
const tasks=(await all(ACTIONS)).map(parse).filter(Boolean);
const next=select(tasks);
console.log('PSE_QUEUE_STATE '+next.status);
if(next.status==='dispatch')try{await dispatch(next.task)}catch(err){
 await update(next.task.issue,'needs-agent');
 await comment(next.task.issue,'Coding agent handoff thất bại: '+err.message+'. Không phát hành và không coi task đã chạy.');
 console.log('PSE_QUEUE_NEEDS_AGENT '+err.message)
}else if(next.status==='manual')await update(next.task.issue,'running');
