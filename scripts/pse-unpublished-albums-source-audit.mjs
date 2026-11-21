/** Four remaining Joomla photo-album sources. Source-only audit, no WordPress writes/build. */
import {chromium,request} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const albums=[
  {id:1053,slug:"1053-ngay-hoi-truyen-thong-2014",minimum:76},
  {id:990,slug:"990-dai-hoi-chi-doan-2010",minimum:80},
  {id:980,slug:"980-cong-trinh-dtn-kho-chua-dong-nai",minimum:80},
  {id:975,slug:"975-dai-hoi-cong-doan-nhiem-ky-ii-10-2013",minimum:80}
];
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong PSE source repository");
const base="https://www.pse.vn/tin-tuc-su-kien/thu-vien/anh/";
const browser=await chromium.launch({headless:true});
const network=await request.newContext({timeout:60000,ignoreHTTPSErrors:false});
const report={schema:"pse-unpublished-four-albums-original-source-v1",readOnly:true,at:new Date().toISOString(),rows:[],summary:{}};
try{
 const results=await Promise.all(albums.map(async entry=>{
   const url=base+entry.slug+".html",r={...entry,url,sourceHttp:null,links:0,sourceChars:0,minimumMet:false,firstLastCheck:[],error:null};
   try{
     const response=await network.get(url,{timeout:60000,maxRedirects:2});
     r.sourceHttp=response.status();
     if(r.sourceHttp!==200)throw Error("Original album page HTTP "+r.sourceHttp);
     const html=await response.text();r.sourceChars=html.length;
     if(html.length<250||html.length>8000000)throw Error("Source HTML size invalid");
     const ctx=await browser.newContext({javaScriptEnabled:false});
     await ctx.route("**/*",route=>route.abort());
     const page=await ctx.newPage();
     try{
       const inert=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"");
       await page.setContent('<base href="'+url+'">'+inert,{waitUntil:"domcontentloaded",timeout:25000});
       const links=await page.evaluate(()=>{
         const root=document.querySelector(".item-page [itemprop=articleBody],.item-page,article,.blog")||document.body;
         return [...new Set([...root.querySelectorAll("a[href]")].map(e=>e.href).filter(h=>{
           try{const u=new URL(h);return u.hostname==="www.pse.vn"&&
             u.pathname.startsWith("/images/gallery/")&&/\.(?:jpe?g|png|webp)$/i.test(u.pathname)}catch{return false}
         }))];
       });
       r.links=links.length;r.minimumMet=links.length>=entry.minimum&&links.length<=350;
       if(!r.minimumMet)throw Error("Unverified original gallery count "+r.links);
       for(const link of [links[0],links.at(-1)]){
         const h=await network.head(link,{timeout:16000,maxRedirects:2});
         r.firstLastCheck.push({status:h.status(),mime:String(h.headers()["content-type"]||"").slice(0,55)});
       }
     }finally{await ctx.close()}
   }catch(e){r.error=String(e?.message||e).slice(0,180)}
   console.log("PSE_FOUR_GALLERY_SOURCE="+JSON.stringify({id:r.id,http:r.sourceHttp,links:r.links,minimumMet:r.minimumMet,probes:r.firstLastCheck,error:r.error}));
   return r;
 }));
 report.rows=results;
 report.summary={sources:results.length,verified:results.filter(r=>r.minimumMet&&r.firstLastCheck.length===2&&
   r.firstLastCheck.every(x=>x.status===200&&x.mime.startsWith("image/"))).length,
   totalImages:results.reduce((s,r)=>s+r.links,0),sourceOnly:true};
 await mkdir("artifacts/pse-unpublished-four-albums",{recursive:true});
 await writeFile("artifacts/pse-unpublished-four-albums/report.json",JSON.stringify(report,null,2)+"\n");
 console.log("PSE_FOUR_ALBUM_SOURCE_SUMMARY="+JSON.stringify(report.summary));
 if(report.summary.verified!==4)process.exitCode=1;
}finally{await network.dispose();await browser.close()}
