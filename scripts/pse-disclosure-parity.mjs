/**
 * PSE disclosure parity audit (READ ONLY).
 * Oracle: legacy Joomla archive plus independently checkpointed source URLs.
 * WordPress records are queried from CMS, not inferred from target listing.
 * Does not publish, import, mutate files, or trigger Astro build.
 */
import {chromium} from "playwright";
import {readFile, mkdir, writeFile} from "node:fs/promises";
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(state.schema!=="pse-legacy-article-migration-v1")throw Error("Unexpected migration checkpoint");
const BASE="https://www.pse.vn/quan-he-nha-dau-tu/tin-tuc-co-dong/ban-cong-bo-thong-tin.html";
const records=Object.entries(state.articles).filter(([,v])=>v.source_url?.includes("/tin-tuc-co-dong/ban-cong-bo-thong-tin/")).map(([id,v])=>({sourceId:id,sourceUrl:v.source_url,checkpoint:v.status,wpId:v.wp_id||null,reason:v.reason||null,verifiedDate:v.verified_date||null}));
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const origin=(name)=>{const found=env.filter(x=>x.startsWith(name+"="));if(found.length!==1)throw Error("Missing unique "+name);const u=new URL(found[0].slice(name.length+1).replace(/^['"]|['"]$/g,""));if(u.protocol!=="https:"||u.username||u.password||u.pathname!=="/"||u.search||u.hash)throw Error("Invalid "+name);return u.origin};
const wpOrigin=origin("WC_URL"),frontOrigin=origin("WC_URL_CLIENT");
if(!frontOrigin.includes("pse."))throw Error("Unexpected PSE frontend");
const browser=await chromium.launch({headless:true});
let report={schema:"pse-disclosure-parity-v1",source:BASE,target:frontOrigin+"/tin-tuc-su-kien/ban-cong-bo-thong-tin",checkpointRecords:records.length,sourceArchivePages:[],sourceArchiveUnique:[],sourceOnly:[],checkpointOnly:[],cms:{},missing:[],unpublished:[],wrongCategory:[],mediaHotlinks:[],errors:[]};
try{
 const source=await browser.newPage({viewport:{width:1365,height:860}});
 await source.route(/\.(png|jpe?g|webp|gif|svg|woff2?|ttf)(\?.*)?$/i,r=>r.abort());
 const sourceIds=new Set();
 let consecutiveEmpty=0;
 for(let i=0;i<40;i++){
  const url=BASE+(i?"?start="+(i*6):"");let response=null,err=null;
  for(let k=0;k<2;k++){try{response=await source.goto(url,{waitUntil:"domcontentloaded",timeout:24000});if(response?.status()===200)break;throw Error("HTTP "+response?.status())}catch(e){err=e;response=null}}
  if(!response){report.errors.push({stage:"source",page:i+1,url,error:String(err).slice(0,180)});continue}
  const out=await source.evaluate(()=>{
   const root=document.querySelector(".blog")||document.querySelector("main");if(!root)return {ids:[],hasRoot:false};
   const ids=[...root.querySelectorAll("a[href]")].map(a=>{try{const u=new URL(a.href);if(!["www.pse.vn","pse.vn"].includes(u.hostname)||!u.pathname.includes("/tin-tuc-co-dong/ban-cong-bo-thong-tin/"))return null;return u.pathname.match(/\/(\d{2,6})-[^/]+\.html$/)?.[1]||null}catch{return null}}).filter(Boolean);
   return {ids:[...new Set(ids)],hasRoot:true};
  });
  const before=sourceIds.size;out.ids.forEach(id=>sourceIds.add(id));
  report.sourceArchivePages.push({page:i+1,url,found:out.ids.length,newIds:sourceIds.size-before,hasRoot:out.hasRoot});
  consecutiveEmpty=out.ids.length===0?consecutiveEmpty+1:0;
  if(consecutiveEmpty>=2 && i>=30)break;
 }
 report.sourceArchiveUnique=[...sourceIds].sort((a,b)=>Number(b)-Number(a));
 const checkpointIds=new Set(records.map(x=>x.sourceId));
 report.sourceOnly=report.sourceArchiveUnique.filter(id=>!checkpointIds.has(id));
 report.checkpointOnly=records.filter(x=>!sourceIds.has(x.sourceId)).map(x=>x.sourceId);
 console.log("PSE_DISCLOSURE_SOURCE="+JSON.stringify({scanned:report.sourceArchivePages.length,unique:sourceIds.size,checkpoint:records.length,sourceOnly:report.sourceOnly.length,errors:report.errors.length}));

 const wp=await browser.newPage();
 await wp.goto(wpOrigin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await wp.locator("#user_login").count()){
  await wp.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");await wp.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=await wp.locator("body").innerText(),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],z=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const field=wp.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await field.count())throw Error("Login challenge field missing");await field.fill(String(z))}
  await Promise.all([wp.waitForLoadState("domcontentloaded"),wp.locator("#wp-submit").click()]);
 }
 if(wp.url().includes("wp-login"))throw Error("WordPress auth unavailable");
 const nonce=await wp.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("WP nonce unavailable");return(await r.text()).trim()});
 const api=(path)=>wp.evaluate(async({path,nonce})=>{const r=await fetch(path,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json"}});return {status:r.status,total:r.headers.get("X-WP-Total"),pages:r.headers.get("X-WP-TotalPages"),body:await r.json().catch(()=>null)}},{path,nonce});
 const c=await api("/wp-json/wp/v2/categories?context=edit&slug=ban-cong-bo-thong-tin&_fields=id,name,slug,parent,count");
 if(c.status!==200||!Array.isArray(c.body)||c.body.length!==1)throw Error("Disclosure taxonomy missing/ambiguous "+c.status);
 const cat=c.body[0];report.cms.category=cat;
 const ids=records.map(x=>x.wpId).filter(Boolean),posts=[];
 for(let i=0;i<ids.length;i+=60){
  const chunk=ids.slice(i,i+60);
  const u="/wp-json/wp/v2/posts?context=edit&status=any&per_page=100&include="+chunk.join(",")+"&_fields=id,status,slug,title,date,categories,acf,content";
  const p=await api(u);if(p.status!==200||!Array.isArray(p.body))throw Error("CMS post readback failed "+p.status+" chunk "+i);
  posts.push(...p.body);
 }
 const byId=new Map(posts.map(p=>[Number(p.id),p]));
 for(const record of records){
  const p=record.wpId?byId.get(Number(record.wpId)):null;
  if(!p){report.missing.push(record);continue}
  if(p.status!=="publish")report.unpublished.push({...record,cmsStatus:p.status,wpTitle:p.title?.raw||p.title?.rendered||""});
  if(!p.categories?.includes(cat.id))report.wrongCategory.push({...record,cmsCategories:p.categories||[],wpTitle:p.title?.raw||p.title?.rendered||""});
  const html=p.content?.raw||p.content?.rendered||"";
  if(/(?:https?:)?\/\/(?:www\.)?pse\.vn\/(?:images|media|files)\//i.test(html))report.mediaHotlinks.push({sourceId:record.sourceId,wpId:p.id});
 }
 const stats={};for(const p of posts)stats[p.status]=(stats[p.status]||0)+1;
 report.cms={category:cat,found:posts.length,statuses:stats,sourceRecordsWithWpId:ids.length};
 console.log("PSE_DISCLOSURE_CMS="+JSON.stringify({source:records.length,found:posts.length,statuses:stats,missing:report.missing.length,unpublished:report.unpublished.length,wrongCategory:report.wrongCategory.length,legacyMediaLinks:report.mediaHotlinks.length}));
 const publicPage=await browser.newPage();
 try{
  const response=await publicPage.goto(report.target,{waitUntil:"domcontentloaded",timeout:30000});
  report.targetHttp=response?.status()||null;
  report.targetPaginationText=await publicPage.locator("body").innerText().then(s=>s.match(/Trang\s+1\s*\/\s*\d+\s*\(Tổng\s*\d+\s*bài viết\)/i)?.[0]||null);
 }catch(e){report.errors.push({stage:"target",error:String(e).slice(0,160)})}
}finally{
 await mkdir("artifacts/pse-disclosure-parity",{recursive:true});
 await writeFile("artifacts/pse-disclosure-parity/audit.json",JSON.stringify(report,null,2)+"\n");
 console.log("PSE_DISCLOSURE_AUDIT="+JSON.stringify({targetPagination:report.targetPaginationText,sourceCount:report.sourceArchiveUnique.length,checkpointCount:report.checkpointRecords,sourceOnly:report.sourceOnly.length,missing:report.missing.length,unpublished:report.unpublished.length,wrongCategory:report.wrongCategory.length,errors:report.errors.length,artifact:"artifacts/pse-disclosure-parity/audit.json",mode:"read-only"}));
 await browser.close();
}
