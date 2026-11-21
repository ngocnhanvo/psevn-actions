/** Snapshot native WordPress Media/Post progress while a separately locked
 * four-original-gallery importer runs. READ ONLY. Pagination can move during
 * uploads: numbers are observations, not final parity or permission to build.
 */
import {chromium} from "playwright";
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
 paginationMayChangeDuringConcurrentImport:true,mediaPagesRead:0,wpMediaTotal:null,
 mediaRecordsObserved:0,albums:[],errors:[]};
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1366,height:820}});
try{
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
  exactFilenameCount:0,duplicateFilenames:[],sampleMediaIds:[],publishedPost:null}]));
 const filenames=new Map();
 let pagesExpected=null;
 for(let n=1;n<=65;n++){
  let data,last="unavailable";
  for(let attempt=1;attempt<=3;attempt++){
   try{
    data=await get("/wp-json/wp/v2/media?context=edit&per_page=100&page="+n+
     "&_fields=id,slug,mime_type,media_details");
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
   const basename=String(media.media_details?.file||"").split("/").at(-1);
   const m=basename.match(/^pse-gallery-(1053|990|980|975)-[0-9a-f]{16}\.(?:jpe?g|png|webp)$/i);
   if(!m)continue;
   const id=Number(m[1]),row=byId.get(id);
   row.observedMedia++;
   if(!filenames.has(basename))filenames.set(basename,[]);
   filenames.get(basename).push(Number(media.id));
   if(row.sampleMediaIds.length<5)row.sampleMediaIds.push(Number(media.id));
  }
  if(n>=data.pages)break;
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
  row.observedComplete=row.exactFilenameCount>=row.expected &&
   row.duplicateFilenames.length===0&&row.publishedPost?.status==="publish";
  report.albums.push(row);
  console.log("PSE_FOUR_GALLERY_PROGRESS_ROW="+JSON.stringify(row));
 }
 report.totalObservedOriginalPhotos=report.albums.reduce((n,r)=>n+r.exactFilenameCount,0);
 report.expectedOriginalPhotos=464;
 console.log("PSE_FOUR_GALLERY_PROGRESS_SUMMARY="+JSON.stringify({
  mediaPagesRead:report.mediaPagesRead,wordpressMediaTotal:report.wpMediaTotal,
  observedOriginalPhotos:report.totalObservedOriginalPhotos,expectedOriginalPhotos:464,
  albums:report.albums.map(x=>({id:x.id,observed:x.exactFilenameCount,expected:x.expected,
    published:x.publishedPost?.status==="publish"})),readOnly:true,notFinalSourceParity:true
 }));
}finally{
 await mkdir("artifacts/pse-four-gallery-progress",{recursive:true});
 await writeFile("artifacts/pse-four-gallery-progress/report.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}