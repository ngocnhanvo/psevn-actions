/** Exact two source-backed Joomla shareholder notices, postrelease GET-only acceptance. */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const evt=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const marker="test(pse): verify two original shareholder notices 338 1085 postrelease";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main"||evt.head_commit?.message!==marker)
 throw Error("Unapproved investor postrelease source QA");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(state.schema!=="pse-legacy-article-migration-v1")throw Error("Untrusted Joomla migration checkpoint");
const docs=[
 {id:338,day:"2013-02-28",count:241,files:[
  ["https://www.pse.vn/images/web/news/qhcd/ThongTinCongBo/cv%20gi%20vsd%20cht%20danh%20sch%20c%20ng_001.jpg","450d2875fdd51c343e77e968122beb6d68f0e29827e7eb7392f77b4ba68c6b97"],
  ["https://www.pse.vn/images/web/news/qhcd/ThongTinCongBo/cv%20gi%20vsd%20cht%20danh%20sch%20c%20ng_002.jpg","7bb5dcb38ec11d0a99d9a59cbac4e83f305a275d333311de3d86a91cba80bd22"]]},
 {id:1085,day:"2015-03-04",count:385,files:[
  ["https://www.pse.vn/images/web/news/qhcd/Dai_Hoi_Co_Dong_2013/gui_VSD_choDS_001.jpg","c569532d3707b1e1757b4b0705e6d7d18609367d4fa7f1f92eb23422650762ac"],
  ["https://www.pse.vn/images/web/news/qhcd/Dai_Hoi_Co_Dong_2013/gui_VSD_choDS_002.jpg","0f786bc97f0a14589a366f84f6024fd35a28c09754350bb8720605948fe921d4"]]}
];
const lines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const site=k=>{const x=lines.filter(t=>t.startsWith(k+"="));if(x.length!==1)throw Error("Missing "+k);
 const u=new URL(x[0].slice(k.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.port||u.search||u.hash||!["","/"].includes(u.pathname))
  throw Error("Invalid origin");return u.origin};
const wp=site("WC_URL"),front=site("WC_URL_CLIENT");
if(wp===front)throw Error("Public origin leak");
const sha=b=>createHash("sha256").update(b).digest("hex");
const norm=t=>String(t||"").replace(/\u00a0/g," ").replace(/\s+/g," ").trim();
const browser=await chromium.launch({headless:true}),net=await request.newContext({timeout:50000});
const report={schema:"pse-two-original-shareholder-source-postrelease-v1",
 sourceIds:[338,1085],sourcePosts:[],media:[],rows:[],readOnly:true,noBuild:true,noCmsWrites:true};
const get=async url=>{
 for(let n=1;n<=3;n++){
  try{const r=await net.get(url,{timeout:45000,failOnStatusCode:false});
   if(r.status()<500||n===3)return r;
  }catch(e){if(n===3||!/ECONNRESET|Timeout|ETIMEDOUT|socket hang up/i.test(String(e?.message||e)))throw e}
  await new Promise(resolve=>setTimeout(resolve,n*1200));
 }
 throw Error("Source GET retry exhausted "+new URL(url).pathname);
};
try{
 const cats=await get(wp+"/wp-json/wp/v2/categories?slug=tin-tuc-co-dong&_fields=id,slug");
 if(cats.status()!==200)throw Error("Investor category lookup failed");
 const foundCat=await cats.json();if(foundCat.length!==1)throw Error("Investor taxonomy source missing");
 const catId=Number(foundCat[0].id);
 const inert=await browser.newContext({javaScriptEnabled:false});await inert.route("**/*",r=>r.abort());
 for(const doc of docs){
  const source=state.articles?.[doc.id]?.source_url||"";
  if(!source.startsWith("https://www.pse.vn/quan-he-nha-dau-tu/tin-tuc-co-dong/"+doc.id+"-"))
   throw Error("Original source Joomla Article changed "+doc.id);
  const slug=new URL(source).pathname.split("/").at(-1).replace(new RegExp("^"+doc.id+"-"),"").replace(/\.html$/,"");
  const [htmlResponse,postResponse]=await Promise.all([
   get(source),get(wp+"/wp-json/wp/v2/posts?slug="+encodeURIComponent(slug)+
    "&per_page=5&_fields=id,slug,status,title,date,acf,content,featured_media,categories")
  ]);
  if(htmlResponse.status()!==200||postResponse.status()!==200)throw Error("Source WP post unavailable "+doc.id);
  const originals=await htmlResponse.text(),posts=await postResponse.json();
  if(!Array.isArray(posts)||posts.length!==1||posts[0].status!=="publish"||
   posts[0].slug!==slug||posts[0].date?.slice(0,10)!==doc.day||
   String(posts[0].acf?.origin_page_id||"")!==String(doc.id)||
   !posts[0].categories?.includes(catId))throw Error("Native source investor published metadata mismatch "+doc.id);
  const page=await inert.newPage(),native=await inert.newPage();
  await page.setContent('<base href="'+source+'">'+originals.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""));
  const src=await page.evaluate(()=>{
   const root=document.querySelector(".item-page [itemprop=articleBody]")||document.querySelector(".item-page");
   return{title:(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent||"").replace(/\s+/g," ").trim(),
    body:(root?.textContent||"").replace(/\s+/g," ").trim(),
    images:[...root.querySelectorAll("img[src]")].map(x=>x.src)};
  });
  if(src.body.length!==doc.count||src.images.length!==2||
   doc.files.some((x,i)=>src.images[i]!==x[0]))throw Error("Original Joomla shareholder document changed "+doc.id);
  await native.setContent('<base href="'+wp+'/">'+String(posts[0].content?.rendered||""));
  const wpBody=norm(await native.locator("body").innerText());
  const imgUrls=await native.locator("img[src]").evaluateAll(es=>es.map(x=>x.src));
  if(imgUrls.length!==2||wpBody.length<src.body.length*0.75||!wpBody.includes(src.body.slice(0,50)))
   throw Error("WordPress source investor body/media lost "+doc.id);
  const expectedNames=doc.files.map(x=>"pse-original-"+doc.id+"-"+sha(x[0]).slice(0,16)+".jpg");
  for(let i=0;i<2;i++){
   const u=new URL(imgUrls[i]),filename=expectedNames[i];
   if(u.origin!==wp||!u.pathname.startsWith("/wp-content/uploads/")||
    !u.pathname.endsWith("/"+filename)||u.search||u.hash)
    throw Error("Wrong WP original shareholder scan identity "+doc.id+" image "+i);
   const [nativeResponse,proxyResponse]=await Promise.all([get(u.href),get(front+"/api/files"+u.pathname)]);
   const [wpBytes,proxyBytes]=await Promise.all([nativeResponse.body(),proxyResponse.body()]);
   if(nativeResponse.status()!==200||proxyResponse.status()!==200||
    sha(wpBytes)!==doc.files[i][1]||sha(proxyBytes)!==doc.files[i][1])
    throw Error("Original shareholder scan SHA256 mismatch WP/proxy "+doc.id+" image "+i);
   report.media.push({sourceId:doc.id,index:i,filename,sourceHash:doc.files[i][1],
    wpPath:u.pathname,wpMediaPass:true,frontendProxyPass:true});
  }
  await page.close();await native.close();
  report.sourcePosts.push({sourceId:doc.id,wpPostId:posts[0].id,title:src.title,
   date:doc.day,originalTextChars:doc.count,category:catId});
  for(const width of [390,1440]){
   const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
   const leaks=[];page.on("request",r=>{try{if(new URL(r.url()).origin===wp)leaks.push("cms")}catch{}});
   try{
    const response=await page.goto(front+"/"+slug,{waitUntil:"domcontentloaded",timeout:65000});
    if(response?.status()!==200)throw Error("Source shareholder public detail not HTTP200 "+doc.id);
    const imgs=page.locator("#article-content img");
    if(await imgs.count()!==2)throw Error("Wrong source shareholder public scanned images "+doc.id);
    const paths=await imgs.evaluateAll(es=>es.map(x=>new URL(x.getAttribute("src")||"",location.href).pathname));
    if(paths.some((x,i)=>!x.includes(expectedNames[i].slice(0,-4))||
      !x.startsWith("/api/files/")&&!x.startsWith("/api/images/")))
     throw Error("Original shareholder JPEG identity/order frontend mismatch "+doc.id);
    const dom=await page.evaluate(()=>({
     h1:[...document.querySelectorAll("h1")].map(x=>(x.textContent||"").replace(/\s+/g," ").trim()),
     canonical:document.querySelector('link[rel="canonical"]')?.href||"",
     overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2
    }));
    const can=dom.canonical?new URL(dom.canonical,front):null;
    if(dom.h1.length!==1||dom.h1[0]!==src.title||!can||can.origin!==front||
     can.pathname!=="/"+slug||dom.overflow||leaks.length)
     throw Error("Source shareholder public H1/canonical/layout/cms leak "+doc.id);
    for(let i=0;i<2;i++){
     const img=imgs.nth(i);await img.scrollIntoViewIfNeeded();
     await img.evaluate(async el=>{if(!el.complete)await new Promise(resolve=>{
      el.addEventListener("load",resolve,{once:true});el.addEventListener("error",resolve,{once:true});
      setTimeout(resolve,35000);
     })});
     if(!(await img.evaluate(el=>el.complete&&el.naturalWidth>0)))
      throw Error("Public original shareholder scan browser decode failed "+doc.id+" image "+i+" width "+width);
    }
    report.rows.push({sourceId:doc.id,width,http:200,originalImages:2,
     decodedAll:true,canonical:can.pathname,noCmsLeak:true,overflow:false});
    console.log("PSE_ORIGINAL_INVESTOR_LIVE_ROW="+JSON.stringify(report.rows.at(-1)));
   }finally{await page.close()}
  }
 }
 await inert.close();
 if(report.sourcePosts.length!==2||report.media.length!==4||report.rows.length!==4)
  throw Error("Incomplete investor original source QA coverage");
 console.log("PSE_TWO_ORIGINAL_INVESTOR_LIVE_PASS="+JSON.stringify({
  sourceIds:[338,1085],nativePosts:2,originalSourceJPEG:4,originalProxyDigestPass:4,
  mobileDesktopRows:4,decodedBrowserScans:8,originalCreatedDatesProven:true,
  readOnly:true,noCmsWrites:true,noBuild:true}));
}finally{
 await mkdir("artifacts/pse-original-investor-live",{recursive:true});
 await writeFile("artifacts/pse-original-investor-live/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await browser.close();
}
