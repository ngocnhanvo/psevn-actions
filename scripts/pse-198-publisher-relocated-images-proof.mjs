// Read-only publisher relocation evidence, NOT original byte parity.
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions") throw Error("Wrong repository");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified||state.articles?.["198"]?.status!=="quarantined")throw Error("Source identity changed");
const publisher="https://dpm.vn/tin-tuc/nha-may-dam-phu-my-don-tan-san-pham-ure-thu-5-trieu-1954";
const root="https://dpm.vn/static/upload/users/dpm.vn/2011/08-13/";
const files=["E1","E2","E3","E4","E5","E5_1","E6","E7","E8","E9"].map(x=>"110814 "+x+".jpg");
const out="artifacts/pse-198-publisher-relocation";
const report={schema:"pse-198-publisher-relocation-proof-v1",sourceId:198,publisher,originalUrls:files.map(f=>"http://dpm.vn/Portals/0/"+encodeURIComponent(f)),rows:[],publisherHttp:null,publisherTitleConfirmed:false,stopped:false,readOnly:true,noCMSWrites:true,noBuild:true,originalByteParityNotVerified:true};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const get=async url=>{if(new URL(url).origin!=="https://dpm.vn")throw Error("Unexpected host");return fetch(url,{redirect:"manual",signal:AbortSignal.timeout(16000)})};
const max=8*1024*1024;
await mkdir(out,{recursive:true});
try {
 const page=await get(publisher);report.publisherHttp=page.status;
 if(page.status!==200){report.stopped=true;throw Error("Publisher article unavailable");}
 const html=await page.text();
 if(html.length>3000000)throw Error("Unexpected article size");
 report.publisherTitleConfirmed=/Nhà máy Đạm Phú Mỹ đón tấn sản phẩm urê thứ 5 triệu/i.test(html);
 if(!report.publisherTitleConfirmed)throw Error("Publisher title not verified");
 const normalized=html.replace(/&amp;/g,"&");
 for(const filename of files){
  const url=root+encodeURIComponent(filename);
  const path=new URL(url).pathname;
  const row={filename,sourceUrl:"http://dpm.vn/Portals/0/"+encodeURIComponent(filename),candidate:url,linkedByPublisherArticle:normalized.includes(path)||normalized.includes(decodeURIComponent(path)),http:null,validJpeg:false,sha256:null,bytes:0,decision:"NOT_CHECKED"};
  report.rows.push(row);
  try {
   const res=await get(url);row.http=res.status;
   if([429,502,503,504].includes(res.status)){report.stopped=true;row.decision="RATE_OR_CONNECTIVITY_GUARD";break;}
   if(res.status!==200){row.decision="HTTP_"+res.status;}
   else {
    const size=Number(res.headers.get("content-length")||0);
    if(size>max){row.decision="SIZE_LIMIT";}
    else{
     const chunks=[];let bytes=0;
     for await(const chunk of res.body){bytes+=chunk.length;if(bytes>max)throw Error("SIZE_LIMIT");chunks.push(Buffer.from(chunk));}
     const b=Buffer.concat(chunks);row.bytes=b.length;
     row.validJpeg=b.length>100&&b[0]===255&&b[1]===216&&b[2]===255&&b[b.length-2]===255&&b[b.length-1]===217;
     row.contentType=res.headers.get("content-type");
     if(row.validJpeg){row.sha256=createHash("sha256").update(b).digest("hex");row.decision=row.linkedByPublisherArticle?"SAME_PUBLISHER_ARTICLE_LINKED_FILENAME":"RELOCATED_FILENAME_LEAD_ONLY";await writeFile(out+"/"+filename,b);}
     else row.decision="NOT_JPEG";
    }
   }
  }catch(e){row.error=String(e?.name||"Error");row.decision="DOWNLOAD_ERROR";report.stopped=true;}
  console.log("PSE_198_PUBLISHER_RELOCATION_ROW="+JSON.stringify(row));
  if(report.stopped)break;
  await sleep(1000);
 }
}finally{
 report.summary={expected:files.length,checked:report.rows.length,validJpeg:report.rows.filter(x=>x.validJpeg).length,linkedByPublisherArticleVerified:report.rows.filter(x=>x.validJpeg&&x.linkedByPublisherArticle).length,stopped:report.stopped,originalByteParityNotVerified:true,noCMSWrites:true};
 await writeFile(out+"/report.json",JSON.stringify(report,null,2)+"\n");
 console.log("PSE_198_PUBLISHER_RELOCATION_SUMMARY="+JSON.stringify(report.summary));
}
