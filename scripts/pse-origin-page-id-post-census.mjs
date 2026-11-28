/** Read-only PSE WordPress Post origin_page_id census. No CMS writes or build. */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const WP='https://admin-pse.webnvn.com';
if(process.env.GITHUB_REPOSITORY!=='ngocnhanvo/psevn-actions' ||
   !process.env.WP_ADMIN_USERNAME || !process.env.WP_ADMIN_PASSWORD)
  throw Error('PSE_REPO_OR_AUTH_MISSING');

const report={
  schema:'pse-origin-page-id-post-census-v1', site:WP,
  noCmsWrites:true, source:'authenticated-wp-rest-context-edit',
  startedAt:new Date().toISOString(), status:'STARTED', errors:[],
  counts:{}, candidates:[], translations:[], emptySerialized:[],
  coverage:{}, scan:[]
};
const wait=ms=>new Promise(ok=>setTimeout(ok,ms));
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:900},locale:'vi-VN'});
const page=await context.newPage();
const statuses=['any','trash'];
const selectFields='id,type,status,slug,title,date,acf,pse_joomla_source_id,link';
let nonce='';
async function get(route){
  let last;
  for(let i=0;i<3;i++){
    try{
      const res=await context.request.get(WP+route,{
        timeout:85000,failOnStatusCode:false,
        headers:nonce?{'X-WP-Nonce':nonce}:{}
      });
      const data=await res.json().catch(()=>null);
      if([429,500,502,503,504].includes(res.status())&&i<2){
        await wait(1200*(i+1)); continue;
      }
      return {http:res.status(),headers:res.headers(),data};
    }catch(e){
      last=e;
      if(i<2) await wait(1300*(i+1));
    }
  }
  throw last||Error('Request attempts exhausted');
}
const titleOf=p=>String(p?.title?.raw||p?.title?.rendered||'')
  .replace(/<[^>]*>/g,'').trim();
function langOf(p){
  const v=p?.acf?.product_lang;
  if(Array.isArray(v))return String(v[0]?.value??v[0]??'').trim().toLowerCase();
  if(v&&typeof v==='object')return String(v.value||'').trim().toLowerCase();
  return String(v||'').trim().toLowerCase();
}
function extractOrigin(value){
  if(value==null||value===false||value===''||value===0||value==='0'||
    value==='a:0:{}'||(Array.isArray(value)&&value.length===0))
    return {empty:true,ids:[],raw:value??null};
  const items=Array.isArray(value)?value:[value];
  const ids=items.map(x=>{
    if(typeof x==='number')return x;
    if(typeof x==='string'&&/^[1-9]\d*$/.test(x.trim()))return Number(x.trim());
    if(x&&typeof x==='object'){
      const xId=x.ID??x.id??x.value;
      if(typeof xId==='number'||typeof xId==='string'&&/^[1-9]\d*$/.test(xId.trim()))
        return Number(xId);
    }
    return null;
  }).filter(x=>Number.isSafeInteger(x)&&x>0);
  return {empty:false,ids,raw:value};
}
const slim=p=>({
  id:p.id,status:p.status,title:titleOf(p),slug:p.slug,lang:langOf(p),
  date:p.date,sourceId:String(p.pse_joomla_source_id||''),
  url:p.link||WP+'/wp-admin/post.php?post='+p.id+'&action=edit'
});
try{
  const resp=await page.goto(WP+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:85000});
  if(!resp||resp.status()>=500)throw Error('WP_ADMIN_UNAVAILABLE');
  if(await page.locator('#user_login').count()){
    await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
    await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
    const form=await page.locator('#loginform').innerText();
    const match=form.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/)||
      form.match(/(\d+)\s*([+\-x×*])\s*(\d+)/);
    if(match){
      const a=Number(match[1]),b=Number(match[3]);
      const answer=match[2]==='+'?a+b:match[2]==='-'?a-b:a*b;
      const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if(!await input.count())throw Error('LOGIN_MATH_FIELD_MISSING');
      await input.fill(String(answer));
    }
    await page.locator('#wp-submit').click({noWaitAfter:true,timeout:85000});
    await page.waitForFunction(
      ()=>location.pathname.startsWith('/wp-admin/')&&!document.querySelector('#loginform'),
      null,{timeout:85000}
    );
  }
  const admin=await page.goto(WP+'/wp-admin/edit.php?post_type=post',{waitUntil:'domcontentloaded',timeout:85000});
  if(!admin||admin.status()!==200||!await page.locator('#adminmenu').count())
    throw Error('WP_EDITOR_AUTH_NOT_VERIFIED');
  nonce=await page.evaluate(async()=>globalThis.wpApiSettings?.nonce||
    await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(r=>r.text()));
  if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('WP_REST_NONCE_MISSING');

  const posts=[];
  for(const status of statuses){
    let expectedPages=null,expectedCount=null,actual=0;
    for(let index=1;index<=150;index++){
      const query='/wp-json/wp/v2/posts?context=edit&per_page=100&page='+index+
        '&status='+status+'&_fields='+encodeURIComponent(selectFields);
      const r=await get(query);
      if(r.http===400&&status==='trash'&&index===1){
        report.coverage.trash='UNSUPPORTED';
        break;
      }
      if(r.http!==200||!Array.isArray(r.data))
        throw Error('WP_REST_CENSUS_FAILED '+status+' page='+index+' http='+r.http+
          ' message='+String(r.data?.message||'').slice(0,110));
      if(index===1){
        expectedPages=Number(r.headers['x-wp-totalpages']);
        expectedCount=Number(r.headers['x-wp-total']);
        if(expectedCount===0&&expectedPages===0){
          report.coverage[status]={pages:0,expected:0,received:0};
          break;
        }
        if(!Number.isSafeInteger(expectedPages)||expectedPages<1||expectedPages>150)
          throw Error('WP_REST_TOTALPAGES_INVALID '+status);
        if(!Number.isSafeInteger(expectedCount))
          throw Error('WP_REST_TOTAL_INVALID '+status);
      }
      actual+=r.data.length;
      posts.push(...r.data);
      report.scan.push({status,page:index,received:r.data.length,expectedPages});
      if(index===expectedPages)break;
    }
    if(expectedPages!==null){
      if(actual!==expectedCount)throw Error('WP_REST_PAGE_COUNT_MISMATCH '+status+' '+actual+'/'+expectedCount);
      report.coverage[status]={pages:expectedPages,expected:expectedCount,received:actual};
    }
  }
  const uniq=new Map();
  for(const p of posts)uniq.set(p.id,p);
  const all=[...uniq.values()];
  if(all.length===0)throw Error('POST_CENSUS_ZERO');
  const acfWithOrigin=all.filter(p=>p.acf&&Object.prototype.hasOwnProperty.call(p.acf,'origin_page_id')).length;
  const acfWithLang=all.filter(p=>p.acf&&Object.prototype.hasOwnProperty.call(p.acf,'product_lang')).length;
  report.coverage.acfWithOrigin=acfWithOrigin;
  report.coverage.acfWithLang=acfWithLang;
  report.coverage.postIdsUnique=all.length;
  report.coverage.acfWithoutOrigin=all.length-acfWithOrigin;
  const lookup=new Map(all.map(p=>[p.id,p]));
  const candidates=[];
  for(const p of all){
    const info=extractOrigin(p.acf?.origin_page_id);
    report.counts[p.status]=(report.counts[p.status]||0)+1;
    if(p.acf?.origin_page_id===undefined)continue;
    if(info.empty){
      if(Array.isArray(p.acf.origin_page_id))report.counts.emptyAcfArray=(report.counts.emptyAcfArray||0)+1;
      if(p.acf.origin_page_id==='a:0:{}')report.emptySerialized.push(p.id);
      continue;
    }
    candidates.push({post:p,origin:info});
  }
  const parentInfo=new Map();
  for(const x of candidates){
    for(const id of x.origin.ids){
      if(parentInfo.has(id))continue;
      let p=lookup.get(id);
      if(p){parentInfo.set(id,{kind:'post',post:p,fromCensus:true});continue;}
      const response=await get('/wp-json/wp/v2/posts/'+id+'?context=edit&_fields='+encodeURIComponent(selectFields));
      if(response.http===200&&response.data?.id===id){
        parentInfo.set(id,{kind:'post',post:response.data});continue;
      }
      const respPage=await get('/wp-json/wp/v2/pages/'+id+'?context=edit&_fields=id,type,status,title,acf');
      if(respPage.http===200&&respPage.data?.id===id)
        parentInfo.set(id,{kind:'page',post:respPage.data});
      else parentInfo.set(id,{kind:'not_found',post:null,http:response.http,pageHttp:respPage.http});
    }
  }
  for(const x of candidates){
    const p=x.post, ids=x.origin.ids, reasons=[];
    let parent=null;
    if(ids.length!==1)reasons.push(ids.length===0?'ORIGIN_NOT_SINGLE_NUMERIC_ID':'ORIGIN_MULTIPLE_IDS');
    if(ids.length===1){
      const id=ids[0];
      const match=parentInfo.get(id);
      parent=match?.post?{...slim(match.post),type:match.kind}:{
        id,type:match?.kind||'unknown',http:match?.http??null
      };
      if(id===p.id)reasons.push('ORIGIN_POINTS_TO_SELF');
      if(match?.kind==='not_found')reasons.push('ORIGIN_PARENT_NOT_FOUND');
      if(match?.kind==='page')reasons.push('ORIGIN_PARENT_IS_PAGE_NOT_POST');
      if(match?.kind==='post'){
        const pl=langOf(match.post),cl=langOf(p);
        const po=extractOrigin(match.post.acf?.origin_page_id);
        if(pl&&cl&&pl===cl)reasons.push('SAME_LOCALE_AS_PARENT');
        if(!po.empty)reasons.push('PARENT_ALSO_HAS_ORIGIN');
        if(cl==='vi'&&pl&&pl!=='vi')reasons.push('VI_CHILD_OF_NON_VI_ROOT_REVIEW');
      }
    }
    const row={...slim(p),originValue:x.origin.raw,originIds:ids,parent,
      reasons,classification:reasons.length?'REVIEW_ORIGINAL_OR_BROKEN_TRANSLATION':'VALID_TRANSLATION_CANDIDATE'};
    if(reasons.length)report.candidates.push(row);
    else report.translations.push(row);
  }
  report.summary={
    allPosts:all.length, withNonemptyOrigin:candidates.length,
    normalTranslations:report.translations.length,
    suspectRecords:report.candidates.length,
    emptyOrigins:all.length-candidates.length,
    acfWithOrigin,acfWithoutOrigin:all.length-acfWithOrigin
  };
  // The above object key is validated by node --check in workflow.
  report.status=acfWithOrigin===all.length?'COMPLETE':'PARTIAL_ACF_FIELD_COVERAGE';
  console.log('PSE_ORIGIN_PAGE_ID_CENSUS='+JSON.stringify({status:report.status,
    coverage:report.coverage,counts:report.counts,summary:report.summary}));
  for(const row of report.candidates)
    console.log('PSE_ORIGIN_PAGE_ID_SUSPECT='+JSON.stringify(row));
}catch(err){
  report.status='FAILED';
  report.errors.push(String(err?.stack||err).slice(0,1600));
  console.error('PSE_ORIGIN_PAGE_ID_AUDIT_FAILED='+String(err?.message||err).slice(0,500));
  process.exitCode=1;
}finally{
  report.finishedAt=new Date().toISOString();
  await mkdir('artifacts',{recursive:true});
  await writeFile('artifacts/pse-origin-page-id-post-census.json',JSON.stringify(report,null,2)+'\n');
  await context.close();
  await browser.close();
}
