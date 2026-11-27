/** Read-only production verification of the four PSE Tin tong hop Joomla originals. */
import {chromium} from "playwright";
import {readFile,writeFile,mkdir} from "node:fs/promises";
const marker=(await readFile(".pse-tin-tong-hop-four-live-qa-request","utf8")).trim();
const manifest=JSON.parse(await readFile("docs/source/pse-tin-tong-hop-four-20261127.json","utf8"));
const ev=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
if(marker!=="MODE=READONLY"||manifest.records?.length!==4||
 manifest.records.some(d=>!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(d.publishUp))||
 ev.head_commit?.message!=="test(pse): verify four original Tin tong hop articles live"||
 process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")
 throw Error("Unauthorized production article QA");
const wp="https://admin-pse.webnvn.com",web="https://pse.webnvn.com";
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1366,height:900}});
const report={schema:"pse-tth-4-production-live-parity-v1",noWrites:true,
  sourceCategory:101,wpCategory:1746,articles:[],assets:[],status:"STARTED"};

const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
// Only retry read-only HTTP requests on transient connection/5xx failures.
// Persistent 404, incorrect content, dates, image count or identity still FAIL.
async function getWithTransientRetry(url, options, label){
 let lastError;
 for(let attempt=1;attempt<=3;attempt++){
  try{
   const response=await ctx.request.get(url,{...options,failOnStatusCode:false});
   if([408,429,500,502,503,504].includes(response.status())&&attempt<3){
    console.log("PSE_TTH_TRANSIENT_HTTP_RETRY="+JSON.stringify({label,attempt,status:response.status()}));
    await sleep(1200*attempt);
    continue;
   }
   return response;
  }catch(error){
   lastError=error;
   const message=String(error?.message||error);
   if(!/ECONNRESET|socket hang up|ERR_TIMED_OUT|TimeoutError|Timeout .*exceeded|ECONNREFUSED|ETIMEDOUT/i.test(message)||attempt===3)throw error;
   console.log("PSE_TTH_TRANSIENT_NETWORK_RETRY="+JSON.stringify({label,attempt,reason:message.slice(0,110)}));
   await sleep(1200*attempt);
  }
 }
 throw lastError||Error("Transient read-only request exhausted: "+label);
}
try{
 const res=await getWithTransientRetry(wp+"/wp-json/wp/v2/posts?categories=1746&status=publish&per_page=1"+
  "&_fields=id,slug,date,status",{timeout:55000},"wp-category-count");
 const total=Number(res.headers()["x-wp-total"]||0);
 if(res.status()!==200||total<328)throw Error("WP_CATEGORY_COUNT_OLD_OR_UNREACHABLE "+total);
 report.wpPublishedTotal=total;
 const archive=await ctx.newPage();
 let response=null,archiveText="",count=NaN;
 const archiveAttempts=[];
 for(let attempt=1;attempt<=3;attempt++){
  response=await archive.goto(web+"/tin-tuc-su-kien/tin-tong-hop",{waitUntil:"domcontentloaded",timeout:65000});
  const http=response?.status()||0;
  archiveText=(await archive.locator("main").first().innerText({timeout:45000}).catch(()=>"" )).replace(/\s+/g," ");
  count=Number(archiveText.match(/Tổng\s+(\d+)\s+bài viết/)?.[1]);
  archiveAttempts.push({attempt,http,count:Number.isFinite(count)?count:null,url:archive.url()});
  if(http===200&&count===total)break;
  if(attempt<3&&http>=500){await archive.waitForTimeout(2200);continue}
  break;
 }
 if(response?.status()!==200||count!==total)throw Error("ASTRO_CATEGORY_SSR_COUNT_MISMATCH "+JSON.stringify({http:response?.status(),count:Number.isFinite(count)?count:null,wp:total,url:archive.url(),attempts:archiveAttempts}));
 report.archive={http:200,total:count,url:archive.url(),postsGrid:await archive.locator("#posts-grid").count()>0,attempts:archiveAttempts.length};
 await archive.close();
 for(const d of manifest.records){
  const r=await getWithTransientRetry(wp+"/wp-json/wp/v2/posts?status=publish&slug="+
   encodeURIComponent(d.slug)+"&_fields=id,slug,title,date,categories,status",
   {timeout:55000},"wp-post-"+d.joomlaId);
  const arr=await r.json().catch(()=>null);
  if(r.status()!==200||!Array.isArray(arr)||arr.length!==1||arr[0].date!==d.publishUp||
     !arr[0].categories?.includes(1746)||!arr[0].categories?.includes(1742))
   throw Error("WORDPRESS_EXACT_LOCAL_SECOND_OR_CATEGORY_FAIL "+d.joomlaId);
  const page=await ctx.newPage();
  const url=web+"/"+d.slug;
  try{
   const pageResult=await page.goto(url,{waitUntil:"domcontentloaded",timeout:65000});
   const data=await page.evaluate(()=>{
    const main=document.querySelector("main"),body=main?.querySelector("#article-content");
    return{title:(main?.querySelector("h1")?.textContent||"").replace(/\s+/g," ").trim(),
     date:main?.querySelector("time[datetime]")?.getAttribute("datetime")||"",
     text:(body?.textContent||"").replace(/\s+/g," ").trim(),
     images:[...(body?.querySelectorAll("img[src]")||[])].map(x=>x.getAttribute("src")||""),
     headings:[...(body?.querySelectorAll("h1,h2,h3,h4,h5,h6")||[])].map(x=>(x.textContent||"").replace(/\s+/g," ").trim())};
   });
   if(pageResult?.status()!==200||data.title!==d.title||data.date!==d.publishUp||
    data.text.length<110||data.images.length!==d.images||
    data.headings.some(x=>/^(?:các bài viết khác|other posts)$/i.test(x))||
    /các\s+bài\s+viết\s+khác/i.test(data.text))
    throw Error("ASTRO_DETAIL_SOURCE_DATE_CONTENT_OR_RELATED_FAIL "+d.joomlaId+" "+JSON.stringify({
     status:pageResult?.status(),date:data.date,images:data.images.length,textLen:data.text.length}));
   for(const src of data.images){
    const u=new URL(src,url);
    if(u.origin!==web||!u.pathname.startsWith("/api/images/"))
     throw Error("SOURCE_MEDIA_NOT_OPTIMIZED_LOCAL_PROXY "+d.joomlaId);
    const image=await getWithTransientRetry(u.href,{timeout:35000},"image-"+d.joomlaId);
    if(image.status()!==200||!String(image.headers()["content-type"]||"").startsWith("image/"))
     throw Error("SOURCE_MEDIA_HTTP_FAILED "+d.joomlaId+" "+image.status());
    report.assets.push({joomlaId:d.joomlaId,path:u.pathname,http:200});
   }
   report.articles.push({joomlaId:d.joomlaId,wordpressPostId:arr[0].id,url,date:d.publishUp,originalCreated:d.created,
    imageCount:data.images.length,contentLength:data.text.length,relatedPostsSection:false,http:200});
   console.log("PSE_TTH_FOUR_LIVE_POST_PASS="+JSON.stringify(report.articles.at(-1)));
  }finally{await page.close()}
 }
 if(report.articles.length!==4||report.assets.length!==13)
  throw Error("PSE_4_POSTS_13_IMAGES_INCOMPLETE");
 report.status="PASS";
 console.log("PSE_TTH_FOUR_LIVE_PARITY=PASS 4_POSTS_13_JPEG_IMAGES_EXACT_SECOND_NO_RELATED");
}catch(e){report.status="FAILED";report.error=String(e).slice(0,500);
 console.error("PSE_TTH_FOUR_LIVE_PARITY_FAILED="+report.error);process.exitCode=1}
finally{await mkdir("artifacts/pse-tth-four",{recursive:true});
 await writeFile("artifacts/pse-tth-four/live-qa.json",JSON.stringify(report,null,2)+"\n");
 await ctx.close();await browser.close();}
