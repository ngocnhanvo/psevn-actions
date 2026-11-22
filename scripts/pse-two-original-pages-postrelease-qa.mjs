/** Read-only independent postrelease QA for Joomla 1426 and 1434 full native Pages.
 * Requires original Page media URLs and no host migration of the original external image.
 */
import {readFile,mkdir,writeFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")
 throw Error("Wrong repo for original PSE Page QA");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified)
 throw Error("Owner original Joomla source ledger not verified");
const wp="https://admin-pse.webnvn.com",front="https://pse.webnvn.com";
const expected=[
 {id:1426,wpId:83572,slug:"kali-phu-my-mo-ta-cac-bien-the",name:"Kali Phú Mỹ",
  key:"pse-historical-kali-1426",images:3,owned:3,external:0},
 {id:1434,wpId:83593,slug:"npk-phu-my",name:"NPK Phú Mỹ",
  key:"pse-historical-npk-1434",images:20,owned:19,external:1,date:"2021-06-17T00:00:00"}
];
const path="artifacts/pse-two-original-pages-postrelease";await mkdir(path,{recursive:true});
const report={schema:"pse-two-verified-joomla-original-pages-content-301-live-qa-v1",
 sourceIds:expected.map(x=>x.id),readOnly:true,noCmsWrites:true,
 externalImagePolicy:"source dpm.vn original URL retained",rows:[],summary:null};
const save=()=>writeFile(path+"/report.json",JSON.stringify(report,null,2)+"\n");
const get=async u=>{
 for(let i=1;i<=3;i++)try{
  const r=await fetch(u,{redirect:"manual",signal:AbortSignal.timeout(40000),
   headers:{Accept:"text/html,application/json"}});
  if(r.status>=500&&i<3){await new Promise(f=>setTimeout(f,i*1000));continue}
  const text=await r.text();if(text.length>5000000)throw Error("Overlong public original Page");
  return{http:r.status,location:r.headers.get("location")||"",text};
 }catch(e){
  if(i===3||!/fetch failed|ECONNRESET|ETIMEDOUT|socket|timeout|abort/i.test(String(e?.message||e)))throw e;
  await new Promise(f=>setTimeout(f,i*1000));
 }
 throw Error("Unexpected empty GET");
};
const strip=s=>String(s||"").replace(/<[^>]*>/g," ").replace(/&(?:nbsp|amp|quot|#39);/g," ").replace(/\s+/g," ").trim();
const tagCanonical=s=>s.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1]||
 s.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical/i)?.[1]||"";
const extractImages=s=>[...String(s||"").matchAll(/<img\b[^>]*\s(?:src|data-src)=["']([^"']+)["']/gi)].map(x=>x[1]);
const stem=u=>{
 const name=decodeURIComponent(new URL(u,wp).pathname.split("/").at(-1)||"");
 return name.replace(/\.(?:jpe?g|png|gif|webp)$/i,"");
};
let all=true;
for(const def of expected){
 const original=state.articles[def.id];
 if(original?.status!=="quarantined"||!original.source_url?.includes("/8-trang-chu/"+def.id+"-"))
  throw Error("Historical source path changed "+def.id);
 const oldPath=new URL(original.source_url).pathname,to="/"+def.slug;
 const [old,dest,data]=await Promise.all([
  get(front+oldPath),get(front+to),
  get(wp+"/wp-json/wp/v2/pages/"+def.wpId+"?_fields=id,slug,status,title,content,acf,date")
 ]);
 const p=JSON.parse(data.text||"{}");
 const rawImages=extractImages(p.content?.rendered||"");
 const native=rawImages.filter(x=>{try{return new URL(x,wp).pathname.startsWith("/wp-content/uploads/")}catch{return false}});
 const third=rawImages.filter(x=>{try{return new URL(x,wp).hostname==="dpm.vn"}catch{return false}});
 const realH1=strip(dest.text.match(/<h1\b[^>]*>([\s\S]{0,1200}?)<\/h1>/i)?.[1]||"");
 const can=tagCanonical(dest.text),canon=can?new URL(can,front):null;
 const loc=old.location?new URL(old.location,front):null;
 const readable=(()=>{try{return decodeURIComponent(dest.text)}catch{return dest.text}})();
 const missingNativeStems=native.map(stem).filter(x=>!readable.includes(x));
 const outsideReferenceOkay=def.external===0||(
  third.length===1&&dest.text.includes("dpm.vn"));
 const row={sourceId:def.id,wpId:def.wpId,oldPath,target:to,
  oldHttp:old.http,location:old.location,targetHttp:dest.http,
  nativeRestHttp:data.http,status:p.status,
  h1:realH1,canonicalPath:canon?.pathname||null,
  originalPageNativeImageCount:native.length,sourceThirdPartyImageCount:third.length,
  missingNativeStems,externalImageSourcePreserved:outsideReferenceOkay,
  passed:old.http===301&&loc?.origin===front&&loc.pathname===to&&
   !loc.search&&!loc.hash&&dest.http===200&&
   canon?.origin===front&&canon.pathname===to&&!canon.search&&!canon.hash&&
   data.http===200&&p.id===def.wpId&&p.status==="publish"&&p.slug===def.slug&&
   p.acf?.key===def.key&&p.acf?.action==="PublicPage"&&
   (!def.date||p.date===def.date)&&
   realH1.includes(def.name)&&rawImages.length===def.images&&
   native.length===def.owned&&third.length===def.external&&
   missingNativeStems.length===0&&outsideReferenceOkay};
 all&&=row.passed;report.rows.push(row);
 console.log("PSE_TWO_ORIGINAL_PAGE_LIVE_ROW="+JSON.stringify(row));await save();
}
report.summary={sourcePages:2,validNativePages:report.rows.filter(x=>x.nativeRestHttp===200&&x.status==="publish").length,
 exactLegacy301:report.rows.filter(x=>x.oldHttp===301&&x.passed).length,
 originalSiteOwnedMediaReferenced:report.rows.reduce((s,x)=>s+x.originalPageNativeImageCount,0),
 originalExternalSourceReferences:report.rows.reduce((s,x)=>s+x.sourceThirdPartyImageCount,0),
 pass:all,noCMSWrites:true};
await save();console.log("PSE_TWO_ORIGINAL_PAGE_LIVE_SUMMARY="+JSON.stringify(report.summary));
if(!all)throw Error("Original Page source identity, frontend media, or exact 301 parity incomplete");
