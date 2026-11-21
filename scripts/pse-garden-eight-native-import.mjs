/** Exact source-authorized Phú Mỹ Garden 8 product/Media migration.
 * PSE WordPress native Product + ProductCategory only; NEVER hardcode Astro.
 * No writes for read-only audits; apply gated by exact owner request event.
 * A fresh Updraft DB-only rollback backup is required by the apply workflow.
 */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";

const repo="ngocnhanvo/psevn-actions",expectedMessage="cms(pse): import eight original Phu My Garden products";
if(process.env.GITHUB_REPOSITORY!==repo)throw Error("Wrong PSE Actions repo");
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const apply=event.head_commit?.message===expectedMessage;
if(apply&&(process.env.GITHUB_REF!=="refs/heads/main"||process.env.GITHUB_EVENT_NAME!=="push"))
 throw Error("Untrusted Garden write event");
const sourceUrl="https://pse.vn/hoat-dong-kinh-doanh/san-pham/nhom-phan-hon-hop-npk-phu-my/8-trang-chu.html";
const config=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
function origin(key){
 const rows=config.filter(x=>x.startsWith(key+"="));
 if(rows.length!==1)throw Error("Missing unique "+key);
 const x=new URL(rows[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
 if(x.protocol!=="https:"||x.username||x.password||x.port||x.search||x.hash||
   !["","/"].includes(x.pathname))throw Error("Untrusted "+key+" origin");
 return x.origin;
}
const wp=origin("WC_URL"),front=origin("WC_URL_CLIENT");
if(wp===front)throw Error("Cannot target public frontend as CMS");
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const digest=b=>createHash("sha256").update(b).digest("hex");
const normalize=s=>String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/gi,"d").toLowerCase().replace(/\s+/g," ").trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const safeName=x=>/^[A-Za-z0-9._-]{4,90}\.png$/.test(x);
const expect=new Map([
 ["PMGarden009.png",{formula:"NPK 20-20-15+TE",crop:"Cây ăn trái",weight:"1 kg/túi"}],
 ["PMGarden002.png",{formula:"NPK 20-5-5+TE",crop:"Cây ăn trái",weight:"500gr/túi"}],
 ["PMGarden003.png",{formula:"NPK 20-20-15+TE",crop:"Cây hoa cảnh",weight:"1 kg/túi"}],
 ["PMGarden004.png",{formula:"NPK 20-5-5+TE",crop:"Cây hoa cảnh",weight:"500gr/túi"}],
 ["PMGarden005.png",{formula:"NPK 20-20-15+TE",crop:"Rau - Củ - Quả",weight:"1 kg/túi"}],
 ["PMGarden006.png",{formula:"NPK 20-5-5+TE",crop:"Rau - Củ - Quả",weight:"500gr/túi"}],
 ["PMGarden007.png",{formula:"Đạm Phú Mỹ + Kebo",crop:"Rau ăn lá",weight:"500gr/túi"}],
 ["PMGarden008.png",{formula:"NPK 16-16-8+13S+TE",crop:"Rau ăn lá",weight:"500gr/túi"}]
]);
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({javaScriptEnabled:false});
await ctx.route("**/*",route=>route.abort());
const net=await request.newContext({timeout:60000,ignoreHTTPSErrors:false});
const admin=await browser.newPage({viewport:{width:1366,height:900}});
const report={schema:"pse-eight-garden-original-native-products-v1",mode:apply?"apply":"source-only",
 originalSourceUrl:sourceUrl,expectedImages:8,source:[],cms:{},assets:[],products:[],writes:[],
 errors:[],summary:{},sourceSeo:"SEO_SOURCE_MISSING"};
let nonce="";
async function getUrl(url,timeout=65000){
 for(let n=1;n<=3;n++){
  try{
   const res=await net.get(url,{timeout,maxRedirects:2,failOnStatusCode:false});
   if(res.status()===200)return res;
   if(res.status()<500)throw Error("Source GET permanent HTTP "+res.status()+" "+url);
   if(n===3)throw Error("Source GET exhausted HTTP "+res.status());
  }catch(e){
   if(/permanent/.test(String(e?.message||""))||n===3)throw e;
  }
  await sleep(n*900);
 }
 throw Error("Unreachable trusted source URL "+url);
}
async function wpRest(path,method="GET",data=null){
 if(!path.startsWith("/wp-json/")||path.includes("..")||path.startsWith("//"))
  throw Error("Unsafe WordPress REST path");
 return admin.evaluate(async({path,method,data,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{
   "X-WP-Nonce":nonce,Accept:"application/json",
   ...(data?{"Content-Type":"application/json"}:{})},
   ...(data?{body:JSON.stringify(data)}:{})});
  return{http:r.status,data:await r.json().catch(()=>null),
   pages:Number(r.headers.get("X-WP-TotalPages")||1),total:Number(r.headers.get("X-WP-Total")||0)};
 },{path,method,data,nonce});
}
async function wpRead(path){
 for(let attempt=1;attempt<=3;attempt++){
  try{
   const r=await wpRest(path);
   if(r.http===200||r.http<500)return r;
   if(attempt===3)throw Error("WordPress GET HTTP "+r.http+" "+path);
  }catch(e){if(attempt===3)throw e}
  await sleep(attempt*650);
 }
 throw Error("WordPress GET retry exhausted");
}
try{
 const response=await getUrl(sourceUrl);
 const html=await response.text();
 if(html.length<500||html.length>8_000_000)throw Error("Original Garden source HTML size unexpected");
 const page=await ctx.newPage();
 let extracted;
 try{
  await page.setContent('<base href="'+sourceUrl+'">'+html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),
   {waitUntil:"domcontentloaded",timeout:25000});
  extracted=await page.evaluate(()=>{
   const root=document.querySelector(".item-page [itemprop=articleBody],.item-page,article")||document.body;
   const headings=[...root.querySelectorAll("h1,h2,h3,h4")].map(x=>(x.textContent||"").replace(/\s+/g," ").trim());
   const rows=[...root.querySelectorAll("img[src]")].filter(img=>
     /pmgarden\s*0?\d/i.test((img.getAttribute("src")||"")+" "+(img.alt||""))).map(img=>{
    const tr=img.closest("tr"),td=tr?[...tr.children].find(x=>x.tagName==="TD"&&!x.contains(img)):null;
    const body=String((td||tr||img.parentElement)?.textContent||"").replace(/\s+/g," ").trim();
    const formula=body.match(/(?:NPK\s*\d+\s*-\s*\d+\s*-\s*\d+(?:\+\d+S)?(?:\s*vi sinh)?(?:\s*\+TE)?|Đạm Phú Mỹ\s*\+\s*Kebo)/i);
    const crop=body.match(/Loại cây trồng\s*:\s*(.{3,90}?)(?:Đặt hàng\s*:|$)/i);
    const weight=body.match(/(?:trọng lượng tịnh|trọng lượng)\s*([\d.,]+\s*(?:kg|gr|g)\s*\/\s*túi)/i);
    const shop=[...((td||tr||img.parentElement)?.querySelectorAll('a[href]')||[])]
     .map(a=>a.href).find(x=>x.startsWith("https://shopee.vn/phumygarden"))||null;
    return{filename:decodeURIComponent(new URL(img.src).pathname.split("/").at(-1)),
     sourceUrl:img.src,formula:formula?.[0]?.replace(/\s+/g," ").trim()||null,
     crop:crop?.[1]?.trim()||null,weight:weight?.[1]?.trim()||null,
     body:body.slice(0,2000),shop};
   });
   return{headings,rows};
  });
 }finally{await page.close()}
 if(!extracted.headings.some(x=>normalize(x)==="phu my garden"))
  throw Error("Original section heading changed");
 if(extracted.rows.length!==8||new Set(extracted.rows.map(x=>x.filename)).size!==8)
  throw Error("Original Garden image count/identity changed");
 for(const row of extracted.rows){
  const ref=expect.get(row.filename),url=new URL(row.sourceUrl);
  if(!ref||!safeName(row.filename)||url.protocol!=="https:"||
    !["www.pse.vn","pse.vn"].includes(url.hostname)||
    url.pathname!=="/images/"+row.filename||url.search||url.hash)
   throw Error("Unsafe source Garden image path "+row.filename);
  if(normalize(row.formula||"")!==normalize(ref.formula)||
     normalize(row.crop||"")!==normalize(ref.crop)||
     normalize(row.weight||"").replace(/\s+/g,"")!==normalize(ref.weight).replace(/\s+/g,"")||
     row.body.length<80)
   throw Error("Source Garden specification changed "+row.filename);
  if(row.shop&&row.shop!=="https://shopee.vn/phumygarden#product_list")
   throw Error("Unknown source shop destination");
  row.slug="phu-my-garden-"+row.filename.toLowerCase().replace(/\.png$/,"");
  row.title="Phú Mỹ Garden - "+ref.formula+" - "+ref.crop+" ("+ref.weight+")";
  row.excerpt=ref.formula+"; "+ref.crop+"; túi "+ref.weight;
  row.content="<p>"+esc(row.body)+"</p>"+(row.shop?
   '<p><a href="'+esc(row.shop)+'" rel="noopener noreferrer">Đặt hàng Phú Mỹ Garden</a></p>':"");
 }
 // Download/validate the exact eight original PNG bytes BEFORE any CMS write.
 // GET failures do not create partial Product drafts or guessed Media.
 for(const row of extracted.rows){
  const r=await getUrl(row.sourceUrl,60000);
  if(new URL(r.url()).hostname!=="pse.vn"&&new URL(r.url()).hostname!=="www.pse.vn")
   throw Error("Original Garden media redirected to outside source host");
  const body=await r.body();
  if(body.length<300||body.length>20_000_000||
    !body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||
    !String(r.headers()["content-type"]||"").toLowerCase().startsWith("image/png"))
   throw Error("Original Garden PNG invalid "+row.filename);
  row.sha256=digest(body);row.bytes=body.length;row.originalBytes=body;
  report.assets.push({filename:row.filename,sourceUrl:row.sourceUrl,
   sha256:row.sha256,bytes:body.length,verifiedOriginalPNG:true});
  report.source.push({filename:row.filename,formula:row.formula,crop:row.crop,
   weight:row.weight,slug:row.slug,title:row.title});
  console.log("PSE_GARDEN_ORIGINAL_IMAGE="+JSON.stringify(report.assets.at(-1)));
 }
 await admin.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=(await admin.locator("#loginform").innerText()).slice(0,500),
   m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i);
  if(m){
   const v=({"+":+m[1]+ +m[3],"-":+m[1]- +m[3],"*":+m[1]* +m[3],"×":+m[1]* +m[3],x:+m[1]* +m[3]})[m[2]];
   const inp=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await inp.count())throw Error("WordPress challenge field absent");
   await inp.fill(String(v));
  }
  await admin.locator("#wp-submit").click();
 }
 await admin.goto(wp+"/wp-admin/post.php?post=248&action=edit",
  {waitUntil:"domcontentloaded",timeout:65000});
 if(admin.url().includes("wp-login")||!await admin.locator("#adminmenu").count())
  throw Error("WordPress guarded Garden audit authentication denied");
 nonce=await admin.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("Native WP REST nonce denied");
  return(await r.text()).trim();
 });
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error("Invalid nonce");
 const [cats,products]=await Promise.all([
  wpRead("/wp-json/wp/v2/product_cat?context=edit&per_page=100&hide_empty=false&_fields=id,slug,name,parent"),
  wpRead("/wp-json/wp/v2/product?context=edit&status=publish,draft,private&per_page=100&_fields=id,slug,status,title,featured_media,product_cat,content,excerpt")
 ]);
 if(cats.http!==200||!Array.isArray(cats.data)||products.http!==200||
  !Array.isArray(products.data)||products.data.length<40||products.data.length>100)
  throw Error("Native Product/Categories incomplete");
 const root=cats.data.filter(x=>x.slug==="phan-bon-phu-my");
 if(root.length!==1||Number(root[0].parent)!==0)throw Error("Missing native fertilizer root taxonomy");
 const gardens=cats.data.filter(x=>x.slug==="phu-my-garden");
 if(gardens.length>1||gardens.length===1&&(
   gardens[0].name!=="Phú Mỹ Garden"||Number(gardens[0].parent)!==Number(root[0].id)))
  throw Error("Native Garden taxonomy collision");
 const existingBySlug=new Map(products.data.map(p=>[p.slug,p]));
 for(const row of extracted.rows){
  const existing=existingBySlug.get(row.slug);
  if(existing){
   const title=String(existing.title?.raw||existing.title?.rendered||"").trim();
   if(title!==row.title||!["publish","draft"].includes(existing.status))
    throw Error("Unrelated WordPress Product owns original Garden slug "+row.slug);
  }
  row.existing=existing||null;
 }
 // Enumerate the actual native Media filesystem filenames, not just search
 // fields; WordPress search may omit stored filenames with edited titles.
 const filenames=new Map();
 let registryPages=0,mediaTotal=0;
 for(let pg=1;pg<=75;pg++){
  const r=await wpRead("/wp-json/wp/v2/media?context=edit&per_page=100&page="+pg+
   "&_fields=id,slug,mime_type,media_details,source_url");
  if(r.http!==200||!Array.isArray(r.data)||!Number.isSafeInteger(r.pages)||r.pages>75)
   throw Error("Full protected Media registry unavailable page "+pg);
  registryPages++;mediaTotal+=r.data.length;
  for(const media of r.data){
   const file=String(media.media_details?.file||"").split("/").at(-1);
   if(!expect.has(file))continue;
   if(!filenames.has(file))filenames.set(file,[]);
   filenames.get(file).push(media);
  }
  if(pg>=r.pages)break;
 }
 for(const row of extracted.rows){
  const found=filenames.get(row.filename)||[];
  if(found.length>1)throw Error("More than one native Media owns Garden original filename "+row.filename);
  if(found.length===1){
   const media=found[0],path=String(media.media_details?.file||"").replace(/^\/+/,"");
   if(media.mime_type!=="image/png"||!path.split("/").every(s=>/^[A-Za-z0-9._-]+$/.test(s)))
    throw Error("Native Media conflict "+row.filename);
   const r=await getUrl(wp+"/wp-content/uploads/"+path,55000);
   const actual=await r.body();
   if(digest(actual)!==row.sha256)
    throw Error("Native WordPress filename collision different bytes "+row.filename);
   row.mediaId=Number(media.id);
  }
 }
 report.cms={existingProducts:products.data.length,rootCategoryId:Number(root[0].id),
  existingGardenCategoryId:gardens[0]?.id||null,mediaPages:registryPages,
  mediaItems:mediaTotal,existingGardenPhotos:extracted.rows.filter(x=>x.mediaId).length,
  existingGardenProducts:extracted.rows.filter(x=>x.existing?.status==="publish").length};
 console.log("PSE_GARDEN_PREFLIGHT="+JSON.stringify({
  ...report.cms,verifiedOriginalImages:8,rows:8,mode:report.mode,
  unchangedOrExisting:report.cms.existingGardenProducts,readOnly:!apply
 }));
 if(!apply){
  report.summary={decision:"SOURCE_GARDEN_NATIVE_PREFLIGHT_PASS",rows:8,
   verifiedOriginalImages:8,existingProductRows:report.cms.existingGardenProducts,
   sourceSeoMissing:true,noCmsWrites:true,noBuild:true};
  console.log("PSE_GARDEN_NATIVE_DRY_PASS="+JSON.stringify(report.summary));
 }else{
  if(process.env.PSE_GARDEN_FRESH_BACKUP_VERIFIED!=="yes")
   throw Error("Refuse native Garden writes without just-completed Updraft DB backup");
  let gardenTerm=gardens[0]||null;
  if(!gardenTerm){
   const saved=await wpRest("/wp-json/wp/v2/product_cat","POST",
    {name:"Phú Mỹ Garden",slug:"phu-my-garden",parent:Number(root[0].id)});
   if(saved.http!==201||saved.data?.slug!=="phu-my-garden"||
      Number(saved.data.parent)!==Number(root[0].id))throw Error("Garden term create failed");
   gardenTerm=saved.data;
   report.writes.push({type:"product_cat",id:gardenTerm.id});
  }
  // Every original Product row has a unique source image, growing only the
  // allowed 8-record scope. Each asset and Product save is read-after-written.
  for(const row of extracted.rows){
   let mediaId=row.mediaId||null;
   if(!mediaId){
    const receipt=await admin.context().request.post(wp+"/wp-json/wp/v2/media",{
     data:row.originalBytes,
     headers:{"X-WP-Nonce":nonce,"Content-Type":"image/png",
      "Content-Disposition":'attachment; filename="'+row.filename+'"',
      Accept:"application/json"},timeout:120000});
    const data=await receipt.json().catch(()=>({}));
    if(receipt.status()!==201||!Number.isSafeInteger(Number(data.id))||
       data.mime_type!=="image/png")
     throw Error("Native Garden Media upload ambiguous; stop without replay "+row.filename);
    mediaId=Number(data.id);
    report.writes.push({type:"media",id:mediaId,filename:row.filename});
   }
   const media=await wpRead("/wp-json/wp/v2/media/"+mediaId+"?context=edit");
   const file=String(media.data?.media_details?.file||"").replace(/^\/+/,"");
   if(media.http!==200||!file.endsWith("/"+row.filename)||media.data.mime_type!=="image/png")
    throw Error("Garden Media readback filename mismatch "+row.filename);
   const verified=await getUrl(wp+"/wp-content/uploads/"+file,55000);
   if(digest(await verified.body())!==row.sha256)
    throw Error("Original Garden image digest mismatch after Media upload "+row.filename);
   if(media.data.alt_text!==row.title){
    const edited=await wpRest("/wp-json/wp/v2/media/"+mediaId,"POST",{alt_text:row.title});
    if(edited.http!==200||edited.data?.alt_text!==row.title)
     throw Error("Garden Media alt change failed "+row.filename);
   }
   let wpId=row.existing?.id||null;
   if(!wpId){
    const saved=await wpRest("/wp-json/wp/v2/product","POST",
     {title:row.title,slug:row.slug,status:"draft",excerpt:row.excerpt,
      content:row.content,product_cat:[Number(gardenTerm.id)],featured_media:mediaId});
    if(saved.http!==201||saved.data?.slug!==row.slug||!Number.isSafeInteger(Number(saved.data.id)))
     throw Error("Garden Product draft create failed "+row.slug);
    wpId=Number(saved.data.id);
    report.writes.push({type:"product",id:wpId,slug:row.slug});
   }
   const inspected=await wpRead("/wp-json/wp/v2/product/"+wpId+"?context=edit");
   if(inspected.http!==200||inspected.data.slug!==row.slug||
      String(inspected.data.title?.raw||inspected.data.title?.rendered||"")!==row.title||
      Number(inspected.data.featured_media)!==mediaId||
      !inspected.data.product_cat?.includes(Number(gardenTerm.id)))
    throw Error("Guarded Garden Product readback failed "+row.slug);
   if(inspected.data.status!=="publish"){
    const pub=await wpRest("/wp-json/wp/v2/product/"+wpId,"POST",{status:"publish"});
    if(pub.http!==200||pub.data.status!=="publish")
     throw Error("Native Garden Product publication failed "+row.slug);
   }
   const final=await wpRead("/wp-json/wp/v2/product/"+wpId+"?context=edit");
   if(final.http!==200||final.data.status!=="publish"||
      Number(final.data.featured_media)!==mediaId)
    throw Error("Final Garden Product publication readback failed "+row.slug);
   report.products.push({filename:row.filename,wpProductId:wpId,mediaId,
    slug:row.slug,status:"publish",sourceSha256:row.sha256,seo:"SEO_SOURCE_MISSING"});
   console.log("PSE_GARDEN_NATIVE_PRODUCT_SAVED="+JSON.stringify(report.products.at(-1)));
  }
  report.summary={decision:"GARDEN_NATIVE_WORDPRESS_APPLY_PASS",
   published:report.products.length,sourceRows:8,
   originalImagesVerified:8,wpMediaNamesPreserved:true,
   wordpressWrites:report.writes.length,buildTriggered:false};
  if(report.products.length!==8)throw Error("Incomplete native Garden source-backed scope");
  console.log("PSE_GARDEN_NATIVE_APPLY_PASS="+JSON.stringify(report.summary));
 }
}finally{
 // Do not put original binary blobs or credentials into retained artifacts.
 for(const row of report.source)delete row.originalBytes;
 await mkdir("artifacts/pse-garden-native-import",{recursive:true});
 await writeFile("artifacts/pse-garden-native-import/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await ctx.close();await browser.close();
}