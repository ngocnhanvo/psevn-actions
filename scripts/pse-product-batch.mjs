/** Source-verified PSE fertilizer Product CMS batches. Bounded, idempotent, native Product/ProductCategory/Media; no build. */
import {chromium} from "playwright";
import {createHash} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const match=String(event.head_commit?.message||"").match(/^cms\(pse\): import verified fertilizer batch ([1-9][0-9]*)$/);
const batch=match?Number(match[1]):0,chunkSize=8;
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const setting=key=>{const a=env.filter(s=>s.startsWith(key+"="));if(a.length!==1)throw Error("Missing PSE "+key);const url=new URL(a[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||!["","/"].includes(url.pathname))throw Error("Untrusted WP origin");return url.origin};
const cms=setting("WC_URL");
const groups=[
 {slug:"nhom-phan-don-va-phan-phuc-hop-phu-my",name:"Nhóm phân đơn và phân phức hợp Phú Mỹ",menu:77006},
 {slug:"nhom-phan-hon-hop-npk-phu-my",name:"Nhóm phân hỗn hợp NPK Phú Mỹ",menu:77007},
 {slug:"huu-co-phu-my",name:"Hữu cơ Phú Mỹ",menu:77008},
 {slug:"phan-bon-sinh-hoc",name:"Phân bón sinh học",menu:77009},
 {slug:"nhom-san-pham-ure-nguyen-lieu-cho-san-xuat-cong-nghiep",name:"Nhóm sản phẩm ure nguyên liệu cho sản xuất công nghiệp",menu:77010},
 {slug:"dam-phu-my",name:"Đạm Phú Mỹ",menu:77011}
];
const browser=await chromium.launch({headless:true});const ctx=await browser.newContext({viewport:{width:1440,height:900}}),admin=await ctx.newPage();
const report={mode:batch?"apply":"dry",batch,chunkSize,products:[],categories:[],errors:[],sourceCount:0,uniqueProducts:0,skippedNoSourceId:0,collisions:0};
const sha=buf=>createHash("sha256").update(buf).digest("hex");
const safe=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const slugify=s=>String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,92).replace(/-+$/,"");
try{
 await admin.goto(cms+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=await admin.locator("body").innerText(),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const f=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("WP captcha missing");await f.fill(String(v))}
  await Promise.all([admin.waitForLoadState("domcontentloaded"),admin.locator("#wp-submit").click()]);
 }
 if(admin.url().includes("wp-login"))throw Error("WP admin login failed");
 const nonce=await admin.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("REST nonce missing");const s=(await r.text()).trim();if(!/^[A-Za-z0-9]{8,24}$/.test(s))throw Error("REST nonce malformed");return s});
 const api=(path,method="GET",body)=>admin.evaluate(async({path,method,body,nonce})=>{const r=await fetch(path,{credentials:"same-origin",method,headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json().catch(()=>({}))}},{path,method,body,nonce});
 const [menus,existingCategories,existingProducts]=await Promise.all([
  api("/wp-json/wp/v2/menu-items?context=edit&per_page=100"),
  api("/wp-json/wp/v2/product_cat?context=edit&per_page=100&hide_empty=false&_fields=id,slug,parent,name"),
  api("/wp-json/wp/v2/product?context=edit&status=publish,draft,private&per_page=100&_fields=id,slug,title,status,product_cat,featured_media")
 ]);
 if(menus.status!==200||!Array.isArray(menus.data)||existingCategories.status!==200||!Array.isArray(existingCategories.data)||existingProducts.status!==200||!Array.isArray(existingProducts.data))throw Error("PSE Product CMS registry unavailable");
 const source=await ctx.newPage();const records=new Map();
 for(const family of groups){
  const menu=menus.data.filter(m=>Number(m.id)===family.menu&&Number(m.parent)===77005&&String(m.title?.raw||m.title?.rendered||"").trim()===family.name);
  if(menu.length!==1)throw Error("Product category menu identity mismatch "+family.slug);
  const original="https://www.pse.vn/hoat-dong-kinh-doanh/san-pham/"+family.slug+".html";
  if(menu[0].url!==original)throw Error("Original product submenu already changed unexpectedly "+family.slug);
  const response=await source.goto(original,{waitUntil:"domcontentloaded",timeout:55000});
  if(response?.status()!==200)throw Error("Legacy product family source HTTP "+response?.status());
  const rows=await source.evaluate(()=>{
   const root=document.querySelector(".item-page [itemprop=articleBody]");if(!root)throw Error("Missing Joomla product articleBody");
   return [...root.querySelectorAll("table tr")].map(tr=>{
    const cells=[...tr.children].filter(e=>e.tagName==="TD");if(cells.length<2)return null;
    const img=cells[0].querySelector("img[src]");if(!img)return null;
    const a=cells[0].querySelector("a[href*='id=']");
    let originalId="";try{originalId=new URL(a.href).searchParams.get("id")||""}catch{}
    const full=(cells[1].textContent||"").replace(/\s+/g," ").trim();
    const name=full.split(/Mã số\s*:/i)[0].trim();
    return{originalId,name,full,imageUrl:new URL(img.getAttribute("src"),location.href).href};
   }).filter(Boolean);
  });
  for(const item of rows){
   report.sourceCount++;
   if(!/^\d{3,5}$/.test(item.originalId)){report.skippedNoSourceId++;continue}
   if(item.name.length<5||item.name.length>135||item.full.length<85||!item.full.includes("Mã số")||!item.full.includes("Thành phần"))throw Error("Unsafe/missing original Product specs "+item.originalId);
   const image=new URL(item.imageUrl);
   if(image.hostname!=="www.pse.vn"||image.protocol!=="https:"||!image.pathname.startsWith("/images/")||!/\.(png|jpe?g|webp)$/i.test(image.pathname))throw Error("Unexpected original product image source "+item.originalId);
   if(records.has(item.originalId)){
    const prev=records.get(item.originalId);
    if(prev.name.replace(/\s+/g," ").trim().toLowerCase()!==item.name.replace(/\s+/g," ").trim().toLowerCase())throw Error("Conflicting product title for original ID "+item.originalId);
    prev.families.add(family.slug);report.collisions++;
   }else records.set(item.originalId,{...item,families:new Set([family.slug]),original});
  }
 }
 const ordered=[...records.values()].sort((a,b)=>Number(a.originalId)-Number(b.originalId));
 report.uniqueProducts=ordered.length;
 if(ordered.length<35||ordered.length>60)throw Error("Unexpected verified product count "+ordered.length);
 if(batch>Math.ceil(ordered.length/chunkSize))throw Error("Requested batch beyond verified original Product count");
 const chosen=batch?ordered.slice((batch-1)*chunkSize,batch*chunkSize):ordered;
 const catMatches=slug=>existingCategories.data.filter(c=>c.slug===slug);
 const needed=new Set(chosen.flatMap(p=>[...p.families]));
 for(const family of groups){
  if(!needed.has(family.slug))continue;
  const m=catMatches(family.slug);
  if(m.length>1||m.length===1&&m[0].name!==family.name)throw Error("WordPress ProductCategory conflict "+family.slug);
 }
 const root=catMatches("phan-bon-phu-my");
 if(root.length>1||root.length===1&&(root[0].name!=="Phân bón Phú Mỹ"||Number(root[0].parent)!==0))throw Error("PSE fertilizer root ProductCategory conflict");
 const existingBySlug=new Map(existingProducts.data.map(p=>[p.slug,p]));
 for(const item of chosen){
  const id=item.originalId,title=item.name,slug=slugify(title)+"-"+id;
  const present=existingBySlug.get(slug);
  if(present&&String(present.title?.raw||present.title?.rendered||"").replace(/\s+/g," ").trim()!==title)throw Error("Product slug occupied by different source "+slug);
  report.products.push({originalId:id,title,slug,families:[...item.families],imageSource:item.imageUrl,existingId:present?.id||null});
 }
 console.log("PSE_PRODUCT_BATCH_PREFLIGHT="+JSON.stringify({mode:report.mode,batch,sourceRows:report.sourceCount,uniqueProducts:report.uniqueProducts,skippedNoSourceId:report.skippedNoSourceId,duplicateOccurrences:report.collisions,selected:report.products.length,products:report.products.map(x=>({id:x.originalId,title:x.title,existingId:x.existingId}))}));
 if(!batch){console.log("PSE_PRODUCT_BATCH=DRY_PASS; no_wp_mutation=true; no_build=true");process.exit(0)}
 const categoryIds=new Map();
 const acquireCategory=async(slug,name,parent)=>{
  const existing=catMatches(slug);
  if(existing.length){
   if(Number(existing[0].parent)!==parent)throw Error("ProductCategory ancestry conflict "+slug);
   categoryIds.set(slug,existing[0].id);return existing[0].id;
  }
  const r=await api("/wp-json/wp/v2/product_cat","POST",{slug,name,parent});
  if(r.status!==201||r.data.slug!==slug||Number(r.data.parent)!==parent)throw Error("ProductCategory save failed "+slug+" HTTP "+r.status);
  const check=await api("/wp-json/wp/v2/product_cat/"+r.data.id+"?context=edit&_fields=id,name,slug,parent");
  if(check.status!==200||check.data.slug!==slug||Number(check.data.parent)!==parent)throw Error("ProductCategory readback failed "+slug);
  existingCategories.data.push(check.data);
  categoryIds.set(slug,check.data.id);
  report.categories.push({slug,id:check.data.id,created:true});
  return check.data.id;
 };
 const rootId=await acquireCategory("phan-bon-phu-my","Phân bón Phú Mỹ",0);
 for(const family of groups)if(needed.has(family.slug))await acquireCategory(family.slug,family.name,rootId);
 let done=0;
 for(const item of chosen){
  const id=item.originalId,slug=slugify(item.name)+"-"+id;
  const existing=existingBySlug.get(slug);
  if(existing?.status==="publish"){report.products.find(x=>x.slug===slug).result="already-published";done++;continue}
  const imageUrl=new URL(item.imageUrl);
  const ext=imageUrl.pathname.toLowerCase().endsWith(".png")?"png":imageUrl.pathname.toLowerCase().endsWith(".webp")?"webp":"jpg";
  const expectedMime=ext==="png"?"image/png":ext==="webp"?"image/webp":"image/jpeg";
  const r=await ctx.request.get(imageUrl.href,{timeout:60000});if(!r.ok())throw Error("Original image HTTP "+r.status()+" for "+id);
  const buf=await r.body(),digest=sha(buf);
  if(buf.length<100||buf.length>20_000_000||!(ext==="png"?buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):ext==="jpg"?buf[0]===255&&buf[1]===216:buf.toString("ascii",0,4)==="RIFF"))throw Error("Invalid original Product image "+id);
  const filename="pse-fertilizer-"+id+"-"+digest.slice(0,12)+"."+ext,marker=filename.replace(/\.[^.]+$/,"");
  const media=await api("/wp-json/wp/v2/media?context=edit&search="+encodeURIComponent(marker)+"&per_page=100");
  if(media.status!==200||!Array.isArray(media.data))throw Error("Cannot read matching WP Media for "+id);
  const matches=media.data.filter(x=>x.slug===marker&&x.mime_type===expectedMime);
  if(matches.length>1)throw Error("Ambiguous WordPress Product Media "+id);
  let mediaId=matches[0]?.id;
  if(!mediaId){
   const upload=await ctx.request.post(cms+"/wp-json/wp/v2/media",{data:buf,headers:{"X-WP-Nonce":nonce,"Content-Type":expectedMime,"Content-Disposition":'attachment; filename="'+filename+'"',Accept:"application/json"},timeout:100000});
   const result=await upload.json().catch(()=>({}));
   if(upload.status()!==201||result.mime_type!==expectedMime||!Number.isSafeInteger(Number(result.id)))throw Error("Media create HTTP "+upload.status()+" for "+id);
   mediaId=Number(result.id);
  }
  const mediaInfo=await api("/wp-json/wp/v2/media/"+mediaId+"?context=edit");
  if(mediaInfo.status!==200||mediaInfo.data.mime_type!==expectedMime)throw Error("Uploaded WordPress Media mismatch "+id);
  const f=String(mediaInfo.data.media_details?.file||"").replace(/^\/+/, "");
  const urls=[mediaInfo.data.source_url,mediaInfo.data.guid?.rendered];
  if(f&&f.split("/").every(x=>/^[A-Za-z0-9._-]+$/.test(x))&&f.split("/").at(-1)===filename)urls.push(cms+"/wp-content/uploads/"+f);
  let verifiedUrl="";
  for(const entry of urls.filter(Boolean)){
   let link;try{link=new URL(entry,cms)}catch{continue}
   if(link.hostname!==new URL(cms).hostname||!link.pathname.startsWith("/wp-content/uploads/")||!link.pathname.endsWith("/"+filename))continue;
   link.protocol="https:";
   try{const got=await ctx.request.get(link.href,{timeout:50000});if(got.ok()&&sha(await got.body())===digest){verifiedUrl=link.href;break}}catch{}
  }
  if(!verifiedUrl)throw Error("Media checksum verification failed "+id);
  const alt=await api("/wp-json/wp/v2/media/"+mediaId,"POST",{alt_text:item.name});if(alt.status!==200||alt.data?.alt_text!==item.name)throw Error("Product image ALT save failed "+id);
  const ids=[...item.families].map(x=>categoryIds.get(x));
  const parts=item.full.slice(item.name.length).trim();
  const html="<p>"+safe(parts)+"</p>";
  let postId=existing?.id;
  if(!postId){
   const saved=await api("/wp-json/wp/v2/product","POST",{title:item.name,slug,content:html,excerpt:item.name,status:"draft",product_cat:ids,featured_media:mediaId});
   if(saved.status!==201||!Number.isSafeInteger(Number(saved.data?.id)))throw Error("Cannot create verified native Product "+id+" HTTP "+saved.status);
   postId=saved.data.id;
  }
  const check=await api("/wp-json/wp/v2/product/"+postId+"?context=edit");
  if(check.status!==200||check.data.slug!==slug||Number(check.data.featured_media)!==Number(mediaId)||!ids.every(i=>check.data.product_cat?.includes(i))||String(check.data.title?.raw||check.data.title?.rendered||"").trim()!==item.name)throw Error("Product/category/image REST readback failed "+id);
  if(check.data.status==="draft"){
   const published=await api("/wp-json/wp/v2/product/"+postId,"POST",{status:"publish"});
   if(published.status!==200||published.data?.status!=="publish")throw Error("Product publish failed "+id);
  }else if(check.data.status!=="publish")throw Error("Unexpected Product status "+id);
  const verified=await api("/wp-json/wp/v2/product/"+postId+"?context=edit&_fields=id,slug,status,product_cat,featured_media");
  if(verified.status!==200||verified.data.status!=="publish"||!ids.every(i=>verified.data.product_cat?.includes(i))||Number(verified.data.featured_media)!==Number(mediaId))throw Error("Product final readback failed "+id);
  const out=report.products.find(x=>x.slug===slug);out.productId=postId;out.imageId=mediaId;out.imageSha256=digest;out.result="published";done++;
  console.log("PSE_PRODUCT_BATCH_SAVED="+JSON.stringify({batch,id,productId:postId,categoryIds:ids,imageId:mediaId,verified:true}));
 }
 console.log("PSE_PRODUCT_BATCH=PASS; batch="+batch+"; products="+done+"; totalSourceProducts="+ordered.length+"; no_astro_build=true");
}finally{
 await mkdir("artifacts/pse-product-batch",{recursive:true});
 await writeFile("artifacts/pse-product-batch/manifest.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
