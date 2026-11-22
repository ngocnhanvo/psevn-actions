/** Strictly source-scoped native WordPress exact 301 for two already-published
 * original Joomla Pages: Kali overview #1426 and NPK overview #1434.
 * No WordPress Page/Product/Media mutation or duplicate redirect rules.
 */
import {chromium,request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
const signed="cms(pse): publish two exact original Kali and NPK redirects";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main"||
 event.head_commit?.message!==signed||process.env.PSE_TWO_SOURCE_REDIRECT_BACKUP_READY!=="yes")
 throw Error("Unapproved historical exact Joomla redirect CMS write");
const wp="https://admin-pse.webnvn.com",front="https://pse.webnvn.com";
const original=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(original.schema!=="pse-legacy-article-migration-v1"||!original.backup_verified)
 throw Error("Historical original source ledger provenance missing");
const rows=[
 {sourceId:1426,slug:"kali-phu-my-mo-ta-cac-bien-the",key:"pse-historical-kali-1426",
  title:"Kali Phú Mỹ",bodySHA:"13b5f4bc0b124df9820b9060b11efed972b243044948b968fe1342a94458e268",
  imageCount:3,tables:1},
 {sourceId:1434,slug:"npk-phu-my",key:"pse-historical-npk-1434",
  title:"NPK Phú Mỹ",bodySHA:"128f19004566d9635f5fd790b2695414384da294f85f0775e81806a961b7e1ce",
  imageCount:20,tables:3,date:"2021-06-17T00:00:00"}
];
for(const row of rows){
 const v=original.articles?.[row.sourceId];
 if(v?.status!=="quarantined"||!v.source_url?.includes("/8-trang-chu/"+row.sourceId+"-")||
 !v.source_url?.endsWith(row.sourceId+"-"+(row.sourceId===1426?"kali-phu-my":"npk-phu-my")+".html"))
 throw Error("Owner original Joomla legacy path identity changed "+row.sourceId);
 row.from=new URL(v.source_url).pathname;row.to="/"+row.slug;
}
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(v=>v.trim().replace(/^export\s+/,""));
for(const [name,expected] of [["WC_URL",wp],["WC_URL_CLIENT",front]]){
 const matches=env.filter(v=>v.startsWith(name+"="));
 if(matches.length!==1)throw Error("PSE runtime origin not configured");
 const candidate=matches[0].slice(name.length+1).replace(/^['"]|['"]$/g,"").replace(/\/$/,"");
 if(candidate!==expected||new URL(candidate).origin!==expected)throw Error("Wrong WordPress/Astro origin");
}
const report={schema:"pse-original-1426-1434-native-page-exact-301-v1",
 sourceIds:[1426,1434],readback:[],nativeTargets:[],writes:[],
 noPostWrites:true,noPageWrites:true,noMediaWrites:true,noProductWrites:true,
 originalExternalImagePolicy:"retain original third-party dpm.vn URL",
 freshBackup:true,result:"STARTED"};
const out="artifacts/pse-two-original-1426-1434-redirects";
await mkdir(out,{recursive:true});
const save=()=>writeFile(out+"/report.json",JSON.stringify(report,null,2)+"\n");
const browser=await chromium.launch({headless:true}),ctx=await browser.newContext({viewport:{width:1366,height:850}});
const page=await ctx.newPage(),net=await request.newContext({timeout:45000});
const hash=s=>createHash("sha256").update(s).digest("hex");
try{
 await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=(await page.locator("#loginform").innerText()).slice(0,850);
  const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){
   const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error("Unsupported WP native login challenge");
   await f.fill(String(v));
  }
  await page.locator("#wp-submit").click();
 }
 await page.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:65000});
 if(page.url().includes("wp-login")||!await page.locator("#adminmenu").count())throw Error("WordPress native authenticated editor unavailable");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("No WP REST nonce");return(await r.text()).trim();
 });
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error("Wrong WP REST nonce");
 const api=async(path,method="GET",data)=>page.evaluate(async({path,method,data,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{
    "X-WP-Nonce":nonce,Accept:"application/json",...(data?{"Content-Type":"application/json"}:{})},
    ...(data?{body:JSON.stringify(data)}:{})});
  return{http:r.status,totalPages:Number(r.headers.get("x-wp-totalpages")||0),
    body:await r.json().catch(()=>null)};
 },{path,method,data,nonce});
 const registry=[];
 for(let n=1;n<=40;n++){
  const r=await api("/wp-json/wp/v2/chuyen-huong-link?context=edit&status=any&per_page=100&page="+n+
   "&_fields=id,status,acf&orderby=id&order=asc");
  if(r.http!==200||!Array.isArray(r.body)||r.totalPages<1||r.totalPages>40)
   throw Error("Incomplete native WordPress redirect registry");
  registry.push(...r.body);if(n>=r.totalPages)break;
 }
 const found=new Map();
 for(const row of rows){
  const q=await api("/wp-json/wp/v2/pages?context=edit&status=any&slug="+row.slug+
    "&_fields=id,slug,status,title,content,acf,date,featured_media&per_page=5");
  if(q.http!==200||q.body?.length!==1)throw Error("Native original Joomla Page not uniquely published "+row.sourceId);
  const p=q.body[0],html=String(p.content?.raw||"");
  const parsed=await page.evaluate(html=>{
   const el=document.createElement("div");el.innerHTML=html;
   const norm=s=>String(s||"").normalize("NFKC").replace(/\s+/g," ").trim();
   return {text:norm(el.textContent),imgs:[...el.querySelectorAll("img[src]")].map(x=>x.getAttribute("src")),
    tables:el.querySelectorAll("table").length};
  },html);
  if(p.status!=="publish"||p.slug!==row.slug||p.title?.raw!==row.title||
   p.acf?.action!=="PublicPage"||p.acf?.key!==row.key||
   (p.acf?.product_lang?.value??p.acf?.product_lang)!=="vi"||
   hash(parsed.text)!==row.bodySHA||parsed.imgs.length!==row.imageCount||
   parsed.tables!==row.tables||!Number.isSafeInteger(p.featured_media)||p.featured_media<1||
   row.date&&p.date!==row.date)
   throw Error("Source-owned canonical WordPress Page/body/media/date mismatch "+row.sourceId);
  if(row.sourceId===1434){
   const third=parsed.imgs.filter(x=>{try{return new URL(x,wp).hostname==="dpm.vn"}catch{return false}});
   const site=parsed.imgs.filter(x=>String(x).startsWith("/wp-content/uploads/"));
   if(third.length!==1||site.length!==19)throw Error("Original third-party vs site-owned image split changed");
  }
  const old=await net.get(front+row.from,{failOnStatusCode:false,maxRedirects:0,timeout:35000});
  const current=old.headers().location?new URL(old.headers().location,front).pathname:null;
  if(old.status()!==404&&!(old.status()===301&&current===row.to))
   throw Error("Unrecognized existing old Joomla route "+row.sourceId+" HTTP"+old.status());
  const existing=registry.filter(x=>x.acf?.from_link===row.from);
  if(existing.length>1||existing.some(x=>
    x.acf?.to_link!==row.to||String(x.acf?.type)!=="301"||
    x.acf?.match_type!=="Exact"||x.acf?.enable!==true||
    !["draft","publish"].includes(x.status)))
   throw Error("Conflicting native WordPress historical redirect source "+row.sourceId);
  found.set(row.sourceId,existing[0]||null);
  const rec={sourceId:row.sourceId,pageId:p.id,slug:row.slug,bodySha256:row.bodySHA,
    originalOwnedMediaCount:row.sourceId===1434?19:3,
    preservedThirdPartySourceCount:row.sourceId===1434?1:0,
    sourcePath:row.from,targetPath:row.to,existingRedirectId:existing[0]?.id||null};
  report.nativeTargets.push(rec);await save();
  console.log("PSE_TWO_VERIFIED_ORIGINAL_NATIVE_TARGETS="+JSON.stringify(rec));
 }
 if(report.nativeTargets.length!==2)throw Error("Original native Page cohort incomplete");
 for(const row of rows){
  let record=found.get(row.sourceId);
  if(!record){
   const r=await api("/wp-json/wp/v2/chuyen-huong-link","POST",{
    title:"PSE Joomla original article "+row.sourceId+" exact 301",status:"draft",
    acf:{from_link:row.from,to_link:row.to,type:"301",match_type:"Exact",enable:true}
   });
   if(r.http!==201||!Number.isSafeInteger(r.body?.id))throw Error("Original Joomla native 301 creation failed "+row.sourceId);
   record=r.body;report.writes.push({kind:"native-redirect-draft",sourceId:row.sourceId,id:record.id});await save();
  }
  const read=async()=>{
   const q=await api("/wp-json/wp/v2/chuyen-huong-link/"+record.id+"?context=edit&_fields=id,status,acf");
   const p=q.body||{};
   if(q.http!==200||p.id!==record.id||p.acf?.from_link!==row.from||
      p.acf?.to_link!==row.to||String(p.acf?.type)!=="301"||
      p.acf?.match_type!=="Exact"||p.acf?.enable!==true)
    throw Error("Original Joomla native exact 301 readback mismatch "+row.sourceId);
   return p.status;
  };
  if(await read()!=="publish"){
   const r=await api("/wp-json/wp/v2/chuyen-huong-link/"+record.id,"POST",{status:"publish"});
   if(r.http!==200||r.body?.status!=="publish"||await read()!=="publish")
    throw Error("Original Joomla exact 301 publication failed "+row.sourceId);
   report.writes.push({kind:"native-redirect-publish",sourceId:row.sourceId,id:record.id});await save();
  }
  const ready={sourceId:row.sourceId,redirectId:record.id,from:row.from,to:row.to,status:"publish"};
  report.readback.push(ready);console.log("PSE_TWO_ORIGINAL_NATIVE_REDIRECT_READBACK="+JSON.stringify(ready));
  await save();
 }
 report.result="TWO_JOOMLA_ORIGINAL_NATIVE_301_READY_FOR_PRODUCTION_BUILD";
 await save();
 console.log("PSE_TWO_ORIGINAL_PAGES_301_PASS="+JSON.stringify({total:2,sourceIds:[1426,1434],
  exactNative301:2,originalPagesUnchanged:true,originalMediaUnchanged:true,
  originalThirdPartyDpmImageRetained:true,requiresProductionBuild:true}));
}catch(e){report.result="FAILED_OR_PARTIAL";report.errorType=e?.constructor?.name||"Error";report.errorMessage=String(e?.message||"").slice(0,160);await save();throw e}
finally{await net.dispose();await ctx.close();await browser.close()}
