/** Source-verified alternative 2012 reviewed financial PDF: WordPress + Astro live, GET only.
 * Do not claim Stockbiz PDF binary equivalence to dead original MediaFire.
 */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong PSE repo");
const wp="https://admin-pse.webnvn.com",front="https://pse.webnvn.com";
const slug="pvfcco-se-cong-bo-thong-tin-bao-cao-tai-chinh-ban-nien-2012-da-duoc-soat-xet";
const old="http://www.mediafire.com/file/mn5v49y1db5me3h/scan0001.pdf";
const shaExpected="06d58c64257e7751df13981b383b62fd2a4b48a5afbf4a30fd6ebf8be75e6e26";
const bytesExpected=5520707;
const net=await request.newContext({timeout:85000}),browser=await chromium.launch({headless:true});
const report={schema:"pse-298-2012-reviewed-stockbiz-native-and-astro-qa-v1",readOnly:true,noCmsWrites:true,noBuild:true,
 originalSourceId:298,wpPostId:82548,alternativeNotOriginalMediafireByteEqual:true,media:null,post:null,
 mobileDesktop:[],summary:null};
const sha=b=>createHash("sha256").update(b).digest("hex");
try{
 const r=await net.get(wp+"/wp-json/wp/v2/posts/82548?_fields=id,status,slug,date,title,content,categories,acf",{
  timeout:45000,failOnStatusCode:false});
 if(r.status()!==200)throw Error("Native restored Post REST unavailable");
 const p=await r.json();
 if(p.id!==82548||p.slug!==slug||p.status!=="publish"||!p.categories?.includes(1754)||
  p.acf?.key!=="ssr-post"||p.acf?.action!=="PostDetails")throw Error("Native original Post identity changed");
 const body=String(p.content?.rendered||"");
 const href=[...body.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)]
  .map(x=>x[1].replace(/&amp;/g,"&"))
  .filter(x=>x.startsWith("/api/files/wp-content/uploads/")&&/\.pdf$/i.test(x));
 if(href.length!==1||body.includes(old)||!body.includes("Nguồn PDF thay thế:")||
  !body.includes("Stockbiz")||!body.includes("không thể xác minh tệp thay thế trùng byte"))
  throw Error("Native alternative source disclosure/link missing or old dead link still present");
 const u=new URL(href[0],front);
 if(u.origin!==front||!/^\/api\/files\/wp-content\/uploads\/\d{4}\/\d{2}\/[^/]+\.pdf$/i.test(u.pathname))
  throw Error("Not an Astro file proxy path");
 const native=new URL(u.pathname.replace(/^\/api\/files/,""),wp);
 const [target,wpAsset]=await Promise.all([
  net.get(u.href,{timeout:85000,failOnStatusCode:false}),
  net.get(native.href,{timeout:85000,failOnStatusCode:false})
 ]);
 if(target.status()!==200||wpAsset.status()!==200)throw Error("Astro proxy or WP native PDF inaccessible");
 const [fb,wb]=await Promise.all([target.body(),wpAsset.body()]);
 if(fb.length!==bytesExpected||wb.length!==bytesExpected||
  fb.subarray(0,5).toString("ascii")!=="%PDF-"||sha(fb)!==shaExpected||
  sha(wb)!==shaExpected||!fb.equals(wb))throw Error("Astro PDF proxy SHA/bytes mismatch independent source");
 report.media={url:u.href,sha256:sha(fb),bytes:fb.length,
  wpEqual:true,proxyMime:target.headers()["content-type"],wpMime:wpAsset.headers()["content-type"]};
 report.post={wpId:p.id,slug:p.slug,date:p.date,category1754:true,sourceDisclosure:true};
 for(const width of [390,1440]){
  const ctx=await browser.newContext({viewport:{width,height:850}});
  const page=await ctx.newPage();
  try{
   const response=await page.goto(front+"/"+slug,{waitUntil:"domcontentloaded",timeout:60000});
   if(response?.status()!==200)throw Error("Frontend article not published "+width);
   const row=await page.evaluate(()=>{
    const title=document.querySelector("h1")?.textContent||"";
    const canonical=document.querySelector('link[rel="canonical"]')?.href||"";
    const main=document.querySelector("main");
    const links=[...main?.querySelectorAll("a[href]")||[]].map(x=>({text:x.textContent.trim(),href:x.getAttribute("href")||""}));
    return{title:title.trim(),canonical,overflow:document.documentElement.scrollWidth-innerWidth,
     sourceDisclosure:main?.textContent?.includes("Nguồn PDF thay thế:")||false,
     originalLinkPresent:main?.innerHTML?.includes("mediafire.com")||false,links};
   });
   const exact=row.links.filter(x=>{try{return new URL(x.href,front).href===u.href}catch{return false}});
   const can=new URL(row.canonical||front,front);
   if(exact.length!==1||!row.sourceDisclosure||row.originalLinkPresent||
    can.origin!==front||can.pathname!=="/"+slug||row.overflow>3||
    !/báo cáo tài chính bán niên 2012/i.test(row.title))throw Error("Frontend QA content/layout/canonical mismatch "+width);
   report.mobileDesktop.push({width,html200:true,canonical:true,
    sourceDisclaimer:true,exactFileLink:true,noHorizontalOverflow:true});
  }finally{await ctx.close()}
 }
 report.summary={result:"PSE_298_2012_ALTERNATIVE_NATIVE_LIVE_PASS",
  sourceId:298,postId:82548,mediaSha256:shaExpected,bytes:bytesExpected,
  proxyAndWpBytesEqual:true,responsiveRows:report.mobileDesktop.length,
  oldMediafireNoLongerLinked:true,explicitAlternativeProvenance:true,readOnly:true,noBuild:true};
 console.log("PSE_298_REVIEWED_ALTERNATIVE_LIVE_PASS="+JSON.stringify(report.summary));
}finally{
 await mkdir("artifacts/pse-298-reviewed-live-qa",{recursive:true});
 await writeFile("artifacts/pse-298-reviewed-live-qa/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await browser.close();
}
