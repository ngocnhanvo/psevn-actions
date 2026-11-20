/**
 * Independent WordPress public REST vs exact Joomla migration source identity.
 * READ ONLY. Separate legacy importer status from actual WordPress publication.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const state=JSON.parse(await readFile('docs/pse-legacy-migration-state.json','utf8'));
const dateState=JSON.parse(await readFile('docs/pse-legacy-date-backfill-state.json','utf8'));
if(state.schema!=='pse-legacy-article-migration-v1'||dateState.schema!=='pse-legacy-date-backfill-v1'||
  state.tracker_issue!==3||state.backup_verified!==true||
  process.env.GITHUB_REPOSITORY!=='ngocnhanvo/psevn-actions')throw Error('Wrong project/manifest');
const originLine=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,'' )).filter(x=>x.startsWith('WC_URL='));
if(originLine.length!==1)throw Error('Missing unique WordPress origin');
const v=new URL(originLine[0].slice(7).trim().replace(/^['"]|['"]$/g,''));
if(v.protocol!=='https:'||v.username||v.password||v.search||v.hash||v.port||!['','/'].includes(v.pathname))throw Error('Unexpected WordPress origin');
const wp=v.origin,catId=1746,parentId=1742;
async function get(path){
 let error=null;
 for(let retry=0;retry<2;retry++){
  try{
   const response=await fetch(wp+path,{headers:{Accept:'application/json','Cache-Control':'no-cache'},signal:AbortSignal.timeout(35000)});
   const json=await response.json().catch(()=>null);
   if(response.status===200)return {status:response.status,body:json,total:Number(response.headers.get('x-wp-total')||0),pages:Number(response.headers.get('x-wp-totalpages')||0)};
   error='HTTP '+response.status+' path='+path;
   if(response.status<500)break;
  }catch(e){error=String(e?.message||e)}
 }
 throw Error('WP REST read failed '+error);
}
const root='artifacts/pse-tin-tong-hop-live-manifest';
await mkdir(root,{recursive:true});
const report={schema:'pse-tin-tong-hop-live-manifest-v1',readonly:true,root:wp,legacy:{},wordpress:{},missing:[],extras:[],draftDateEvidence:[],status:'STARTED'};
try{
 const source=Object.entries(state.articles).filter(([id,row])=>
  /^https:\/\/(?:www\.)?pse\.vn\/tin-tuc-su-kien\/tin-cong-ty\/tin-tong-hop\/\d+-[a-z0-9-]+\.html$/i.test(row.source_url||''))
  .map(([id,row])=>({id,sourceUrl:row.source_url,status:row.status,wpId:row.wp_id||null,
   dateRecord:dateState.records?.[id]||null}));
 if(source.length<300||source.length>400)throw Error('Unexpected source count '+source.length);
 const category=await get('/wp-json/wp/v2/categories?slug=tin-tong-hop&hide_empty=false&_fields=id,parent,slug,count');
 if(category.body?.length!==1||category.body[0].id!==catId||category.body[0].parent!==parentId)throw Error('Category taxonomy drift');
 const first=await get('/wp-json/wp/v2/posts?categories=1746&per_page=100&page=1&status=publish&_fields=id,slug,date,status,categories');
 const posts=[...first.body];
 for(let n=2;n<=first.pages;n++){
  const next=await get('/wp-json/wp/v2/posts?categories=1746&per_page=100&page='+n+'&status=publish&_fields=id,slug,date,status,categories');
  if(!Array.isArray(next.body))throw Error('WP API page not an array');
  posts.push(...next.body);
 }
 if(posts.length!==first.total||posts.length!==category.body[0].count)throw Error('Public WP posts incomplete');
 const sourceMap=new Map(source.filter(x=>x.wpId).map(x=>[Number(x.wpId),x]));
 const liveMap=new Map(posts.map(x=>[x.id,x]));
 if(sourceMap.size!==source.filter(x=>x.wpId).length)throw Error('Duplicate WP mapped ID in source checkpoint');
 report.missing=source.filter(x=>x.wpId&&!liveMap.has(Number(x.wpId))).map(x=>({id:x.id,wpId:x.wpId,importStatus:x.status,
  dateStatus:x.dateRecord?.status||null,dateReason:x.dateRecord?.reason||null,sourceUrl:x.sourceUrl}));
 report.extras=posts.filter(p=>!sourceMap.has(p.id)).map(p=>({id:p.id,slug:p.slug,date:p.date,categories:p.categories}));
 report.draftDateEvidence=source.filter(x=>x.status==='draft_needs_date').map(x=>({
  id:x.id,wpId:x.wpId,dateCheckpointStatus:x.dateRecord?.status||null,
  verifiedSourceDay:x.dateRecord?.source_created_day||null,livePublished:liveMap.has(Number(x.wpId))
 }));
 report.legacy={count:source.length,withWordPressId:sourceMap.size,
  withoutWordPressId:source.filter(x=>!x.wpId).map(x=>({id:x.id,status:x.status,sourceUrl:x.sourceUrl})),
  importerStates:Object.fromEntries([...new Set(source.map(x=>x.status))].map(status=>[status,source.filter(x=>x.status===status).length]))};
 report.wordpress={categoryId:catId,count:posts.length,headlines:posts.slice(0,10).map(p=>({id:p.id,slug:p.slug,date:p.date})),
  posts:posts.map(p=>({id:p.id,slug:p.slug,date:p.date})),actualCount:first.total};
 report.status='PASS_INVENTORY_WITH_UNRESOLVED';
 console.log('PSE_TIN_TONG_HOP_LIVE_MANIFEST='+JSON.stringify({
  status:report.status,sourceRecords:report.legacy.count,mapped:sourceMap.size,
  noWP:report.legacy.withoutWordPressId.length,livePublished:posts.length,
  missingFromPublishedCategory:report.missing,extraPublished:report.extras,
  draftLabelRecords:report.draftDateEvidence.length,
  draftLabelActuallyPublished:report.draftDateEvidence.filter(x=>x.livePublished).length,
  draftLabelStillUnpublished:report.draftDateEvidence.filter(x=>!x.livePublished)}));
}catch(e){report.status='FAILED';report.error=String(e?.message||e);console.error('PSE_TIN_TONG_HOP_LIVE_MANIFEST_ERROR='+report.error);throw e}
finally{await writeFile(root+'/report.json',JSON.stringify(report,null,2)+'\n');}
