import test from 'node:test';import assert from 'node:assert/strict';import {parse,complete,select} from './pse-queue-core.mjs';
function mk(n,override={},phase='waiting',state='open'){
 const config={version:1,mode:'copilot',depends_on:[],priority:50,target_repo:'ngocnhanvo/psevn-astro',base_branch:'github',...override};
 return {number:n,title:'[PSE-Q] test',body:'<!-- PSE_QUEUE_V1 '+JSON.stringify(config)+' -->',user:{login:'ngocnhanvo'},state,labels:[{name:'pse-queue:'+phase}]}
}
const evidence={qa_run:'https://github.com/ngocnhanvo/psevn-actions/actions/runs/123',commit:'a'.repeat(40),build:'verified-wordpress-build'};
test('dependency unlocks successor only with proof',()=>{
 const news=parse(mk(1,{mode:'manual',target_repo:'ngocnhanvo/psevn-actions',base_branch:'main',evidence},'done','closed'));
 const slider=parse(mk(2,{depends_on:[1]}));
 assert.equal(complete(news),true);assert.equal(select([news,slider]).task.issue.number,2)
});
test('active predecessor blocks parallel execution',()=>{
 const news=parse(mk(1,{mode:'manual',target_repo:'ngocnhanvo/psevn-actions',base_branch:'main'},'running'));
 assert.equal(select([news,parse(mk(2,{depends_on:[1]}))]).status,'busy')
});
test('closed without proof never unlocks',()=>{
 const news=parse(mk(1,{mode:'manual',target_repo:'ngocnhanvo/psevn-actions',base_branch:'main'},'done','closed'));
 assert.equal(complete(news),false);assert.equal(select([news,parse(mk(2,{depends_on:[1]}))]).status,'waiting')
});
test('unknown dependency and invalid task fail closed',()=>{
 assert.equal(select([parse(mk(2,{depends_on:[99]}))]).status,'waiting');
 assert.equal(parse(mk(3,{depends_on:[3]})),null);
 const outsider=mk(4);outsider.user.login='outside';assert.equal(parse(outsider),null);
 assert.equal(parse(mk(5,{target_repo:'wrong/repo'})),null)
});
test('sequential one-dispatch lock',()=>{
 const a=parse(mk(4,{},'dispatched')),b=parse(mk(5));
 assert.equal(select([a,b]).status,'busy')
})