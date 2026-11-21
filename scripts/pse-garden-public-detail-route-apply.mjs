/** Scoped WordPress routing-manager correction for exactly eight proven Garden Products.
 * No Astro hardcode; never replaces existing Product category/numeric detail rules.
 * Only applies for an exact owner commit after verified fresh Updraft DB backup.
 */
import {chromium,request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const evt=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const marker="cms(pse): restore eight Garden public Product detail rewrites";
const authorized=process.env.GITHUB_REPOSITORY==="ngocnhanvo/psevn-actions"&&
 process.env.GITHUB_REF==="refs/heads/main"&&evt.head_commit?.message===marker;
if(!authorized)throw Error("Garden public route writes not authorized");
if(process.env.PSE_GARDEN_ROUTE_BACKUP_VERIFIED!=="yes")throw Error("Fresh Updraft DB backup missing");
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
function origin(key){
 const matches=vars.filter(x=>x.startsWith(key+"="));
 if(matches.length!==1)throw Error("Missing unique "+key);
 const u=new URL(matches[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.port||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Untrusted "+key);
 return u.origin;
}
const wp=origin("WC_URL"),front=origin("WC_URL_CLIENT");
if(wp===front)throw Error("CMS and Astro origin overlap");
const slugs=["009","002","003","004","005","006","007","008"].map(n=>"phu-my-garden-pmgarden"+n);
const rule={from:"^/san-pham/(phu-my-garden-pmgarden(?:009|00[2-8]))/?$",
 to:"/ssr/products/$1/detail",type:"Rewrite",match_type:"Regex",enable:true};
const browser=await chromium.launch({headless:true});
const net=await request.newContext({timeout:45000});
const page=await browser.newPage();
let createdId=null,published=false;
const report={schema:"pse-verified-eight-garden-public-detail-rewrite-v1",sourceVariants:8,
 exactSlugs:slugs,rule,readOnly:false,writes:[],priorRule:null,after:null,buildTriggered:false};
try{
 // Independently prove all intended targets exist and native scope is exact.
 const [pr,cr]=await Promise.all([
  net.get(wp+"/wp-json/wp/v2/product?status=publish&per_page=100&_fields=id,slug,status,product_cat"),
  net.get(wp+"/wp-json/wp/v2/product_cat?per_page=100&hide_empty=false&_fields=id,slug,name,parent")
 ]);
 if(pr.status()!==200||cr.status()!==200)throw Error("Native Product/category public registry unavailable");
 const products=await pr.json(),categories=await cr.json();
 if(products.length!==53||slugs.some(slug=>products.filter(p=>p.slug===slug).length!==1))
  throw Error("Unexpected WordPress Garden Product registry");
 const roots=categories.filter(c=>c.slug==="phan-bon-phu-my"),terms=categories.filter(c=>c.slug==="phu-my-garden");
 if(roots.length!==1||terms.length!==1||terms[0].name!=="Phú Mỹ Garden"||
 Number(terms[0].parent)!==Number(roots[0].id)||slugs.some(s=>!products.find(p=>p.slug===s).product_cat?.includes(Number(terms[0].id))))
  throw Error("WordPress Garden native taxonomy wrong");
 for(const slug of slugs){
  const r=await net.get(front+"/ssr/products/"+slug+"/detail",{timeout:40000,failOnStatusCode:false,maxRedirects:0});
  if(r.status()!==200)throw Error("Unpublished internal Garden detail "+slug+" HTTP "+r.status());
  const body=await r.text();
  if(!body.includes("Phú Mỹ Garden")||!body.includes("https://")||!body.includes("san-pham/"+slug))
   throw Error("Missing source-owned Garden SSR body/canonical "+slug);
 }
 const category=await net.get(front+"/san-pham/phu-my-garden",{timeout:40000,maxRedirects:0,failOnStatusCode:false});
 if(category.status()!==200)throw Error("Garden archive is not yet live");
 // Authenticate against the existing native WordPress REST routing manager.
 await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=(await page.locator("#loginform").innerText()).slice(0,600);
  const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i);
  if(m){
   const a=Number(m[1]),b=Number(m[3]),n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await input.count())throw Error("Native WP login math input missing");
   await input.fill(String(n));
  }
  await page.locator("#wp-submit").click();
 }
 await page.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 if(page.url().includes("wp-login")||!await page.locator("#adminmenu").count())
  throw Error("Native WordPress authenticated editor unavailable");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("WP REST nonce unavailable");
  return(await r.text()).trim();
 });
 if(!/^[a-zA-Z0-9]{8,24}$/.test(nonce))throw Error("Invalid WordPress REST nonce");
 const api=(path,method="GET",body)=>page.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{
   "X-WP-Nonce":nonce,"Accept":"application/json",
   ...(body?{"Content-Type":"application/json"}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  return{http:r.status,pages:Number(r.headers.get("X-WP-TotalPages")||1),
   data:await r.json().catch(()=>null)};
 },{path,method,body,nonce});
 const all=[];
 for(let n=1;n<=40;n++){
  const r=await api("/wp-json/wp/v2/chuyen-huong-link?context=edit&status=any&per_page=100&page="+n+
   "&orderby=id&order=asc&_fields=id,title,slug,status,acf,route_priority,route_conditions");
  if(r.http!==200||!Array.isArray(r.data)||!Number.isInteger(r.pages)||r.pages<1||r.pages>40)
   throw Error("Routing inventory incomplete at page "+n);
  all.push(...r.data);
  if(n===r.pages)break;
 }
 const existing=all.filter(x=>x.acf?.from_link===rule.from);
 if(existing.length>1)throw Error("Duplicate exact Garden native routing rule");
 const candidate=existing[0];
 if(candidate&&(candidate.acf?.to_link!==rule.to||
  String(candidate.acf?.type||"").toLowerCase()!=="rewrite"||
  candidate.acf?.match_type!=="Regex"||candidate.acf?.enable!==true))
  throw Error("Existing exact Garden route conflicts");
 // Prior numeric Product route and WP product category route must not be changed.
 const numeric=all.filter(x=>x.acf?.from_link==="^/san-pham/([a-z0-9-]+-[0-9]{3,5})$"&&
  x.acf?.to_link==="/ssr/products/$1/detail"&&x.status==="publish");
 if(numeric.length!==1)throw Error("Existing 45 Product numeric detail route missing");
 report.priorRule=candidate?{id:candidate.id,status:candidate.status}:null;
 console.log("PSE_GARDEN_ROUTE_PREFLIGHT="+JSON.stringify({products:products.length,originalSlugs:slugs.length,
  publishedNumericRoute:numeric[0].id,already:report.priorRule,sourceChecked:true,rule,readOnly:false}));
 await mkdir("artifacts/pse-garden-native-route",{recursive:true});
 await writeFile("artifacts/pse-garden-native-route/rollback.json",JSON.stringify({
  previous:report.priorRule,createdId:null,rule,reason:"verified Garden routes only"
 },null,2)+"\n");
 let id=candidate?.id||null;
 if(!id){
  const c=await api("/wp-json/wp/v2/chuyen-huong-link","POST",
   {title:"PSE: Phú Mỹ Garden - 8 chi tiết sản phẩm gốc",status:"draft",
    acf:{from_link:rule.from,to_link:rule.to,type:rule.type,match_type:rule.match_type,enable:rule.enable}});
  if(c.http!==201||!Number.isSafeInteger(Number(c.data?.id))||!c.data.id)
   throw Error("WordPress Garden routing CPT draft creation failed HTTP "+c.http);
  id=Number(c.data.id);createdId=id;
  report.writes.push({type:"nativeRouteDraft",id});
  await writeFile("artifacts/pse-garden-native-route/rollback.json",
   JSON.stringify({previous:null,createdId:id,rule},null,2)+"\n");
 }
 const verify=await api("/wp-json/wp/v2/chuyen-huong-link/"+id+
  "?context=edit&_fields=id,status,acf,route_priority,route_conditions");
 if(verify.http!==200||Number(verify.data?.id)!==Number(id)||
  verify.data.acf?.from_link!==rule.from||verify.data.acf?.to_link!==rule.to||
  String(verify.data.acf?.type).toLowerCase()!=="rewrite"||
  verify.data.acf?.match_type!=="Regex"||verify.data.acf?.enable!==true||
  (verify.data.route_conditions||[]).length!==0)
  throw Error("Garden native WordPress route readback mismatched");
 if(verify.data.status!=="publish"){
  const saved=await api("/wp-json/wp/v2/chuyen-huong-link/"+id,"POST",{status:"publish"});
  if(saved.http!==200||saved.data?.status!=="publish")throw Error("WordPress Garden route publish failed");
  report.writes.push({type:"publish",id});
 }
 const final=await api("/wp-json/wp/v2/chuyen-huong-link/"+id+
  "?context=edit&_fields=id,status,acf,route_priority,route_conditions");
 if(final.http!==200||final.data?.status!=="publish"||final.data.acf?.from_link!==rule.from||
  final.data.acf?.to_link!==rule.to||final.data.acf?.enable!==true)
  throw Error("Published Garden route readback unavailable");
 published=true;report.after={id,status:final.data.status,priority:final.data.route_priority};
 console.log("PSE_GARDEN_ROUTE_APPLY_PASS="+JSON.stringify({nativeRouteId:id,verifiedGardenSlugs:8,
  otherNumericProductRouteUnchanged:numeric[0].id,sourceOwned:true,noAstroHardcode:true,
  noBuildTriggered:true,writes:report.writes.length}));
}finally{
 if(createdId&&!published){
  // Only an uncommitted route draft created by this run may be rolled back.
  try{
   const check=await page.request.get(wp+"/wp-json/wp/v2/chuyen-huong-link/"+createdId,{failOnStatusCode:false});
   console.warn("PSE_GARDEN_ROUTE_ROLLBACK_MANUAL_REVIEW="+JSON.stringify({createdId,status:check.status(),noBlindReplay:true}));
  }catch{console.warn("PSE_GARDEN_ROUTE_ROLLBACK_MANUAL_REVIEW id="+createdId)}
 }
 await mkdir("artifacts/pse-garden-native-route",{recursive:true});
 await writeFile("artifacts/pse-garden-native-route/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await browser.close();
}
