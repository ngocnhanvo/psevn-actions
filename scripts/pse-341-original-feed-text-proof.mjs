/**
 * Original Joomla #341 exact category RSS/Atom content oracle, GET ONLY.
 * Never publish a feed description unless verified as native source text.
 */
import {writeFile,mkdir} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong PSE repository");
const original="https://www.pse.vn";
const category="/hoat-dong-kinh-doanh/thong-tin-thi-truong";
const target=category+"/341-du-nuoc-tuoi-cho-633000-ha-lua-xuan-2013.html";
const variants=[
 category+"?format=feed&type=rss&limit=1000",
 category+"?format=feed&type=atom&limit=1000",
 category+"?format=feed&type=rss",
 category+"?format=feed&type=atom",
 category+".feed?type=rss&limit=1000",
 category+".feed?type=atom&limit=1000"
];
const decode=s=>String(s||"").replace(/^<!\[CDATA\[|\]\]>$/g,"").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'");
const tag=(xml,key)=>decode(xml.match(new RegExp("<"+key+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+key+">","i"))?.[1]);
const text=s=>decode(s).replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
const report={schema:"pse-source-341-exact-feed-content-oracle-v1",readOnly:true,noCmsWrites:true,noBuild:true,
 sourceUrl:original+target,feeds:[],matches:[],summary:null};
for(const variant of variants){
 const url=new URL(variant,original),entry={url:url.href,http:null,contentType:null,items:0,matches:[],reason:null};
 try{
  const res=await fetch(url.href,{headers:{Accept:"application/rss+xml, application/atom+xml, text/xml, application/xml"},
   redirect:"manual",signal:AbortSignal.timeout(24000)});
  entry.http=res.status;entry.contentType=(res.headers.get("content-type")||"").slice(0,100);
  if(res.status!==200||!/rss|xml|atom/i.test(entry.contentType)){entry.reason="HTTP_OR_FORMAT";continue}
  const xml=await res.text();
  if(xml.length<150||xml.length>9000000){entry.reason="SOURCE_SIZE";continue}
  const blocks=xml.match(/<item\b[\s\S]*?<\/item>/gi)||
   xml.match(/<entry\b[\s\S]*?<\/entry>/gi)||[];
  entry.items=blocks.length;
  for(const block of blocks){
   const rel=tag(block,"link")||decode(block.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1]);
   let sourceUrl;try{sourceUrl=new URL(rel,original)}catch{continue}
   if(!["pse.vn","www.pse.vn"].includes(sourceUrl.hostname)||
    !["http:","https:"].includes(sourceUrl.protocol)||sourceUrl.pathname!==target)continue;
   const title=text(tag(block,"title"));
   const pubDate=tag(block,"pubDate")||tag(block,"published")||tag(block,"updated");
   const description=tag(block,"description")||tag(block,"summary")||tag(block,"content")||"";
   const bodyText=text(description);
   const mediaURLs=[...new Set([...description.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map(m=>{
    try{const u=new URL(decode(m[1]),sourceUrl.href);
     return ["http:","https:"].includes(u.protocol)?u.href:null;
    }catch{return null}
   }).filter(Boolean))];
   const day=pubDate?new Date(pubDate):null;
   const row={sourceUrl:sourceUrl.href,title,
     exactTitle:title==="Đủ nước tưới cho 633.000 ha lúa Xuân 2013",
     publicationRaw:pubDate.slice(0,120),
     publicationLocal:day&&Number.isFinite(day.getTime())?
      day.toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"}):null,
     descriptionHtmlChars:description.length,descriptionTextChars:bodyText.length,
     descriptionStart:bodyText.slice(0,280),descriptionEnd:bodyText.slice(-150),
     imageCount:mediaURLs.filter(u=>/\.(jpe?g|png|webp|gif)(?:[?#]|$)/i.test(u)).length,
     sourceMediaPaths:mediaURLs.filter(u=>/\.(jpe?g|png|webp|gif|pdf)(?:[?#]|$)/i.test(u)).map(u=>new URL(u).pathname),
     feedOrigin:entry.url,
     likelySpam:/(?:ducauto|sedoauto|miratalk|leostroi|<\/script>)/i.test(bodyText),
     hasPossibleSourceBody:title.length>0&&bodyText.length>=180};
   entry.matches.push(row);report.matches.push(row);
  }
  console.log("PSE_341_CATEGORY_FEED="+JSON.stringify({
   url:entry.url,http:entry.http,items:entry.items,
   matchCount:entry.matches.length,matched:entry.matches.map(x=>({
    date:x.publicationLocal,bodyChars:x.descriptionTextChars,
    sourceMediaPaths:x.sourceMediaPaths,titleMatch:x.exactTitle,spam:x.likelySpam
   }))}));
 }catch(e){entry.reason=String(e?.message||e).slice(0,100)}
 finally{report.feeds.push(entry)}
}
report.summary={feedVariantsChecked:report.feeds.length,exactOriginalUrlMatches:report.matches.length,
 sourceContentCandidates:report.matches.filter(r=>r.exactTitle&&r.hasPossibleSourceBody&&!r.likelySpam).length,
 decision:report.matches.some(r=>r.exactTitle&&r.hasPossibleSourceBody&&!r.likelySpam)?
  "REVIEW_SOURCE_ORIGINAL_FEED_BODY_CANDIDATES":"ORIGINAL_CONTENT_UNRECOVERED_FROM_FEED",
 noCmsWrites:true};
console.log("PSE_341_CATEGORY_FEED_SUMMARY="+JSON.stringify(report.summary));
await mkdir("artifacts/pse-341-original-feed",{recursive:true});
await writeFile("artifacts/pse-341-original-feed/report.json",JSON.stringify(report,null,2)+"\n");
