/** Six original Joomla full-size photos missing from public Media search:
 * authenticated read-only WP Media slug/search and published gallery Post audit.
 */
import {chromium,request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const s=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 s.schema!=="pse-legacy-article-migration-v1")throw Error("Wrong project scope");
const target=[
 {album:993,marker:"pse-gallery-993-9559deff9296b224"},
 {album:993,marker:"pse-gallery-993-f0e750ded9d81e11"},
 {album:993,marker:"pse-gallery-993-0a21c2f4c3e191fe"},
 {album:993,marker:"pse-gallery-993-5b540cadae19063d"},
 {album:993,marker:"pse-gallery-993-5a97a6939da05ad7"},
 {album:995,marker:"pse-gallery-995-32db1458721c1301"}
];
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const configured=env.filter(x=>x.startsWith("WC_URL="));
if(configured.length!==1)throw Error("Invalid WP origin");
const u=new URL(configured[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Unsafe origin");
const wp=u.origin;
const browser=await chromium.launch({headless:true}),page=await browser.newPage();
const report={schema:"pse-six-original-gallery-media-auth-rest-v1",readOnly:true,rows:[],albums:[],summary:{}};
try{
 await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=(await page.locator("#loginform").innerText()).slice(0,500);
  const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i);
  if(m){
   const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,"*":a*b,"×":a*b,x:a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error("Missing WP math input");
   await f.fill(String(v));
  }
  await page.locator("#wp-submit").click();
 }
 await page.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:65000});
 if(page.url().includes("wp-login")||!await page.locator("#adminmenu").count())throw Error("Unauthorized WP admin");
 const nonce=await page.evaluate(async()=>{
  if(globalThis.wpApiSettings?.nonce)return globalThis.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("Missing WP nonce");return(await r.text()).trim();
 });
 const get=async path=>page.evaluate(async({path,nonce})=>{
  const r=await fetch(path,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json"}});
  return{http:r.status,data:await r.json().catch(()=>null)};
 },{path,nonce});
 const albums=new Map([[993,"993-ngay-truyen-thong"],[995,"995-phu-nu-viet-nam"]]);
 const albumPosts=new Map();
 for(const [id,slug] of albums){
  const v=await get("/wp-json/wp/v2/posts?context=edit&status=any&slug="+slug+"&_fields=id,slug,status,content,acf");
  if(v.http!==200||!Array.isArray(v.data)||v.data.length!==1)throw Error("Gallery native Post identity missing "+id);
  const post=v.data[0];
  if(post.status!=="publish"||String(post.acf?.origin_page_id||"")!==String(id))
   throw Error("Published gallery source provenance mismatch "+id);
  albumPosts.set(id,post);
  report.albums.push({id,postId:post.id,slug,status:post.status});
 }
 // PSE WordPress native Media REST search indexes text, not every stored
 // basename. Enumerate the authenticated registry by exact filesystem
 // filename rather than assuming a missing search hit means lost original.
 const filenames=new Map();
 let totalMedia=0,registryPages=0;
 for(let pageNumber=1;pageNumber<=60;pageNumber++){
  const path="/wp-json/wp/v2/media?context=edit&per_page=100&page="+pageNumber+
    "&_fields=id,slug,mime_type,media_details,source_url,status";
  let response=null,last="unknown";
  for(let retry=1;retry<=3;retry++){
   try{
    response=await page.evaluate(async({path,nonce})=>{
      const r=await fetch(path,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json"}});
      return {http:r.status,pages:Number(r.headers.get("X-WP-TotalPages")||1),
        records:await r.json().catch(()=>null)};
    },{path,nonce});
    if(response.http===200||response.http<500)break;
    last="HTTP "+response.http;
   }catch(e){last=String(e?.code||e?.name||"network").slice(0,60)}
   if(retry<3)await new Promise(resolve=>setTimeout(resolve,retry*750));
  }
  if(response?.http!==200||!Array.isArray(response.records)||
    !Number.isSafeInteger(response.pages)||response.pages>60)
   throw Error("Authenticated full Media registry unavailable page="+pageNumber+" cause="+last);
  totalMedia+=response.records.length;registryPages++;
  for(const m of response.records){
   const filename=String(m.media_details?.file||"").split("/").at(-1);
   if(!filename)continue;
   if(!filenames.has(filename))filenames.set(filename,[]);
   filenames.get(filename).push(m);
  }
  if(pageNumber>=response.pages)break;
 }
 if(registryPages<1||totalMedia<100)throw Error("WordPress Media inventory incomplete");
 console.log("PSE_SIX_GALLERY_WP_REGISTRY="+JSON.stringify({pages:registryPages,media:totalMedia}));
 for(const x of target){
  const filename=x.marker+".jpg";
  const lookup=await get("/wp-json/wp/v2/media?context=edit&status=any&slug="+
    encodeURIComponent(x.marker)+"&per_page=100&_fields=id,slug,status,mime_type,media_details,source_url");
  const search=await get("/wp-json/wp/v2/media?context=edit&search="+
    encodeURIComponent(x.marker)+"&per_page=100&_fields=id,slug,status,mime_type,media_details,source_url");
  const choose=v=>v.http===200&&Array.isArray(v.data)?v.data.filter(m=>m.slug===x.marker):[];
  const a=choose(lookup),b=choose(search);
  const content=String(albumPosts.get(x.album).content?.raw||"");
  const referenced=content.includes(filename);
  const byFile=filenames.get(filename)||[];
  if(byFile.length>1)throw Error("Ambiguous exact source Media filename "+filename);
  const media=byFile[0]||(a[0]||b[0])||null;
  const row={...x,slugHttp:lookup.http,slugMatches:a.length,searchHttp:search.http,searchMatches:b.length,
   galleryPostId:albumPosts.get(x.album).id,galleryReferencesFullFilename:referenced,
   exactFilenameMatches:byFile.length,
   nativeMediaId:media?.id||null,nativeMediaFile:media?.media_details?.file||null,
   nativeMediaSlug:media?.slug||null,nativeMime:media?.mime_type||null};
  report.rows.push(row);
  console.log("PSE_SIX_GALLERY_WP_MEDIA="+JSON.stringify(row));
 }
 report.summary={sourceMedia:target.length,
  verifiedMedia:report.rows.filter(x=>x.nativeMediaId&&x.nativeMediaFile?.endsWith(x.marker+".jpg")).length,
  albumHtmlReferences:report.rows.filter(x=>x.galleryReferencesFullFilename).length,
  noCmsWrites:true};
 console.log("PSE_SIX_GALLERY_WP_MEDIA_SUMMARY="+JSON.stringify(report.summary));
}finally{
 await mkdir("artifacts/pse-six-original-gallery-media",{recursive:true});
 await writeFile("artifacts/pse-six-original-gallery-media/report.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}