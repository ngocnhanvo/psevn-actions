/** PSE Joomla gallery publication chronology: independent source page metadata
 * verification. Never conflate com_search "created" with "published"; never
 * synthesize a missing historical day. This audit performs no WordPress writes.
 */
import {chromium,request} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const a=[
 {id:1053,slug:"1053-ngay-hoi-truyen-thong-2014",created:"2014-09-05"},
 {id:990,slug:"990-dai-hoi-chi-doan-2010",created:"2011-07-26"},
 {id:980,slug:"980-cong-trinh-dtn-kho-chua-dong-nai",created:"2011-03-06"},
 {id:975,slug:"975-dai-hoi-cong-doan-nhiem-ky-ii-10-2013",created:"2011-03-06"}
];
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong PSE repo");
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({javaScriptEnabled:false});
await ctx.route("**/*",route=>route.abort());
const net=await request.newContext({timeout:55000});
const report={schema:"pse-four-source-gallery-publish-metadata-v1",readOnly:true,
 noWordPressCalls:true,noCmsWrites:true,rows:[],summary:{}};
const isoDay=x=>{
 const s=String(x||"").trim();
 let m=s.match(/^(20\d\d|19\d\d)-(\d\d)-(\d\d)(?:[T ]\d\d:\d\d(?::\d\d)?(?:\.\d+)?(?:Z|[+-]\d\d:?\d\d)?)?$/);
 if(m){
  const day=m[1]+"-"+m[2]+"-"+m[3],d=new Date(day+"T12:00:00Z");
  return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===day?day:null;
 }
 m=s.match(/^(\d\d?)[/.](\d\d?)[/.](20\d\d|19\d\d)(?:\s|$)/);
 if(!m)return null;
 const day=m[3]+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0");
 const d=new Date(day+"T12:00:00Z");
 return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===day?day:null;
};
try{
 const page=await ctx.newPage();
 for(const target of a){
  const url="https://www.pse.vn/tin-tuc-su-kien/thu-vien/anh/"+target.slug+".html";
  const r=await net.get(url,{timeout:65000,maxRedirects:2});
  if(r.status()!==200)throw Error("Original Joomla HTML HTTP "+r.status()+" id="+target.id);
  const html=await r.text();
  if(html.length<250||html.length>8000000)throw Error("Unsafe original HTML length "+target.id);
  await page.setContent('<base href="'+url+'">'+html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),
   {waitUntil:"domcontentloaded",timeout:25000});
  const parsed=await page.evaluate(()=>{
   const pairs=[],attr=(el,n)=>String(el.getAttribute(n)||"").trim();
   for(const m of document.querySelectorAll('meta[content]')){
    const key=attr(m,"property")||attr(m,"name")||attr(m,"itemprop");
    if(/(?:^|[.:_-])(datepublished|datecreated|published_time|publish_date|pubdate|date|created|modified_time)(?:$|[.:_-])/i.test(key)||
       /^article:(published_time|modified_time)$/i.test(key)){
      const value=attr(m,"content").slice(0,120);
      if(value)pairs.push({source:"meta:"+key,value});
    }
   }
   for(const el of document.querySelectorAll('time[datetime],time[itemprop],.item-page .published,.item-page .createdate,.item-page dd.published,.item-page dd.created')){
    const raw=attr(el,"datetime")||attr(el,"content")||(el.textContent||"").trim().replace(/\s+/g," ");
    if(raw)pairs.push({source:"dom:"+el.tagName.toLowerCase()+(el.getAttribute("itemprop")?":"+el.getAttribute("itemprop"):""),value:raw.slice(0,120)});
   }
   const sourceTitle=(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent||"").trim().replace(/\s+/g," ");
   return{sourceTitle,candidates:pairs.slice(0,40),headTitle:(document.querySelector("title")?.textContent||"").trim().slice(0,160)};
  });
  // JSON-LD is inert text, not executed. Only inspect datePublished on a
  // single Article body, with matching title or source URL when available.
  const scripts=[...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].slice(0,10);
  for(const m of scripts){
   if(m[1].length>200000)continue;
   try{
    const obj=JSON.parse(m[1]),stack=[obj];
    while(stack.length){
     const x=stack.shift();
     if(!x||typeof x!=="object")continue;
     if(Array.isArray(x)){stack.push(...x.slice(0,15));continue}
     if(x["@graph"])stack.push(x["@graph"]);
     if(!/^(article|newsarticle|blogposting)$/i.test(Array.isArray(x["@type"])?x["@type"][0]:x["@type"]||""))continue;
     const linked=[x.url,x.mainEntityOfPage?.["@id"],x.mainEntityOfPage?.url,x.mainEntityOfPage].filter(v=>typeof v==="string");
     const title=String(x.headline||x.name||"").trim().replace(/\s+/g," ");
     if(linked.length&&!linked.some(x=>x.replace(/\/$/,"")===url.replace(/\/$/,""))&&title!==parsed.sourceTitle)continue;
     if(!linked.length&&title!==parsed.sourceTitle)continue;
     if(typeof x.datePublished==="string")
      parsed.candidates.push({source:"jsonld:Article.datePublished",value:x.datePublished.slice(0,120)});
     if(typeof x.dateCreated==="string")
      parsed.candidates.push({source:"jsonld:Article.dateCreated",value:x.dateCreated.slice(0,120)});
    }
   }catch{}
  }
  const candidates=parsed.candidates.map(x=>({...x,day:isoDay(x.value)}));
  const publish=candidates.filter(x=>
   /published_time|datepublished|pubdate|publish_date|dom:time:datepublished|jsonld:Article\.datePublished/i.test(x.source)&&x.day);
  const days=[...new Set(publish.map(x=>x.day))];
  const row={id:target.id,sourceUrl:url,title:parsed.sourceTitle,
   originalComSearchCreatedDay:target.created,publishedDay:days.length===1?days[0]:null,
   publishEvidence:publish,allDateHints:candidates.slice(0,45),
   chronologyConflict:target.id===975,
   decision:days.length===1?"PUBLISH_DAY_SOURCE_METADATA_FOUND":
    days.length>1?"CONFLICTING_SOURCE_PUBLISH_DAYS":"PUBLISH_DAY_NOT_IN_SOURCE_HTML"};
  report.rows.push(row);
  console.log("PSE_FOUR_JOOMLA_PUBLISH_METADATA="+JSON.stringify(row));
 }
 report.summary={originalAlbums:4,publishedMetadataDays:report.rows.filter(x=>!!x.publishedDay).length,
  chronologyConflicts:report.rows.filter(x=>x.chronologyConflict).map(x=>x.id),
  readOnly:true,noCmsWrites:true};
 console.log("PSE_FOUR_JOOMLA_PUBLISH_METADATA_SUMMARY="+JSON.stringify(report.summary));
}finally{
 await mkdir("artifacts/pse-four-gallery-publish-metadata",{recursive:true});
 await writeFile("artifacts/pse-four-gallery-publish-metadata/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await browser.close();
}