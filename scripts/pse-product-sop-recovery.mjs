/** Restore ONE source-verified, previously unmapped Kali Phu My SOP product to native WordPress; NO Astro edits/build. */
import {chromium} from "playwright";
import {createHash} from "node:crypto";
import {readFile,writeFile,mkdir} from "node:fs/promises";

const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const message=String(event.head_commit?.message||"").split("\n")[0];
const dryMessage="audit(pse): Kali SOP product recovery preflight";
const applyMessage="cms(pse): restore source verified Kali SOP product";
if(![dryMessage,applyMessage].includes(message)||process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")
 throw Error("Unexpected SOP recovery trigger or repository");
const apply=message===applyMessage;
const settings=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,"")).filter(s=>s.startsWith("WC_URL="));
if(settings.length!==1)throw Error("PSE CMS origin unavailable");
const u=new URL(settings[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||u.port||!["","/"].includes(u.pathname))
 throw Error("PSE CMS origin invalid");
const wp=u.origin;
const original="https://www.pse.vn/hoat-dong-kinh-doanh/san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my.html";
const name="Kali Phú Mỹ (SOP)",slug="kali-phu-my-sop";
const familySlug="nhom-phan-don-va-phan-phuc-hop-phu-my",rootSlug="phan-bon-phu-my";
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const escape=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const norm=s=>String(s||"").replace(/<[^>]+>/g,"").normalize("NFC").replace(/\s+/g," ").trim().toLocaleLowerCase("vi");
const report={schema:"pse-verified-no-joomla-id-kali-sop-v1",mode:apply?"apply":"dry",original,product:null,media:null,category:null,source:null,errors:[]};
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1440,height:900}});
try{
 const source=await ctx.newPage();
 const loaded=await source.goto(original,{waitUntil:"domcontentloaded",timeout:60000});
 if(loaded?.status()!==200)throw Error("Original Joomla source HTTP "+loaded?.status());
 const p=await source.evaluate(()=>{
  const root=document.querySelector(".item-page [itemprop=articleBody]");
  if(!root)throw Error("Joomla verified article body absent");
  const hit=[...root.querySelectorAll("table tr")].flatMap(tr=>{
   const cells=[...tr.children].filter(x=>x.tagName==="TD");
   if(cells.length<2)return [];
   const img=cells[0].querySelector("img[src]");
   if(!img)return [];
   const full=(cells[1].textContent||"").replace(/\s+/g," ").trim();
   const title=full.split(/Mã số\s*:/i)[0].trim();
   return title==="Kali Phú Mỹ (SOP)"?[{
    title,full,image:new URL(img.getAttribute("src"),location.href).href,
    sourceLink:cells[0].querySelector("a[href*='id=']")?.href||null
   }]:[];
  });
  if(hit.length!==1)throw Error("Original SOP product has missing/ambiguous source row "+hit.length);
  return hit[0];
 });
 if(p.title!==name||p.sourceLink||!/Mã số\s*:\s*00059\b/i.test(p.full)||
  !/Thành phần\s*:/i.test(p.full)||!/Loại cây\s*:/i.test(p.full)||
  !/Kali hữu hiệu\s*\(K2Ohh\)\s*:\s*50%/i.test(p.full)||
  !/Lưu huỳnh\s*\(S\)\s*:\s*17%/i.test(p.full)||
  !/Độ ẩm\s*:\s*0,5%/i.test(p.full))
  throw Error("Original no-ID SOP composition or identity is not as verified");
 const image=new URL(p.image);
 if(image.origin!=="https://www.pse.vn"||image.pathname!=="/images/Kali-SOP-25-mat-truoc.png")
  throw Error("Original SOP image location changed");
 const imageResponse=await ctx.request.get(image.href,{timeout:60000});
 if(!imageResponse.ok())throw Error("Original SOP PNG HTTP "+imageResponse.status());
 const bytes=await imageResponse.body(),hash=sha(bytes);
 if(bytes.length<100||bytes.length>20000000||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
  throw Error("Original SOP media PNG signature/size invalid");
 const filename="pse-fertilizer-sop-"+hash.slice(0,12)+".png",marker=filename.replace(/\.png$/,"");
 const components=[
  p.full.match(/Kali hữu hiệu\s*\(K2Ohh\)\s*:\s*50%/i)?.[0],
  p.full.match(/Lưu huỳnh\s*\(S\)\s*:\s*17%/i)?.[0],
  p.full.match(/Độ ẩm\s*:\s*0,5%/i)?.[0]
 ];
 const crop=p.full.split(/Loại cây\s*:/i)[1]?.trim();
 if(components.some(x=>!x)||!crop||crop.length<25)throw Error("Incomplete source product excerpt");
 const excerpt="<p>Mã số: 00059</p>\n<p><strong>Thành phần:</strong></p>\n"+
  components.map(x=>"<p>"+escape(x)+"</p>").join("\n")+
  "\n<p><strong>Loại cây:</strong></p>\n<p>"+escape(crop)+"</p>";
 const description="<h2>Thông tin chi tiết</h2><p>"+escape(p.full.slice(name.length).trim())+"</p>";
 report.source={title:name,registrationCode:"00059",category:familySlug,hasOriginalJoomlaId:false,
  imageUrl:image.href,sha256:hash,bytes:bytes.length,spec:p.full,excerpt};
 console.log("PSE_SOP_SOURCE_PROOF="+JSON.stringify({title:name,code:"00059",hasOriginalJoomlaId:false,sha256:hash,imageBytes:bytes.length,components,crop}));

 if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("WP write authorization unavailable");
 const admin=await ctx.newPage();
 await admin.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const body=(await admin.locator("#loginform").innerText()).slice(0,650);
  const math=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(math){
   const a=+math[1],b=+math[3],v=math[2]==="+"?a+b:math[2]==="-"?a-b:a*b;
   const input=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await input.count())throw Error("WP login arithmetic challenge missing");
   await input.fill(String(v));
  }
  await admin.locator("#wp-submit").click();
 }
 await admin.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 if(admin.url().includes("wp-login")||!await admin.locator("#adminmenu").count())
  throw Error("WordPress admin login blocked: no product/media writes attempted");
 const nonce=await admin.evaluate(async()=>window.wpApiSettings?.nonce||
  await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"}).then(x=>x.text()));
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("WP REST nonce invalid");
 const api=(path,method="GET",data)=>admin.evaluate(async({path,method,data,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",
   headers:{Accept:"application/json","X-WP-Nonce":nonce,...(data?{"Content-Type":"application/json"}:{})},
   ...(data?{body:JSON.stringify(data)}:{})});
  return{status:r.status,data:await r.json().catch(()=>null)};
 },{path,method,data,nonce});
 const [taxonomy,products,existingMedia]=await Promise.all([
  api("/wp-json/wp/v2/product_cat?context=edit&per_page=100&hide_empty=false&_fields=id,slug,name,parent"),
  api("/wp-json/wp/v2/product?context=edit&status=publish,draft,private&per_page=100&_fields=id,slug,status,title,product_cat,featured_media,content,excerpt"),
  api("/wp-json/wp/v2/media?context=edit&search="+encodeURIComponent(marker)+"&per_page=100")
 ]);
 if(taxonomy.status!==200||!Array.isArray(taxonomy.data)||products.status!==200||
  !Array.isArray(products.data)||existingMedia.status!==200||!Array.isArray(existingMedia.data))
  throw Error("Read native WP product/category/media registry failed");
 const root=taxonomy.data.filter(c=>c.slug===rootSlug),child=taxonomy.data.filter(c=>c.slug===familySlug);
 if(root.length!==1||child.length!==1||root[0].parent!==0||
  child[0].parent!==root[0].id||child[0].name!=="Nhóm phân đơn và phân phức hợp Phú Mỹ")
  throw Error("Native ProductCategory ancestry has changed");
 if(products.data.length<44)throw Error("Published/draft Product registry unexpectedly incomplete");
 const matches=products.data.filter(x=>x.slug===slug||norm(x.title?.raw||x.title?.rendered)===norm(name));
 if(matches.length>1||matches.length===1&&(![slug,canonicalSlug].includes(matches[0].slug)||norm(matches[0].title?.raw||matches[0].title?.rendered)!==norm(name)))
  throw Error("Ambiguous/colliding WordPress Product SOP identity");
 const media=existingMedia.data.filter(x=>x.slug===marker&&x.mime_type==="image/png");
 if(media.length>1)throw Error("Ambiguous existing SOP source media");
 report.product={slug,existingId:matches[0]?.id||null,status:matches[0]?.status||null};
 report.category={id:child[0].id,slug:familySlug,rootId:root[0].id};
 report.media={filename,existingId:media[0]?.id||null,sha256:hash};
 console.log("PSE_SOP_PREFLIGHT="+JSON.stringify({mode:report.mode,product:report.product,category:report.category,media:report.media,source:report.source.title}));
 if(!apply){report.status="DRY_PASS";console.log("PSE_SOP_RECOVERY=DRY_PASS; native_products="+products.data.length+"; no_cms_write=true; no_build=true");}
 else{
  let mediaId=media[0]?.id;
  if(!mediaId){
   const created=await ctx.request.post(wp+"/wp-json/wp/v2/media",{data:bytes,
    headers:{"X-WP-Nonce":nonce,"Content-Type":"image/png","Content-Disposition":'attachment; filename="'+filename+'"',Accept:"application/json"},timeout:100000});
   const body=await created.json().catch(()=>({}));
   if(created.status()!==201||body.mime_type!=="image/png"||!Number.isSafeInteger(Number(body.id)))
    throw Error("WP Media create failed HTTP "+created.status());
   mediaId=Number(body.id);
  }
  const checked=await api("/wp-json/wp/v2/media/"+mediaId+"?context=edit");
  if(checked.status!==200||checked.data.mime_type!=="image/png")
   throw Error("WP SOP Media verification failed");
  const file=String(checked.data.media_details?.file||"").replace(/^\/+/,"");
  const locations=[checked.data.source_url,checked.data.guid?.rendered];
  if(file&&file.split("/").every(x=>/^[A-Za-z0-9._-]+$/.test(x))&&file.split("/").at(-1)===filename)
   locations.push(wp+"/wp-content/uploads/"+file);
  let verifiedUrl="";
  for(const entry of locations.filter(Boolean)){
   let address;try{address=new URL(entry,wp)}catch{continue}
   if(address.origin!==wp||!address.pathname.startsWith("/wp-content/uploads/")||
    !address.pathname.endsWith("/"+filename))continue;
   const download=await ctx.request.get(address.href,{timeout:50000}).catch(()=>null);
   if(download?.ok()&&sha(await download.body())===hash){verifiedUrl=address.href;break}
  }
  if(!verifiedUrl)throw Error("WP original SOP media checksum mismatch");
  const alt=await api("/wp-json/wp/v2/media/"+mediaId,"POST",{alt_text:name});
  if(alt.status!==200||alt.data.alt_text!==name)throw Error("WP SOP Media alt readback failed");
  report.media={id:mediaId,filename,sourceSha256:hash,wpUrl:verifiedUrl};
  let productId=matches[0]?.id;
  if(!productId){
   const newProduct=await api("/wp-json/wp/v2/product","POST",{
    title:name,slug,status:"draft",content:description,excerpt,
    product_cat:[child[0].id],featured_media:mediaId
   });
   if(newProduct.status!==201||!Number.isSafeInteger(Number(newProduct.data?.id)))
    throw Error("Native SOP product draft create failed HTTP "+newProduct.status);
   productId=Number(newProduct.data.id);
  }
  const before=await api("/wp-json/wp/v2/product/"+productId+"?context=edit");
  if(before.status!==200||![slug,slug+"-"+productId].includes(before.data.slug)||norm(before.data.title?.raw||before.data.title?.rendered)!==norm(name)||
   Number(before.data.featured_media)!==Number(mediaId)||!before.data.product_cat?.includes(child[0].id)||
   !String(before.data.content?.raw||"").includes("50%")||!String(before.data.excerpt?.raw||"").includes("17%"))
    throw Error("WP SOP product draft readback content/category/media mismatch");
  if(before.data.status==="draft"){
   const published=await api("/wp-json/wp/v2/product/"+productId,"POST",{status:"publish"});
   if(published.status!==200||published.data.status!=="publish")
    throw Error("WP SOP product publish failed");
  }else if(before.data.status!=="publish")throw Error("Unexpected SOP product status");
  const after=await api("/wp-json/wp/v2/product/"+productId+"?context=edit");
  if(after.status!==200||after.data.status!=="publish"||![slug,slug+"-"+productId].includes(after.data.slug)||
   !after.data.product_cat?.includes(child[0].id)||after.data.featured_media!==mediaId||
   !String(after.data.content?.raw||"").includes("17%"))
   throw Error("Published native SOP product readback mismatch");
  report.product={id:productId,slug:after.data.slug,status:"publish",featuredMedia:mediaId,categoryId:child[0].id};
  report.status="PASS";
  console.log("PSE_SOP_RECOVERY=PASS; title="+name+"; wp_product_id="+productId+"; wp_media_id="+mediaId+"; original_sha256="+hash+"; cms_native=true; no_astro_build=true");
 }
}catch(error){report.status="FAILED";report.errors.push(String(error?.message||error).slice(0,350));console.error("PSE_SOP_RECOVERY_ERROR="+report.errors[0]);throw error}
finally{await mkdir("artifacts/pse-product-batch",{recursive:true});
 await writeFile("artifacts/pse-product-batch/sop-recovery.json",JSON.stringify(report,null,2)+"\n");
 await browser.close()}
