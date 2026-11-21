/** PSE two newly recovered 2025 Joomla articles — live public URL/images QA.
 * All URLs are obtained from native WP REST IDs or links rendered in the public
 * Astro archive; do not guess unverified public article paths.
 */
import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const e=Object.fromEntries(String(process.env.ENV_FILE||"").split(/\r?\n/)
 .map(x=>x.trim().replace(/^export\s+/,"")).filter(x=>/^(WC_URL|WC_URL_CLIENT)=/.test(x))
 .map(x=>{const i=x.indexOf("=");return[x.slice(0,i),x.slice(i+1).trim().replace(/^['"]|['"]$/g,"")]}));
const origin=x=>{const u=new URL(x);if(u.protocol!=="https:"||u.username||u.password||u.port||
 !["","/"].includes(u.pathname)||u.search||u.hash)throw Error("Unexpected site origin");return u.origin};
const wp=origin(e.WC_URL),front=origin(e.WC_URL_CLIENT);
if(wp===front||process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Untrusted source/site");
const expected=[
 {source:1641,id:82846,date:"2025-05-14",minImages:3,text:"Miền Đông khúc ca tự hào"},
 {source:1651,id:82840,date:"2025-08-18",minImages:2,text:"Ứng dụng"}
];
const dir="artifacts/pse-recovered-2025-posts";await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
const result={schema:"pse-recovered-2025-posts-production-v1",readOnly:true,posts:[],status:"STARTED"};
try{
 const context=await browser.newContext({viewport:{width:1366,height:850}});
 const json=async url=>{const r=await context.request.get(url,{timeout:45000,headers:{Accept:"application/json", "Cache-Control":"no-cache"}});return{http:r.status(),value:await r.json().catch(()=>null)}};
 for(const x of expected){
  const r=await json(wp+"/wp-json/wp/v2/posts/"+x.id+"?_fields=id,slug,status,date,title,content,categories");
  if(r.http!==200||r.value?.id!==x.id||r.value.status!=="publish"||
    !r.value.date?.startsWith(x.date)||!r.value.categories?.length)
   throw Error("WordPress article identity or source-created day changed #"+x.source);
  const html=String(r.value.content?.rendered||"");
  console.log("PSE_2025_POST_WP_PREFLIGHT="+JSON.stringify({source:x.source,id:x.id,images:(html.match(/<img\b/gi)||[]).length,bodyChars:html.replace(/<[^>]+>/g," ").trim().length,category:r.value.categories,slug:r.value.slug}));
  if((html.match(/<img\b/gi)||[]).length<x.minImages||html.replace(/<[^>]+>/g," ").trim().length<500)
   throw Error("WordPress source HTML/media incomplete #"+x.source);
  if(/<img\b[^>]+src=["']https?:\/\/(?!admin-pse\.webnvn\.com)/i.test(html))
   throw Error("Article still hotlinks mandatory image outside WordPress #"+x.source);
  const row={sourceId:x.source,wpId:x.id,slug:r.value.slug,sourceDate:r.value.date,
   wpImageCount:(html.match(/<img\b/gi)||[]).length,linksFound:[],details:[]};
  result.posts.push(row);
 }
 // The original is a direct child of Tin công ty, whose public native archive
 // pagination is real SSR. Follow only links actually emitted by the archive.
 const links=new Map();
 const page=await context.newPage();
 for(let index=1;index<=8 && links.size<expected.length;index++){
  const route="/tin-tuc-su-kien/tin-cong-ty"+(index>1?"/"+index:"");
  const response=await page.goto(front+route,{waitUntil:"domcontentloaded",timeout:60000});
  if(response?.status()===404&&index>1)break;
  if(response?.status()!==200)throw Error("Original company public news archive HTTP "+response?.status()+" "+route);
  const items=await page.locator("#posts-grid a[href]").evaluateAll(nodes=>nodes.map(a=>({
   url:a.getAttribute("href")||"",text:(a.textContent||"").trim().slice(0,150)
  })));
  for(const x of expected){
   const row=result.posts.find(y=>y.sourceId===x.source);
   if(links.has(x.source))continue;
   const found=items.find(y=>y.url.includes(row.slug));
   if(found){links.set(x.source,new URL(found.url,front).href);row.linksFound.push({archive:route,link:found.url})}
  }
  console.log("PSE_2025_ARCHIVE_PAGE="+JSON.stringify({route,http:response.status(),links:items.length,matching:[...links.keys()]}));
 }
 for(const x of expected){
  const row=result.posts.find(y=>y.sourceId===x.source);
  const url=links.get(x.source);
  if(!url)throw Error("Published WordPress article absent from public Tin công ty archive #"+x.source);
  for(const width of [1366,390]){
   await page.setViewportSize({width,height:width===390?844:850});
   const res=await page.goto(url,{waitUntil:"domcontentloaded",timeout:60000});
   if(res?.status()!==200)throw Error("Public article detail "+x.source+" HTTP "+res?.status());
   const d=await page.evaluate(()=>({
    title:document.title,
    body:(document.querySelector("#article-content")?.textContent||document.body.textContent||"").replace(/\s+/g," ").slice(0,1200),
    articleImages:[...document.querySelectorAll("#article-content img")].map(i=>({src:i.currentSrc||i.src,width:i.naturalWidth})),
    canonical:document.querySelector('link[rel=canonical]')?.getAttribute("href")||"",
    overflow:Math.round(document.documentElement.scrollWidth-innerWidth)
   }));
   if(!d.body.includes(x.text)||d.overflow>6||!d.canonical.startsWith(front)||
     d.articleImages.length<x.minImages)
    throw Error("Frontend HTML/body/SEO/image mismatch #"+x.source+" width "+width+" images "+d.articleImages.length);
   await page.locator("#article-content img").evaluateAll(async nodes=>{await Promise.all(nodes.map(async node=>{try{await node.decode()}catch{}}))});
   const loaded=await page.locator("#article-content img").evaluateAll(nodes=>nodes.map(i=>({
    source:i.currentSrc||i.src,width:i.naturalWidth,complete:i.complete
   })));
   if(loaded.filter(i=>i.width>0).length<x.minImages)
    throw Error("Frontend migrated image failed to decode #"+x.source+" width "+width);
   await page.screenshot({path:dir+"/"+x.source+"-"+width+".png",fullPage:true,timeout:45000});
   row.details.push({width,url,status:res.status(),renderedImages:loaded.length,loadedImages:loaded.filter(i=>i.width>0).length,
    overflow:d.overflow,canonical:d.canonical});
  }
  console.log("PSE_2025_RESTORED_POST_LIVE="+JSON.stringify(row).slice(0,2800));
 }
 result.status="PASS";
 console.log("PSE_2025_RESTORED_POSTS_LIVE_SUMMARY="+JSON.stringify({status:result.status,count:result.posts.length,checks:4,
  urls:result.posts.map(x=>x.details[0]?.url),photosLocal:true,readOnly:true}));
}catch(e){result.status="FAIL";result.error=String(e?.message||e);
 console.error("PSE_2025_RESTORED_POSTS_LIVE_ERROR="+result.error);throw e
}finally{await writeFile(dir+"/report.json",JSON.stringify(result,null,2)+"\n");await browser.close()}