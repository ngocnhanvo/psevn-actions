/** Public GET-only postrelease parity for ten Joomla originals with external img URLs.
 * Validates native old URL 301, new article 200, WordPress publish, and all raw
 * third-party img src references. Does NOT claim images are reachable externally.
 */
import {readFile,mkdir,writeFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")
 throw Error("Wrong repository");
const doc=JSON.parse(await readFile("docs/source/pse-original-public-articles-11-2026-11-22.json","utf8"));
const sources=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const ids=[114,121,127,178,186,196,202,237,341,1090],targetIds=[83534,83535,83536,83537,83538,83539,83540,83541,83542,83544];
if(doc.schema!=="pse-original-joomla-selected-public-articles-v1"||doc.entries?.length!==11||
 sources.schema!=="pse-legacy-article-migration-v1")
 throw Error("Owner original article fixture mismatch");
const site="https://pse.webnvn.com",admin="https://admin-pse.webnvn.com";
const allowedHosts=new Set([
 "www.sieuthinongnghiep.com","www.spchcmc.com.vn","dateh.lamdong.gov.vn",
 "images.danviet.vn","library.petrotimes.vn","baobinhphuoc.com.vn",
 "dpm.vn","www.dpm.vn","baodientu.chinhphu.vn"
]);
const report={schema:"pse-10-third-party-original-url-redirect-live-qa-v1",
 originalContentSource:"owner Joomla SQL public-only posts",sourceIds:ids,wpIds:targetIds,
 front:site,readOnly:true,noCMSWrites:true,noMediaUploads:true,
 externalSourceAvailabilityNotGuaranteed:true,rows:[],summary:{},result:"STARTED"};
const out="artifacts/pse-ten-thirdparty-postrelease-live-qa";
await mkdir(out,{recursive:true});
const save=()=>writeFile(out+"/report.json",JSON.stringify(report,null,2)+"\n");
const get=async url=>{
 const r=await fetch(url,{redirect:"manual",signal:AbortSignal.timeout(45000),headers:{Accept:"text/html,application/json"}});
 const buf=Buffer.from(await r.arrayBuffer());
 if(buf.length>4*1024*1024)throw Error("Unexpected oversized PSE public QA response");
 return{status:r.status,loc:r.headers.get("location")||"",body:buf.toString("utf8"),type:r.headers.get("content-type")||""};
};
try{
 let sourcesCount=0;
 for(let n=0;n<ids.length;n++){
  const id=ids[n],src=doc.entries.find(x=>x.source_id===id),legacy=sources.articles?.[id];
  if(!src||!legacy||legacy.status!=="quarantined")
   throw Error("Unrecognized owner SQL/legacy article "+id);
  const legacyUrl=new URL(legacy.source_url);
  const oldPath=legacyUrl.pathname,slug=src.slug,target="/"+slug;
  if(!["www.pse.vn","pse.vn"].includes(legacyUrl.hostname)||
     !oldPath.endsWith("/"+id+"-"+slug+".html"))throw Error("Legacy path unexpected "+id);
  const [oldPage,newPage,post]=await Promise.all([
    get(site+oldPath),get(site+target),
    get(admin+"/wp-json/wp/v2/posts/"+targetIds[n]+
      "?_fields=id,status,slug,date,title,content")
  ]);
  let data;try{data=JSON.parse(post.body)}catch{throw Error("Native Post public JSON unreadable "+id)}
  const redirectedPath=oldPage.loc?new URL(oldPage.loc,site).pathname:null;
  const wpTitle=(data?.title?.rendered||"").replace(/<[^>]*>/g,"").trim();
  const h1=(newPage.body.match(/<h1\b[^>]*>([\s\S]{0,1000}?)<\/h1>/i)?.[1]||"")
    .replace(/<[^>]*>/g,"").replace(/\s+/g," ").trim();
  // External image links must stay their original third-party absolute URL.
  const articleHtml=newPage.body.match(/<div\b[^>]*\bid=["']article-content["'][^>]*>([\s\S]*?)(?:<\/section>|<footer|<nav)/i)?.[1]||newPage.body;
  const imageSources=[...articleHtml.matchAll(/<img\b[^>]*\ssrc=["']([^"']+)["']/gi)].map(m=>m[1].replaceAll("&amp;","&"));
  const external=imageSources.filter(url=>{
   try{return allowedHosts.has(new URL(url).hostname)}catch{return false}
  });
  const expected=src.inline_image_src,originalInPage=expected.every((v,i)=>{
   const occurrence=expected.slice(0,i+1).filter(s=>s===v).length;
   return external.filter(s=>s===v).length>=occurrence;
  });
  const originalInWP=expected.every(url=>String(data?.content?.rendered||"").includes(url));
  const good=oldPage.status===301&&redirectedPath===target&&
    newPage.status===200&&newPage.body.includes(slug)&&
    h1.includes(src.title.trim().replace(/\s+/g," ").slice(0,22))&&
    post.status===200&&data?.id===targetIds[n]&&data?.status==="publish"&&
    data.slug===slug&&data.date===src.created_at_joomla.replace(" ","T")&&
    wpTitle.includes(src.title.trim().slice(0,15))&&
    originalInPage&&originalInWP;
  const row={sourceId:id,wpPostId:targetIds[n],canonicalSlug:slug,oldPath,
    expectedRedirect:target,legacyHttp:oldPage.status,redirectTargetPath:redirectedPath,
    canonicalHttp:newPage.status,nativeRestHttp:post.status,nativeStatus:data?.status,
    h1MatchesSource:h1.includes(src.title.trim().replace(/\s+/g," ").slice(0,22)),
    originalThirdPartyMediaOccurrences:expected.length,
    renderedExternalImageOccurrences:external.length,
    allOriginalImgSrcPreserved:originalInPage,originalImgSrcPreservedByWP:originalInWP,
    externalMediaReachabilityVerified:false,readOnly:true,pass:good};
  sourcesCount+=expected.length;
  report.rows.push(row);await save();
  console.log("PSE_TEN_EXTERNAL_LIVE_POST_QA="+JSON.stringify(row));
  if(!good)throw Error("Production old/new original Joomla content or image URL parity failed source "+id);
 }
 if(sourcesCount!==56||report.rows.length!==10)throw Error("Original public source scoped count changed");
 report.summary={sourcePosts:10,canonicalHttp200:10,legacyHttp301:10,
  unchangedOriginalThirdPartySrcOccurrences:sourcesCount,wpNativePublished:10,
  externalImageByteAvailabilityNotAsserted:true,sourceHostedImageCopiesCreated:0,
  wordPressWrites:0,productionParityChecked:true};
 report.result="TEN_ORIGINAL_THIRD_PARTY_SRC_301_POSTS_LIVE_PASS";
 await save();console.log("PSE_TEN_EXTERNAL_LIVE_POST_QA_SUMMARY="+JSON.stringify(report.summary));
}catch(e){
 report.result="FAILED";report.errorType=e?.constructor?.name||"Error";
 await save();throw e;
}
