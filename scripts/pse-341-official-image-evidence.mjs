/** Original publisher article/embedded image evidence; no WP or FTP writes. */
import {chromium, request} from "playwright";
import {createHash} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
const expected="Đủ nước tưới cho 633.000 ha lúa Xuân 2013";
const source="https://baochinhphu.vn/du-nuoc-tuoi-cho-633000-ha-lua-xuan-2013-102139394.htm";
const historic="Resize of lua xaun.jpg";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("wrong repository");
const allowed=host=>host==="baochinhphu.vn"||host==="baodientu.chinhphu.vn"||host==="bcp.cdnchinhphu.vn"||host.endsWith(".cdnchinhphu.vn");
const out="artifacts/pse-341-official-photo-evidence";await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});const ctx=await browser.newContext({viewport:{width:1366,height:900}});const page=await ctx.newPage();const net=await request.newContext({timeout:35000});
const report={schema:"pse-original-341-official-publisher-media-evidence-v1",readOnly:true,noCmsWrites:true,reportOnly:true,originalJoomlaId:341,officialSource:source,sourceHtmlVerified:false,actualHistoricalPhotoBytesProven:false,candidates:[]};
try{
 const response=await page.goto(source,{waitUntil:"domcontentloaded",timeout:70000});
 if(response?.status()!==200)throw Error("official publisher article not HTTP200");
 await page.locator("h1").first().waitFor({timeout:15000});
 const found=await page.evaluate(()=>{
  const norm=s=>String(s||"").replace(/\s+/g," ").trim();
  const heading=norm(document.querySelector("h1")?.textContent);
  const text=norm(document.querySelector(".detail-content,.detail-content-body,.content-detail,article,main")?.textContent);
  const selectors=[".detail-content img",".detail-content-body img",".content-detail img","article img","figure img"];
  const imgs=[...new Set(selectors.flatMap(s=>[...document.querySelectorAll(s)]))].slice(0,30);
  const get=(el,key)=>el.getAttribute(key)||"";
  const list=imgs.map(el=>({src:get(el,"src"),dataSrc:get(el,"data-src"),dataOriginal:get(el,"data-original"),srcset:get(el,"srcset"),alt:get(el,"alt")}));
  const og=document.querySelector('meta[property="og:image"]')?.getAttribute("content")||"";
  return{heading,bodyMatches:text.includes("633.000")&&text.includes("2013"),img:list,og};
 });
 if(!found.heading.includes("Đủ nước tưới")||!found.heading.includes("633.000 ha")||!found.bodyMatches )throw Error("official article identity mismatch");
 report.sourceHtmlVerified=true;
 const pool=new Set();
 for(const im of found.img)for(const value of [im.src,im.dataSrc,im.dataOriginal,im.srcset?.split(",")[0]?.split(" ")[0]]){
  if(value)pool.add(value);
 }
 if(found.og)pool.add(found.og);
 for(const raw of [...pool].slice(0,24)){
  let url;try{url=new URL(raw,source)}catch{continue}
  if(url.protocol!=="https:"||!allowed(url.hostname)||!/\.(?:jpe?g|png|webp)(?:$|\?)/i.test(url.pathname+url.search))continue;
  const name=decodeURIComponent(url.pathname.split("/").at(-1)||"").normalize("NFC");
  const item={officialHost:url.hostname,filename:name.slice(0,120),historicalSourceBasenameMatches:name.toLowerCase()===historic.toLowerCase(),http:null,bytes:null,sha256:null,verifiedImageBytes:false};
  try{
   const res=await net.get(url.href,{timeout:25000,maxRedirects:2});
   item.http=res.status();
   const final=new URL(res.url());
   if(final.protocol!=="https:"||!allowed(final.hostname))throw Error("unexpected publisher redirect");
   const ct=String(res.headers()["content-type"]||"");
   const n=Number(res.headers()["content-length"]||"0");
   if(res.status()===200&&ct.startsWith("image/")&&n<=8*1024*1024){
    const body=await res.body();
    if(body.length>256&&body.length<=8*1024*1024&&((body[0]===255&&body[1]===216&&body[2]===255)||(body[0]===137&&body[1]===80&&body[2]===78&&body[3]===71))){
     item.bytes=body.length;item.sha256=createHash("sha256").update(body).digest("hex");item.verifiedImageBytes=true;
    }
   }
  }catch(e){item.readError=e.constructor?.name||"Error"}
  if(item.verifiedImageBytes){
   try{
    const dims=await page.evaluate(async url=>{
      return new Promise(resolve=>{
        const img=new Image();
        img.onload=()=>resolve({width:img.naturalWidth,height:img.naturalHeight});
        img.onerror=()=>resolve(null);
        img.src=url;
      });
    },url.href);
    if(dims&&dims.width>0&&dims.height>0)item.dimensions=dims;
   }catch{}
  }
  report.candidates.push(item);
 }
 report.candidateCount=report.candidates.length;
 report.verifiedPublisherImageCount=report.candidates.filter(x=>x.verifiedImageBytes).length;
 report.historicalBasenameMatchCount=report.candidates.filter(x=>x.historicalSourceBasenameMatches).length;
 report.publisherCurrentSameBasenameImagesVerified=report.candidates.filter(x=>x.verifiedImageBytes&&x.historicalSourceBasenameMatches).length;
 // Same original filename at the primary publisher is strong provenance
 // but is NOT equivalent to historical URL byte identity.
 const historicUrl="https://baodientu.chinhphu.vn/Uploaded_VGP/phungthithuhuyen/20130306/Resize%20of%20lua%20xaun.jpg";
 try{
  const old=await net.get(historicUrl,{timeout:17000,maxRedirects:3});
  const u=new URL(old.url());
  report.historicalUrlStatus=old.status();
  report.historicalUrlTrustedRedirect=u.protocol==="https:"&&allowed(u.hostname);
  if(report.historicalUrlStatus===200&&report.historicalUrlTrustedRedirect&&String(old.headers()["content-type"]||"").startsWith("image/")){
   const bytes=await old.body();
   if(bytes.length>256&&bytes.length<=8*1024*1024){
    report.historicalUrlSha256=createHash("sha256").update(bytes).digest("hex");
    report.actualHistoricalPhotoBytesProven=report.candidates.some(x=>x.verifiedImageBytes&&x.sha256===report.historicalUrlSha256);
   }
  }
 }catch(e){report.historicalUrlError=e.constructor?.name||"Error"}

 console.log("PSE_341_OFFICIAL_PUBLISHER_IMAGE_EVIDENCE="+JSON.stringify(report));
}finally{
 await writeFile(out+"/summary.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await browser.close();
}
