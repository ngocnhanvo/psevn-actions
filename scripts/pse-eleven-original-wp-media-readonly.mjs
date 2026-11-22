/** Read-only filename evidence across existing native WordPress Media for 59 owner SQL images.
 * Exact filename is only candidate reuse; never publish or modify CMS automatically.
 */
import {readFile,mkdir,writeFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong repository");
const doc=JSON.parse(await readFile("docs/source/pse-original-public-articles-11-2026-11-22.json","utf8"));
if(doc.schema!=="pse-original-joomla-selected-public-articles-v1"||
 JSON.stringify(doc.source_ids)!==JSON.stringify([114,121,127,178,186,196,202,237,341,382,1090])||
 doc.entries?.length!==11)throw Error("Unexpected owner public SQL article fixture");
const rows=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const u=rows.filter(x=>x.startsWith("WC_URL="));
if(u.length!==1)throw Error("Missing WC_URL WP origin");
const origin=new URL(u[0].slice(7).replace(/^['"]|['"]$/g,""));
if(origin.protocol!=="https:"||origin.username||origin.password||origin.port||origin.search||origin.hash||!["","/"].includes(origin.pathname)||
 !["admin-pse.webnvn.com","pse.webnvn.com"].includes(origin.hostname))throw Error("WP origin not the scoped PSE backend");
const all=[];
for(const entry of doc.entries){
 for(let i=0;i<entry.inline_image_src.length;i++){
  const source=entry.inline_image_src[i];
  let name;
  try{name=decodeURIComponent(new URL(source, "https://pse.vn/").pathname.split("/").at(-1))}catch{throw Error("Invalid public photo URL")}
  if(!name||name.length>200||!(/\.(?:jpe?g|png|gif|webp)$/i).test(name))throw Error("Untrusted original filename");
  all.push({id:entry.source_id,media_order:i+1,filename:name});
 }
}
if(all.length!==59)throw Error("Unexpected count of public article original image occurrences");
const distinct=[...new Set(all.map(x=>x.filename.toLowerCase()))];
const results=new Map();
const cleanFile=s=>{try{return decodeURIComponent(s.split("?")[0].split("/").at(-1)||"").toLowerCase()}catch{return ""}};
const report={schema:"pse-eleven-original-native-wordpress-media-leads-v1",readOnly:true,noWpWrites:true,noSourceWrites:true,images:[],summary:{}};
let cursor=0;
const normalizedBasename=s=>cleanFile(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/[^a-z0-9]/g,"");
async function lookup(filename){
 const stem=filename.replace(/\.[^.]+$/,"");
 const search=stem.replace(/[_()-]+/g," ").trim();
 const uri=new URL(origin.origin+"/wp-json/wp/v2/media");
 uri.searchParams.set("search",search);
 uri.searchParams.set("per_page","100");
 uri.searchParams.set("_fields","id,slug,source_url,media_details");
 const out={filename,query:search,restStatus:null,mediaCandidates:[],possiblyTruncated:false,pagesInspected:0,status:""};
 try{
  let totalPages=1;
  const seen=new Set();
  const maxPages=12; // Bounded. If WP has more, explicitly report incomplete.
  for(let page=1;page<=Math.min(totalPages,maxPages);page++){
   uri.searchParams.set("page",String(page));
   const res=await fetch(uri,{redirect:"manual",signal:AbortSignal.timeout(25000),headers:{Accept:"application/json"}});
   out.restStatus=res.status;
   if(res.status!==200){out.status="WP_MEDIA_LOOKUP_UNAVAILABLE";return out}
   if(page===1){
    totalPages=Number(res.headers.get("x-wp-totalpages")||"1");
    if(!Number.isSafeInteger(totalPages)||totalPages<1)throw Error("Invalid WordPress media page count");
   }
   const list=await res.json();
   if(!Array.isArray(list)||list.length>100)throw Error("unexpected WordPress media response");
   out.pagesInspected++;
   for(const x of list){
    const path=String(x.media_details?.file||"");
    const itemName=cleanFile(path)||cleanFile(x.source_url||"");
    const exact=itemName===filename;
    const similar=!exact&&normalizedBasename(itemName)===normalizedBasename(filename);
    if((exact||similar)&&!seen.has(x.id)){
     seen.add(x.id);
     out.mediaCandidates.push({id:x.id,fileBasename:itemName,matchClass:exact?"EXACT_BASENAME":"SIMILAR_BASENAME_ONLY"});
    }
   }
  }
  out.possiblyTruncated=out.pagesInspected<totalPages;
  out.status=out.mediaCandidates.length?"POSSIBLE_MEDIA_REUSE_NEEDS_BYTE_PROOF":out.possiblyTruncated?"SEARCH_RESULTS_INCOMPLETE":"NO_MATCH_IN_PUBLIC_MEDIA_SEARCH";
 }catch(e){out.status="WP_MEDIA_LOOKUP_UNAVAILABLE";out.error=String(e?.name||"network").slice(0,60)}
 return out;
}

try{
 await Promise.all(Array.from({length:3},async()=>{
  for(;;){const i=cursor++;if(i>=distinct.length)break;
   const filename=distinct[i];const found=await lookup(filename);results.set(filename,found);
   console.log("PSE_WP_EXISTING_MEDIA_NAME="+JSON.stringify({file:filename,status:found.status,candidates:found.mediaCandidates.length,truncated:found.possiblyTruncated}));
  }
 }));
 for(const image of all)report.images.push({...image,result:results.get(image.filename.toLowerCase())});
 report.summary={originalImageOccurrences:59,uniqueImageBasenames:distinct.length,
  filenamesWithPotentialMediaReuse:[...results.values()].filter(v=>v.mediaCandidates.length).length,
  unavailableQueries:[...results.values()].filter(v=>v.status==="WP_MEDIA_LOOKUP_UNAVAILABLE").length,
  incompleteQueries:[...results.values()].filter(v=>v.possiblyTruncated).length,
  noWordPressWrites:true,mediaBytesVerified:false};
 console.log("PSE_ELEVEN_WP_EXISTING_MEDIA_AUDIT="+JSON.stringify(report.summary));
}finally{
 await mkdir("artifacts/pse-eleven-existing-wp-media",{recursive:true});
 await writeFile("artifacts/pse-eleven-existing-wp-media/report.json",JSON.stringify(report,null,2)+"\n");
}
