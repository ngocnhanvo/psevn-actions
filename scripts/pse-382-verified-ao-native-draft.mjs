/** Guarded exact original owner Joomla Austria photo into one private native Post83543.
 * No publication/redirect; leave third original Wieliczka photo source untouched.
 */
import {chromium,request} from "playwright";
import {readFile,writeFile,mkdir,unlink} from "node:fs/promises";
import {createHash} from "node:crypto";
const requiredMessage="cms(pse): stage verified original Austria photo in draft 382";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions" ||
 process.env.GITHUB_REF!=="refs/heads/main" ||
 event.head_commit?.message!==requiredMessage ||
 process.env.PSE_382_AO_BACKUP_READY!=="yes")throw Error("Unauthorized WP write scope");
const fixture=JSON.parse(await readFile("docs/source/pse-original-public-articles-11-2026-11-22.json","utf8"));
const original=fixture.entries?.find(x=>x.source_id===382);
const oldSource="images/web/Áo_2.JPG";
const originalMissing="images/web/Mỏ_muối_Wieliczka_dưới_mặt_đất_135m_-_Ba_lan.JPG";
const expectedSlug="pvfcco-se-to-chuc-thanh-cong-chuyen-du-lich-chau-au-cho-khach-hang-tieu-bieu-cua-cong-ty";
if(fixture.schema!=="pse-original-joomla-selected-public-articles-v1" ||
 original?.slug!==expectedSlug||original.inline_image_src?.length!==3||
 original.inline_image_src[0]!==oldSource||original.inline_image_src[2]!==originalMissing)
 throw Error("Source #382 public original identity changed");
const sha=x=>createHash("sha256").update(x).digest("hex");
const file="/tmp/pse-382-original-Ao_2.JPG",digest="7a190b8e1c4144e8b9f4aeab0a7aedf415cc74281212ce100cc61dd31db08964",length=269085;
const bytes=await readFile(file);
if(bytes.length!==length||sha(bytes)!==digest||bytes[0]!==255||bytes[1]!==216||
 bytes.at(-2)!==255||bytes.at(-1)!==217)throw Error("Source original Austria JPEG changed");
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const get=n=>{
 const rows=vars.filter(x=>x.startsWith(n+"="));
 if(rows.length!==1)throw Error("Missing WordPress target configuration");
 return rows[0].slice(n.length+1).replace(/^['"]|['"]$/g,"").replace(/\/$/,"");
};
const wp=get("WC_URL"),client=get("WC_URL_CLIENT");
if(wp!=="https://admin-pse.webnvn.com"||client!=="https://pse.webnvn.com")
 throw Error("Wrong target WP/site");
const output="artifacts/pse-382-verified-original-Austria-photo";
await mkdir(output,{recursive:true});
const report={schema:"pse-382-source-austria-native-private-draft-v1",
 sourceId:382,postId:83543,originalPhotoSha256:digest,originalPhotoBytes:length,
 mediaId:null,mediaCreated:false,mediaReused:false,draftUpdated:false,wpWrites:0,
 stillMissingOnePhoto:true,published:false,redirects:0,
 freshBackup:true,readbackVerified:false,result:"STARTED"};
const save=()=>writeFile(output+"/report.json",JSON.stringify(report,null,2)+"\n");
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:860}});
const page=await context.newPage();
const net=await request.newContext({timeout:45000});
try{
 await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const text=(await page.locator("#loginform").innerText()).slice(0,850);
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){
   const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,"x":a*b,"×":a*b,"*":a*b})[m[2]];
   const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await input.count())throw Error("WP challenge input unavailable");
   await input.fill(String(v));
  }
  await page.locator("#wp-submit").click();
 }
 await page.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:65000});
 if(page.url().includes("wp-login")||!await page.locator("#adminmenu").count())
  throw Error("WP authentication unavailable");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("WP REST nonce unavailable");
  return(await r.text()).trim();
 });
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error("Invalid WordPress REST nonce");
 const api=async (path,method="GET",body)=>page.evaluate(async({path,method,body,nonce})=>{
  const res=await fetch(path,{method,credentials:"same-origin",headers:{
   "X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {status:res.status,pages:Number(res.headers.get("X-WP-TotalPages")||0),
    data:await res.json().catch(()=>null)};
 },{path,method,body,nonce});
 const postPath="/wp-json/wp/v2/posts/83543?context=edit&_fields=id,slug,status,date,title,acf,categories,content";
 let post=await api(postPath);
 const previous=String(post.data?.content?.raw||"");
 if(post.status!==200||post.data?.id!==83543||post.data.slug!==expectedSlug||
    post.data.status!=="draft"||post.data.title?.raw!==original.title||
    post.data.date!==original.created_at_joomla.replace(" ","T")||
    post.data.acf?.action!=="PostDetails"||post.data.acf?.key!=="ssr-post"||
    JSON.stringify((post.data.categories||[]).sort((a,b)=>a-b))!==JSON.stringify([1742,1746])||
    !previous.includes('src="'+oldSource+'"')||
    !previous.includes('src="'+originalMissing+'"')||
    !previous.includes("/wp-content/uploads/2026/11/Ba_Lan.jpg"))
   throw Error("Original WP 382 private draft identity/media scope changed");
 if(previous.split('src="'+oldSource+'"').length!==2)throw Error("Source Austria img not unique in draft");
 // Search only filenames relevant to this original owner image; do not scan or save unrelated Posts.
 let matches=[];
 for(const term of ["Ao_2","Áo_2"]){
  let pages=null;
  for(let n=1;n<=(pages||1);n++){
   const r=await api("/wp-json/wp/v2/media?context=edit&search="+encodeURIComponent(term)+
    "&per_page=100&page="+n+"&_fields=id,slug,source_url,media_details,mime_type");
   if(r.status!==200||!Array.isArray(r.data))throw Error("WP native Media search failed");
   if(pages===null){
    pages=r.pages;
    if(!Number.isInteger(pages)||pages<0||pages>25)throw Error("Incomplete WP native Media search");
   }
   for(const m of r.data){
    const p=String(m.media_details?.file||"").split("/").at(-1)||"";
    if(p.toLowerCase()==="ao_2.jpg"||p.toLowerCase()==="áo_2.jpg"||
       p.toLowerCase()==="ao_2.jpeg"){
      if(!matches.some(x=>x.id===m.id))matches.push(m);
    }
   }
  }
 }
 if(matches.length>1)throw Error("Ambiguous existing Austria media filename");
 let media=matches[0]||null;
 const verifyMedia=async item=>{
  const url=new URL(item.source_url,wp);
  if(url.origin!==wp||url.protocol!=="https:"||
     !url.pathname.startsWith("/wp-content/uploads/")||
     !/\/(?:Ao_2|áo_2)\.jpe?g$/i.test(decodeURIComponent(url.pathname)))
   throw Error("WP Media canonical URL unexpected");
  if(item.mime_type!=="image/jpeg")throw Error("WP Media not JPEG");
  const res=await net.get(url.href,{timeout:45000,failOnStatusCode:false});
  if(res.status()!==200||sha(await res.body())!==digest)
   throw Error("WP Media original byte checksum mismatch");
  return url.href;
 };
 if(media){
  await verifyMedia(media);
  report.mediaReused=true;
 }else{
  // Upload only once; on ambiguous transport errors do not retry blindly.
  const incoming=await page.evaluate(async({nonce,data})=>{
   const raw=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
   const res=await fetch("/wp-json/wp/v2/media",{method:"POST",credentials:"same-origin",
    headers:{"X-WP-Nonce":nonce,"Content-Type":"image/jpeg",
     "Content-Disposition":'attachment; filename="Ao_2.JPG"',Accept:"application/json"},
    body:raw});
   return {status:res.status,data:await res.json().catch(()=>null)};
  },{nonce,data:bytes.toString("base64")});
  if(incoming.status!==201||!Number.isSafeInteger(incoming.data?.id))
   throw Error("Native Media upload failed HTTP "+incoming.status);
  media=incoming.data;report.mediaCreated=true;report.wpWrites++;
  await save();
 }
 const lookedUp=await api("/wp-json/wp/v2/media/"+media.id+"?context=edit&_fields=id,source_url,mime_type,media_details,alt_text");
 if(lookedUp.status!==200||lookedUp.data?.id!==media.id)
  throw Error("Native Media readback missing");
 const native=await verifyMedia(lookedUp.data);
 report.mediaId=media.id;await save();
 // Only the exact source img in the existing native DRAFT, never publish or touch other fields.
 const desired=previous.replace('src="'+oldSource+'"','src="'+native+'"');
 if(desired===previous||!desired.includes('src="'+originalMissing+'"'))
  throw Error("Scoped draft source replacement failed");
 const updated=await api("/wp-json/wp/v2/posts/83543","POST",{content:desired});
 if(updated.status!==200||updated.data?.id!==83543)throw Error("Native Post draft update rejected");
 report.wpWrites++;report.draftUpdated=true;await save();
 post=await api(postPath);
 const actual=String(post.data?.content?.raw||"");
 if(post.status!==200||post.data?.status!=="draft"||
   post.data?.date!==original.created_at_joomla.replace(" ","T")||
   post.data.slug!==expectedSlug||post.data.title?.raw!==original.title||
   post.data.acf?.action!=="PostDetails"||post.data.acf?.key!=="ssr-post"||
   JSON.stringify((post.data.categories||[]).sort((a,b)=>a-b))!==JSON.stringify([1742,1746])||
   actual!==desired||!actual.includes('src="'+originalMissing+'"')||
   actual.includes('src="'+oldSource+'"')||!actual.includes("/wp-content/uploads/2026/11/Ba_Lan.jpg"))
  throw Error("Post382 scoped draft write readback failed");
 report.readbackVerified=true;report.result="AUSTRIA_EXACT_ORIGINAL_MEDIA_STAGED_PRIVATE_ONLY";
 await save();
 console.log("PSE_382_AUSTRIA_NATIVE_DRAFT_PASS="+JSON.stringify(report));
}catch(e){
 report.result="FAILED";report.errorType=e?.constructor?.name||"Error";
 await save();throw e;
}finally{
 await unlink(file).catch(()=>{});
 await net.dispose();await context.close();await browser.close();
}
