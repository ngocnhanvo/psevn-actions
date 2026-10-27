/** Verify Joomla source aliases and suspicious WordPress text coincidences.
 * Public-source/REST read-only; never insert/merge/delete posts.
 */
import {chromium} from "playwright";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const dates=JSON.parse(await readFile("docs/pse-legacy-date-backfill-state.json","utf8"));
if(state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified||
 process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong manifest/project");
const normalize=v=>String(v||"").normalize("NFKC").replace(/[\u00a0\s]+/g," ").trim().toLocaleLowerCase("vi");
const digest=v=>createHash("sha256").update(v).digest("hex").slice(0,20);
const aliasGroups=new Map();
for(const [sourceId,item] of Object.entries(state.articles)){
 if(!item.wp_id)continue;
 const key=String(item.wp_id),arr=aliasGroups.get(key)||[];
 arr.push({sourceId,url:item.source_url,status:item.status,
   created:dates.records?.[sourceId]?.source_created_day||item.source_created_date||null});
 aliasGroups.set(key,arr);
}
const aliases=[...aliasGroups].filter(([,v])=>v.length>1);
if(aliases.length!==12)throw Error("Manifest alias groups changed: "+aliases.length);
const wpSetting=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,"")).find(x=>x.startsWith("WC_URL="));
if(!wpSetting)throw Error("Missing WP origin");
const wp=new URL(wpSetting.slice(7).replace(/^['"]|['"]$/g,""));
if(wp.protocol!=="https:"||wp.username||wp.password)throw Error("Invalid WP URL");
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
await page.route(/\.(?:jpg|jpeg|png|gif|webp|woff2?|svg)(?:[?#]|$)/i,r=>r.abort());
const report={schema:"pse-legacy-source-alias-content-audit-v1",readonly:true,groups:[],wpNoticePair:null};
try{
 for(const [wpId,items] of aliases){
  const inspected=[];
  for(const rec of items){
   const u=new URL(rec.url);
   if(u.protocol!=="https:"||!["www.pse.vn","pse.vn"].includes(u.hostname))
    throw Error("Untrusted Joomla source "+rec.sourceId);
   try{
    const response=await page.goto(rec.url,{waitUntil:"domcontentloaded",timeout:35000});
    const http=response?.status()||0;
    const parsed=await page.evaluate(()=>{
     const root=document.querySelector('[itemprop="articleBody"]')||
      document.querySelector(".item-page");
     const text=String(root?.textContent||"").replace(/\s+/g," ").trim();
     const urls=[...new Set([...root?.querySelectorAll("img[src],a[href]")||[]]
      .map(el=>el.getAttribute(el.tagName==="IMG"?"src":"href"))
      .filter(v=>v&&/\.(?:png|jpe?g|gif|webp|pdf|docx?|xlsx?)(?:[?#]|$)/i.test(v))
      .map(v=>new URL(v,location.href).pathname.toLowerCase()))].sort();
     const title=document.title.replace(/\s+-\s+PSE\.VN\s*$/i,"").trim();
     const published=[...document.querySelectorAll('time[datetime],meta[property="article:published_time"],[itemprop="datePublished"],dd.published,dd.created')]
      .map(x=>x.getAttribute("datetime")||x.getAttribute("content")||x.textContent||"").map(x=>x.trim()).filter(Boolean).slice(0,3);
     return {title,text,urls,published,bodyPresent:!!root};
    });
    inspected.push({sourceId:rec.sourceId,sourceUrl:rec.url,status:rec.status,checkpointCreated:rec.created,
     http,bodyPresent:parsed.bodyPresent,title:parsed.title,textLength:parsed.text.length,
     textHash:parsed.text.length>=30?digest(normalize(parsed.text)):null,
     assetHash:digest(parsed.urls.join("\n")),assets:parsed.urls.length,
     assetPaths:parsed.urls.length<=8?parsed.urls:[],
     sourceDateFields:parsed.published});
   }catch(e){inspected.push({sourceId:rec.sourceId,sourceUrl:rec.url,status:rec.status,
    checkpointCreated:rec.created,error:String(e).slice(0,160)})}
  }
  const comparables=inspected.filter(x=>x.http===200&&x.bodyPresent&&x.textHash);
  const status=comparables.length===items.length?
    (new Set(comparables.map(x=>x.textHash)).size===1?
      (new Set(comparables.map(x=>x.assetHash)).size===1?"matching-text-and-assets":"same-text-different-assets")
      :"different-text"):"source-unavailable";
  report.groups.push({wpId:Number(wpId),status,source:inspected});
  console.log("PSE_JOOMLA_ALIAS_CHECK="+JSON.stringify({wpId:Number(wpId),status,
    source:inspected.map(x=>({sourceId:x.sourceId,http:x.http||null,error:x.error||null,
     title:x.title||null,sourceDate:x.checkpointCreated,textHash:x.textHash||null,
     assetHash:x.assetHash||null,assets:x.assets||0}))}));
 }
 const posts=[];
 for(const id of [77783,77786]){
  const res=await page.request.get(wp.origin+"/wp-json/wp/v2/posts/"+id+
    "?_fields=id,slug,status,date,title,content,categories",{timeout:30000});
  if(!res.ok())throw Error("WordPress public post "+id+" HTTP "+res.status());
  const p=await res.json();
  const html=p.content?.rendered||"";
  const extracted=await page.evaluate(html=>{
   const root=document.createElement("div");root.innerHTML=html;
   const text=root.textContent.replace(/\s+/g," ").trim();
   const refs=[...new Set([...root.querySelectorAll("a[href],img[src]")].map(x=>
    x.getAttribute(x.tagName==="IMG"?"src":"href")||"").filter(Boolean))].sort();
   return {text,refs};
  },html);
  posts.push({id:p.id,title:p.title?.rendered,date:p.date,
   bodyTextHash:digest(normalize(extracted.text)),renderedHtmlHash:digest(normalize(html)),
   attachmentReferences:extracted.refs,attachmentReferenceHash:digest(extracted.refs.join("\n"))});
 }
 report.wpNoticePair=posts;
 console.log("PSE_WP_NOTICE_PAIR_CONTENT="+JSON.stringify(posts));
 console.log("PSE_JOOMLA_ALIAS_SUMMARY="+JSON.stringify({
   aliasGroups:report.groups.length,matching:report.groups.filter(x=>x.status==="matching-text-and-assets").length,
   differentText:report.groups.filter(x=>x.status==="different-text").length,
   sameTextDifferentAssets:report.groups.filter(x=>x.status==="same-text-different-assets").length,
   sourceUnavailable:report.groups.filter(x=>x.status==="source-unavailable").length,
   noticeSamePlainText:posts[0].bodyTextHash===posts[1].bodyTextHash,
   noticeSameHtml:posts[0].renderedHtmlHash===posts[1].renderedHtmlHash,
   noticeSameAttachments:posts[0].attachmentReferenceHash===posts[1].attachmentReferenceHash,
   readonly:true
 }));
}finally{
 await mkdir("docs/reports",{recursive:true});
 await writeFile("docs/reports/pse-joomla-source-alias-content-audit.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
