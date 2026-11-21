/** Independent GET-only Joomla RSS/Atom evidence for source #975 and #379.
 * A feed timestamp is a review candidate, never an automatic WordPress date.
 */
import {mkdir,writeFile} from "node:fs/promises";

if (process.env.GITHUB_REPOSITORY !== "ngocnhanvo/psevn-actions")
  throw new Error("Wrong repository");
const sources = [
  {id:975, path:"/tin-tuc-su-kien/thu-vien/anh/975-dai-hoi-cong-doan-nhiem-ky-ii-10-2013.html",
   category:"/tin-tuc-su-kien/thu-vien/anh"},
  {id:379, path:"/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/379-pvfcco-se-to-chuc-tham-quan-phong-truyen-thong-pvfcco.html",
   category:"/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop"}
];
const base="https://www.pse.vn";
const dexml=s=>String(s||"").replace(/^<!\[CDATA\[|\]\]>$/g,"")
  .replace(/&amp;/g,"&").replace(/&#38;/g,"&").replace(/&quot;/g,'"').trim();
const field=(block,tag)=>dexml(block.match(new RegExp("<"+tag+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+tag+">","i"))?.[1]||"");
const report={schema:"pse-exact-original-joomla-feed-date-evidence-v1",readOnly:true,
  noCmsWrites:true,noBuild:true,rows:[]};
for(const source of sources){
  const variantUrls=[
    base+source.category+".feed?type=rss&limit=1000",
    base+source.category+".feed?type=atom&limit=1000",
    base+source.category+"?format=feed&type=rss&limit=1000",
    base+source.category+"?format=feed&type=atom&limit=1000"
  ];
  const row={id:source.id,sourceUrl:base+source.path,feedChecks:[],exactItems:[],
    originalPublishedDayCandidates:[],decision:"NO_EXACT_SOURCE_FEED_DATE"};
  for(const url of variantUrls){
    const check={url,http:null,contentType:null,exactMatches:0,reason:null};
    row.feedChecks.push(check);
    try{
      const res=await fetch(url,{signal:AbortSignal.timeout(19000),redirect:"manual",
        headers:{Accept:"application/rss+xml, application/atom+xml, application/xml, text/xml"}});
      check.http=res.status;
      check.contentType=String(res.headers.get("content-type")||"").slice(0,80);
      if(res.status!==200){check.reason="HTTP_"+res.status;continue}
      if(!/xml|rss|atom/i.test(check.contentType)){check.reason="NOT_XML";continue}
      const xml=await res.text();
      if(xml.length<80||xml.length>8000000){check.reason="UNEXPECTED_SIZE";continue}
      const blocks=[...(xml.match(/<item\b[\s\S]*?<\/item>/gi)||[]),
        ...(xml.match(/<entry\b[\s\S]*?<\/entry>/gi)||[])];
      check.totalItems=blocks.length;
      for(const item of blocks){
        let link=field(item,"link");
        if(!link){link=dexml(item.match(/<link\b[^>]*href=["']([^"']+)["']/i)?.[1]||"")}
        let uri;try{uri=new URL(link,base)}catch{continue}
        if(!["www.pse.vn","pse.vn"].includes(uri.hostname)||
          uri.pathname!==source.path)continue;
        check.exactMatches++;
        const rawDate=field(item,"pubDate")||field(item,"published")||field(item,"updated");
        const when=new Date(rawDate);
        const day=rawDate&&Number.isFinite(when.getTime())?when.toISOString().slice(0,10):null;
        const record={feed:url,link:uri.href,title:field(item,"title").slice(0,220),
          rawDate:rawDate.slice(0,120),day,
          dateKind:/<pubDate\b/i.test(item)?"rss_pubDate":
            /<published\b/i.test(item)?"atom_published":"atom_updated_only"};
        if(day&&day>="2000-01-01"&&day<="2026-11-21"&&
          record.dateKind!=="atom_updated_only")row.originalPublishedDayCandidates.push(day);
        row.exactItems.push(record);
      }
      if(!check.exactMatches)check.reason="EXACT_SOURCE_ITEM_NOT_FOUND";
    }catch(e){check.reason="SOURCE_FEED_UNAVAILABLE";
      check.error=String(e?.name||"network").slice(0,70)}
    console.log("PSE_FEED_SOURCE_CHECK="+JSON.stringify({id:source.id,...check}));
  }
  const days=[...new Set(row.originalPublishedDayCandidates)];
  if(days.length===1)row.decision="EXACT_JOOMLA_FEED_PUBLICATION_DAY_CANDIDATE_MANUAL_REVIEW";
  else if(days.length>1)row.decision="ORIGINAL_FEED_DATE_CONFLICT";
  report.rows.push(row);
  console.log("PSE_EXACT_ORIGINAL_FEED_DATE="+JSON.stringify({id:source.id,
    exactItems:row.exactItems.length,days,decision:row.decision,noCmsWrites:true}));
}
await mkdir("artifacts/pse-original-feed-date",{recursive:true});
await writeFile("artifacts/pse-original-feed-date/report.json",JSON.stringify(report,null,2)+"\n");
console.log("PSE_SOURCE_FEED_DATE_AUDIT=COMPLETE readOnly=true noBuild=true");
