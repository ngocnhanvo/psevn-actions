/** Exact original Joomla Kali article archived HTML candidates. READ ONLY.
 * Only original-URL, title-verified Wayback captures can be source evidence.
 * A capture timestamp never authorizes WordPress publication or a redirect.
 */
import {chromium,request} from "playwright";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong PSE project");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const ids=[1425,1426,1678],archive="https://web.archive.org",lastDate="20261121";
if(state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified||
 ids.some(id=>state.articles?.[id]?.status!=="quarantined"||
 state.articles[id]?.reason!=="Original Joomla section cannot be mapped to verified WP taxonomy"))
 throw Error("Wrong source checkpoint");
const norm=s=>String(s||"").normalize("NFKC").replace(/\s+/g," ").trim();
const digest=s=>createHash("sha256").update(norm(s)).digest("hex").slice(0,20);
const net=await request.newContext({timeout:19000}),browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({javaScriptEnabled:false}),page=await ctx.newPage();
await ctx.route("**/*",r=>r.abort());
const report={schema:"pse-kali-exact-original-article-archive-v1",readOnly:true,noBuild:true,noCmsWrites:true,
 sourceIds:ids,records:[],summary:null};
const get=(url,timeout=17000)=>{
 if(new URL(url).origin!==archive)throw Error("Wrong Wayback origin");
 return net.get(url,{maxRedirects:0,failOnStatusCode:false,timeout});
};
try{
 for(const id of ids){
  const u=new URL(state.articles[id].source_url);
  if(u.origin!=="https://www.pse.vn"||!u.pathname.includes("/8-trang-chu/")||
    !u.pathname.includes("/"+id+"-"))throw Error("Source URL mismatch "+id);
  const row={sourceId:id,original:u.href,indexes:[],captures:[],decision:"EXACT_SOURCE_ARCHIVE_NOT_YET_PROVEN"};
  report.records.push(row);
  const sources=["http://www.pse.vn","https://www.pse.vn","http://pse.vn","https://pse.vn"]
   .map(x=>x+u.pathname);
  const seen=new Map();
  const checks=await Promise.all(sources.map(async src=>{
   const q=new URL(archive+"/cdx/search/cdx");
   for(const [key,v] of Object.entries({url:src,output:"json",
    fl:"timestamp,original,statuscode,mimetype",filter:"statuscode:200",
    collapse:"timestamp:4",limit:"6"}))q.searchParams.set(key,v);
   const rec={sourceVariant:src,http:null,captures:0,reason:null};
   try{
    const r=await get(q.href,20000);rec.http=r.status();
    if(r.status()!==200){rec.reason="INDEX_HTTP_"+r.status();return rec}
    const text=await r.text();
    if(text.length>100000){rec.reason="INDEX_SIZE";return rec}
    let arr;try{arr=JSON.parse(text)}catch{rec.reason="INDEX_INVALID_JSON";return rec}
    if(!Array.isArray(arr)||arr[0]?.[0]!=="timestamp"){rec.reason="INDEX_EMPTY";return rec}
    for(const fields of arr.slice(1)){
     const [ts,original,status,mime]=fields;
     if(!/^\d{14}$/.test(String(ts))||ts.slice(0,8)>lastDate||
      String(status)!=="200"||!/html/i.test(mime||""))continue;
     let url;try{url=new URL(original)}catch{continue}
     if(!["pse.vn","www.pse.vn"].includes(url.hostname)||url.pathname!==u.pathname||
      !["https:","http:"].includes(url.protocol))continue;
     const key=ts+"|"+url.href;
     if(!seen.has(key)){seen.set(key,{timestamp:ts,original:url.href});rec.captures++}
    }
   }catch(e){rec.reason="ARCHIVE_INDEX_UNAVAILABLE";rec.error=String(e?.name||e?.code||"network").slice(0,70)}
   return rec;
  }));
  row.indexes=checks;
  console.log("PSE_KALI_ARCHIVE_INDEX="+JSON.stringify({id,checks,exactCaptureCandidates:seen.size}));
  const list=[...seen.values()].sort((a,b)=>a.timestamp.localeCompare(b.timestamp)).slice(0,6);
  for(const cap of list){
   const rec={timestamp:cap.timestamp,original:cap.original,http:null,
    title:null,bodyChars:0,bodySha:null,images:[],paragraphs:[],
    createdDates:[],publishedDates:[],decision:"SOURCE_BODY_NOT_PROVEN"};
   row.captures.push(rec);
   try{
    const res=await get(archive+"/web/"+cap.timestamp+"id_/"+cap.original,24000);
    rec.http=res.status();
    if(res.status()!==200){rec.decision="CAPTURE_HTTP_"+res.status();continue}
    const type=String(res.headers()["content-type"]||"");
    if(!type.includes("text/html")){rec.decision="NOT_HTML";continue}
    const html=await res.text();
    if(html.length<400||html.length>7500000){rec.decision="HTML_SIZE";continue}
    await page.setContent('<base href="'+cap.original+'">'+
     html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded"});
    const value=await page.evaluate(()=>{
     const t=x=>String(x||"").normalize("NFKC").replace(/\s+/g," ").trim();
     const title=t(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent||
      document.title.replace(/\s+-\s+PSE\.VN$/i,""));
     let root=document.querySelector('[itemprop="articleBody"]')||
      document.querySelector(".item-page");
     if(!root)return{title,text:"",paragraphs:[],images:[],dates:[]};
     root=root.cloneNode(true);
     root.querySelectorAll(".extranews_box,.extranews_separator").forEach(x=>x.remove());
     const images=[...root.querySelectorAll("img[src]")].map(e=>{
      try{const u=new URL(e.getAttribute("src"),document.baseURI);
       return{host:u.hostname,path:u.pathname}}catch{return null}
     }).filter(Boolean);
     const paragraphs=[...root.querySelectorAll("p,td,li")].map(e=>t(e.textContent))
      .filter(x=>x.length>40).map(x=>x.slice(0,220)).slice(0,22);
     const dates=[...document.querySelectorAll('time[datetime],meta[property],meta[name],dd.created,dd.published')]
      .map(x=>({name:String(x.getAttribute("property")||x.getAttribute("name")||x.className||""),
        value:t(x.getAttribute("content")||x.getAttribute("datetime")||x.textContent)}))
      .filter(x=>/publish|creat|date/i.test(x.name)).slice(0,20);
     return{title,text:t(root.textContent),paragraphs,images,dates};
    });
    rec.title=value.title;rec.bodyChars=value.text.length;rec.bodySha=digest(value.text);
    rec.images=value.images;rec.paragraphs=value.paragraphs.map(x=>({len:x.length,start:x.slice(0,145)}));
    rec.createdDates=value.dates.filter(x=>/creat/i.test(x.name));rec.publishedDates=value.dates.filter(x=>/publish/i.test(x.name));
    const expected=id===1425?/kali phú mỹ bột canada/i:id===1426?/kali phú mỹ/i:/kali phú mỹ/i;
    const titleOkay=expected.test(value.title);
    const contaminated=/Подробнее на сайте|(?:ducauto|sedoauto|miratalk)\.ru/i.test(value.text);
    rec.decision=titleOkay&&value.text.length>=180&&!contaminated?
     "EXACT_ORIGINAL_KALI_BODY_CANDIDATE_REVIEW":"SOURCE_ORIGINAL_BODY_OR_TITLE_NOT_VERIFIED";
   }catch(e){rec.decision="ARCHIVE_CAPTURE_UNAVAILABLE";rec.error=String(e?.name||e?.code||"network").slice(0,90)}
   console.log("PSE_KALI_ARCHIVE_CAPTURE="+JSON.stringify({
    id,timestamp:rec.timestamp,http:rec.http,title:rec.title,bodyChars:rec.bodyChars,
    originalImages:rec.images.map(x=>x.path).slice(0,22),
    decision:rec.decision,error:rec.error||null}).slice(0,5000));
  }
  row.decision=row.captures.some(x=>x.decision==="EXACT_ORIGINAL_KALI_BODY_CANDIDATE_REVIEW")?
   "REVIEW_CAPTURED_ORIGINAL_SOURCE_NOT_REDIRECT_AUTHORITY":"NO_EXACT_ORIGINAL_ARCHIVE_BODY";
 }
 report.summary={sourceCount:ids.length,
  sourceWithCapture:report.records.filter(r=>r.captures.length).map(r=>r.sourceId),
  sourceWithReadableBody:report.records.filter(r=>r.captures.some(c=>c.decision==="EXACT_ORIGINAL_KALI_BODY_CANDIDATE_REVIEW")).map(r=>r.sourceId),
  decision:"NO_AUTOMATIC_CMS_WRITE_OR_REDIRECT",readOnly:true};
 console.log("PSE_KALI_ARCHIVE_SUMMARY="+JSON.stringify(report.summary));
}finally{
 await mkdir("artifacts/pse-kali-original-archive",{recursive:true});
 await writeFile("artifacts/pse-kali-original-archive/report.json",JSON.stringify(report,null,2)+"\n");
 await page.close();await ctx.close();await browser.close();await net.dispose();
}
