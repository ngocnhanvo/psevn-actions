/** Independent original article #1640 versus identified publisher mirror (READ ONLY). */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
const original="https://www.pse.vn/21-tin-tuc-su-kien/tin-cong-ty/1640-nhung-giai-dieu-dep-ve-dong-nam-bo.html";
const mirror="https://www.vietnam.vn/nhung-giai-dieu-dep-ve-dong-nam-bo";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong project");
const browser=await chromium.launch({headless:true});
const network=await request.newContext({timeout:65000});
const result={schema:"pse-1640-original-publisher-mirror-proof-v1",readOnly:true,original,mirror,records:[],sameArticle:false,publisherImageEquivalence:"UNVERIFIED",wpWrites:0};
const norm=v=>String(v||"").replace(/\s+/g," ").trim();
const tokenize=v=>new Set(norm(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().split(/[^a-z0-9]+/).filter(t=>t.length>4));
const overlap=(a,b)=>{const A=tokenize(a),B=tokenize(b);return A.size?Number(([...A].filter(x=>B.has(x)).length/A.size).toFixed(3)):0};
const bodyTexts=[];
try{
 for(const url of [original,mirror]){
  const entry={url,http:null,heading:"",bodyChars:0,bodySample:"",imageSources:[],captionSamples:[],publishedDates:[],errors:[]};
  try{
   const resp=await network.get(url,{maxRedirects:3,timeout:65000});
   entry.http=resp.status();if(entry.http!==200)throw Error("Original/mirror HTTP "+entry.http);
   const html=await resp.text();if(html.length<250||html.length>10000000)throw Error("Untrusted HTML size");
   const context=await browser.newContext({javaScriptEnabled:false});
   await context.route("**/*",route=>route.abort());
   const page=await context.newPage();
   try{
    await page.setContent('<base href="'+url+'">'+html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded",timeout:20000});
    const p=await page.evaluate(()=>{
     const root=document.querySelector(".item-page [itemprop=articleBody]")||
      document.querySelector(".item-page")||
      document.querySelector(".article-detail-content")||
      document.querySelector(".article-content")||
      document.querySelector("article")||document.querySelector("main")||document.body;
     const title=(document.querySelector("h1")?.textContent||document.title||"").trim();
     const body=(root?.innerText||root?.textContent||"").replace(/\s+/g," ").trim();
     const imgs=[...root.querySelectorAll("img")].map(i=>{
      let url="";try{url=new URL(i.getAttribute("data-src")||i.getAttribute("src")||"",document.baseURI).href}catch{}
      const figure=i.closest("figure,.figure,.article-photo,.image-caption");
      return{src:url,alt:(i.getAttribute("alt")||"").trim().slice(0,180),
       nearby:(figure?.textContent||i.parentElement?.textContent||"").replace(/\s+/g," ").trim().slice(0,180)}
     }).filter(x=>/^https?:\/\//.test(x.src)).slice(0,26);
     const dates=[...document.querySelectorAll('meta[property="article:published_time"],meta[name="date"],time[datetime]')]
      .map(e=>e.getAttribute("content")||e.getAttribute("datetime")||"").filter(Boolean).slice(0,8);
     return{title,body,imgs,dates}
    });
    entry.heading=p.title;entry.bodyChars=p.body.length;entry.bodySample=p.body.slice(0,200);
    bodyTexts.push(p.body);
    entry.imageSources=p.imgs;entry.publishedDates=p.dates;
   }finally{await context.close()}
  }catch(e){entry.errors.push(String(e?.message||e).slice(0,220))}
  result.records.push(entry);
  console.log("PSE_1640_SOURCE_MIRROR="+JSON.stringify({url,http:entry.http,title:entry.heading,bodyChars:entry.bodyChars,
    imageSources:entry.imageSources.map(x=>({src:x.src,alt:x.alt})).slice(0,9),dates:entry.publishedDates,errors:entry.errors}));
 }
 const [a,b]=result.records;
 const cleanTitle=s=>norm(s).replace(/\s*-\s*PSE\.VN\s*$/i,"");
 result.sameArticle=cleanTitle(a.heading).toLowerCase()===cleanTitle(b.heading).toLowerCase();
 result.bodyOverlap=bodyTexts.length===2?overlap(bodyTexts[0],bodyTexts[1]):0;
 // The mirror has unrelated logos/sidebar images: compare only the exact alt
 // of the two original Joomla media, in their order, never a total image count.
 const editorial=b.imageSources.filter(i=>a.imageSources.some(o=>norm(o.alt)===norm(i.alt)));
 result.captionMatches=a.imageSources.map((o,i)=>({
   original:o.src,mirror:editorial[i]?.src||null,alt:o.alt,
   exactAlt:!!editorial[i]&&norm(o.alt)===norm(editorial[i].alt)
 }));
 result.imageProbes=[];
 for(const row of result.captionMatches){
  for(const [role,url] of [["original",row.original],["publisherMirror",row.mirror]]){
   if(!url)continue;
   const sample={role,url,http:null,mime:null,bytes:null,sha256:null,error:null};
   try{
    const r=await network.get(url,{timeout:25000,maxRedirects:2});
    sample.http=r.status();sample.mime=String(r.headers()["content-type"]||"").slice(0,70);
    if(r.ok()&&sample.mime.startsWith("image/")){
      const bytes=await r.body();sample.bytes=bytes.length;
      sample.sha256=createHash("sha256").update(bytes).digest("hex");
    }
   }catch(e){sample.error=String(e?.message||e).slice(0,130)}
   result.imageProbes.push(sample);
  }
 }
 const allCaptionMatches=result.captionMatches.length===2&&result.captionMatches.every(x=>x.exactAlt);
 result.publisherImageEquivalence=allCaptionMatches?"TWO_CAPTIONS_MATCH_ORIGINAL_BUT_PIXEL_EQUIVALENCE_UNPROVEN":"UNVERIFIED";
 // Editorial caption similarity is NOT sufficient evidence for replacement
 // or permission to publish; original media must be accessed or equivalence
 // independently confirmed before CMS writes.
 await mkdir("artifacts/pse-1640-source-mirror",{recursive:true});
 await writeFile("artifacts/pse-1640-source-mirror/report.json",JSON.stringify(result,null,2)+"\n");
 console.log("PSE_1640_MIRROR_EVIDENCE="+JSON.stringify({sameTitle:result.sameArticle,bodyOverlap:result.bodyOverlap,
   sourceImages:a.imageSources.length,mirrorImages:b.imageSources.length,
   captionMatchCount:result.captionMatches.filter(x=>x.exactAlt).length,
   imageProbes:result.imageProbes.map(x=>({role:x.role,http:x.http,mime:x.mime,bytes:x.bytes,error:x.error})),
   noWpWrites:true}));
}finally{await network.dispose();await browser.close()}
