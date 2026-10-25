/** Retry only the seven Joomla gallery detail pages that timed out in the
 * bounded legacy inventory. Request HTML without downloading gallery images,
 * parse static SIGPro anchors with a disabled-JavaScript browser. READ ONLY.
 */
import { chromium, request } from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const albums=[
 [986,"hoi-thao-tong-ket-vuon-thuc-nghiem-ngay-3-6-2013"],
 [997,"truong-sa"],
 [993,"ngay-truyen-thong"],
 [989,"hoi-dong-co-dong-le-ra-mat-va-don-nhan-iso"],
 [985,"hinh-anh-marketing-2010"],
 [996,"hoc-van-hoa-doanh-nghiep"],
 [992,"mau-bao-bi"]
];
const prefix="https://www.pse.vn/tin-tuc-su-kien/thu-vien/anh/";
const fetcher=await request.newContext({timeout:110000});
const browser=await chromium.launch({headless:true});
const parsed={createdAt:new Date().toISOString(),kind:"legacy_photo_album_retry",entries:[]};
try{
 const ctx=await browser.newContext({javaScriptEnabled:false});
 await ctx.route("**/*",r=>r.abort());
 const page=await ctx.newPage();
 for(const [id,slug] of albums){
  const url=prefix+id+"-"+slug+".html";
  let result={id,slug,url,status:"UNKNOWN",galleryLinks:[],domImages:0};
  try{
   const response=await fetcher.get(url,{timeout:110000,maxRedirects:3});
   result.http=response.status();
   if(!response.ok())throw Error("Joomla HTML HTTP "+response.status());
   const html=await response.text();
   if(html.length>8000000||html.length<200)throw Error("Source HTML size invalid");
   // Strip remote scripts and eager media to avoid excessive network/JS.
   const staticMarkup=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"");
   await page.setContent('<base href="'+url+'">'+staticMarkup,{waitUntil:"domcontentloaded",timeout:17000});
   const info=await page.evaluate(()=>{
    const body=document.querySelector(".item-page [itemprop=articleBody],.item-page,article")||document.body;
    const links=[...body.querySelectorAll("a[href]")].map(a=>a.href)
      .filter(h=>{try{const u=new URL(h);return u.hostname==="www.pse.vn"&&u.pathname.startsWith("/images/gallery/")&&/\.(?:jpe?g|png|webp)$/i.test(u.pathname)}catch{return false}});
    const images=[...body.querySelectorAll("img")].filter(i=>i.src.includes("/images/gallery/"));
    return {links:[...new Set(links)],images:images.length,heading:(body.querySelector("h1,h2,h3")?.textContent||"").replace(/\s+/g," ").trim().slice(0,140)};
   });
   result={...result,status:info.links.length>0?"VERIFIED":"NO_GALLERY_LINKS",galleryLinks:info.links,domImages:info.images,heading:info.heading,bytes:html.length};
  }catch(e){result.status="SOURCE_ERROR";result.reason=String(e.message||e).slice(0,230)}
  parsed.entries.push(result);
  console.log("PSE_GALLERY_RETRY="+JSON.stringify({id,status:result.status,http:result.http??null,images:result.domImages,links:result.galleryLinks.length,reason:result.reason||null}));
 }
 await mkdir("artifacts/pse-gallery-retry",{recursive:true});
 await writeFile("artifacts/pse-gallery-retry/verified.json",JSON.stringify(parsed,null,2));
 console.log("PSE_GALLERY_RETRY=COMPLETE; verified="+parsed.entries.filter(x=>x.status==="VERIFIED").length+"; total=7; cmsWrites=0");
}finally{await fetcher.dispose();await browser.close()}
