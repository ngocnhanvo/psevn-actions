/** Restore exactly one original distribution image to PSE WP Media; idempotent, checksum/readback. */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const evt=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const apply=evt.head_commit?.message==="cms(pse): restore verified distribution image from original Joomla";
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const origins=vars.filter(x=>x.startsWith("WC_URL="));if(origins.length!==1)throw Error("PSE WP origin missing");
const url=new URL(origins[0].slice(7).replace(/^['"]|['"]$/g,""));if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||!["","/"].includes(url.pathname))throw Error("PSE WP origin invalid");
const cms=url.origin,wpId=81043,original="https://www.pse.vn/images/web/he-thong-phan-phoi/map_thumb_kenphanphoi.jpg",relative="/images/web/he-thong-phan-phoi/map_thumb_kenphanphoi.jpg";
const expectedSha="32d96c7e1c3ab1b53194f235e0320af77da08f8ee02028d98257aed65dd4d099",filename="pse-distribution-map-"+expectedSha.slice(0,14)+".jpg",marker=filename.slice(0,-4);
const sha=b=>createHash("sha256").update(b).digest("hex");
const browser=await chromium.launch({headless:true}),ctx=await browser.newContext(),page=await ctx.newPage(),source=await request.newContext({timeout:65000});
const state={mode:apply?"apply":"dry",pageId:wpId,source:original,sha256:expectedSha,filename,media:null,updated:false};
try{
 await page.goto(cms+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=await page.locator("body").innerText(),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("Captcha input missing");await f.fill(String(v))}
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WordPress authentication refused");
 const nonce=await page.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("REST nonce denied");const value=(await r.text()).trim();if(!/^[A-Za-z0-9]{8,24}$/.test(value))throw Error("REST nonce malformed");return value});
 const api=(path,method="GET",body)=>page.evaluate(async({path,method,body,nonce})=>{const r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});return{http:r.status,data:await r.json().catch(()=>({}))}},{path,method,body,nonce});
 const get=()=>api("/wp-json/wp/v2/pages/"+wpId+"?context=edit&_fields=id,slug,status,acf,content");
 const record=await get();if(record.http!==200||record.data?.slug!=="he-thong-phan-phoi-san-pham-tai-cac-tinh-mien-dong-nam-bo"||record.data.status!=="publish"||record.data.acf?.action!=="PublicPage"||record.data.acf?.key!=="pse-business-he-thong-phan-phoi-san-pham-tai-cac-tinh-mien-dong-nam-bo")throw Error("WordPress Page identity mismatch");
 const html=String(record.data.content?.raw||"");if(html.length<350||html.length>145000)throw Error("Original Page body size unexpected");
 const inspect=await page.evaluate(({html,relative,original})=>{const d=document.createElement("div");d.innerHTML=html;return [...d.querySelectorAll("img[src]")].map(i=>({src:i.getAttribute("src"),alt:i.getAttribute("alt"),matches:i.getAttribute("src")===relative||i.getAttribute("src")===original}))},{html,relative,original});
 const current=inspect.filter(x=>x.matches),other=inspect.filter(x=>!x.matches);
 if(other.length||current.length>1)throw Error("Unexpected distribution images; manual review instead of bulk replacement");
 const originalBytes=await source.get(original,{timeout:60000});
 if(!originalBytes.ok())throw Error("Joomla original image HTTP "+originalBytes.status());
 const bytes=await originalBytes.body();
 if(bytes.length!==93901||sha(bytes)!==expectedSha||bytes[0]!==255||bytes[1]!==216)throw Error("Original JPG hash/magic changed");
 const candidates=await api("/wp-json/wp/v2/media?context=edit&search="+encodeURIComponent(marker)+"&per_page=100&_fields=id,slug,mime_type,source_url,media_details");
 if(candidates.http!==200||!Array.isArray(candidates.data))throw Error("WordPress media index inaccessible");
 const found=candidates.data.filter(m=>m.slug===marker&&m.mime_type==="image/jpeg");
 if(found.length>1)throw Error("Ambiguous restored image upload");
 state.media={existingId:found[0]?.id||null};
 if(current.length===0&&(!found.length||!html.includes(marker)))throw Error("Source image already replaced with different media; stop without overwrite");
 console.log("PSE_DISTRIBUTION_IMAGE_PREFLIGHT="+JSON.stringify({mode:state.mode,pageId:wpId,images:inspect,originalBytes:bytes.length,sha256:expectedSha,existingMedia:state.media.existingId}));
 if(!apply){console.log("PSE_DISTRIBUTION_IMAGE_RESTORE=DRY_PASS; noCmsWrite=true; noBuild=true");process.exit(0)}
 let mediaId=found[0]?.id;
 if(!mediaId){
  const upload=await ctx.request.post(cms+"/wp-json/wp/v2/media",{data:bytes,headers:{"X-WP-Nonce":nonce,"Content-Type":"image/jpeg","Content-Disposition":'attachment; filename="'+filename+'"',Accept:"application/json"},timeout:90000});
  const data=await upload.json().catch(()=>({}));
  if(upload.status()!==201||data.mime_type!=="image/jpeg"||!Number.isSafeInteger(Number(data.id)))throw Error("WordPress original JPG Media upload failed HTTP "+upload.status());
  mediaId=Number(data.id);
 }
 const stored=await api("/wp-json/wp/v2/media/"+mediaId+"?context=edit");
 if(stored.http!==200||stored.data.mime_type!=="image/jpeg")throw Error("Media JPG identification failed");
 const storedFile=String(stored.data.media_details?.file||"").replace(new RegExp("^/+"),"");
 const urls=[stored.data.source_url,stored.data.guid?.rendered];
 if(storedFile&&storedFile.split("/").every(x=>/^[A-Za-z0-9._-]+$/.test(x))&&storedFile.split("/").at(-1)===filename)urls.push(cms+"/wp-content/uploads/"+storedFile);
 let nativeUrl="";
 for(const raw of urls.filter(Boolean)){
  let u;try{u=new URL(String(raw),cms)}catch{continue}
  if(u.hostname!==url.hostname||!u.pathname.startsWith("/wp-content/uploads/")||!u.pathname.endsWith("/"+filename))continue;
  u.protocol="https:";
  try{const rsp=await ctx.request.get(u.href,{timeout:45000});if(rsp.ok()&&sha(await rsp.body())===expectedSha){nativeUrl=u.href;break}}catch{}
 }
 if(!nativeUrl)throw Error("WordPress media restored image cannot be read back with source hash");
 const edited=await api("/wp-json/wp/v2/media/"+mediaId,"POST",{alt_text:"Kênh phân phối PSE"});
 if(edited.http!==200||edited.data.alt_text!=="Kênh phân phối PSE")throw Error("Image ALT readback failed");
 state.media={id:mediaId,url:nativeUrl,sha256:expectedSha};
 if(current.length){
  state.before={content:html,acfCssmore:record.data.acf?.cssmore||null};
  const replaced=await page.evaluate(({html,relative,original,nativeUrl})=>{
   const d=document.createElement("div");d.innerHTML=html;
   const img=[...d.querySelectorAll("img[src]")].filter(i=>i.getAttribute("src")===relative||i.getAttribute("src")===original);
   if(img.length!==1)throw Error("Cannot safely replace original PSE image");
   img[0].setAttribute("src",nativeUrl);img[0].setAttribute("alt","Kênh phân phối PSE");
   return d.innerHTML;
  },{html,relative,original,nativeUrl});
  const put=await api("/wp-json/wp/v2/pages/"+wpId,"POST",{content:replaced});
  if(put.http!==200||Number(put.data.id)!==wpId)throw Error("Updating public PSE distribution Page failed");
  state.updated=true;
 }
 const after=await get();
 const content=String(after.data?.content?.raw||"");
 if(after.http!==200||after.data.status!=="publish"||!content.includes(nativeUrl)||content.includes('src="'+relative+'"')||!content.includes("pse-distribution-body"))throw Error("Distribution WP Page original image readback mismatch");
 const count=await page.evaluate(html=>{const el=document.createElement("div");el.innerHTML=html;return el.querySelectorAll("img[src]").length},content);
 if(count!==1)throw Error("Restored distribution image count !=1");
 console.log("PSE_DISTRIBUTION_IMAGE_RESTORE=PASS; page=81043; media="+mediaId+"; originalSha256Verified=true; wpChecksumVerified=true; pageReadback=true; noAstroBuild=true");
}finally{
 await mkdir("artifacts/pse-distribution-image",{recursive:true});
 await writeFile("artifacts/pse-distribution-image/manifest.json",JSON.stringify(state,null,2)+"\n");
 await source.dispose();await browser.close();
}
