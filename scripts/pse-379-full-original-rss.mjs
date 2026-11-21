/** Exact, independent RSS pubDate oracle for historic Joomla Tin tổng hợp.
 * Uses source category's verified pagination limitstart; GET only, no WP writes.
 */
import {mkdir,writeFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong repository");
const origin="https://www.pse.vn";
const category="/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop";
const targets=new Set([186,196,198,202,237,379,382,1090]);
const expected379="/379-pvfcco-se-to-chuc-tham-quan-phong-truyen-thong-pvfcco.html";
const sourceDate=s=>{
  if(!s)return null;
  const d=new Date(s);
  return Number.isFinite(d.getTime())?{
    iso:d.toISOString(),
    dayUTC:d.toISOString().slice(0,10),
    dayVietnam:d.toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"})
  }:null;
};
const xmlValue=(item,name)=>String(item.match(new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+name+">","i"))?.[1]||"")
  .replace(/^<!\[CDATA\[|\]\]>$/g,"").replace(/&amp;/g,"&").trim();
const offsets=Array.from({length:34},(_,i)=>i*10);
const report={schema:"pse-exact-original-joomla-tin-tong-hop-rss-pagination-v1",
  readOnly:true,noCmsWrites:true,noBuild:true,category:origin+category,offsets:[],targetRows:[],summary:null};
let pos=0;
async function task(offset){
  const link=new URL(origin+category);
  link.searchParams.set("format","feed");link.searchParams.set("type","rss");link.searchParams.set("limitstart",String(offset));
  const out={offset,url:link.href,http:null,items:[],error:null};
  for(let attempt=1;attempt<=2;attempt++){
    try{
      const response=await fetch(link.href,{signal:AbortSignal.timeout(23000),redirect:"manual",
        headers:{Accept:"application/rss+xml, application/xml, text/xml"}});
      out.http=response.status;
      const type=String(response.headers.get("content-type")||"");
      if(response.status!==200||!/xml|rss/i.test(type))throw Error("Unexpected feed HTTP/type "+response.status+" "+type.slice(0,40));
      const data=await response.text();
      if(data.length<100||data.length>8000000)throw Error("Unreasonable feed size");
      for(const item of data.match(/<item\b[\s\S]*?<\/item>/gi)||[]){
        const linkRaw=xmlValue(item,"link");
        let u;try{u=new URL(linkRaw,origin)}catch{continue}
        if(!["www.pse.vn","pse.vn"].includes(u.hostname)||!u.pathname.startsWith(category+"/"))continue;
        const id=Number(u.pathname.match(/\/(\d+)-[^/]+\.html$/)?.[1]||0);
        if(!Number.isInteger(id)||id<=0)continue;
        const pubDate=xmlValue(item,"pubDate");
        out.items.push({id,url:u.href,path:u.pathname,title:xmlValue(item,"title").slice(0,250),
          rawPubDate:pubDate.slice(0,120),date:sourceDate(pubDate)});
      }
      out.error=null;
      break;
    }catch(e){
      out.items=[];out.error=String(e?.message||e?.name||"source unavailable").slice(0,110);
      if(attempt<2)await new Promise(r=>setTimeout(r,600));
    }
  }
  const hit=out.items.filter(e=>targets.has(e.id));
  console.log("PSE_SOURCE_RSS_PAGE="+JSON.stringify({offset,http:out.http,items:out.items.length,
    firstId:out.items[0]?.id||null,lastId:out.items.at(-1)?.id||null,
    hits:hit.map(v=>({id:v.id,day:v.date?.dayVietnam,title:v.title})),error:out.error}));
  return out;
}
const results=[];
const workers=Array.from({length:4},async()=>{
  while(pos<offsets.length){
    const i=pos++;
    results.push(await task(offsets[i]));
  }
});
await Promise.all(workers);
results.sort((a,b)=>a.offset-b.offset);
report.offsets=results.map(({offset,url,http,items,error})=>({offset,url,http,itemCount:items.length,error,
  firstId:items[0]?.id||null,lastId:items.at(-1)?.id||null}));
const all=results.flatMap(x=>x.items),unique=new Map(all.map(x=>[x.path,x]));
report.targetRows=[...unique.values()].filter(r=>targets.has(r.id));
report.article379=report.targetRows.find(r=>r.id===379&&r.path.endsWith(expected379))||null;
report.summary={sourcePagesChecked:results.length,fullyReadPages:results.filter(x=>x.http===200&&!x.error).length,
  totalListed:all.length,uniquePaths:unique.size,duplicatePaths:all.length-unique.size,
  exactTargetIds:report.targetRows.map(x=>x.id),exact379Found:!!report.article379,
  original379LocalPublishedDay:report.article379?.date?.dayVietnam||null,
  safeForNativePublication:false,
  decision:report.article379?.date?"EXACT_FEED_PUBDATE_CANDIDATE_CHECK_NATIVE_DRAFT_AND_MEDIA":
      "NO_EXACT_379_FEED_PUBDATE"};
console.log("PSE_379_FULL_ORIGINAL_RSS_SUMMARY="+JSON.stringify(report.summary));
console.log("PSE_379_FULL_ORIGINAL_RSS_MATCHES="+JSON.stringify(report.targetRows));
await mkdir("artifacts/pse-379-full-rss",{recursive:true});
await writeFile("artifacts/pse-379-full-rss/report.json",JSON.stringify(report,null,2)+"\n");
