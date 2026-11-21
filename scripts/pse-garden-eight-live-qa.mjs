/** Strict PSE Phú Mỹ Garden eight original Products after signed Astro deploy.
 * Independent immutable original PNG digests + live WP Product/Media + Astro
 * responsive details/category; strictly read-only, NOT an importer or build.
 */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
const repo="ngocnhanvo/psevn-actions";
const evt=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
if(process.env.GITHUB_REPOSITORY!==repo||process.env.GITHUB_REF!=="refs/heads/main"||
 evt.head_commit?.message!=="test(pse): original eight Garden products postrelease acceptance")
 throw Error("Wrong PSE Garden read-only QA request context");
const variables=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const origin=key=>{
 const rows=variables.filter(x=>x.startsWith(key+"="));
 if(rows.length!==1)throw Error("Missing unique "+key);
 const u=new URL(rows[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.port||u.search||u.hash||
  !["","/"].includes(u.pathname))throw Error("Invalid WP/frontend origin "+key);
 return u.origin;
};
const wp=origin("WC_URL"),front=origin("WC_URL_CLIENT");
if(wp===front)throw Error("PSE CMS/frontend origins overlap");
const variants=[
 {name:"PMGarden009.png",sha:"8ca49ed13ec9b1953822ab8dd1ed4d48a1dac70cec70d61dfad0bf5ea4994ceb",crop:"Cây ăn trái",formula:"NPK 20-20-15+TE"},
 {name:"PMGarden002.png",sha:"4e437b3ed1fb3b628ebc63465e3cfefd52096fbb571c0c2b8ce228491bf7b077",crop:"Cây ăn trái",formula:"NPK 20-5-5+TE"},
 {name:"PMGarden003.png",sha:"a1837d1e26b6bff1978e2584f23927cf8aec9ab036f16a74ea1d98ed23420f19",crop:"Cây hoa cảnh",formula:"NPK 20-20-15+TE"},
 {name:"PMGarden004.png",sha:"852e68cf846ace3f63651c3353ac3aafb617c322db52ee4e0927ed3705b0da38",crop:"Cây hoa cảnh",formula:"NPK 20-5-5+TE"},
 {name:"PMGarden005.png",sha:"0f32d870c03ebe175cfcbe4c617f8b60f43a7ccae524ce648f03ab58f4c8ccb7",crop:"Rau - Củ - Quả",formula:"NPK 20-20-15+TE"},
 {name:"PMGarden006.png",sha:"3981e6b6566dcd75c34bae39428c6fece31e6782db9dd9c38a9c5f7e52cbe4c7",crop:"Rau - Củ - Quả",formula:"NPK 20-5-5+TE"},
 {name:"PMGarden007.png",sha:"9fe8a0b29ba7a7e74005b36258649bcfecd0679dab484fb49fbf75935b4f2e2e",crop:"Rau ăn lá",formula:"Đạm Phú Mỹ + Kebo"},
 {name:"PMGarden008.png",sha:"a662f0e053002d976528cdfae18d6440b6d60c3a53cb312408cfe4c9a4be433a",crop:"Rau ăn lá",formula:"NPK 16-16-8+13S+TE"}
];
const slugOf=x=>"phu-my-garden-"+x.name.toLowerCase().replace(/\.png$/,"");
const normal=s=>String(s||"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
// Joomla authoring uses ASCII dashes; WordPress wptexturize may render U+2013.
// Match only this typographic dash equivalence; keep formula, crop and taxonomy strict.
const cropComparable=s=>normal(s).replace(/[\u2010-\u2015\u2212]/g,"-");
const browser=await chromium.launch({headless:true}),net=await request.newContext({timeout:40000});
const report={schema:"pse-eight-original-garden-live-acceptance-v1",readOnly:true,
 sourceOwnership:"verified-original-PNG-SHA256",rows:[],category:{},media:[],issues:[],summary:{}};
try{
 await mkdir("artifacts/pse-garden-eight-live",{recursive:true});
 const get=async path=>{
  const res=await net.get(wp+path,{timeout:45000});
  if(res.status()!==200)throw Error("Native public WP source endpoint HTTP "+res.status()+" "+path);
  return await res.json();
 };
 const [products,cats]=await Promise.all([
  get("/wp-json/wp/v2/product?status=publish&per_page=100&_fields=id,slug,title,excerpt,content,product_cat,featured_media"),
  get("/wp-json/wp/v2/product_cat?per_page=100&hide_empty=false&_fields=id,slug,name,parent")
 ]);
 if(!Array.isArray(products)||products.length!==53)throw Error("Expected 45 original+8 Garden Products; got "+products.length);
 const gardenTerm=cats.filter(c=>c.slug==="phu-my-garden"),
  rootTerm=cats.filter(c=>c.slug==="phan-bon-phu-my");
 if(gardenTerm.length!==1||rootTerm.length!==1||
    gardenTerm[0].name!=="Phú Mỹ Garden"||Number(gardenTerm[0].parent)!==Number(rootTerm[0].id))
  throw Error("Exact native WordPress Garden taxonomy missing");
 const gardenProducts=products.filter(p=>variants.some(v=>p.slug===slugOf(v)));
 if(gardenProducts.length!==8)throw Error("Original Garden Product slug set incomplete");
 for(const target of variants){
  const slug=slugOf(target),record=products.find(p=>p.slug===slug);
  const title=normal(record?.title?.rendered||record?.title?.raw);
  if(!record||!record.product_cat?.includes(Number(gardenTerm[0].id))||
     !title.includes("Phú Mỹ Garden")||!title.includes(target.formula)||!cropComparable(title).includes(cropComparable(target.crop))||
     !Number.isSafeInteger(Number(record.featured_media))||Number(record.featured_media)<1)
   throw Error("Native Garden Product identity/category/title missing "+slug);
  const media=await get("/wp-json/wp/v2/media/"+record.featured_media+
   "?_fields=id,slug,mime_type,media_details,alt_text");
  const file=String(media.media_details?.file||"").replace(/^\/+/,"");
  if(media.mime_type!=="image/png"||file.split("/").at(-1)!==target.name||
    !file.split("/").every(x=>/^[a-zA-Z0-9._-]+$/.test(x))||
    !media.alt_text?.includes("Phú Mỹ Garden"))
   throw Error("Native Garden original Media identity missing "+slug);
  const proxy=front+"/api/files/wp-content/uploads/"+file;
  const original=await net.get(proxy,{timeout:40000,failOnStatusCode:false});
  if(original.status()!==200||!String(original.headers()["content-type"]||"").toLowerCase().startsWith("image/png"))
   throw Error("Astro native source-image proxy unavailable "+slug);
  const sha=createHash("sha256").update(await original.body()).digest("hex");
  if(sha!==target.sha)throw Error("Original Joomla PNG digest mismatch on frontend "+slug);
  report.media.push({slug,filename:target.name,mediaId:record.featured_media,sha256Pass:true,http:200});
  for(const width of [390,1440]){
   const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
   try{
    const leaks=[];page.on("request",r=>{try{if(new URL(r.url()).origin===wp)leaks.push(r.url())}catch{}});
    const url=front+"/san-pham/"+slug,res=await page.goto(url,{waitUntil:"domcontentloaded",timeout:65000});
    if(res?.status()!==200)throw Error("Live Garden Product page HTTP "+res?.status()+" "+slug);
    const dom=await page.evaluate(name=>({
     h1:[...document.querySelectorAll("h1")].map(x=>(x.textContent||"").replace(/\s+/g," ").trim()),
     canonical:document.querySelector('link[rel="canonical"]')?.href||"",
     matchingImages:[...document.querySelectorAll("main img, #main-content img")]
      .filter(x=>(x.currentSrc||x.src||"").includes(name)).map(x=>({src:x.currentSrc||x.src,loaded:x.complete&&x.naturalWidth>0})),
     overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2
    }),target.name);
    const canon=dom.canonical?new URL(dom.canonical,front):null;
    if(dom.h1.length!==1||!dom.h1[0].includes(target.formula)||!cropComparable(dom.h1[0]).includes(cropComparable(target.crop))||
      !canon||canon.origin!==front||canon.pathname!=="/san-pham/"+slug||canon.search||canon.hash||
      dom.overflow||leaks.length)
     throw Error("Live Garden Product SEO/mobile/privacy mismatch "+slug+" width "+width);
    const stem=target.name.replace(/\.png$/,"");
    const pics=page.locator('main img[src*="'+stem+'"],#main-content img[src*="'+stem+'"]');
    if(!await pics.count()&&!dom.matchingImages.length)
     throw Error("Garden original photo absent on detail "+slug);
    const check=await pics.count()?pics.first():null;
    if(check){
      await check.scrollIntoViewIfNeeded();
      await check.evaluate(async image=>{
       if(!image.complete)await new Promise(resolve=>{
        image.addEventListener("load",resolve,{once:true});
        image.addEventListener("error",resolve,{once:true});
        setTimeout(resolve,12000)});
      });
      if(!await check.evaluate(x=>x.complete&&x.naturalWidth>0))
       throw Error("Garden original image failed pixel decode "+slug);
    }
    const row={slug,width,wpId:record.id,sourceImage:target.name,canonical:canon.pathname,
     originalSha256Pass:true,productVisible:true,overflow:false,cmsLeak:false};
    report.rows.push(row);
    console.log("PSE_GARDEN_LIVE_ROW="+JSON.stringify(row));
    if([variants[0].name,variants.at(-1).name].includes(target.name))
     await page.screenshot({path:"artifacts/pse-garden-eight-live/"+target.name+"-"+width+".png",
      fullPage:true,animations:"disabled"}).catch(()=>{});
   }finally{await page.close()}
  }
 }
 // The new native Garden term must be accessible as a product archive rather
 // than relying solely on 8 orphaned direct detail URLs.
 const page=await browser.newPage({viewport:{width:390,height:900}});
 try{
  const target=front+"/san-pham/phu-my-garden",res=await page.goto(target,{waitUntil:"domcontentloaded",timeout:65000});
  if(res?.status()!==200)throw Error("Garden native ProductCategory archive HTTP "+res?.status());
  const anchors=await page.locator('a[href]').evaluateAll(es=>es.map(x=>x.getAttribute("href")||""));
  const found=variants.filter(x=>anchors.some(a=>a.includes(slugOf(x)))).length;
  if(found!==8)throw Error("Garden archive did not expose all eight genuine Product cards "+found+"/8");
  report.category={path:"/san-pham/phu-my-garden",http:200,sourceOwnedProducts:8,found,rootId:rootTerm[0].id};
 }finally{await page.close()}
 report.summary={nativeOriginalProducts:8,sourcePNGMatches:report.media.length,
  responsiveRows:report.rows.length,categoryArchive:report.category.http,
  originalSixCategoryProducts:45,publishedNativeProducts:53,readOnly:true,noBuild:true};
 if(report.rows.length!==16||report.media.length!==8)throw Error("Incomplete Garden production acceptance");
 console.log("PSE_GARDEN_EIGHT_LIVE_PASS="+JSON.stringify(report.summary));
}finally{
 await mkdir("artifacts/pse-garden-eight-live",{recursive:true});
 await writeFile("artifacts/pse-garden-eight-live/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await browser.close();
}