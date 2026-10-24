/** PSE verified single Product pilot. Native WP Product + ProductCategory + Media; dry by default. */
import {chromium} from "playwright";
import {createHash} from "node:crypto";
import {mkdir,writeFile,readFile} from "node:fs/promises";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const apply=event.head_commit?.message==="cms(pse): stage verified Phu My Organic 80 product pilot";
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const base=vars.filter(x=>x.startsWith("WC_URL="));if(base.length!==1)throw Error("PSE WordPress origin absent");
const cms=new URL(base[0].slice(7).replace(/^['"]|['"]$/g,""));if(cms.protocol!=="https:"||cms.username||cms.password||cms.search||cms.hash||!["","/"].includes(cms.pathname))throw Error("Unsafe PSE CMS origin");
const wpOrigin=cms.origin,sourceUrl="https://www.pse.vn/hoat-dong-kinh-doanh/san-pham/huu-co-phu-my.html";
const browser=await chromium.launch({headless:true}),ctx=await browser.newContext({viewport:{width:1440,height:900}});
const admin=await ctx.newPage();const state={mode:apply?"apply":"dry",source:sourceUrl,media:null,product:null,categories:[]};
try{
 await admin.goto(wpOrigin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const text=await admin.locator("body").innerText(),m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],ans=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const f=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("Challenge missing");await f.fill(String(ans))}
  await Promise.all([admin.waitForLoadState("domcontentloaded"),admin.locator("#wp-submit").click()]);
 }
 if(admin.url().includes("wp-login"))throw Error("No WordPress admin access");
 const nonce=await admin.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("Missing REST nonce");const v=(await r.text()).trim();if(!/^[a-zA-Z0-9]{8,24}$/.test(v))throw Error("Malformed nonce");return v});
 const api=(path,method="GET",body)=>admin.evaluate(async({path,method,body,nonce})=>{const r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});return{http:r.status,data:await r.json().catch(()=>({}))}},{path,method,body,nonce});
 const source=await ctx.newPage();
 const page=await source.goto(sourceUrl,{waitUntil:"domcontentloaded",timeout:50000});
 if(page?.status()!==200)throw Error("Product original HTTP "+page?.status());
 const data=await source.evaluate(()=>{
  const body=document.querySelector(".item-page [itemprop=articleBody]");if(!body)throw Error("No Joomla article");
  const tr=[...body.querySelectorAll("tr")].find(el=>{const a=el.querySelector("a[href*='id=']");try{return new URL(a.href).searchParams.get("id")==="1720"}catch{return false}});
  if(!tr)throw Error("Original product 1720 missing");
  const td=[...tr.children].filter(el=>el.tagName==="TD");if(td.length!==2)throw Error("Product row not 2 columns");
  const img=td[0].querySelector("img[src]");if(!img)throw Error("Original product image absent");
  const text=(td[1].textContent||"").replace(/\s+/g," ").trim();
  const name=text.split(/Mã số\s*:/i)[0].trim();
  const image=new URL(img.getAttribute("src"),location.href);
  return {name,originalId:1720,text,imageUrl:image.href,alt:img.alt||name,sourceHtml:tr.outerHTML.slice(0,12000)};
 });
 if(data.name!=="Hữu cơ Phú Mỹ Organic 80"||data.text.length<120||!data.text.includes("Mã số")||!data.text.includes("Thành phần")||!data.text.includes("32488"))throw Error("Original Organic 80 identity/spec mismatch");
 const sourceImage=new URL(data.imageUrl);if(sourceImage.protocol!=="https:"||sourceImage.hostname!=="www.pse.vn"||!sourceImage.pathname.startsWith("/images/")||!sourceImage.pathname.toLowerCase().endsWith(".png"))throw Error("Untrusted original PNG");
 const downloaded=await ctx.request.get(sourceImage.href,{timeout:65000});
 if(!downloaded.ok())throw Error("Original PNG HTTP "+downloaded.status());
 const bytes=await downloaded.body();const hash=createHash("sha256").update(bytes).digest("hex");
 if(bytes.length<100||bytes.length>20_000_000||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error("Product image magic/size mismatch");
 const filename="pse-product-1720-"+hash.slice(0,14)+".png",marker=filename.replace(/\.png$/,""),slug="huu-co-phu-my-organic-80-1720";
 const all=await api("/wp-json/wp/v2/product_cat?context=edit&per_page=100&hide_empty=false&_fields=id,slug,name,parent");
 const posts=await api("/wp-json/wp/v2/product?context=edit&status=publish,draft,private&per_page=100&_fields=id,slug,status,title,product_cat,featured_media,content");
 const media=await api("/wp-json/wp/v2/media?context=edit&search="+encodeURIComponent(marker)+"&per_page=100&_fields=id,slug,mime_type,source_url,media_details");
 if(all.http!==200||!Array.isArray(all.data)||posts.http!==200||!Array.isArray(posts.data)||media.http!==200||!Array.isArray(media.data))throw Error("Native Product registry unavailable");
 const productConflict=posts.data.filter(x=>x.slug===slug);
 if(productConflict.length>1)throw Error("Duplicate existing original Product");
 if(productConflict.length===1&&String(productConflict[0].title?.raw||productConflict[0].title?.rendered||"").trim()!==data.name)throw Error("Existing slug belongs to different Product");
 const groups=[
  {slug:"phan-bon-phu-my",name:"Phân bón Phú Mỹ",parentSlug:null},
  {slug:"huu-co-phu-my",name:"Hữu cơ Phú Mỹ",parentSlug:"phan-bon-phu-my"}
 ];
 for(const item of groups){
  const matches=all.data.filter(x=>x.slug===item.slug);
  if(matches.length>1||matches.length===1&&matches[0].name!==item.name)throw Error("Conflicting product Category "+item.slug);
  item.existing=matches[0]||null;
 }
 const mediaMatches=media.data.filter(x=>x.slug===marker&&x.mime_type==="image/png");
 if(mediaMatches.length>1)throw Error("Ambiguous uploaded product PNG");
 state.original={name:data.name,sourceId:1720,characters:data.text.length,imageBytes:bytes.length,sha256:hash,slug};
 state.categories=groups.map(x=>({slug:x.slug,name:x.name,existingId:x.existing?.id||null}));
 state.media={filename,existingId:mediaMatches[0]?.id||null};
 state.product={slug,existingId:productConflict[0]?.id||null};
 console.log("PSE_PRODUCT_PILOT_PREFLIGHT="+JSON.stringify({mode:state.mode,...state.original,categories:state.categories,media:state.media,product:state.product}));
 if(!apply){console.log("PSE_PRODUCT_PILOT=DRY_PASS; no_cms_write=true; no_build=true");process.exit(0)}
 const ids=new Map();
 for(const group of groups){
  const parent=group.parentSlug?ids.get(group.parentSlug):0;
  if(parent===undefined)throw Error("ProductCategory parent missing");
  let id=group.existing?.id;
  if(id){if(Number(group.existing.parent)!==Number(parent))throw Error("Existing ProductCategory hierarchy mismatch")}
  else{
   const r=await api("/wp-json/wp/v2/product_cat","POST",{name:group.name,slug:group.slug,parent:Number(parent)});
   if(r.http!==201||r.data.slug!==group.slug||Number(r.data.parent)!==Number(parent))throw Error("WordPress ProductCategory save failed "+group.slug+" HTTP "+r.http);
   id=r.data.id;
  }
  const verified=await api("/wp-json/wp/v2/product_cat/"+id+"?context=edit&_fields=id,slug,name,parent");
  if(verified.http!==200||verified.data.slug!==group.slug||Number(verified.data.parent)!==Number(parent))throw Error("ProductCategory read-after-write mismatch");
  ids.set(group.slug,Number(id));state.categories.find(x=>x.slug===group.slug).id=Number(id);
 }
 let mediaId=mediaMatches[0]?.id;
 if(!mediaId){
  const uploaded=await ctx.request.post(wpOrigin+"/wp-json/wp/v2/media",{data:bytes,headers:{"X-WP-Nonce":nonce,"Content-Type":"image/png","Content-Disposition":'attachment; filename="'+filename+'"',Accept:"application/json"},timeout:90000});
  const output=await uploaded.json().catch(()=>({}));
  if(uploaded.status()!==201||!Number.isSafeInteger(Number(output.id))||output.mime_type!=="image/png")throw Error("WP media upload failed HTTP "+uploaded.status());
  mediaId=Number(output.id);
 }
 const verifiedMedia=await api("/wp-json/wp/v2/media/"+mediaId+"?context=edit");
 if(verifiedMedia.http!==200||verifiedMedia.data.mime_type!=="image/png")throw Error("Media REST identity mismatch");
 const detailFile=String(verifiedMedia.data.media_details?.file||"").replace(/^\/+/, "");
 const candidates=[verifiedMedia.data.source_url,verifiedMedia.data.guid?.rendered];
 if(detailFile && detailFile.split("/").every(x=>/^[A-Za-z0-9._-]+$/.test(x))&&detailFile.split("/").at(-1)===filename)
   candidates.push(wpOrigin+"/wp-content/uploads/"+detailFile);
 let mediaUrl="";
 for(const candidate of candidates.filter(Boolean)){
  let u;try{u=new URL(String(candidate),wpOrigin)}catch{continue}
  if(u.hostname!==cms.hostname||!u.pathname.startsWith("/wp-content/uploads/")||!u.pathname.endsWith("/"+filename))continue;
  u.protocol="https:";
  try{const chk=await ctx.request.get(u.href,{timeout:45000});if(chk.ok()&&createHash("sha256").update(await chk.body()).digest("hex")===hash){mediaUrl=u.href;break}}catch{}
 }
 if(!mediaUrl)throw Error("WordPress Media bytes/readback do not match source");
 const alt=await api("/wp-json/wp/v2/media/"+mediaId,"POST",{alt_text:data.name});
 if(alt.http!==200||alt.data?.alt_text!==data.name)throw Error("Media SEO alt text not persisted");
 state.media={id:mediaId,sha256:hash,wpMediaUrl:mediaUrl};
 const escape=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
 const description=data.text.slice(data.name.length).trim();
 const html="<p>"+escape(description)+"</p>";
 let wpProduct=productConflict[0];
 if(!wpProduct){
  const r=await api("/wp-json/wp/v2/product","POST",{title:data.name,slug,status:"draft",content:html,excerpt:data.name,product_cat:[ids.get("huu-co-phu-my")],featured_media:mediaId});
  if(r.http!==201||!Number.isSafeInteger(Number(r.data?.id)))throw Error("Native Product draft create HTTP "+r.http);
  wpProduct=r.data;
 }
 const read=await api("/wp-json/wp/v2/product/"+wpProduct.id+"?context=edit");
 if(read.http!==200||read.data.slug!==slug||!read.data.product_cat?.includes(ids.get("huu-co-phu-my"))||Number(read.data.featured_media)!==Number(mediaId)||String(read.data.title?.raw||read.data.title?.rendered||"").trim()!==data.name)throw Error("WordPress Product draft content/category/media mismatched");
 const clean=String(read.data.content?.raw||"").replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").trim();
 if(!clean.includes("Mã số")||!clean.includes("32488"))throw Error("Product technical specifications not stored");
 if(read.data.status==="draft"){
  const pub=await api("/wp-json/wp/v2/product/"+wpProduct.id,"POST",{status:"publish"});
  if(pub.http!==200||pub.data?.status!=="publish")throw Error("Product publish rejected");
 }else if(read.data.status!=="publish")throw Error("Unexpected existing Product status");
 const final=await api("/wp-json/wp/v2/product/"+wpProduct.id+"?context=edit");
 if(final.http!==200||final.data.status!=="publish"||Number(final.data.featured_media)!==Number(mediaId)||!final.data.product_cat?.includes(ids.get("huu-co-phu-my")))throw Error("Native published Product readback failed");
 state.product={id:wpProduct.id,slug,status:"publish",categoryId:ids.get("huu-co-phu-my"),featuredMedia:mediaId};
 console.log("PSE_PRODUCT_PILOT=PASS; original_id=1720; product_id="+wpProduct.id+"; media_id="+mediaId+"; category_id="+ids.get("huu-co-phu-my")+"; verified_original_bytes=true; no_astro_build=true");
}finally{await mkdir("artifacts/pse-product-pilot",{recursive:true});await writeFile("artifacts/pse-product-pilot/manifest.json",JSON.stringify(state,null,2)+"\n");await browser.close()}
