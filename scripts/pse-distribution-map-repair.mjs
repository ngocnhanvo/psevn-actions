/** Idempotent native WordPress Media repair for authentic Joomla distribution map, preserving SHA-256. */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const evt=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const apply=evt.head_commit?.message==="cms(pse): repair original distribution map JPG in WordPress Media";
const lines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,"")).filter(s=>s.startsWith("WC_URL="));
if(lines.length!==1)throw Error("Wrong WordPress origin configuration");
const cms=new URL(lines[0].slice(7).replace(/^['"]|['"]$/g,""));if(cms.protocol!=="https:"||cms.username||cms.password||cms.search||cms.hash||!["","/"].includes(cms.pathname))throw Error("Unsafe PSE CMS");
const originalPath="/images/web/he-thong-phan-phoi/map_thumb_kenphanphoi.jpg";
const oldOrigin="https://www.pse.vn",wpId=81043,expectedSha="32d96c7e1c3ab1b53194f235e0320af77da08f8ee02028d98257aed65dd4d099";
const hash=b=>createHash("sha256").update(b).digest("hex"),filename="pse-distribution-map-"+expectedSha.slice(0,14)+".jpg",marker=filename.slice(0,-4);
const browser=await chromium.launch({headless:true});const ctx=await browser.newContext(),admin=await ctx.newPage(),download=await request.newContext({timeout:55000});
const manifest={mode:apply?"apply":"dry",wpPage:wpId,source:oldOrigin+originalPath,originalSha256:expectedSha,media:null,page:null};
try{
 await admin.goto(cms.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const s=await admin.locator("body").innerText(),m=s.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||s.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const f=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("WP login challenge missing");await f.fill(String(v))}
  await Promise.all([admin.waitForLoadState("domcontentloaded"),admin.locator("#wp-submit").click()]);
 }
 if(admin.url().includes("wp-login"))throw Error("CMS login rejected");
 const nonce=await admin.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("Native REST nonce missing");return(await r.text()).trim()});
 const api=(path,method="GET",body)=>admin.evaluate(async({path,method,body,nonce})=>{const r=await fetch(path,{credentials:"same-origin",method,headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});return{http:r.status,data:await r.json().catch(()=>({}))}},{path,method,body,nonce});
 const readPage=()=>api("/wp-json/wp/v2/pages/"+wpId+"?context=edit&_fields=id,slug,status,acf,content");
 const [page,knownMedia]=await Promise.all([readPage(),api("/wp-json/wp/v2/media?context=edit&search="+encodeURIComponent(marker)+"&per_page=100&_fields=id,slug,mime_type,source_url,media_details,guid")]);
 if(page.http!==200||page.data?.slug!=="he-thong-phan-phoi-san-pham-tai-cac-tinh-mien-dong-nam-bo"||page.data?.status!=="publish"||page.data?.acf?.action!=="PublicPage"||page.data?.acf?.key!=="pse-business-he-thong-phan-phoi-san-pham-tai-cac-tinh-mien-dong-nam-bo")throw Error("Distribution Page identity changed");
 if(knownMedia.http!==200||!Array.isArray(knownMedia.data))throw Error("WP Media registry unavailable");
 const originalHtml=String(page.data.content?.raw||"");
 const existingImageCount=originalHtml.split(originalPath).length-1;
 const candidates=knownMedia.data.filter(x=>x.slug===marker&&x.mime_type==="image/jpeg");
 if(candidates.length>1)throw Error("Ambiguous distributed map Media");
 if(existingImageCount!==1&&!(existingImageCount===0&&candidates.length===1))throw Error("Original map reference count unexpected "+existingImageCount);
 const response=await download.get(oldOrigin+originalPath,{timeout:60000});
 if(!response.ok())throw Error("Original map JPG HTTP "+response.status());
 const bytes=await response.body();
 if(bytes.length!==93901||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||hash(bytes)!==expectedSha)throw Error("Original source map changed since verified audit");
 manifest.page={status:page.data.status,legacyImageRefs:existingImageCount,contentLength:originalHtml.length};
 manifest.media={filename,existingId:candidates[0]?.id||null,bytes:bytes.length};
 console.log("PSE_DISTRIBUTION_MAP_PREFLIGHT="+JSON.stringify(manifest));
 if(!apply){console.log("PSE_DISTRIBUTION_MAP=DRY_PASS; image=1; SHA256=true; noCMSWrite=true; noBuild=true");process.exit(0)}
 let mediaId=candidates[0]?.id;
 if(!mediaId){
  const uploaded=await ctx.request.post(cms.origin+"/wp-json/wp/v2/media",{data:bytes,headers:{"X-WP-Nonce":nonce,"Content-Type":"image/jpeg","Content-Disposition":'attachment; filename="'+filename+'"',Accept:"application/json"},timeout:100000});
  const result=await uploaded.json().catch(()=>({}));
  if(uploaded.status()!==201||result.mime_type!=="image/jpeg"||!Number.isSafeInteger(Number(result.id)))throw Error("WP original map Media create refused HTTP "+uploaded.status());
  mediaId=Number(result.id);
 }
 const current=await api("/wp-json/wp/v2/media/"+mediaId+"?context=edit");
 if(current.http!==200||current.data.mime_type!=="image/jpeg")throw Error("Stored WP map Media identity mismatch");
 const file=String(current.data.media_details?.file||"").replace(new RegExp("^/+"),"");
 const urls=[current.data.source_url,current.data.guid?.rendered];
 if(file&&file.split("/").every(p=>/^[A-Za-z0-9._-]+$/.test(p))&&file.split("/").at(-1)===filename)urls.push(cms.origin+"/wp-content/uploads/"+file);
 let nativeUrl="";
 for(const candidate of urls.filter(Boolean)){
  let url;try{url=new URL(String(candidate),cms.origin)}catch{continue}
  if(url.hostname!==cms.hostname||!url.pathname.startsWith("/wp-content/uploads/")||!url.pathname.endsWith("/"+filename))continue;
  url.protocol="https:";
  try{
   const result=await ctx.request.get(url.href,{timeout:60000});
   if(result.ok()&&hash(await result.body())===expectedSha){nativeUrl=url.href;break}
  }catch{}
 }
 if(!nativeUrl)throw Error("WordPress-owned map media checksum cannot be verified");
 const alt=await api("/wp-json/wp/v2/media/"+mediaId,"POST",{alt_text:"Kênh phân phối"});
 if(alt.http!==200||alt.data.alt_text!=="Kênh phân phối")throw Error("Native map ALT SEO save failed");
 if(existingImageCount===1){
  const html=originalHtml.replace(originalPath,nativeUrl);
  const saved=await api("/wp-json/wp/v2/pages/"+wpId,"POST",{content:html});
  if(saved.http!==200||saved.data.id!==wpId||saved.data.status!=="publish")throw Error("WordPress distribution Page map repair refused");
 }
 const verified=await readPage(),fresh=String(verified.data.content?.raw||"");
 if(verified.http!==200||verified.data.status!=="publish"||fresh.includes(originalPath)||!fresh.includes(nativeUrl))throw Error("Distribution Page new Media src verification failed");
 manifest.page={id:wpId,status:"publish",nativeImageUrl:nativeUrl,legacyImageRefs:0};
 manifest.media={id:mediaId,sha256:expectedSha,bytes:bytes.length};
 console.log("PSE_DISTRIBUTION_MAP=PASS; page=81043; media="+mediaId+"; source_sha256_verified=true; native_wp_image=true; noAstroBuild=true");
}finally{await mkdir("artifacts/pse-distribution-map",{recursive:true});await writeFile("artifacts/pse-distribution-map/repair.json",JSON.stringify(manifest,null,2)+"\n");await download.dispose();await browser.close()}
