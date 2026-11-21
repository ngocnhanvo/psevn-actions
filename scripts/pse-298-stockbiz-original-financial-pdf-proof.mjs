/** PSE 2012 semiannual reviewed financial statements alternative provenance;
 * Stockbiz archive, NOT claimed binary identical to dead original MediaFire.
 * Read-only strict original issuer/period/report identity proof.
 */
import {mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong PSE repository");
const original="http://www.mediafire.com/file/mn5v49y1db5me3h/scan0001.pdf";
const base="https://web.stockbiz.vn",cms="https://admin-pse.webnvn.com";
const listing=base+"/Stocks/PSE/Downloads.aspx",name="PSE-12-Q2-Audited Financial Statements.pdf";
const target=base+"/Handlers/DownloadFinancialStatement.ashx?FileName="+encodeURIComponent(name);
const audit={schema:"pse-298-reviewed-2012-third-party-archived-pdf-v1",readOnly:true,noCmsWrites:true,noBuild:true,
 sourcePostId:298,wpPostId:82548,oldMediafire:original,alternative:{sourceListing:listing,url:target,fileName:name,
 originalMediafireByteEquality:"UNVERIFIABLE",publisher:"Stockbiz financial report archive"},errors:[],summary:null};
async function download(url,limit=30_000_000){
 const res=await fetch(url,{signal:AbortSignal.timeout(60000),redirect:"manual",headers:{Accept:"application/pdf,*/*;q=0.1"}});
 if(res.status!==200)throw Error("Source PDF HTTP "+res.status);
 const mime=String(res.headers.get("content-type")||"").toLowerCase();
 if(!mime.includes("application/pdf")&&!mime.includes("application/octet-stream"))throw Error("Source file not PDF "+mime);
 const declared=Number(res.headers.get("content-length")||0);
 if(declared>limit)throw Error("Source PDF oversized");
 const reader=res.body?.getReader();if(!reader)throw Error("No source PDF body");
 let bytes=0,parts=[];
 for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;
  if(bytes>limit){await reader.cancel();throw Error("PDF over size cap")}
  parts.push(Buffer.from(value));
 }
 const buf=Buffer.concat(parts);
 if(buf.length<10_000||buf.subarray(0,5).toString("ascii")!=="%PDF-"||
  !buf.subarray(Math.max(0,buf.length-2048)).toString("latin1").includes("%%EOF"))
  throw Error("Alternative report lacks PDF signature or EOF");
 return{bytes:buf.length,sha256:createHash("sha256").update(buf).digest("hex"),
  mime,head:buf.subarray(0,8).toString("ascii")};
}
try{
 const src=await fetch(listing,{signal:AbortSignal.timeout(30000),redirect:"manual"});
 audit.alternative.listingHttp=src.status;
 if(src.status!==200)throw Error("Stockbiz PSE archive unavailable");
 const html=await src.text();
 audit.alternative.listingMentionsExactName=html.includes(name)||
  html.includes(name.replaceAll(" ","+"))||
  html.includes(name.replaceAll(" ","%20"));
 audit.alternative.listingMentionsPSE=html.includes("PSE");
 if(!audit.alternative.listingMentionsExactName||!audit.alternative.listingMentionsPSE)
  throw Error("Stockbiz PSE archive list does not identify exact 2012 report");
 audit.alternative.document=await download(target);
 const post=await fetch(cms+"/wp-json/wp/v2/posts/82548?_fields=id,slug,status,title,content,categories,date",{signal:AbortSignal.timeout(24000)});
 if(post.status!==200)throw Error("Native exact WP original report absent");
 const p=await post.json();
 if(p.id!==82548||p.status!=="publish"||!Array.isArray(p.categories)||
  !p.categories.includes(1754)||!String(p.content?.rendered||"").includes(original))
  throw Error("Current PSE native finance Post changed/unexpected old link");
 audit.originalWordPress={id:p.id,slug:p.slug,date:p.date,contentChars:p.content.rendered.length,
  oldMediafireLinkPresent:true,financeCategory1754:true};
 const m=await fetch(cms+"/wp-json/wp/v2/media?search="+encodeURIComponent("PSE-12-Q2-Audited")+
  "&per_page=100&_fields=id,source_url,mime_type,media_details",{signal:AbortSignal.timeout(25000)});
 audit.mediaSearchHttp=m.status;
 if(m.status!==200)throw Error("Existing WordPress Media search unavailable");
 const media=await m.json();
 if(!Array.isArray(media))throw Error("WP Media results invalid");
 audit.candidates=media.filter(x=>String(x.mime_type).toLowerCase()==="application/pdf")
  .map(x=>({id:x.id,path:String(x.media_details?.file||"").slice(0,180),url:x.source_url})).slice(0,25);
 audit.summary={sourcePostId:298,nativeWpId:82548,pdfRetrieved:true,
  bytes:audit.alternative.document.bytes,sha256:audit.alternative.document.sha256,
  exactSourceOriginalBinaryAvailable:false,mediaCandidates:audit.candidates.length,
  decision:"THIRD_PARTY_2012_REVIEWED_REPORT_ALTERNATIVE_PROVENANCE_READY_FOR_SCOPED_CMS_REVIEW",
  noCmsWrites:true,noBuild:true};
}catch(e){
 audit.errors.push(String(e?.message||e));
 audit.summary={decision:"SOURCE_ALTERNATIVE_PROOF_UNAVAILABLE",error:audit.errors[0],
  noCmsWrites:true,noBuild:true};
}
console.log("PSE_298_STOCKBIZ_ALTERNATIVE_PDF="+JSON.stringify({
 ...audit.summary,stockbizListingHttp:audit.alternative.listingHttp,
 listingNameMatched:audit.alternative.listingMentionsExactName,
 candidates:audit.candidates||[]}).slice(0,7000));
await mkdir("artifacts/pse-298-2012-reviewed-alternative",{recursive:true});
await writeFile("artifacts/pse-298-2012-reviewed-alternative/report.json",JSON.stringify(audit,null,2)+"\n");
if(audit.errors.length)process.exitCode=1;
