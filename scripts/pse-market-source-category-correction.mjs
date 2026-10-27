/** Precise source-verified market-category correction. Preserves original posts;
 * never deletes records or changes status/dates/content. Stores rollback evidence.
 */
import {chromium} from "playwright";
import {readFile,writeFile,mkdir} from "node:fs/promises";
const checkpoint=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 checkpoint.schema!=="pse-legacy-article-migration-v1"||
 checkpoint.tracker_issue!==3||checkpoint.backup_verified!==true)
 throw Error("Unverified repo or data rollback checkpoint");
const ids=["115","122","152","167","185","361","1060","1278","1539"];
const selected=ids.map(id=>{
 const item=checkpoint.articles[id];
 if(!item||!item.wp_id||!["imported","existing","draft_needs_date"].includes(item.status))throw Error("Manifest source id missing "+id);
 const u=new URL(item.source_url);
 if(u.protocol!=="https:"||!["pse.vn","www.pse.vn"].includes(u.hostname))throw Error("Unsafe source");
 const slug=u.pathname.match(/\/\d+-([^/]+)\.html$/)?.[1];
 if(!slug)throw Error("Source slug missing "+id);
 const kind=u.pathname.startsWith("/hoat-dong-kinh-doanh/kien-thuc-nong-nghiep/")?"knowledge":
  u.pathname.startsWith("/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/")?"company-general":
  u.pathname.startsWith("/21-tin-tuc-su-kien/tin-cong-ty/")?"company-legacy":null;
 if(!kind)throw Error("Unexpected category provenance "+id);
 return{id,wp:Number(item.wp_id),slug,kind};
});
if(new Set(selected.map(x=>x.wp)).size!==9)throw Error("Duplicate WordPress target");
const creds=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,"")).filter(s=>s.startsWith("WC_URL="));
if(creds.length!==1)throw Error("Expected WC_URL");
const u=new URL(creds[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||
 !["","/"].includes(u.pathname))throw Error("Invalid WordPress URL");
if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("Missing WP credentials");
const report={schema:"pse-market-taxonomy-correction-v1",backupVerified:true,changed:[],unchanged:[],errors:[],noAstroBuild:true};
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
try{
 // WP admin HTML can time out under database load. A failed GET is safe to
 // retry using the standard WP login endpoint; never repeat an uncertain POST.
 try{
  await page.goto(u.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:32000});
 }catch(e){
  console.warn("PSE_MARKET_ADMIN_GET_FALLBACK; original_error="+String(e).slice(0,110));
  const login=await page.goto(u.origin+"/wp-login.php",{waitUntil:"domcontentloaded",timeout:45000});
  if(!login||login.status()>=500)throw Error("WP login unavailable after admin GET fallback");
 }
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const t=await page.locator("body").innerText();
  const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=Number(m[1]),b=Number(m[3]),n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await input.count())throw Error("WordPress login math control missing");
   await input.fill(String(n));
  }
  // Login click may redirect slowly under WordPress DB load. Do not
  // resend the login POST just because Playwright's navigation wait timed out.
  // DOM submit does not wait for slow navigation; authenticate exactly once.
  await page.locator("#wp-submit").evaluate(el=>el.click());
  await page.waitForURL(url=>!url.href.includes("wp-login"),{timeout:80000});
  await page.waitForLoadState("domcontentloaded",{timeout:80000});
 }
 if(page.url().includes("wp-login"))throw Error("WordPress login failed");
 await page.goto(u.origin+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("WordPress REST nonce missing");
  return(await r.text()).trim();
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("Invalid WP REST nonce");
 const api=(path,method="GET",body)=>page.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{
   "Accept":"application/json","X-WP-Nonce":nonce,...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {http:r.status,total:Number(r.headers.get("X-WP-Total")||0),data:await r.json().catch(()=>null)};
 },{path,method,body,nonce});
 const cats=await Promise.all(["thong-tin-thi-truong","tin-cong-ty","tin-tong-hop"].map(s=>api("/wp-json/wp/v2/categories?slug="+s+"&_fields=id,slug,parent")));
 if(cats.some(x=>x.http!==200||x.data?.length!==1)||
    cats[0].data[0].id!==1743||cats[0].data[0].parent!==0||
    cats[1].data[0].id!==1742||cats[2].data[0].id!==1746||cats[2].data[0].parent!==1742)
  throw Error("WordPress market/company taxonomy changed");
 // Preflight every post before any write. Protect against altered publications.
 const list=[];
 for(const row of selected){
  const r=await api("/wp-json/wp/v2/posts/"+row.wp+"?context=edit&_fields=id,slug,status,categories,date");
  if(r.http!==200||r.data?.id!==row.wp||r.data.slug!==row.slug||r.data.status!=="publish")
   throw Error("Post verification failed id="+row.id);
  if(row.kind==="knowledge" && !r.data.categories.some(c=>[1755,1756].includes(c)))
   throw Error("Knowledge source lacks its confirmed category "+row.id);
  const next=[...new Set([...r.data.categories.filter(c=>c!==1743),
    ...(row.kind==="knowledge"?[]:row.kind==="company-general"?[1742,1746]:[1742])])];
  if(next.length===0||next.includes(1743))throw Error("Cannot orphan post "+row.id);
  list.push({...row,before:[...r.data.categories],after:next,date:r.data.date});
 }
 const countBefore=await api("/wp-json/wp/v2/posts?status=publish&categories=1743&per_page=1&_fields=id");
 if(countBefore.http!==200||countBefore.total<9)throw Error("Category list preflight failed");
 report.countBefore=countBefore.total;
 for(const row of list){
  if(row.before.join(",")===row.after.join(",")){report.unchanged.push({sourceId:row.id,wpId:row.wp});continue}
  const write=await api("/wp-json/wp/v2/posts/"+row.wp,"POST",{categories:row.after});
  if(write.http!==200||write.data?.id!==row.wp)throw Error("WordPress update failed source="+row.id);
  const verify=await api("/wp-json/wp/v2/posts/"+row.wp+"?context=edit&_fields=id,slug,status,categories,date");
  if(verify.http!==200||verify.data?.slug!==row.slug||verify.data.status!=="publish"||
     verify.data.date!==row.date||
     [...row.after].sort().join(",")!==[...verify.data.categories].sort().join(","))
    throw Error("Taxonomy readback failed source="+row.id);
  report.changed.push({sourceId:row.id,wpId:row.wp,beforeCategories:row.before,afterCategories:verify.data.categories});
 }
 const countAfter=await api("/wp-json/wp/v2/posts?status=publish&categories=1743&per_page=1&_fields=id");
 if(countAfter.http!==200||countAfter.total!==report.countBefore-report.changed.length)
  throw Error("Market category count mismatch after taxonomy correction");
 report.countAfter=countAfter.total;
 console.log("PSE_MARKET_TAXONOMY=PASS; "+JSON.stringify({before:report.countBefore,after:report.countAfter,changed:report.changed.length,unchanged:report.unchanged.length,readonly:false,noAstroBuild:true}));
}catch(e){
 report.errors.push(String(e?.message||e).slice(0,280));
 console.error("PSE_MARKET_TAXONOMY=FAIL; "+report.errors[0]);
 throw e;
}finally{
 await mkdir("docs/reports",{recursive:true});
 await writeFile("docs/reports/pse-market-taxonomy-rollback.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
