/** Fill only missing, source-verified Yoast SEO titles for existing PSE finance posts.
 * Original Joomla 76/76 <title> proof is independently audited; preserve all
 * WordPress meta descriptions because source has no meta description values.
 */
import {chromium} from "playwright";
import {readFile,writeFile,mkdir} from "node:fs/promises";
const audit=JSON.parse(await readFile("artifacts/pse-finance-76-seo/report.json","utf8"));
const snapshot=JSON.parse(await readFile("artifacts/pse-financial-original/report.json","utf8"));
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 audit.schema!=="pse-finance-76-source-seo-audit-v1"||audit.checked!==76||
 audit.sourceTitleCount!==76||audit.sourceMetaDescriptionCount!==0||
 audit.titleMismatch.length!==67||audit.descriptionMismatch.length!==0||
 audit.failed.length!==0||snapshot.sourceArticles?.length!==76||
 state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified)
 throw Error("Audited source SEO title or rollback identity changed");
const byId=new Map(snapshot.sourceArticles.map(r=>[r.id,r]));
const rows=audit.rows.map(r=>{
 const source=byId.get(r.id);
 if(!source||r.wpId!==state.articles[r.id]?.wp_id||
   !source.href.startsWith("https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-tai-chinh/")||
   source.slug!==source.href.match(/\/\d+-([^/]+)\.html$/)?.[1]||
   !r.sourceTitle||r.sourceDescription!==null||
   !Number.isSafeInteger(r.wpId))throw Error("One source-to-WordPress SEO identity mismatch "+r.id);
 return{...r,slug:source.slug};
});
if(new Set(rows.map(r=>r.wpId)).size!==76)throw Error("Duplicate title sync WordPress post");
const wp="https://admin-pse.webnvn.com";
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1280,height:800}});
const result={schema:"pse-finance-76-source-seo-title-apply-v1",rows:76,
 changed:[],alreadyMatching:[],errors:[],sourceDescriptionMissing:76,preservedWordPressMetaDescriptions:0,status:"UNVERIFIED"};
try{
 await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:55000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const text=(await page.locator("#loginform").innerText()).slice(0,600);
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){
   const a=+m[1],b=+m[3],answer=m[2]==="+"?a+b:m[2]==="-"?a-b:a*b;
   const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error("Login captcha input not found");
   await field.fill(String(answer));
  }
  await page.locator("#wp-submit").click();
 }
 await page.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:55000});
 if(!await page.locator("#adminmenu").count())throw Error("WordPress administrator authentication missing");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  return r.ok()?(await r.text()).trim():"";
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("WordPress REST nonce invalid");
 const api=(path,method="GET",body)=>page.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,
   Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return{http:r.status,data:await r.json().catch(()=>null)};
 },{path,method,body,nonce});
 const wpCat=await api("/wp-json/wp/v2/categories/1754?_fields=id,slug,parent,count");
 if(wpCat.http!==200||wpCat.data?.id!==1754||wpCat.data.slug!=="bao-cao-tai-chinh"||
   wpCat.data.count!==76)throw Error("WordPress finance category count or identity drift");
 for(const r of rows){
  try{
   const path="/wp-json/wp/v2/posts/"+r.wpId;
   const fields="?context=edit&_fields=id,slug,status,categories,date,title,pse_seo_title,pse_seo_description";
   const before=await api(path+fields);
   const p=before.data;
   if(before.http!==200||p?.id!==r.wpId||p.slug!==r.slug||p.status!=="publish"||
      !p.categories?.includes(1754)||typeof p.pse_seo_title!=="string"||
      typeof p.pse_seo_description!=="string")
    throw Error("Exact WordPress source ID, status, category or SEO field changed");
   const desc=p.pse_seo_description;
   if(desc)result.preservedWordPressMetaDescriptions++;
   if(p.pse_seo_title===r.sourceTitle){
    result.alreadyMatching.push(r.id);continue;
   }
   // Never overwrite a title with an independently authored value. The
   // audited missing-title list proves these 67 title fields were blank.
   if(p.pse_seo_title.trim()!==""||r.wpTitle!=="")throw Error("Previously blank SEO title changed since source proof");
   const updated=await api(path,"POST",{pse_seo_title:r.sourceTitle});
   if(updated.http!==200||updated.data?.id!==r.wpId)throw Error("WordPress Yoast title update HTTP "+updated.http);
   const after=await api(path+fields);
   const saved=after.data;
   if(after.http!==200||saved?.pse_seo_title!==r.sourceTitle||
    saved.pse_seo_description!==desc||saved.slug!==p.slug||saved.date!==p.date||
    saved.title?.raw!==p.title?.raw||saved.status!==p.status)
    throw Error("Yoast SEO title update/readback changed unexpected post data");
   result.changed.push({id:r.id,wpId:r.wpId});
   console.log("PSE_FINANCE_SEO_76_TITLE=PASS; source_id="+r.id+"; wp_id="+r.wpId);
  }catch(e){
   result.errors.push({sourceId:r.id,wpId:r.wpId,error:String(e).slice(0,210)});
   console.error("PSE_FINANCE_SEO_76_TITLE_ERROR="+JSON.stringify(result.errors.at(-1)));
  }
 }
 result.status=!result.errors.length&&result.changed.length+result.alreadyMatching.length===76?
   "PASS_SOURCE_TITLE_PARITY":"PARTIAL";
 console.log("PSE_FINANCE_76_SEO_TITLE_SYNC="+JSON.stringify({
  status:result.status,changed:result.changed.length,already:result.alreadyMatching.length,
  targetDescriptionsPreserved:result.preservedWordPressMetaDescriptions,
  sourceDescriptionsMissing:result.sourceDescriptionMissing,errors:result.errors}));
}catch(e){result.status="FAIL";result.errors.push({error:String(e)});console.error("PSE_FINANCE_SEO_76_FATAL="+String(e))}
finally{
 await mkdir("artifacts/pse-finance-76-seo-sync",{recursive:true});
 await writeFile("artifacts/pse-finance-76-seo-sync/report.json",JSON.stringify(result,null,2)+"\n");
 await browser.close();
}
if(result.status!=="PASS_SOURCE_TITLE_PARITY")process.exitCode=1;
