/**
 * PSE exact 110 imported original Joomla #975 album photos:
 * inspect 16 native JPEG EXIF capture dates (not Joomla publication dates).
 * Source Joomla RSS/Atom 2011-03-05 and com_search 2011-03-06 conflict
 * with event named Oct-2013. EXIF may clarify capture chronology only.
 * WordPress Media source_url original full files, not image CDN previews.
 * Read-only; never infer release day or publish gallery from photo EXIF.
 */
import {mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main")throw Error("Wrong PSE branch");
const wp="https://admin-pse.webnvn.com",pattern=/^pse-gallery-975-[a-f0-9]{16}\.(?:jpe?g|png|webp)$/i;
const report={schema:"pse-975-native-original-photo-capture-exif-chronology-v1",readOnly:true,
 noCmsWrites:true,noBuild:true,sourceId:975,originalEventTitle:"Đại hội công đoàn nhiệm kỳ II 10/2013",
 originalJoomlaFeedDay:"2011-03-05",originalJoomlaComSearchCreatedDay:"2011-03-06",
 dateWarning:"JPEG EXIF capture day is NOT a Joomla article publication day.",
 nativeMediaTotal:null,registryPages:null,matchingNativeGalleryFiles:0,uniqueMedia:0,
 files:[],sampled:0,byCaptureYear:{},summary:null};
async function get(url,timeout=25000){
 const u=new URL(url);
 if(u.origin!==wp||u.username||u.password||u.protocol!=="https:")
 throw Error("Wrong Media origin");
 return fetch(url,{redirect:"manual",signal:AbortSignal.timeout(timeout),
 headers:{Accept:"application/json,image/jpeg,image/png;q=0.8,*/*;q=0.2"}});
}
const req=async page=>{
 const r=await get(wp+"/wp-json/wp/v2/media?status=inherit&per_page=100&page="+page+
  "&orderby=id&order=asc&_fields=id,slug,source_url,mime_type,media_details");
 if(r.status!==200)throw Error("Native public Media page "+page+" HTTP "+r.status);
 const pages=Number(r.headers.get("x-wp-totalpages")),total=Number(r.headers.get("x-wp-total"));
 if(!(pages>=1&&pages<=80&&total>=2500&&total<=9000))throw Error("WP Media page count unexpected "+pages+"/"+total);
 const data=await r.json();if(!Array.isArray(data)||data.length>100)throw Error("Invalid Media data");
 return{pages,total,data};
};
const first=await req(1);
report.nativeMediaTotal=first.total;report.registryPages=first.pages;
const pages=Array(first.pages);pages[0]=first.data;let cursor=2;
await Promise.all(Array.from({length:4},async()=>{for(;;){
 const n=cursor++;if(n>first.pages)return;
 const p=await req(n);if(p.total!==first.total||p.pages!==first.pages)
  throw Error("Unstable WordPress native Media registry");
 pages[n-1]=p.data;
}}));
const native=pages.flat();if(native.length!==first.total||new Set(native.map(x=>x.id)).size!==native.length)
 throw Error("Native WordPress Media page data incomplete");
const candidates=native.filter(m=>pattern.test(String(m.media_details?.file||"").split("/").at(-1)||""))
 .sort((a,b)=>a.id-b.id);
report.matchingNativeGalleryFiles=candidates.length;
report.uniqueMedia=new Set(candidates.map(x=>x.id)).size;
if(candidates.length!==110||report.uniqueMedia!==110)throw Error("Original 975 media cohort not exactly 110");
const samples=[...new Map(Array.from({length:16},(_,i)=>{
 const idx=Math.floor(i*(candidates.length-1)/15);return [candidates[idx].id,candidates[idx]];
})).values()];
function exifJpeg(b){
 const result={hasExif:false,originalCapture:null,originalCaptureYear:null,
  digitizedAt:null,modifiedAt:null,error:null};
 if(b.length<128||b[0]!==0xff||b[1]!==0xd8)return result;
 try{
  let off=2;
  while(off+4<b.length&&b[off]===0xff){
   const mark=b[off+1];
   if(mark===0xda||mark===0xd9)break;
   if(mark===0xd8||mark===0x01||mark>=0xd0&&mark<=0xd7){off+=2;continue}
   const len=b.readUInt16BE(off+2);
   if(len<2||off+2+len>b.length)break;
   if(mark===0xe1&&b.toString("latin1",off+4,off+10)==="Exif\u0000\u0000"){
    result.hasExif=true;
    const base=off+10,limit=off+2+len;
    const isII=b.toString("latin1",base,base+2)==="II";
    const isMM=b.toString("latin1",base,base+2)==="MM";
    if(!isII&&!isMM)break;
    const rd16=k=>{if(k<base||k+2>limit)throw Error("EXIF tag out of bounds");
      return isII?b.readUInt16LE(k):b.readUInt16BE(k)};
    const rd32=k=>{if(k<base||k+4>limit)throw Error("EXIF tag out of bounds");
      return isII?b.readUInt32LE(k):b.readUInt32BE(k)};
    if(rd16(base+2)!==42)break;
    const values=new Map();
    const ifd=(offset)=>{const p=base+offset;
     if(offset<8||p+2>limit)return;
     const count=rd16(p);if(count>300)return;
     for(let n=0;n<count;n++){
      const q=p+2+n*12;if(q+12>limit)break;
      const tag=rd16(q),type=rd16(q+2),bytes=rd32(q+4);
      if(tag===0x8769&&type===4&&bytes===1)values.set(tag,rd32(q+8));
      if((tag===0x9003||tag===0x9004||tag===0x0132)&&type===2&&bytes>=19&&bytes<=40){
       const ptr=bytes<=4?q+8:base+rd32(q+8);
       if(ptr>=base&&ptr+bytes<=limit)
        values.set(tag,b.toString("latin1",ptr,ptr+bytes).replace(/\0/g,"").trim());
      }
     }
    };
    ifd(rd32(base+4));if(Number.isInteger(values.get(0x8769)))ifd(values.get(0x8769));
    const t=v=>/^(?:19|20)\d\d:(?:0[1-9]|1[0-2]):(?:0[1-9]|[12]\d|3[01])\s+\d\d:\d\d:\d\d$/.test(v||"")?v:null;
    result.originalCapture=t(values.get(0x9003));
    result.digitizedAt=t(values.get(0x9004));
    result.modifiedAt=t(values.get(0x0132));
    result.originalCaptureYear=result.originalCapture?.slice(0,4)||null;
    break;
   }
   off+=len+2;
  }
 }catch(e){result.error=String(e?.message||"EXIF parser").slice(0,90)}
 return result;
}
let i=0;await Promise.all(Array.from({length:3},async()=>{for(;;){
 const idx=i++;if(idx>=samples.length)return;
 const m=samples[idx],u=new URL(m.source_url||"",wp);
 if(u.origin!==wp||!u.pathname.startsWith("/wp-content/uploads/")||
  !pattern.test(u.pathname.split("/").at(-1)))throw Error("Misidentified PSE gallery original file");
 const row={mediaId:m.id,basename:u.pathname.split("/").at(-1),
  wpMime:m.mime_type,dimensions:[m.media_details?.width||null,m.media_details?.height||null],
  sourceHttp:null,bytes:null,sha256:null,hasExif:false,originalCapture:null,
  originalCaptureYear:null,digitizedAt:null,modifiedAt:null,error:null};
 report.files.push(row);
 try{
  const resp=await get(u.href,25000);row.sourceHttp=resp.status;
  const length=Number(resp.headers.get("content-length")||0);
  if(resp.status!==200||length>10000000)throw Error("Original WP Media binary unavailable or oversized");
  const buf=Buffer.from(await resp.arrayBuffer());
  if(buf.length<1000||buf.length>10000000)throw Error("Invalid original image length");
  row.bytes=buf.length;row.sha256=createHash("sha256").update(buf).digest("hex");
  const metadata=exifJpeg(buf);
  Object.assign(row,{hasExif:metadata.hasExif,originalCapture:metadata.originalCapture,
   originalCaptureYear:metadata.originalCaptureYear,digitizedAt:metadata.digitizedAt,
   modifiedAt:metadata.modifiedAt,error:metadata.error});
 }catch(e){row.error=String(e?.name||e?.message||"network").slice(0,90)}
}}));
report.files.sort((a,b)=>a.mediaId-b.mediaId);
report.sampled=report.files.length;
for(const f of report.files)if(f.originalCaptureYear)
 report.byCaptureYear[f.originalCaptureYear]=(report.byCaptureYear[f.originalCaptureYear]||0)+1;
report.summary={originalCohort:110,fullWordPressMediaCount:first.total,
 sampleCount:report.sampled,validBinary:report.files.filter(f=>f.sourceHttp===200&&f.sha256).length,
 exifPresent:report.files.filter(f=>f.hasExif).length,
 exactCaptureDatePresent:report.files.filter(f=>f.originalCapture).length,
 byCaptureYear:report.byCaptureYear,
 decision:"EXIF_ONLY_PHOTO_CAPTURE_NOT_JOOMLA_PUBLICATION_DATE",
 noCmsWrites:true,noBuild:true};
console.log("PSE_975_EXIF_MEDIA_CHRONOLOGY="+JSON.stringify(report.summary));
for(const row of report.files)if(row.originalCapture||row.error)
 console.log("PSE_975_EXIF_PHOTO="+JSON.stringify({id:row.mediaId,originalCapture:row.originalCapture,
    hasExif:row.hasExif,error:row.error}));
await mkdir("artifacts/pse-975-original-exif",{recursive:true});
await writeFile("artifacts/pse-975-original-exif/report.json",JSON.stringify(report,null,2)+"\n");
