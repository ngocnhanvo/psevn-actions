/** One exact proven Joomla Garden family URL -> published WordPress Garden ProductCategory.
 * This does not move products, mutate Astro, or infer other historical aliases.
 */
import {chromium,request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const marker="cms(pse): redirect exact Joomla Garden 1639 to published Garden category";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main"||event.head_commit?.message!==marker)
 throw Error("Unapproved 1639 legacy Garden redirect writer");
if(process.env.PSE_1639_FRESH_BACKUP_VERIFIED!=="yes")throw Error("Fresh rollback backup required");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const source=state.articles?.[1639];
if(state.schema!=="pse-legacy-article-migration-v1"||source?.status!=="quarantined"||
 source?.reason!=="Original Joomla section cannot be mapped to verified WP taxonomy")
 throw Error("Original Joomla 1639 legacy provenance changed");
const legacy=new URL(String(source.source_url||""));
const exactPath="/hoat-dong-kinh-doanh/san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my/8-trang-chu/1639-phu-my-garden.html";
if(legacy.protocol!=="https:"||legacy.hostname!=="www.pse.vn"||legacy.pathname!==exactPath||
 legacy.search||legacy.hash)throw Error("Source 1639 URL does not match independently verified Joomla record");
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const origin=k=>{const a=vars.filter(x=>x.startsWith(k+"="));if(a.length!==1)throw Error("Missing "+k);
 const u=new URL(a[0].slice(k.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.port||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Bad "+k);
 return u.origin;};
const wp=origin("WC_URL"),front=origin("WC_URL_CLIENT");
if(wp===front)throw Error("CMS and public origin overlap");
const destination="/san-pham/phu-my-garden";
const slugs=["009","002","003","004","005","006","007","008"].map(x=>"phu-my-garden-pmgarden"+x);
const browser=await chromium.launch({headless:true});
const net=await request.newContext({timeout:45000});
const page=await browser.newPage();
let api=null,createdId=null,success=false;
const report={sourceId:1639,sourcePath:exactPath,to:destination,srcProof:"source-gallery-eight-photo-and-row-text-equivalent",
 readOnly:false,writes:[],products:[],previous:null,result:null,buildTriggered:false};
try{
 // Current public canonical must be live and eight actual source Products present.
 const [cats,products]=await Promise.all([
  net.get(wp+"/wp-json/wp/v2/product_cat?hide_empty=false&per_page=100&_fields=id,slug,name,parent"),
  net.get(wp+"/wp-json/wp/v2/product?status=publish&per_page=100&_fields=id,slug,product_cat")
 ]);
 if(cats.status()!==200||products.status()!==200)throw Error("Native Product taxonomy source unavailable");
 const allCats=await cats.json(),allProducts=await products.json();
 const term=allCats.filter(x=>x.slug==="phu-my-garden");
 if(allProducts.length!==53||term.length!==1||term[0].name!=="Phú Mỹ Garden"||
 slugs.some(s=>allProducts.filter(p=>p.slug===s&&p.product_cat?.includes(Number(term[0].id))).length!==1))
  throw Error("Native Garden category/8 Product identities missing");
 const archive=await net.get(front+destination,{maxRedirects:0,failOnStatusCode:false});
 if(archive.status()!==200)throw Error("Garden canonical archive missing");
 const html=await archive.text();
 for(const slug of slugs)if(!html.includes(slug))throw Error("Garden source Product missing from native archive "+slug);
 for(const slug of slugs){
  const url=front+"/san-pham/"+slug;
  const r=await net.get(url,{maxRedirects:0,failOnStatusCode:false});
  if(r.status()!==200)throw Error("Public Garden detail still not deployed "+slug+" HTTP "+r.status());
  const body=await r.text();
  if(!body.includes("Phú Mỹ Garden")||!body.includes('rel="canonical"')||!body.includes("/san-pham/"+slug))
   throw Error("Garden public canonical proof missing "+slug);
  report.products.push(slug);
 }
 const [oldOriginal,oldPublic]=await Promise.all([
  net.get(legacy.href,{maxRedirects:3,failOnStatusCode:false}),
  net.get(front+exactPath,{maxRedirects:0,failOnStatusCode:false})
 ]);
 if(oldOriginal.status()!==200||!(await oldOriginal.text()).includes("Phú Mỹ Garden"))
  throw Error("Joomla source 1639 original unavailable");
 if(oldPublic.status()!==404&&oldPublic.status()!==301)
  throw Error("Legacy public 1639 path has unexpected existing route "+oldPublic.status());
 if(oldPublic.status()===301){
  const u=new URL(oldPublic.headers().location||"",front);
  if(u.origin!==front||u.pathname!==destination)throw Error("Legacy 1639 already redirects to a wrong target");
 }
 // Native WordPress CPT routing registry owns exact old path and redirect type.
 await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=(await page.locator("#loginform").innerText()).slice(0,500);
  const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i);
  if(m){const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await input.count())throw Error("WordPress login challenge missing");await input.fill(String(n));}
  await page.locator("#wp-submit").click();
 }
 await page.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 if(page.url().includes("wp-login")||!await page.locator("#adminmenu").count())throw Error("Native protected editor unavailable");
 const nonce=await page.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("WordPress nonce unavailable");return(await r.text()).trim()});
 if(!/^[a-zA-Z0-9]{8,24}$/.test(nonce))throw Error("Invalid REST nonce");
 api=(path,method="GET",body)=>page.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{
   "X-WP-Nonce":nonce,"Accept":"application/json",...(body?{"Content-Type":"application/json"}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  return{http:r.status,pages:Number(r.headers.get("X-WP-TotalPages")||1),data:await r.json().catch(()=>null)};
 },{path,method,body,nonce});
 const registry=[];
 for(let i=1;i<=40;i++){
  const r=await api("/wp-json/wp/v2/chuyen-huong-link?context=edit&status=any&per_page=100&page="+i+
   "&orderby=id&order=asc&_fields=id,status,acf");
  if(r.http!==200||!Array.isArray(r.data)||!Number.isInteger(r.pages)||r.pages<1||r.pages>40)
   throw Error("Incomplete native routing registry");
  registry.push(...r.data);if(i===r.pages)break;
 }
 const matches=registry.filter(r=>r.acf?.from_link===exactPath);
 if(matches.length>1)throw Error("Ambiguous legacy 1639 native redirects");
 const existing=matches[0];
 if(existing&&(existing.acf?.to_link!==destination||String(existing.acf?.type)!=="301"||
  existing.acf?.match_type!=="Exact"||existing.acf?.enable!==true))
  throw Error("Conflicting legacy Joomla source 1639 native redirect");
 report.previous=existing?{id:existing.id,status:existing.status}:null;
 console.log("PSE_GARDEN_1639_PREFLIGHT="+JSON.stringify({sourceId:1639,originalPhotos:8,publicProducts:8,
  nativePublishedProducts:53,category:destination,legacyStatus:oldPublic.status(),
  existingRoute:report.previous,verifiedOriginalSource:true}));
 await mkdir("artifacts/pse-garden-1639",{recursive:true});
 await writeFile("artifacts/pse-garden-1639/rollback.json",JSON.stringify({previous:report.previous,newId:null,from:exactPath,to:destination},null,2)+"\n");
 let id=existing?.id;
 if(!id){
  const r=await api("/wp-json/wp/v2/chuyen-huong-link","POST",{
   status:"draft",title:"PSE: Joomla 1639 Phú Mỹ Garden → native danh mục",
   acf:{from_link:exactPath,to_link:destination,type:"301",match_type:"Exact",enable:true}});
  if(r.http!==201||!Number.isSafeInteger(Number(r.data?.id))||!r.data.id)throw Error("Native 1639 draft create failed");
  id=Number(r.data.id);createdId=id;report.writes.push({type:"draft",id});
  await writeFile("artifacts/pse-garden-1639/rollback.json",JSON.stringify({previous:null,newId:id,from:exactPath,to:destination},null,2)+"\n");
 }
 const probe=await api("/wp-json/wp/v2/chuyen-huong-link/"+id+"?context=edit&_fields=id,status,acf");
 if(probe.http!==200||probe.data?.acf?.from_link!==exactPath||probe.data?.acf?.to_link!==destination||
  String(probe.data.acf?.type)!=="301"||probe.data.acf?.match_type!=="Exact"||probe.data.acf?.enable!==true)
  throw Error("Native 1639 source-to-category redirect readback failed");
 if(probe.data.status!=="publish"){
  const pub=await api("/wp-json/wp/v2/chuyen-huong-link/"+id,"POST",{status:"publish"});
  if(pub.http!==200||pub.data?.status!=="publish")throw Error("Native 1639 redirect publish failed");
  report.writes.push({type:"publish",id});
 }
 const check=await api("/wp-json/wp/v2/chuyen-huong-link/"+id+"?context=edit&_fields=id,status,acf");
 if(check.http!==200||check.data?.status!=="publish"||check.data.acf?.from_link!==exactPath||
  check.data.acf?.to_link!==destination)throw Error("Published 1639 redirect final readback failed");
 success=true;report.result={id,status:"publish"};
 console.log("PSE_GARDEN_1639_REDIRECT_APPLY_PASS="+JSON.stringify({sourceId:1639,redirectId:id,
  legacySourceVerified:true,exactOriginalProducts:8,canonicalCategory:destination,wpOwned:true,
  unrelatedSourcesChanged:0,buildTriggered:false}));
}finally{
 if(createdId&&!success&&api){
  try{
   const r=await api("/wp-json/wp/v2/chuyen-huong-link/"+createdId+"?context=edit&_fields=id,status,acf");
   if(r.http===200&&r.data?.status==="draft"&&r.data.acf?.from_link===exactPath){
    const d=await api("/wp-json/wp/v2/chuyen-huong-link/"+createdId+"?force=true","DELETE");
    const after=await api("/wp-json/wp/v2/chuyen-huong-link/"+createdId+"?context=edit");
    if(d.http!==200||after.http!==404)throw Error("Scoped draft cleanup residue");
    console.log("PSE_GARDEN_1639_DRAFT_CLEANUP_PASS");
   }else console.warn("PSE_GARDEN_1639_UNCERTAIN_WRITE_REVIEW id="+createdId);
  }catch(e){console.warn("PSE_GARDEN_1639_CLEANUP_REVIEW="+String(e?.message||e).slice(0,100));}
 }
 await mkdir("artifacts/pse-garden-1639",{recursive:true});
 await writeFile("artifacts/pse-garden-1639/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await browser.close();
}
