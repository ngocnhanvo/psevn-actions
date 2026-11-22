/** Exact original Joomla #1434 public HTML + original owner-owned media manifest (READ ONLY).
 * Third-party dpm.vn img is intentionally NOT fetched or rehosted per owner policy.
 */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")
 throw Error("Wrong original PSE repository");
const hash=b=>createHash("sha256").update(b).digest("hex");
const norm=s=>String(s||"").normalize("NFKC").replace(/\s+/g," ").trim();
const source=JSON.parse(await readFile("inputs/previous/report.json","utf8"));
const ftp=JSON.parse(await readFile("inputs/first/report.json","utf8"));
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const original=state.articles?.[1434],originalUrl="https://pse.vn"+new URL(original?.source_url||"https://invalid.local").pathname;
const SOURCE_SHA="128f19004566d9635f5fd790b2695414384da294f85f0775e81806a961b7e1ce";
if(source.schema!=="pse-1434-npk-original-family-vs-native-category-v1"||
 source.sourceId!==1434||source.source?.bodySha256!==SOURCE_SHA||
 source.originalImages?.length!==20||source.source?.imageCount!==20||
 original?.status!=="quarantined"||!originalUrl.endsWith("/1434-npk-phu-my.html")||
 ftp.schema!=="pse-original-1434-pse-owned-first-png-source-ftps-v1"||
 !ftp.verifiedOriginalByteIdentity||ftp.sha256!=="eb8569ce6a2d6957eab3afd3d7cd85573fed5ce0e0e3edbdd43f335e22b3fa64")
 throw Error("Independent original Joomla source + exact FTP photo provenance mismatch");
const fst=await readFile("inputs/first/original-1434-6-05372.png");
if(hash(fst)!==ftp.sha256||fst.length!==ftp.originalBytes)
 throw Error("Pinned exact original owner FTP photo SHA mismatch");
const out="artifacts/pse-original-1434-full-source";
await mkdir(out,{recursive:true});
const report={schema:"pse-original-1434-full-public-source-and-images-v1",
 originalUrl,sourceId:1434,sourceBodySha256:SOURCE_SHA,
 exactPsePhotoCount:19,externalOriginalPhotoCount:1,
 originalImages:[],ownerThirdPartyPolicy:"retain dpm.vn src without WordPress import",
 noWordPressWrites:true,noFTPReads:true,noBuild:true,success:false,
 originalTextVerified:false,originalTitle:"NPK Phú Mỹ"};
const save=()=>writeFile(out+"/report.json",JSON.stringify(report,null,2)+"\n");
const b=await chromium.launch({headless:true}),ctx=await b.newContext({javaScriptEnabled:false});
await ctx.route("**/*",r=>r.abort());
const page=await ctx.newPage(),net=await request.newContext({timeout:40000});
const get=async(url,attempts=2)=>{
 let last=null;
 for(let n=1;n<=attempts;n++){
  try{
   const r=await net.get(url,{failOnStatusCode:false,maxRedirects:2,timeout:45000});
   if(r.status()===200)return r;
   last="HTTP "+r.status();
   if(![500,502,503,504].includes(r.status())||n===attempts)return r;
  }catch(e){
   last=String(e?.name||"network");
   if(n===attempts||!/Timeout|ECONNRESET|socket hang up|ECONNABORTED/i.test(String(e?.name||"")+" "+String(e?.message||"")))
    throw Error("Original public source transfer unavailable");
  }
  await new Promise(resolve=>setTimeout(resolve,n*800));
 }
 throw Error("Source GET exhausted "+last);
};
try{
 const originalPage=await get(originalUrl);
 if(originalPage.status()!==200)throw Error("Original Joomla source article HTML HTTP "+originalPage.status());
 const html=await originalPage.text();
 if(html.length<500||html.length>5000000)throw Error("Original public HTML out of bounds");
 await page.setContent('<base href="'+originalUrl+'">'+html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),
   {waitUntil:"domcontentloaded",timeout:25000});
 const data=await page.evaluate(()=>{
  const root=document.querySelector('.item-page [itemprop="articleBody"]')||
    document.querySelector(".item-page")||document.querySelector("article");
  if(!root)throw Error("Original source body disappeared");
  const n=s=>String(s||"").normalize("NFKC").replace(/\s+/g," ").trim();
  return {title:n(document.querySelector("h1,h2")?.textContent||document.title),
   body:n(root.textContent),html:root.innerHTML,
   tableCount:root.querySelectorAll("table").length,
   imageUrls:[...root.querySelectorAll("img[src]")].map(e=>new URL(e.getAttribute("src"),document.baseURI).href)};
 });
 if(data.title!=="NPK Phú Mỹ"||data.body.length!==6108||hash(data.body)!==SOURCE_SHA||
 data.imageUrls.length!==20||data.tableCount!==3)
  throw Error("Original public #1434 title/text/table/photo source oracle drift");
 await writeFile(out+"/source-1434.json",JSON.stringify(data,null,2)+"\n");
 report.originalTextVerified=true;
 let countOwner=0,countExternal=0;
 for(let index=0;index<20;index++){
  const item=source.originalImages[index],actual=new URL(data.imageUrls[index]);
  if(actual.pathname!==item.path||![actual.hostname,"pse.vn","www.pse.vn"].includes(item.host))
   throw Error("Original Joomla image order or path drift index "+index);
  if(!["https:","http:"].includes(actual.protocol)||actual.username||actual.password||actual.port)
   throw Error("Unsafe source URL index "+index);
  const ours=["pse.vn","www.pse.vn"].includes(item.host);
  const row={index,sourceUrl:actual.href,sourcePath:actual.pathname,ownerSite:ours,
   originalSourceFilename:decodeURIComponent(actual.pathname.split("/").at(-1)),
   sha256:item.sha256||null,expectedMediaBytes:item.bytes||null,
   assetName:null,externalOriginal:!ours,sourceType:null};
  report.originalImages.push(row);
  if(!ours){
   if(index!==4||item.host!=="dpm.vn"||actual.hostname!=="dpm.vn")throw Error("Unexpected third-party image");
   row.thirdPartyPolicy="preserve_exact_original_absolute_src";countExternal++;continue;
  }
  countOwner++;
  if(index===0){
   row.sha256=ftp.sha256;row.expectedMediaBytes=fst.length;
   row.assetName="original-index-00.png";row.sourceType="verified-original-FTP";
   await writeFile(out+"/"+row.assetName,fst);
   await save();
   continue;
  }
  if(!/^[a-f0-9]{64}$/.test(item.sha256||"")||!Number.isSafeInteger(item.bytes)||item.bytes<180)
   throw Error("Independently verified original Joomla binary missing index "+index);
  // Owner-controlled PSE host aliases are byte-hash checked against prior
  // independent original-source proof. No third-party image substitution.
  let bytes=null,code=null;
  for(const host of ["pse.vn","www.pse.vn"]){
   const url="https://"+host+actual.pathname;
   try{
    const image=await get(url,2);code=image.status();
    if(code!==200)continue;
    const length=Number(image.headers()["content-length"]||0);
    if(length>10000000)throw Error("Original owned image too large");
    const found=await image.body();
    if(found.length<180||found.length>10000000)throw Error("Bad original image length");
    const foundSHA=hash(found);
    if(foundSHA!==item.sha256)throw Error("Original image bytes changed index "+index);
    bytes=found;break;
   }catch(e){
    if(/Original image bytes changed|too large|Bad original image length/.test(String(e?.message||"")))throw e;
    console.log("PSE_1434_ORIGINAL_IMAGE_GET_ALT="+JSON.stringify({index,host,errorType:String(e?.name||"network").slice(0,28)}));
   }
  }
  if(!bytes)throw Error("Original PSE-owned image not retrieved index "+index+" HTTP "+code);
  const ext=row.originalSourceFilename.toLowerCase().endsWith(".jpg")?".jpg":".png";
  if(ext===".png"&&bytes.subarray(0,8).toString("hex")!=="89504e470d0a1a0a"||
     ext===".jpg"&&bytes.subarray(0,3).toString("hex")!=="ffd8ff")
   throw Error("Original source image magic mismatch "+index);
  row.assetName="original-index-"+String(index).padStart(2,"0")+ext;
  row.expectedMediaBytes=bytes.length;row.sourceType="verified-owner-public-original";
  await writeFile(out+"/"+row.assetName,bytes);
  await save();
  console.log("PSE_1434_ORIGINAL_COMPLETE_IMAGE="+JSON.stringify({index,bytes:bytes.length,sha256:item.sha256,sourceType:row.sourceType}));
 }
 if(countOwner!==19||countExternal!==1)throw Error("Original owner/thirdparty media count drift");
 report.success=true;await save();
 console.log("PSE_1434_FULL_SOURCE_AND_19_MEDIA_PASS="+JSON.stringify({sourceId:1434,sourceBodySHA:SOURCE_SHA,
  sourceImages:20,exactOriginalOwnedMedia:19,externalURLsPreserved:1,originalTables:3,
  noWordPressWrites:true}));
}catch(e){report.errorType=String(e?.name||"Error");report.errorMessage=String(e?.message||"").slice(0,170);await save();throw e}
finally{await net.dispose();await ctx.close();await b.close()}
