/**
 * Scoped PSE finance Joomla -> WordPress Yoast title synchronization.
 * Exactly nine source IDs; record source-missing descriptions, never fabricate.
 */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const ids=["1738","1666","1650","1480","1148","1137","337","298","199"];
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified)
 throw Error("PSE source provenance/rollback checkpoint mismatch");
const root="https://admin-pse.webnvn.com";
const browser=await chromium.launch({headless:true});
const source=await browser.newPage(),wp=await browser.newPage();
await source.route(/\.(?:png|jpe?g|webp|svg|gif|woff2?|ttf)(?:[?#]|$)/i,r=>r.abort());
const report={schema:"pse-finance-source-yoast-parity-v1",mode:"source-verified-write-minimal",
 titleMatched:0,titleChanged:0,metaDescriptionSourceMissing:0,
 generatedDescriptionDetected:[],notImported:[],sourceFailures:[],wordpressFailures:[],items:[],status:"UNVERIFIED"};
try{
 await wp.goto(root+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:55000});
 if(await wp.locator("#user_login").count()){
  await wp.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await wp.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const m=(await wp.locator("#loginform").innerText()).match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){
   const a=+m[1],b=+m[3],ans=m[2]==="+"?a+b:m[2]==="-"?a-b:a*b;
   const field=wp.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(await field.count())await field.fill(String(ans));
  }
  await wp.locator("#wp-submit").click();
 }
 await wp.goto(root+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:55000});
 if(!await wp.locator("#adminmenu").count())throw Error("WordPress administrator login not verified");
 const nonce=await wp.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  return r.ok()?(await r.text()).trim():"";
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("WordPress post REST nonce unavailable");
 const api=async(path,method="GET",data)=>{
  return wp.evaluate(async({path,method,data,nonce})=>{
   const r=await fetch(path,{method,credentials:"same-origin",headers:{
    Accept:"application/json","X-WP-Nonce":nonce,
    ...(data?{"Content-Type":"application/json"}:{})
   },...(data?{body:JSON.stringify(data)}:{})});
   return{http:r.status,json:await r.json().catch(()=>null)};
  },{path,method,data,nonce});
 };
 for(const id of ids){
  const item=state.articles[id];
  if(!item?.source_url?.includes("/quan-he-nha-dau-tu/bao-cao-tai-chinh/"+id+"-"))throw Error("Incorrect source original for "+id);
  if(!item.wp_id){report.notImported.push(id);continue}
  const url=item.source_url,parsed=new URL(url);
  if(parsed.origin!=="https://www.pse.vn"||!parsed.pathname.endsWith(".html"))throw Error("Invalid original source "+id);
  let seo;
  try{
   const response=await source.goto(url,{waitUntil:"domcontentloaded",timeout:55000});
   if(response?.status()!==200)throw Error("Original HTTP "+response?.status());
   seo=await source.evaluate(()=>{
    const title=(document.head.querySelector("title")?.textContent||"").replace(/\s+/g," ").trim();
    const meta=(document.head.querySelector('meta[name="description" i]')?.getAttribute("content")||"").trim();
    return{title,metaDescription:meta};
   });
   if(!seo.title||seo.title.length>300||!seo.title.includes("PSE.VN"))
    throw Error("Original SEO title invalid");
  }catch(e){report.sourceFailures.push({sourceId:id,error:String(e).slice(0,150)});continue}
  try{
   const path="/wp-json/wp/v2/posts/"+item.wp_id+"?context=edit&_fields=id,slug,status,categories,excerpt,pse_seo_title,pse_seo_description";
   const before=await api(path);
   const old=before.json;
   if(before.http!==200||old?.id!==item.wp_id||old?.slug!==parsed.pathname.match(/\/\d+-([^/]+)\.html$/)?.[1]||
    old.status!=="publish"||!old.categories?.includes(1754)||
    typeof old.pse_seo_title!=="string"||typeof old.pse_seo_description!=="string")
    throw Error("WordPress scoped SEO REST field or post identity invalid "+before.http);
   const row={sourceId:id,wpId:item.wp_id,sourceTitle:seo.title,
    sourceMetaDescription:seo.metaDescription||null,oldTitle:old.pse_seo_title||null,
    oldDescription:old.pse_seo_description||null,action:"unchanged"};
   if(!seo.metaDescription){
    report.metaDescriptionSourceMissing++;
    if(old.pse_seo_description&&old.pse_seo_description.trim()===
       String(old.excerpt?.raw||"").trim()){
     report.generatedDescriptionDetected.push({sourceId:id,wpId:item.wp_id});
    }
   }else{
    row.descriptionNeedsReview=old.pse_seo_description!==seo.metaDescription;
   }
   if(old.pse_seo_title.trim()!==seo.title){
    const saved=await api("/wp-json/wp/v2/posts/"+item.wp_id,"POST",{pse_seo_title:seo.title});
    if(saved.http!==200||saved.json?.id!==item.wp_id)throw Error("WP rejected source SEO title save HTTP "+saved.http);
    const verify=await api(path);
    if(verify.http!==200||verify.json?.pse_seo_title!==seo.title||verify.json?.slug!==old.slug)
      throw Error("Source Yoast SEO title readback mismatch");
    row.action="updated";report.titleChanged++;
   }else{row.action="already_matching";report.titleMatched++}
   report.items.push(row);
   console.log("PSE_FINANCE_SEO_TITLE="+JSON.stringify({id,postId:item.wp_id,action:row.action,descSource:seo.metaDescription?"present":"missing"}));
  }catch(e){report.wordpressFailures.push({sourceId:id,wpId:item.wp_id,error:String(e).slice(0,170)})}
 }
 report.status=report.notImported.length||report.sourceFailures.length||report.wordpressFailures.length?"PARTIAL":"PASS_SOURCE_VERIFIED";
 console.log("PSE_FINANCE_SEO_SUMMARY="+JSON.stringify({status:report.status,items:report.items.length,
   titleChanged:report.titleChanged,titleMatched:report.titleMatched,descriptionSourceMissing:report.metaDescriptionSourceMissing,
   generatedDescriptions:report.generatedDescriptionDetected,unimported:report.notImported,
   sourceFailures:report.sourceFailures,wordpressFailures:report.wordpressFailures}));
}finally{
 await mkdir("artifacts/pse-finance-seo",{recursive:true});
 await writeFile("artifacts/pse-finance-seo/report.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
if(report.status!=="PASS_SOURCE_VERIFIED")process.exitCode=1;
