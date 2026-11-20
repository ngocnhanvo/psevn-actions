/** Restore exactly the original ZIP attachment of PSE disclosure source ID 1213.
 * Requires fresh UpdraftPlus DB backup from same serialized workflow.
 * No source HTML change except the one provenance-verified ZIP link.
 */
import {chromium} from "playwright";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const checkpoint=state.articles?.["1213"];
const sourcePost="https://www.pse.vn/quan-he-nha-dau-tu/tin-tuc-co-dong/ban-cong-bo-thong-tin/1213-ban-cung-cap-thong-tin-ca-nhan-thanh-vien-hdqt-bks-uy-quyen-nguoi-cung-cap-thong-tin.html";
const sourceZip="https://www.pse.vn/images/pdf/2016/04/2016_04_26_CBTT_-_UY_QUYEN_CBTT.zip";
if(state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified||
 checkpoint?.source_url!==sourcePost||checkpoint?.wp_id!==79397)
 throw Error("PSE disclosure 1213 migration identity or backup proof missing");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const opts=env.filter(s=>s.startsWith("WC_URL="));
if(opts.length!==1)throw Error("Untrusted WP config");
const u=new URL(opts[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("WP origin invalid");
const wp=u.origin;
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({acceptDownloads:false});
 const admin=await context.newPage();
 await admin.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const s=(await admin.locator("#loginform").innerText()).slice(0,500);
  const m=s.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){const x=+m[1],y=+m[3],val=m[2]==="+"?x+y:m[2]==="-"?x-y:x*y;
   const q=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(await q.count())await q.fill(String(val));
  }
  await admin.locator("#wp-submit").click();
 }
 await admin.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 if(admin.url().includes("wp-login")||!(await admin.locator("#adminmenu").count()))throw Error("Protected WordPress admin login failed");
 const nonce=await admin.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("Cannot fetch WP nonce");
  return(await r.text()).trim();
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("Invalid WP REST nonce");
 const api=async(path,method="GET",data)=>admin.evaluate(async({path,nonce,method,data})=>{
  const r=await fetch(path,{credentials:"same-origin",method,headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(data?{"Content-Type":"application/json"}:{})},...(data?{body:JSON.stringify(data)}:{})});
  return {status:r.status,data:await r.json().catch(()=>null)}
 },{path,nonce,method,data});
 const post=await api("/wp-json/wp/v2/posts/79397?context=edit&_fields=id,slug,status,title,categories,content");
 const expectedSlug="ban-cung-cap-thong-tin-ca-nhan-thanh-vien-hdqt-bks-uy-quyen-nguoi-cung-cap-thong-tin";
 if(post.status!==200||post.data?.id!==79397||post.data.slug!==expectedSlug||
    post.data.status!=="publish"||!post.data.categories?.includes(1753))
  throw Error("Disclosure 1213 original published WP identity changed");
 const before=String(post.data.content?.raw||"");
 const count=before.split(sourceZip).length-1;
 if(count!==1){
  if(count===0&&!before.includes("www.pse.vn/images/pdf/2016/04/2016_04_26_CBTT_-_UY_QUYEN_CBTT.zip")){
   console.log("PSE_DISCLOSURE_ZIP=NO_OLD_URL; review existing published post before any write");
   process.exit(0);
  }
  throw Error("Original legacy ZIP link changed or duplicated; refuse mutation");
 }
 const original=await context.request.get(sourceZip,{timeout:60000});
 if(original.status()!==200||new URL(original.url()).hostname!=="www.pse.vn")throw Error("Original ZIP unavailable or redirected");
 const buf=await original.body();
 if(buf.length<100||buf.length>24_000_000||buf.subarray(0,4).toString("hex")!=="504b0304")
  throw Error("Original ZIP binary signature/length invalid, preserve original source");
 const sourceFilename=decodeURIComponent(new URL(sourceZip).pathname.split("/").at(-1));
 if(sourceFilename!=="2016_04_26_CBTT_-_UY_QUYEN_CBTT.zip")
  throw Error("Unexpected original ZIP filename");
 // Preserve existing hashed media identity from a previous interrupted run.
 const legacySlug="pse-legacy-"+createHash("sha256").update(sourceZip).digest("hex").slice(0,16);
 const check=await api("/wp-json/wp/v2/media?context=edit&slug="+legacySlug+"&per_page=3&_fields=id,slug,source_url,mime_type");
 if(check.status!==200||!Array.isArray(check.data)||check.data.length>1)
  throw Error("Ambiguous previous ZIP media identity");
 const originals=await api("/wp-json/wp/v2/media?context=edit&search=2016_04_26_CBTT&per_page=100&_fields=id,slug,source_url,mime_type");
 if(originals.status!==200||!Array.isArray(originals.data))
  throw Error("Cannot check existing original-filename media; refuse duplicates");
 const exact=originals.data.filter(m=>{
  try{return decodeURIComponent(new URL(m.source_url,wp).pathname.split("/").at(-1)).toLowerCase()===sourceFilename.toLowerCase()}
  catch{return false}
 });
 if(exact.length>1)throw Error("Multiple original-name ZIP media detected; refuse duplicates");
 let media=check.data[0]||exact[0];
 if(!media){
  const up=await context.request.post(wp+"/wp-json/wp/v2/media",{
   headers:{"X-WP-Nonce":nonce,"Content-Type":"application/zip","Content-Disposition":'attachment; filename="'+sourceFilename+'"'},
   data:buf,timeout:180000
  });
  if(up.status()!==201)throw Error("WordPress original-name ZIP import rejected HTTP "+up.status());
  media=await up.json();
 }
 if(!media?.id||!media.source_url||media.mime_type&&media.mime_type!=="application/zip")
  throw Error("Untrusted ZIP media record");
 const target=new URL(String(media.source_url),wp).href;
 const parsedTarget=new URL(target);
 if(parsedTarget.origin!==wp||!parsedTarget.pathname.startsWith("/wp-content/uploads/")||
    !parsedTarget.pathname.toLowerCase().endsWith(".zip"))
  throw Error("ZIP destination is not a local WP media upload");
 const downloaded=await context.request.get(target,{timeout:60000});
 if(downloaded.status()!==200)throw Error("Local ZIP media cannot be downloaded "+downloaded.status());
 const localBuf=await downloaded.body();
 const same=createHash("sha256").update(localBuf).digest("hex")===createHash("sha256").update(buf).digest("hex");
 if(!same)throw Error("Uploaded ZIP bytes mismatch original source");
 if(!check.data[0]){
  const localFilename=decodeURIComponent(parsedTarget.pathname.split("/").at(-1));
  if(localFilename!==sourceFilename)throw Error("WP media filename changed from original: "+localFilename);
 }
 const current=await api("/wp-json/wp/v2/posts/79397?context=edit&_fields=id,slug,status,categories,content");
 if(current.status!==200||current.data?.id!==79397||current.data.status!=="publish"||
  String(current.data.content?.raw||"")!==before)throw Error("Source post changed concurrently, do not overwrite");
 const html=before.replace(sourceZip,target);
 if(html===before||html.includes(sourceZip))throw Error("Original ZIP replacement not exact");
 const saved=await api("/wp-json/wp/v2/posts/79397","POST",{content:html});
 if(saved.status!==200||saved.data?.id!==79397)throw Error("WordPress article ZIP link update failed");
 const readback=await api("/wp-json/wp/v2/posts/79397?context=edit&_fields=id,slug,status,categories,content");
 if(readback.status!==200||readback.data?.status!=="publish"||
 !readback.data.categories?.includes(1753)||readback.data.content?.raw!==html)
   throw Error("ZIP link save could not be proven");
 console.log("PSE_DISCLOSURE_ZIP=PASS; source_id=1213; wp_id=79397; media_id="+media.id+"; source_bytes="+buf.length+"; one_url_changed=true; untouched_other_fields=true");
}finally{await browser.close()}
