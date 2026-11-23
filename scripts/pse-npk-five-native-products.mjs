/** Native WooCommerce repair for four source-proven missing NPK variants and five image links. */
import {chromium} from "playwright";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";

const repo="ngocnhanvo/psevn-actions";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const apply=event.head_commit?.message==="cms(pse): publish four missing NPK products" &&
 process.env.PSE_NPK_FIVE_PREVIEW_ONLY!=="true";
if(process.env.GITHUB_REPOSITORY!==repo||process.env.GITHUB_REF!=="refs/heads/main")throw Error("PSE Actions main required");
if(apply&&process.env.PSE_NPK_FIVE_FRESH_BACKUP!=="yes")throw Error("Fresh DB backup required");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const getOrigin=key=>{
 const v=env.filter(s=>s.startsWith(key+"="));if(v.length!==1)throw Error("Missing unique "+key);
 const u=new URL(v[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.port||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Unsafe "+key);
 return u.origin;
};
const wp=getOrigin("WC_URL"),front=getOrigin("WC_URL_CLIENT");
if(wp!=="https://admin-pse.webnvn.com"||front!=="https://pse.webnvn.com")throw Error("Unexpected PSE origin");
const entries=[
 {i:2,code:"05412",title:"NPK 16-7-16",slug:"npk-16-7-16-05412",image:"212_-_NPK_16-7-16_mat_truoc.png",proof:"Kali hữu hiệu (K2Ohh): 16%"},
 {i:11,code:"00066",title:"NPK Phú Mỹ 16-16-8+5S+TE",slug:"npk-phu-my-16-16-8-5s-te-00066",image:"17-161685s.png",proof:"Lưu huỳnh (S): 5%"},
 {i:12,code:"00063",title:"NPK Phú Mỹ 16-16-8+9S+TE",slug:"npk-phu-my-16-16-8-9s-te-00063",image:"18-161689s1.png",proof:"Lưu huỳnh (S): 9%"},
 {i:13,code:"00062",title:"NPK Phú Mỹ 16-16-8+10S+TE",slug:"npk-phu-my-16-16-8-10s-te-00062",image:"19-002.png",proof:"Lưu huỳnh (S): 10%"}
];
const existing={i:15,code:"05395",title:"NPK Phú Mỹ 16-6-19+TE",slug:"npk-phu-my-16-6-19-te-1683",id:80958,proof:"Kali hữu hiệu (K2Ohh): 19%"};
const hash=v=>createHash("sha256").update(String(v||"")).digest("hex");
const normalize=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/gi,"d").toLowerCase().replace(/[^a-z0-9]/g,"");
const dirname="artifacts/pse-npk-five-native-products";await mkdir(dirname,{recursive:true});
const browser=await chromium.launch({headless:true});
const admin=await browser.newPage({viewport:{width:1280,height:900}});
const writes=[];
try{
 await admin.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const body=await admin.locator("body").innerText();
  const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3],answer=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const field=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error("Unknown login challenge");
   await field.fill(String(answer));
  }
  await admin.locator("#wp-submit").click();
 }
 if(admin.url().includes("wp-login"))throw Error("Login failed");
 const nonce=await admin.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("REST nonce failed");
  return (await r.text()).trim();
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("Invalid nonce");
 const rest=(path,method="GET",data=null)=>admin.evaluate(async({path,method,data,nonce})=>{
  const r=await fetch(path,{credentials:"same-origin",method,headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(data?{"Content-Type":"application/json"}:{})},...(data?{body:JSON.stringify(data)}:{})});
  return {status:r.status,value:await r.json().catch(()=>null),pages:Number(r.headers.get("X-WP-TotalPages")||1)};
 },{path,method,data,nonce});
 const pageGet=()=>rest("/wp-json/wp/v2/pages/83593?context=edit&_fields=id,slug,status,acf,content,modified");
 const page=await pageGet();
 if(page.status!==200||page.value?.id!==83593||page.value.slug!=="npk-phu-my"||page.value.status!=="publish"||
  page.value.acf?.action!=="PublicPage"||page.value.acf?.key!=="pse-historical-npk-1434")
  throw Error("Page identity mismatch");
 const original=String(page.value.content?.raw||"");
 const source=await admin.evaluate(html=>{
  const root=document.createElement("div");root.innerHTML=html;
  const tables=[...root.querySelectorAll("table")],rows=[...(tables[0]?.rows||[])];
  return {tables:tables.map(t=>t.rows.length),images:root.querySelectorAll("img").length,
   rows:rows.map((tr,i)=>({i,title:(tr.cells[1]?.querySelector("strong,b")?.textContent||tr.cells[1]?.textContent||"").trim(),
    html:tr.cells[1]?.innerHTML||"",text:tr.cells[1]?.textContent||"",
    img:tr.cells[0]?.querySelector("img")?.outerHTML||"",src:tr.cells[0]?.querySelector("img")?.getAttribute("src")||"",
    href:tr.cells[0]?.querySelector("a:has(img)")?.getAttribute("href")||""}))};
 },original);
 if(source.tables.join(",")!=="20,4,4"||source.images!==20)throw Error("Source table shape mismatch");
 const candidates=[...entries,existing];
 for(const p of candidates){
  const row=source.rows[p.i],name=normalize(row.title);
  if(!row||!name.includes(normalize(p.title))||!row.text.includes(p.code)||!row.text.includes(p.proof))
   throw Error("Source title/code/formula mismatch at row "+p.i);
  if(entries.includes(p)){
   const url="/wp-content/uploads/2026/11/"+p.image;
   if(row.src!==url)throw Error("Original WordPress image identity mismatch "+p.image);
   const media=await admin.request.get(wp+url,{timeout:40000});
   if(media.status()!==200||!(media.headers()["content-type"]||"").startsWith("image/"))throw Error("Original local source photo missing "+p.image);
   p.imageDigest=hash(await media.body());
   p.imageSrc=url;
  }
  if(row.href)throw Error("Previously unlinked image row unexpectedly linked "+p.i);
  p.sourceHtml=row.html;
  p.imageMarkup=row.img;
 }
 const cats=await rest("/wp-json/wp/v2/product_cat?per_page=100&hide_empty=false&_fields=id,slug,parent");
 if(cats.status!==200||!Array.isArray(cats.value)||
  !cats.value.some(x=>x.id===1764&&x.slug==="nhom-phan-hon-hop-npk-phu-my"&&x.parent===1760))throw Error("Original NPK Product category missing");
 const registry=await rest("/wp-json/wp/v2/product?context=edit&status=publish,draft,private&per_page=100&_fields=id,status,slug,title,content,excerpt,featured_media,product_cat,acf");
 if(registry.status!==200||!Array.isArray(registry.value)||registry.value.length<50)throw Error("Woo Product registry incomplete");
 if(!registry.value.some(x=>x.id===80958&&x.slug===existing.slug&&x.content?.raw?.includes("05395")&&x.content.raw.includes("19%")))
  throw Error("Existing NPK 16-6-19 product not verified");
 if(registry.value.some(x=>entries.some(p=>p.slug===x.slug)&&!["publish","draft"].includes(x.status)))
  throw Error("Unrelated target slug collision");
 // Enumerate exact media filenames (not fuzzy WordPress search) to avoid duplicates/collisions.
 const filenames=new Map();let scanned=0;
 for(let n=1;n<=75;n++){
  const m=await rest("/wp-json/wp/v2/media?context=edit&per_page=100&page="+n+"&_fields=id,mime_type,media_details,source_url");
  if(m.status!==200||!Array.isArray(m.value)||m.pages>75)throw Error("Full WordPress Media inventory unavailable at "+n);
  scanned+=m.value.length;
  for(const item of m.value){
   const path=String(item.media_details?.file||"");
   const filename=path.split("/").at(-1);
   if(entries.some(p=>p.image===filename)){
    if(filenames.has(filename))throw Error("Duplicate native media filename "+filename);
    filenames.set(filename,item);
   }
  }
  if(n>=m.pages)break;
 }
 for(const p of entries){
  const media=filenames.get(p.image);
  if(!media||media.mime_type!=="image/png"||!media.source_url?.endsWith("/"+p.image))
   throw Error("Original image not registered in WP Media Library "+p.image);
  p.mediaId=Number(media.id);
  const mediaUrl=new URL(media.source_url,wp);
  if(mediaUrl.origin!==wp)throw Error("Media URL leaves PSE WordPress origin "+p.image);
  const response=await admin.request.get(mediaUrl.href,{timeout:40000});
  if(response.status()!==200||hash(await response.body())!==p.imageDigest)
   throw Error("Media source hash mismatch "+p.image);
  const duplicates=registry.value.filter(x=>normalize(x.title?.raw||x.title?.rendered||"")===normalize(p.title));
  if(duplicates.length>0&&!duplicates.every(x=>x.slug===p.slug))
   throw Error("Existing product with same title, inspect before creating "+p.title);
  p.current=registry.value.find(x=>x.slug===p.slug)||null;
  if(p.current&&(normalize(p.current.title?.raw||p.current.title?.rendered||"")!==normalize(p.title)||
     p.current.featured_media!==p.mediaId||!p.current.product_cat.includes(1764)))
   throw Error("Existing target Product content conflict "+p.slug);
 }
 console.log("PSE_NPK_FIVE_PREFLIGHT="+JSON.stringify({sourcePage:83593,existingProduct:80958,
  missing:entries.filter(p=>!p.current).map(p=>({title:p.title,code:p.code,slug:p.slug,mediaId:p.mediaId})),
  alreadyPresent:entries.filter(p=>p.current).length,mediaScanned:scanned,writeMode:apply}));
 await writeFile(dirname+"/plan.json",JSON.stringify({page:83593,contentHash:hash(original),apply,
  products:entries.map(p=>({sourceRow:p.i,code:p.code,title:p.title,slug:p.slug,mediaId:p.mediaId,imageSha256:p.imageDigest,existingId:p.current?.id||null})),
  linkedExistingProduct:existing.slug},null,2)+"\n");
 if(!apply){console.log("PSE_NPK_FIVE_DRY_RUN=PASS");}
 else{
  let current=await pageGet();
  if(current.status!==200||current.value.modified!==page.value.modified||hash(current.value.content.raw)!==hash(original))
   throw Error("Concurrent Page edit preflight");
  for(const p of entries){
   if(!p.current){
    const saved=await rest("/wp-json/wp/v2/product","POST",{
     title:p.title,slug:p.slug,status:"draft",product_cat:[1764],featured_media:p.mediaId,
     content:p.sourceHtml,excerpt:"<p>Mã số: "+p.code+"</p>"
    });
    if(saved.status!==201||saved.value?.slug!==p.slug||!Number.isSafeInteger(saved.value.id))
     throw Error("Product draft creation uncertain, do not retry blind "+p.slug);
    p.current=saved.value;writes.push({type:"Product",id:p.current.id,slug:p.slug});
   }
   const check=await rest("/wp-json/wp/v2/product/"+p.current.id+"?context=edit");
   if(check.status!==200||check.value.slug!==p.slug||check.value.featured_media!==p.mediaId||
    !check.value.product_cat.includes(1764)||!check.value.content.raw.includes(p.code))
    throw Error("Product created but readback mismatch "+p.slug);
   if(check.value.status!=="publish"){
    const published=await rest("/wp-json/wp/v2/product/"+p.current.id,"POST",{status:"publish"});
    if(published.status!==200||published.value?.status!=="publish")throw Error("Product publish failed "+p.slug);
   }
   console.log("PSE_NPK_FIVE_PRODUCT_VERIFIED="+JSON.stringify({id:p.current.id,slug:p.slug,mediaId:p.mediaId}));
  }
  let changed=original;
  for(const p of candidates){
   const needle=p.imageMarkup;
   if(!needle||changed.split(needle).length!==2)throw Error("Image exact mutation boundary not unique "+p.i);
   const href=front+"/san-pham/"+p.slug;
   changed=changed.replace(needle,'<a href="'+href+'">'+needle+"</a>");
  }
  const shape=await admin.evaluate(html=>{
   const root=document.createElement("div");root.innerHTML=html;
   const table=root.querySelector("table");
   return {images:root.querySelectorAll("img").length,rows:[...root.querySelectorAll("table")].map(x=>x.rows.length),
    urls:[...table.rows].map(tr=>tr.cells[0].querySelector("a:has(img)")?.href||"")};
  },changed);
  if(shape.images!==20||shape.rows.join(",")!=="20,4,4"||shape.urls.some(x=>!x.startsWith(front+"/san-pham/")))
   throw Error("Postlink HTML invalid");
  current=await pageGet();
  if(current.status!==200||hash(current.value.content.raw)!==hash(original))
   throw Error("Concurrent Page content updated, do not overwrite");
  await writeFile(dirname+"/page-rollback.json",JSON.stringify({id:83593,modified:page.value.modified,content:original},null,2)+"\n");
  const saved=await rest("/wp-json/wp/v2/pages/83593","POST",{content:changed});
  if(saved.status!==200||saved.value?.id!==83593)throw Error("Page save failed");
  const after=await pageGet();
  if(after.status!==200||hash(after.value.content.raw)!==hash(changed)||
   hash(after.value.acf?.cssmore)!==hash(page.value.acf?.cssmore))
   throw Error("Page readback content or cssmore mismatch");
  writes.push({type:"Page",id:83593});
  console.log("PSE_NPK_FIVE_SAVED=PASS 4 products plus 5 native image links; 20/20 local");
 }
}finally{
 await writeFile(dirname+"/writes.json",JSON.stringify({apply,writes},null,2)+"\n");
 await browser.close();
}
