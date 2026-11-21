/** Snapshot native WordPress Media/Post progress while a separately locked
 * four-original-gallery importer runs. READ ONLY. Pagination can move during
 * uploads: numbers are observations, not final parity or permission to build.
 */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")
 throw Error("Wrong PSE Actions repo");
const albums=[
 {id:1053,slug:"1053-ngay-hoi-truyen-thong-2014",expected:76},
 {id:990,slug:"990-dai-hoi-chi-doan-2010",expected:98},
 {id:980,slug:"980-cong-trinh-dtn-kho-chua-dong-nai",expected:180},
 {id:975,slug:"975-dai-hoi-cong-doan-nhiem-ky-ii-10-2013",expected:110}
];
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const rows=env.filter(s=>s.startsWith("WC_URL="));
if(rows.length!==1)throw Error("Missing unique PSE WP origin");
const url=new URL(rows[0].slice(7).replace(/^['"]|['"]$/g,""));
if(url.protocol!=="https:"||url.username||url.password||url.port||url.search||url.hash||!["","/"].includes(url.pathname))
 throw Error("Unexpected PSE WP origin");
const origin=url.origin;
const report={schema:"pse-four-gallery-native-progress-readonly-v1",readOnly:true,
 wordpressWrites:0,astroBuilds:0,observedAt:new Date().toISOString(),
 paginationMayChangeDuringConcurrentImport:true,stableAscendingMediaId:true,mediaPagesRead:0,wpMediaTotal:null,
 mediaRecordsObserved:0,albums:[],errors:[]};
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1366,height:820}});
const source=await request.newContext({timeout:45000});
const inert=await browser.newContext({javaScriptEnabled:false});
await inert.route("**/*",route=>route.abort());
try{
 // An independent original URL -> filename oracle distinguishes exact
 // expected source media from merely similar gallery-id-prefixed files.
 const expectedByAlbum=new Map();
 const sourcePage=await inert.newPage();
 for(const a of albums){
  const orig="https://www.pse.vn/tin-tuc-su-kien/thu-vien/anh/"+a.slug+".html";
  const r=await source.get(orig,{timeout:45000,maxRedirects:2});
  if(r.status()!==200)throw Error("Original gallery HTTP "+r.status()+" id="+a.id);
  const html=await r.text();
  if(html.length<250||html.length>8000000)throw Error("Invalid gallery source body");
  await sourcePage.setContent('<base href="'+orig+'">'+html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded",timeout:25000});
  const urls=await sourcePage.evaluate(()=>{
   const root=document.querySelector(".item-page [itemprop=articleBody],.item-page,article,.blog")||document.body;
   return [...new Set([...root.querySelectorAll("a[href]")].map(e=>e.href).filter(h=>{
    try{const u=new URL(h);return u.hostname==="www.pse.vn"&&u.pathname.startsWith("/images/gallery/")&&/\.(?:jpe?g|png|webp)$/i.test(u.pathname)}catch{return false}
   }))];
  });
  if(urls.length!==a.expected)throw Error("Original gallery image count changed id="+a.id+" got="+urls.length);
  const names=urls.map(u=>"pse-gallery-"+a.id+"-"+createHash("sha256").update(u).digest("hex").slice(0,16)+"."+new URL(u).pathname.split(".").at(-1).toLowerCase().replace("jpeg","jpg"));
  if(new Set(names).size!==a.expected)throw Error("Original media filename collision");
  expectedByAlbum.set(a.id,new Set(names));
 }
 await inert.close();
 report.sourceOracleVerified=true;
 report.observedAt=new Date().toISOString();
 await page.goto(origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const loginText=(await page.locator("#loginform").innerText()).slice(0,500);
  const m=loginText.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){
   const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error("Unknown WP login challenge");
   await f.fill(String(v));
  }
  await page.locator("#wp-submit").click();
 }
 await page.goto(origin+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:65000});
 if(page.url().includes("wp-login")||!await page.locator("#adminmenu").count())
  throw Error("WordPress protected read-only authentication failed");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("Read-only REST nonce unavailable");
  return(await r.text()).trim();
 });
 const get=async path=>page.evaluate(async ({path,nonce})=>{
  const r=await fetch(path,{method:"GET",credentials:"same-origin",
   headers:{"X-WP-Nonce":nonce,Accept:"application/json"}});
  return{http:r.status,pages:Number(r.headers.get("X-WP-TotalPages")||1),
   total:Number(r.headers.get("X-WP-Total")||0),data:await r.json().catch(()=>null)};
 },{path,nonce});
 const byId=new Map(albums.map(x=>[x.id,{...x,observedMedia:0,
  exactFilenameCount:0,duplicateFilenames:[],unexpectedFilenames:[],missingFilenames:[],sampleMediaIds:[],publishedPost:null}]));
 const filenames=new Map(), seenMediaIds=new Set(), slugMismatches=[];
 let pagesExpected=null,lastMediaId=0;
 for(let n=1;n<=65;n++){
  let data,last="unavailable";
  for(let attempt=1;attempt<=3;attempt++){
   try{
    data=await get("/wp-json/wp/v2/media?context=edit&per_page=100&page="+n+
     "&orderby=id&order=asc&_fields=id,slug,mime_type,media_details");
    if(data.http===200||data.http<500)break;
    last="HTTP "+data.http;
   }catch(e){last=String(e?.name||"network").slice(0,80)}
   if(attempt<3)await new Promise(r=>setTimeout(r,attempt*450));
  }
  if(data?.http!==200||!Array.isArray(data.data)||!Number.isSafeInteger(data.pages)||
     data.pages<1||data.pages>65)
   throw Error("Native media page "+n+" failed "+last);
  if(pagesExpected===null){pagesExpected=data.pages;report.wpMediaTotal=data.total;}
  report.mediaPagesRead++;
  report.mediaRecordsObserved+=data.data.length;
  for(const media of data.data){
   const mediaId=Number(media.id);
   if(!Number.isSafeInteger(mediaId)||mediaId<1)throw Error("Unexpected native media ID");
   if(seenMediaIds.has(mediaId))continue;
   if(mediaId<lastMediaId)throw Error("Native Media response ignored ascending ID order");
   lastMediaId=mediaId;seenMediaIds.add(mediaId);
   const basename=String(media.media_details?.file||"").split("/").at(-1);
   const m=basename.match(/^pse-gallery-(1053|990|980|975)-[0-9a-f]{16}\.(?:jpe?g|png|webp)$/i);
   if(!m)continue;
   const id=Number(m[1]),row=byId.get(id);
   row.observedMedia++;
   if(media.slug!==basename.replace(/\.[^.]+$/,""))slugMismatches.push({id:mediaId,filename:basename,slug:media.slug});
   if(!expectedByAlbum.get(id).has(basename)){row.unexpectedFilenames.push(basename);continue;}
   if(!filenames.has(basename))filenames.set(basename,[]);
   filenames.get(basename).push(Number(media.id));
   if(row.sampleMediaIds.length<5)row.sampleMediaIds.push(Number(media.id));
  }
  if(n>=pagesExpected)break;
 }
 for(const [filename,ids] of filenames){
  const id=Number(filename.match(/^pse-gallery-(\d+)-/)[1]);
  const row=byId.get(id);
  row.exactFilenameCount++;
  if(ids.length>1)row.duplicateFilenames.push(filename);
 }
 for(const row of byId.values()){
  const result=await get("/wp-json/wp/v2/posts?context=edit&status=any&slug="+
   encodeURIComponent(row.slug)+"&per_page=5&_fields=id,slug,status,acf");
  if(result.http!==200||!Array.isArray(result.data))
   throw Error("Native Post read-only lookup failed "+row.id);
  if(result.data.length>1)throw Error("Duplicate same-slug source gallery Post "+row.id);
  const post=result.data[0];
  if(post){
   if(String(post.acf?.origin_page_id||"")!==String(row.id))
    throw Error("WordPress Post source identity mismatch "+row.id);
   row.publishedPost={id:post.id,status:post.status};
  }
  row.missingFilenames=[...expectedByAlbum.get(row.id)].filter(x=>!filenames.has(x));
  row.observedComplete=row.exactFilenameCount===row.expected && row.unexpectedFilenames.length===0 &&
   row.duplicateFilenames.length===0&&row.publishedPost?.status==="publish";
  report.albums.push(row);
  console.log("PSE_FOUR_GALLERY_PROGRESS_ROW="+JSON.stringify({...row,missingFilenames:undefined,missingCount:row.missingFilenames.length}));
 }
 report.slugMismatches=slugMismatches;
 console.log("PSE_GALLERY_NATIVE_SLUG_MISMATCHES="+JSON.stringify(slugMismatches));
 report.totalObservedOriginalPhotos=report.albums.reduce((n,r)=>n+r.exactFilenameCount,0);
 report.expectedOriginalPhotos=464;
 report.uniqueMediaIdsObserved=seenMediaIds.size;
 report.finishedAt=new Date().toISOString();
 console.log("PSE_FOUR_GALLERY_PROGRESS_SUMMARY="+JSON.stringify({
  mediaPagesRead:report.mediaPagesRead,wordpressMediaTotal:report.wpMediaTotal,
  observedOriginalPhotos:report.totalObservedOriginalPhotos,expectedOriginalPhotos:464,
  albums:report.albums.map(x=>({id:x.id,observed:x.exactFilenameCount,expected:x.expected,
    published:x.publishedPost?.status==="publish",missing:x.missingFilenames.length,duplicateFilenames:x.duplicateFilenames.length,unexpectedFilenames:x.unexpectedFilenames.length})),sourceOracleVerified:true,stableAscendingMediaId:true,uniqueMediaIdsObserved:seenMediaIds.size,observedAt:report.observedAt,finishedAt:report.finishedAt,readOnly:true,notFinalSourceParity:true
 }));
}finally{
 await mkdir("artifacts/pse-four-gallery-progress",{recursive:true});
 await writeFile("artifacts/pse-four-gallery-progress/report.json",JSON.stringify(report,null,2)+"\n");
 await source.dispose();await inert.close().catch(()=>{});await browser.close();
}