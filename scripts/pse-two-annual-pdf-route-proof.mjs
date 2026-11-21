/** PSE two native annual report PDF links: exact frontend proxy vs WordPress original byte identity. READ ONLY. */
import {createHash} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Unexpected repository");
const cms="https://admin-pse.webnvn.com",front="https://pse.webnvn.com";
const files=[
 {wpId:82410,sourceId:1259,slug:"bao-cao-thuong-nien-2016",file:"/wp-content/uploads/2026/10/pse-legacy-bcf327da931e56e4.pdf"},
 {wpId:82777,sourceId:1092,slug:"bao-cao-thuong-nien-2014",file:"/wp-content/uploads/2026/11/PSE_2015.3.18_9a1940e_18-_BCTN_2014.pdf"}
];
const limit=30_000_000;
const sha=b=>createHash("sha256").update(b).digest("hex");
async function probe(url,binary=false){
 const u=new URL(url);
 if(![cms,front].includes(u.origin)||u.protocol!=="https:"||u.username||u.password)throw Error("Non-PSE URL");
 const row={url,headStatus:null,headContentType:null,headLocation:null,contentLength:null,
  getStatus:null,getType:null,bytes:0,pdfValid:false,sha256:null,error:null};
 try{
  const r=await fetch(url,{method:"HEAD",redirect:"manual",signal:AbortSignal.timeout(22000)});
  row.headStatus=r.status;row.headContentType=r.headers.get("content-type")||null;
  row.headLocation=r.headers.get("location")||null;
  row.contentLength=Number(r.headers.get("content-length")||0)||null;
  if(binary&&row.headStatus===200&&(!row.contentLength||row.contentLength<=limit)){
   const g=await fetch(url,{redirect:"manual",signal:AbortSignal.timeout(35000),
    headers:{Accept:"application/pdf,*/*;q=0.2"}});
   row.getStatus=g.status;row.getType=g.headers.get("content-type")||null;
   const headerLength=Number(g.headers.get("content-length")||0);
   if(g.status===200&&headerLength<=limit){
    const stream=g.body?.getReader();if(!stream)throw Error("No binary stream");
    let n=0,parts=[];
    for(;;){
     const {done,value}=await stream.read();if(done)break;
     n+=value.byteLength;if(n>limit){await stream.cancel();throw Error("Binary size over cap")}
     parts.push(Buffer.from(value));
    }
    const bytes=Buffer.concat(parts);
    row.bytes=bytes.length;
    row.pdfValid=bytes.length>500&&bytes.subarray(0,5).toString("ascii")==="%PDF-";
    if(row.pdfValid)row.sha256=sha(bytes);
   }
  }
 }catch(e){row.error=String(e?.name||e?.message||"network").slice(0,140)}
 return row;
}
const audit={schema:"pse-two-broken-admin-api-files-annual-report-asset-original-sha-v1",
 readOnly:true,noCmsWrites:true,noBuild:true,checks:[],summary:{}};
for(const row of files){
 const postUrl=cms+"/wp-json/wp/v2/posts/"+row.wpId+"?_fields=id,slug,status,title,content,categories";
 const p=await fetch(postUrl,{signal:AbortSignal.timeout(25000)});
 if(p.status!==200)throw Error("Native WP Post unavailable "+row.wpId);
 const post=await p.json();
 if(post.id!==row.wpId||post.slug!==row.slug||post.status!=="publish"||
  !Array.isArray(post.categories)||post.categories.length===0)throw Error("Unexpected WordPress owner "+row.wpId);
 const wrong=cms+"/api/files"+row.file;
 const correct=front+"/api/files"+row.file;
 const native=cms+row.file;
 const originalHtml=String(post.content?.rendered||"");
 const refs=[...originalHtml.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)].map(m=>m[1]);
 const originalRefs=refs.filter(raw=>{try{return new URL(raw.replace(/&amp;/gi,"&"),cms).href===wrong}catch{return false}});
 const occurrences=originalRefs.length;
 if(occurrences!==1)throw Error("Unexpected exact link identity "+row.wpId+"="+occurrences+
  " refs="+JSON.stringify(refs.slice(0,8)).slice(0,800));
 const [old,frontend,wordpress]=await Promise.all([
  probe(wrong),probe(correct,true),probe(native,true)
 ]);
 const equal=!!frontend.sha256&&!!wordpress.sha256&&
  frontend.sha256===wordpress.sha256&&frontend.bytes===wordpress.bytes;
 const status=old.headStatus===404&&frontend.getStatus===200&&frontend.pdfValid&&
  wordpress.getStatus===200&&wordpress.pdfValid&&equal?
   "EXACT_BINARY_IDENTICAL_FRONTEND_PROXY_REPLACEMENT_CANDIDATE":
   "PDF_TARGET_ROUTE_OR_BINARY_NOT_PROVEN";
 const item={...row,title:String(post.title?.rendered||"").replace(/<[^>]+>/g,"").slice(0,140),
  originalHtmlOccurrence:occurrences,wrongOriginal:old,frontendProxy:frontend,nativeWordPress:wordpress,
  shaAndLengthEqual:equal,decision:status,noWrites:true};
 audit.checks.push(item);
 console.log("PSE_TWO_ANNUAL_PDF_ROUTE_PROOF="+JSON.stringify(item).slice(0,8800));
}
audit.summary={tested:files.length,
 perfect: audit.checks.filter(x=>x.decision==="EXACT_BINARY_IDENTICAL_FRONTEND_PROXY_REPLACEMENT_CANDIDATE").map(x=>x.wpId),
 needsReview:audit.checks.filter(x=>x.decision!=="EXACT_BINARY_IDENTICAL_FRONTEND_PROXY_REPLACEMENT_CANDIDATE").map(x=>x.wpId),
 readOnly:true,noCMSWrites:true,noBuild:true};
console.log("PSE_TWO_ANNUAL_PDF_SOURCE_SHA_SUMMARY="+JSON.stringify(audit.summary));
await mkdir("artifacts/pse-two-annual-pdf-routes",{recursive:true});
await writeFile("artifacts/pse-two-annual-pdf-routes/report.json",JSON.stringify(audit,null,2)+"\n");
