/** Repair category membership using the exact Joomla URL in the verified migration checkpoint.
 * Additive only: never remove existing categories or publish drafts. */
import {chromium} from "playwright";
import {readFile,writeFile,mkdir} from "node:fs/promises";

const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(state.schema!=="pse-legacy-article-migration-v1"||state.tracker_issue!==3||
   state.backup_verified!==true)throw Error("PSE migration backup/provenance not verified");
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")
 throw Error("Wrong GitHub repository");
const setting=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""))
 .filter(x=>x.startsWith("WC_URL="));
if(setting.length!==1)throw Error("Missing unique PSE WP URL");
const u=new URL(setting[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||
 !["","/"].includes(u.pathname))throw Error("Unexpected WP URL configuration");
if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)
 throw Error("Missing WP Admin credentials");
const selected=Object.entries(state.articles).flatMap(([sourceId,r])=>{
 if(!["imported","existing","draft_needs_date"].includes(r.status)||
   !Number.isSafeInteger(Number(r.wp_id))||Number(r.wp_id)<=0)return [];
 let s;try{s=new URL(r.source_url)}catch{return []}
 if(s.protocol!=="https:"||!["pse.vn","www.pse.vn"].includes(s.hostname))return [];
 const m=/^\/tin-tuc-su-kien\/tin-cong-ty\/tin-tong-hop\/(\d+)-([a-z0-9-]+)\.html$/i.exec(s.pathname);
 if(!m||String(Number(m[1]))!==sourceId)return [];
 return [{sourceId,wpId:Number(r.wp_id),slug:m[2].toLowerCase()}];
}).sort((a,b)=>Number(a.sourceId)-Number(b.sourceId));
if(selected.length<4||selected.length>400||
 new Set(selected.map(r=>r.wpId)).size!==selected.length)
 throw Error("Source manifest count or unique post ID verification failed "+selected.length);
const report={schema:"pse-tin-tong-hop-repair-v1",sourceVerified:selected.length,
  changed:[],already:[],skipped:[],errors:[],backupVerified:true,astroBuild:false};
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
try{
 await page.goto(u.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const text=await page.locator("body").innerText();
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||
    text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const target=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await target.count())throw Error("Arithmetic login input missing");
   await target.fill(String(n));
  }
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WP login rejected");
 await page.goto(u.origin+"/wp-admin/post.php?post=248&action=edit",
 {waitUntil:"domcontentloaded",timeout:60000});
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("REST nonce unavailable");
  return(await r.text()).trim();
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("Invalid WP REST nonce");
 const api=(path,method="GET",data)=>page.evaluate(async({path,method,data,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{
   Accept:"application/json","X-WP-Nonce":nonce,
   ...(data?{"Content-Type":"application/json"}:{})},
   ...(data?{body:JSON.stringify(data)}:{})});
  return{http:r.status,total:r.headers.get("X-WP-Total"),
    data:await r.json().catch(()=>null)};
 },{path,method,data,nonce});
 const child=await api("/wp-json/wp/v2/categories?slug=tin-tong-hop&_fields=id,slug,parent,count");
 const parent=await api("/wp-json/wp/v2/categories?slug=tin-cong-ty&_fields=id,slug");
 if(child.http!==200||child.data?.length!==1||
   child.data[0].id!==1746||child.data[0].parent!==1742||
   parent.http!==200||parent.data?.length!==1||parent.data[0].id!==1742)
  throw Error("PSE WordPress category IDs/parent changed; no write allowed");
 report.countBefore=Number(child.data[0].count);
 const started=Date.now();
 for(const record of selected){
  if(Date.now()-started>17*60*1000)throw Error("Time budget reached; safe to rerun");
  const prior=await api("/wp-json/wp/v2/posts/"+record.wpId+
    "?context=edit&_fields=id,slug,status,categories");
  if(prior.http!==200||prior.data?.id!==record.wpId){
   report.skipped.push({sourceId:record.sourceId,wpId:record.wpId,reason:"post_inaccessible"});continue;
  }
  if(prior.data.slug!==record.slug||!prior.data.categories?.includes(1742)||
    !["publish","draft"].includes(prior.data.status)){
   report.skipped.push({sourceId:record.sourceId,wpId:record.wpId,reason:"slug_category_or_status_mismatch",
    status:prior.data.status});continue;
  }
  if(prior.data.categories.includes(1746)){
   report.already.push({sourceId:record.sourceId,wpId:record.wpId,status:prior.data.status});continue;
  }
  const beforeCategories=[...prior.data.categories];
  const write=await api("/wp-json/wp/v2/posts/"+record.wpId,"POST",
    {categories:[...new Set([...beforeCategories,1746])]});
  if(write.http!==200||write.data?.id!==record.wpId)
   throw Error("Failed WP category assignment source "+record.sourceId+" HTTP "+write.http);
  const after=await api("/wp-json/wp/v2/posts/"+record.wpId+
    "?context=edit&_fields=id,slug,status,categories");
  if(after.http!==200||after.data?.slug!==record.slug||
    after.data.status!==prior.data.status||
    !after.data.categories?.includes(1746)||
    !beforeCategories.every(c=>after.data.categories?.includes(c)))
    throw Error("Category readback mismatch source "+record.sourceId);
  report.changed.push({sourceId:record.sourceId,wpId:record.wpId,status:prior.data.status,
   beforeCategories,afterCategories:after.data.categories});
  if(report.changed.length%25===0)
   console.log("PSE_TIN_TONG_HOP_REPAIR_PROGRESS; changed="+report.changed.length+
    "; total="+selected.length);
 }
 const check=await api("/wp-json/wp/v2/posts?status=publish&categories=1746&per_page=1&_fields=id");
 if(check.http!==200||!Number.isSafeInteger(Number(check.total)))
  throw Error("Final published category count readback failed");
 report.countAfter=Number(check.total);
 console.log("PSE_TIN_TONG_HOP_REPAIR="+JSON.stringify({
  sourceVerified:report.sourceVerified,changed:report.changed.length,
  already:report.already.length,skipped:report.skipped.length,
  before:report.countBefore,after:report.countAfter,
  noAstroBuild:true}));
 if(report.changed.some(x=>x.status==="publish")&&report.countAfter<=report.countBefore)
  throw Error("Category total failed to increase");
 console.log("PSE_TIN_TONG_HOP_REPAIR=PASS");
}catch(e){
 report.errors.push(String(e?.message||e).slice(0,260));
 console.error("PSE_TIN_TONG_HOP_REPAIR=FAIL; "+report.errors[0]);
 throw e;
}finally{
 await mkdir("docs/reports",{recursive:true});
 await writeFile("docs/reports/pse-tin-tong-hop-category-rollback.json",
  JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
