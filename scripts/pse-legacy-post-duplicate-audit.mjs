/** PSE WordPress content-duplicate audit. READ ONLY, no database edits, no build.
 * Compare all WP posts (all statuses) and independently inspect Joomla->WP checkpoint aliases.
 */
import {chromium} from "playwright";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified||
   process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong source checkpoint or repository");
const setting=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,"")).filter(s=>s.startsWith("WC_URL="));
if(setting.length!==1)throw Error("Missing exact WP site configuration");
const wp=new URL(setting[0].slice(7).replace(/^['"]|['"]$/g,""));
if(wp.protocol!=="https:"||wp.username||wp.password||wp.search||wp.hash||
 !["","/"].includes(wp.pathname))throw Error("Unexpected WP origin");
if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)
 throw Error("Missing WP browser credentials");
const sources=new Map();
for(const [joomlaId,r] of Object.entries(state.articles)){
 if(!Number.isSafeInteger(Number(r.wp_id))||Number(r.wp_id)<=0)continue;
 const wpId=Number(r.wp_id);
 if(!sources.has(wpId))sources.set(wpId,[]);
 sources.get(wpId).push({joomlaId,sourceUrl:r.source_url,status:r.status});
}
const report={schema:"pse-wordpress-duplicate-audit-v1",readonly:true,
 checkpointEntries:Object.keys(state.articles).length,checkpointWpLinks:0,checkpointUniqueWpIds:sources.size,
 wordpress:{}, exactContentGroups:[], exactTitleGroups:[], normalizedSlugGroups:[],
 canonicalSourceAliases:[], missingMappedWordPress:[], ambiguousTitleGroups:[], errors:[]};
report.checkpointWpLinks=[...sources.values()].reduce((n,v)=>n+v.length,0);
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const hash=v=>createHash("sha256").update(v).digest("hex").slice(0,16);
const normalize=v=>String(v||"").normalize("NFKC").replace(/<[^>]*>/g," ").replace(/&(?:nbsp|amp|quot|lt|gt);/gi," ").replace(/[\u00a0\s]+/g," ").trim().toLocaleLowerCase("vi");
const buckets=(posts,key,minLength=0)=>{
 const map=new Map;
 for(const p of posts){
  const v=key(p);
  if(!v||String(v).length<minLength)continue;
  if(!map.has(v))map.set(v,[]);
  map.get(v).push(p);
 }
 return [...map.entries()].filter(([,members])=>new Set(members.map(p=>p.id)).size>1)
  .map(([value,members])=>({key:String(value).slice(0,100),posts:members.map(p=>({
   id:p.id,slug:p.slug,status:p.status,categories:p.categories,
   date:p.date,title:p.title,sourceIds:(sources.get(p.id)||[]).map(v=>v.joomlaId)
  }))})).sort((a,b)=>b.posts.length-a.posts.length);
};
try{
 await page.goto(wp.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const t=await page.locator("body").innerText();
  const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||
    t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error("WordPress arithmetic login input missing");
   await f.fill(String(n));
  }
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WordPress authentication failed");
 await page.goto(wp.origin+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("REST nonce not available");
  return(await r.text()).trim();
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("Bad WP REST nonce");
 const api=(path)=>page.evaluate(async({path,nonce})=>{
  const r=await fetch(path,{credentials:"same-origin",headers:{"Accept":"application/json","X-WP-Nonce":nonce}});
  const body=await r.json().catch(()=>null);
  return{status:r.status,total:r.headers.get("X-WP-Total"),pages:r.headers.get("X-WP-TotalPages"),data:body};
 },{path,nonce});
 const query="/wp-json/wp/v2/posts?context=edit&status=any&per_page=100&page=";
 const first=await api(query+"1&_fields=id,slug,title,content,status,categories,date");
 if(first.status!==200||!Array.isArray(first.data)||!Number.isInteger(Number(first.pages)))
   throw Error("Unable to read complete WordPress status=any posts: HTTP "+first.status);
 const pages=Number(first.pages);
 if(pages<1||pages>100)throw Error("Unexpected WordPress post page count "+pages);
 const all=[...first.data];
 for(let pg=2;pg<=pages;pg++){
  const response=await api(query+pg+"&_fields=id,slug,title,content,status,categories,date");
  if(response.status!==200||!Array.isArray(response.data))
   throw Error("WordPress posts pagination "+pg+" HTTP "+response.status);
  all.push(...response.data);
  if(pg%5===0)console.log("PSE_DUPLICATE_AUDIT_PROGRESS; pages="+pg+"/"+pages+"; rows="+all.length);
 }
 if(all.length!==Number(first.total))throw Error("WordPress posts changed during audit: count mismatch "+all.length+" != "+first.total);
 const posts=all.map(p=>{
  const body=String(p.content?.raw||p.content?.rendered||"");
  const clean=normalize(body);
  return {id:p.id,slug:String(p.slug||""),title:normalize(p.title?.raw||p.title?.rendered),
    status:p.status,categories:p.categories||[],date:p.date,
    length:clean.length,contentHash:clean.length>=100?hash(clean):null};
 });
 const allIds=new Set(posts.map(p=>p.id));
 report.wordpress={total:posts.length,pages,byStatus:posts.reduce((a,p)=>(a[p.status]=(a[p.status]||0)+1,a),{}),
  sourceLinkedPosts:[...sources.keys()].filter(id=>allIds.has(id)).length};
 report.missingMappedWordPress=[...sources.entries()].filter(([id])=>!allIds.has(id)).map(([id,arr])=>({id,sourceIds:arr.map(x=>x.joomlaId)}));
 report.exactContentGroups=buckets(posts,p=>p.contentHash).filter(group=>group.posts.length>=2);
 report.exactTitleGroups=buckets(posts,p=>p.title);
 report.normalizedSlugGroups=buckets(posts,p=>p.slug);
 report.canonicalSourceAliases=[...sources.entries()].filter(([,arr])=>arr.length>1)
  .map(([wpId,arr])=>({wpId,wpTitle:posts.find(p=>p.id===wpId)?.title||null,
    sources:arr,slugMatch:arr.every(a=>new URL(a.sourceUrl).pathname.replace(/^.*?\/\d+-/,"")===
      new URL(arr[0].sourceUrl).pathname.replace(/^.*?\/\d+-/,""))}));
 report.ambiguousTitleGroups=report.exactTitleGroups.filter(group=>{
  const set=new Set(group.posts.map(p=>p.contentHash).filter(Boolean));
  return set.size>=2;
 });
 console.log("PSE_WORDPRESS_DUPLICATE_AUDIT="+JSON.stringify({
   inspected:report.wordpress.total,pages:report.wordpress.pages,
   sourceRecords:report.checkpointEntries,sourceWpLinks:report.checkpointWpLinks,
   uniqueLinkedWp:report.checkpointUniqueWpIds,
   exactContentDuplicateGroups:report.exactContentGroups.length,
   exactTitleRepeatedGroups:report.exactTitleGroups.length,
   ambiguousSameTitleDifferentContentGroups:report.ambiguousTitleGroups.length,
   slugDuplicateGroups:report.normalizedSlugGroups.length,
   aliasesFromDifferentJoomlaIds:report.canonicalSourceAliases.length,
   aliasesWithDifferentSlugs:report.canonicalSourceAliases.filter(x=>!x.slugMatch).length,
   missingMappedWordPress:report.missingMappedWordPress.length,readonly:true}));
 for(const group of report.exactContentGroups)
  console.log("PSE_DUPLICATE_EXACT_CONTENT="+JSON.stringify({hash:group.key,posts:group.posts}));
 for(const group of report.exactTitleGroups)
  console.log("PSE_DUPLICATE_MATCHING_TITLE="+JSON.stringify({title:group.key,posts:group.posts}));
 for(const group of report.canonicalSourceAliases)
  console.log("PSE_DUPLICATE_JOOMLA_ALIAS="+JSON.stringify({wpId:group.wpId,sourceIds:group.sources.map(s=>s.joomlaId),
   wpTitle:group.wpTitle,slugMatch:group.slugMatch}));
 console.log("PSE_WORDPRESS_DUPLICATE_AUDIT=READ_ONLY_PASS; manual_review_for_suspicious_groups=true");
}catch(e){
 report.errors.push(String(e?.message||e).slice(0,260));
 console.error("PSE_WORDPRESS_DUPLICATE_AUDIT=FAIL; "+report.errors[0]);
 throw e;
}finally{
 await mkdir("docs/reports",{recursive:true});
 await writeFile("docs/reports/pse-wordpress-duplicate-audit.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
