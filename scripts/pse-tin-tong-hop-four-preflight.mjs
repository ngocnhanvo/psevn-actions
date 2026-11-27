/** Strict READ ONLY source-original audit before native WP synchronization. */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const manifest=JSON.parse(await readFile("docs/source/pse-tin-tong-hop-four-20261127.json","utf8"));
const marker=(await readFile(".pse-tin-tong-hop-four-preflight-request","utf8")).trim();
if(marker!=="MODE=READONLY"||process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 manifest.schema!=="pse-tin-tong-hop-4-source-rss-20261127-v1"||
 manifest.joomlaCategoryId!==101||manifest.wpCategoryId!==1746||
 manifest.parentWpCategoryId!==1742||manifest.records?.length!==4||
 manifest.records.map(x=>x.joomlaId).join(",")!=="1746,1745,1744,1743"||
 manifest.records.reduce((n,x)=>n+x.images,0)!==13)
 throw Error("PSE original four-post audit identity guard denied");
const report={status:"STARTED",scope:"READ_ONLY",date:new Date().toISOString(),posts:[],media:[],wp:[]};
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({javaScriptEnabled:false});
await ctx.route("**/*",route=>route.abort());
const http=await request.newContext({timeout:45000});
const fold=x=>String(x||"").normalize("NFKC").replace(/\s+/g," ").trim().toLocaleLowerCase("vi");
const get=async u=>{
 let last="";
 for(let i=0;i<3;i++){
  try{const r=await http.get(u,{timeout:45000});if(r.status()===200)return r;last="HTTP"+r.status()}
  catch(e){last=String(e?.message||e).slice(0,90)}
  if(i<2)await new Promise(done=>setTimeout(done,800*(i+1)));
 }
 throw Error("Original GET failed for "+new URL(u).hostname+" "+last);
};
try{
 const r=await get(manifest.rss),xml=await r.text();
 if(!/<rss[\s>]/i.test(xml))throw Error("Joomla category RSS no longer valid");
 const items=[...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(m=>{
  const tag=n=>m[1].match(new RegExp("<"+n+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+n+">","i"))?.[1]?.trim()||"";
  return {guid:tag("guid"),title:tag("title").replace(/<!\[CDATA\[|\]\]>/g,""),pubDate:tag("pubDate")};
 });
 for(const d of manifest.records){
  if(d.sourceUrl!==manifest.source+d.joomlaId+"-"+d.slug+".html")
   throw Error("Unexpected exact original Joomla permalink "+d.joomlaId);
  const match=items.filter(x=>x.guid===d.sourceUrl);
  if(match.length!==1||fold(match[0].title)!==fold(d.title)||
   new Date(match[0].pubDate).toISOString()!==new Date(d.created+"+07:00").toISOString())
   throw Error("RSS source ID/title/exact seconds mismatch "+d.joomlaId);
  const source=await get(d.sourceUrl),raw=await source.text();
  if(raw.length<1000||raw.length>1100000)throw Error("Original article length outside bounds "+d.joomlaId);
  const page=await ctx.newPage();
  let article;
  try{
   await page.setContent('<base href="'+d.sourceUrl+'">'+raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),
    {waitUntil:"domcontentloaded",timeout:30000});
   article=await page.evaluate(()=>{
    const original=document.querySelector(".item-page [itemprop=articleBody]")||document.querySelector(".item-page");
    if(!original)throw Error("Original Joomla articleBody missing");
    const title=(document.querySelector(".item-page h1,.item-page h2")?.textContent||"").replace(/\s+/g," ").trim();
    const root=original.cloneNode(true);
    root.querySelectorAll(".itemRelated,.related,.page-header,.article-info,.pager,.readmore,script,style,form,button,nav,iframe,embed,object,svg").forEach(x=>x.remove());
    const html=root.innerHTML,text=(root.textContent||"").replace(/\s+/g," ").trim();
    const images=[...root.querySelectorAll("img[src]")].map(x=>new URL(x.getAttribute("src"),document.baseURI).href);
    return{title,textLen:text.length,htmlLen:html.length,images,hasRelated:/các\s+bài\s+viết\s+khác/i.test(text)};
   });
  }finally{await page.close()}
  if(fold(article.title)!==fold(d.title)||article.textLen<120||
   article.images.length!==d.images||article.htmlLen<190)
   throw Error("Joomla original article content/images differ "+d.joomlaId+" count="+article.images.length);
  if(article.hasRelated)throw Error("Source body still includes legacy related-link wrapper "+d.joomlaId);
  for(const img of article.images){
   const u=new URL(img);
   if(u.protocol!=="https:"||!["www.pse.vn","pse.vn","cdn.petrotimes.vn"].includes(u.hostname))
    throw Error("Source image outside documented trusted origins "+d.joomlaId+" host="+u.hostname);
   const res=await get(img),bytes=await res.body();
   const valid=bytes.length>200&&bytes.length<9000000&&
    bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
   if(!valid)throw Error("Original JPEG magic/size mismatch "+d.joomlaId+" "+u.pathname.slice(-40));
   report.media.push({joomlaId:d.joomlaId,source:img,bytes:bytes.length,
    sha256:createHash("sha256").update(bytes).digest("hex")});
  }
  report.posts.push({id:d.joomlaId,date:d.created,title:d.title,slug:d.slug,
   media:article.images.length,bodyChars:article.textLen,sourceUrl:d.sourceUrl});
  console.log("PSE_TTH_FOUR_SOURCE_VALIDATED="+JSON.stringify(report.posts.at(-1)));
 }
 if(report.media.length!==13)throw Error("Source photo total not 13");
 for(const d of manifest.records){
  const query="https://admin-pse.webnvn.com/wp-json/wp/v2/posts?status=publish&slug="+encodeURIComponent(d.slug)+
   "&_fields=id,slug,title,date,categories,status";
  const r=await get(query),data=await r.json().catch(()=>null);
  if(!Array.isArray(data))throw Error("WordPress public slug audit invalid "+d.slug);
  report.wp.push({joomlaId:d.joomlaId,matchingSlugs:data.map(x=>x.id)});
  if(data.length)throw Error("Exact WordPress slug already published; review before import "+d.joomlaId);
 }
 report.status="PASS";
 console.log("PSE_TTH_FOUR_SOURCE_PREFLIGHT=PASS 4_JOOMLA_IDS_13_JPEG_BYTES_TO_SECOND_NO_WP_WRITES");
}catch(e){report.status="FAILED";report.error=String(e).slice(0,400);
 console.error("PSE_TTH_FOUR_SOURCE_PREFLIGHT_FAILED="+report.error);process.exitCode=1}
finally{await mkdir("artifacts/pse-tth-four",{recursive:true});
 await writeFile("artifacts/pse-tth-four/preflight.json",JSON.stringify(report,null,2)+"\n");
 await http.dispose();await ctx.close();await browser.close();}
