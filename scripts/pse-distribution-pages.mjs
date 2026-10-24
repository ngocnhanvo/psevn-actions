/** PSE verified legacy distribution articles -> native WordPress static Pages + own PDF. Dry by default. */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {mkdir,writeFile,readFile} from "node:fs/promises";
const evt=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const apply=evt.head_commit?.message==="cms(pse): publish verified distribution Pages and own PDF";
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const origins=Object.fromEntries(["WC_URL","WC_URL_CLIENT"].map(key=>{
 const x=vars.filter(s=>s.startsWith(key+"="));if(x.length!==1)throw Error("Missing env "+key);
 const u=new URL(x[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Untrusted WP origin "+key);return[key,u.origin]
}));
const cms=origins.WC_URL,frontend=origins.WC_URL_CLIENT,sourceRoot="https://www.pse.vn";
const targets=[
 {slug:"quy-che-nha-phan-phoi",name:"Quy chế Nhà phân phối",id:1568,min:15},
 {slug:"he-thong-kho",name:"Hệ thống kho",id:1031,min:300},
 {slug:"he-thong-phan-phoi-san-pham-tai-cac-tinh-mien-dong-nam-bo",name:"Hệ thống phân phối sản phẩm tại các tỉnh miền Đông Nam Bộ",id:30,min:800}
];
const menuId=77013,menuParent=77004,landingSlug="kenh-phan-phoi",landingName="Kênh phân phối",prefix="pse-business-";
const digest=bytes=>createHash("sha256").update(bytes).digest("hex");
const escapeText=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const browser=await chromium.launch({headless:true});const ctx=await browser.newContext({viewport:{width:1440,height:900}}),admin=await ctx.newPage(),external=await request.newContext({timeout:55000});
const manifest={mode:apply?"apply":"dry",articles:[],pdf:null,parent:null,menu:null};
try{
 await admin.goto(cms+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=await admin.locator("body").innerText(),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const field=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await field.count())throw Error("Captcha input missing");await field.fill(String(v))}
  await Promise.all([admin.waitForLoadState("domcontentloaded"),admin.locator("#wp-submit").click()]);
 }
 if(admin.url().includes("wp-login"))throw Error("CMS login rejected");
 const nonce=await admin.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("Missing REST nonce");const n=(await r.text()).trim();if(!/^[A-Za-z0-9]{8,24}$/.test(n))throw Error("Bad REST nonce");return n});
 const api=(path,method="GET",body)=>admin.evaluate(async({path,method,body,nonce})=>{const r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json().catch(()=>({}))}},{path,method,body,nonce});
 const [menus,pages]=await Promise.all([api("/wp-json/wp/v2/menu-items?context=edit&per_page=100"),api("/wp-json/wp/v2/pages?context=edit&status=publish,draft,private&per_page=100&_fields=id,slug,status,acf,content")]);
 if(menus.status!==200||!Array.isArray(menus.data)||pages.status!==200||!Array.isArray(pages.data))throw Error("WP menu/page registry invalid");
 const item=menus.data.filter(m=>Number(m.id)===menuId&&Number(m.parent)===menuParent&&String(m.title?.raw||m.title?.rendered||"").trim()===landingName);
 if(item.length!==1)throw Error("Distribution original menu identity changed");
 const originalMenu=sourceRoot+"/hoat-dong-kinh-doanh/"+landingSlug+".html";
 if(item[0].url!==originalMenu&&!(item[0].type==="post_type"&&item[0].object==="page"))throw Error("Distribution menu link changed");
 manifest.menu={id:menuId,original:item[0].url,alreadyNative:item[0].type==="post_type"};
 const pageBySlug=slug=>pages.data.filter(p=>p.slug===slug);
 for(const s of [...targets.map(x=>x.slug),landingSlug]){
  const match=pageBySlug(s);
  if(match.length>1||match.length===1&&(match[0].acf?.action!=="PublicPage"||match[0].acf?.key!==prefix+s))throw Error("Conflicting CMS business Page slug "+s);
 }
 const source=await ctx.newPage();
 const originalArticles=[];
 const sanitize=async(url,mapping,minChars=0)=>{const r=await source.goto(url,{waitUntil:"domcontentloaded",timeout:65000});if(r?.status()!==200)throw Error("Legacy distribution article HTTP "+r?.status());
  let mode="article";
  const targetPath=new URL(url).pathname;
  const extract=()=>source.evaluate(({mapping,mode,targetPath})=>{
   const root=mode==="blog"
     ? [...document.querySelectorAll(".blog .item,.blog .leading")].find(node=>[...node.querySelectorAll("a[href]")].some(a=>{try{return new URL(a.href).pathname===targetPath}catch{return false}}))
     : document.querySelector(".item-page [itemprop=articleBody]");
   if(!root)throw Error("Verified distribution source item missing "+targetPath);
   const clone=root.cloneNode(true);
   clone.querySelectorAll("script,style,noscript,iframe,form,input,textarea,button,object,embed,svg,canvas,.extranews_box,.extranews_separator,.pagination,.relateditems").forEach(el=>el.remove());
   const links=[];
   for(const a of clone.querySelectorAll("a[href]")){
    let u;try{u=new URL(a.getAttribute("href"),location.href)}catch{u=null}
    if(!u||!["https:","http:","mailto:","tel:"].includes(u.protocol)){const span=document.createElement("span");span.textContent=a.textContent;a.replaceWith(span);continue}
    if(["http:","https:"].includes(u.protocol)&&!["www.pse.vn","pse.vn"].includes(u.hostname)){const span=document.createElement("span");span.textContent=a.textContent;a.replaceWith(span);continue}
    if(u.pathname.toLowerCase().endsWith(".pdf"))links.push(u.href);
    a.setAttribute("href",mapping[u.href]||u.href);
   }
   for(const el of clone.querySelectorAll("*")){
    for(const att of [...el.attributes]){
     const keep=el.tagName==="A"&&att.name==="href"||el.tagName==="IMG"&&["src","alt"].includes(att.name)||["colspan","rowspan"].includes(att.name)&&["TD","TH"].includes(el.tagName);
     if(!keep)el.removeAttribute(att.name);
    }
   }
   const content=(clone.textContent||"").replace(/\s+/g," ").trim();
   return {html:clone.innerHTML,chars:content.length,text:content.slice(0,300),tables:clone.querySelectorAll("table").length,links:[...new Set(links)]};
  },{mapping,mode,targetPath});
  let result=await extract();
  if(result.chars<minChars&&/Nội dung đang cập nhật/i.test(result.text)){
   const blog=await source.goto(sourceRoot+"/hoat-dong-kinh-doanh/kenh-phan-phoi.html",{waitUntil:"domcontentloaded",timeout:65000});
   if(blog?.status()!==200)throw Error("Legacy distribution index missing for archival fallback");
   mode="blog";result=await extract();
  }
  return {...result,sourceMode:mode};
 };
 for(const item of targets){
  const legacyUrl=sourceRoot+"/hoat-dong-kinh-doanh/kenh-phan-phoi/"+item.id+"-"+item.slug+".html";
  const data=await sanitize(legacyUrl,{},item.min);
  if(data.chars<item.min||data.html.length>145000||/<script|javascript:|Подробнее|\.ru\b/i.test(data.html))throw Error("Original distribution source needs manual sanitization "+item.slug);
  const existing=pageBySlug(item.slug)[0];
  manifest.articles.push({...item,legacyUrl,chars:data.chars,tables:data.tables,sourceMode:data.sourceMode,links:data.links,existingId:existing?.id||null});
  originalArticles.push({...item,legacyUrl,data});
 }
 const originalPDF=[...new Set(originalArticles.flatMap(x=>x.data.links))].filter(x=>new URL(x).pathname.toLowerCase().endsWith(".pdf"));
 if(originalPDF.length!==1)throw Error("Expected one original real distributor regulation PDF; got "+originalPDF.length);
 const pdfUrl=originalPDF[0],pdfHost=new URL(pdfUrl);
 if(pdfHost.hostname!=="www.pse.vn"||!pdfHost.pathname.startsWith("/images/"))throw Error("Unknown distributor PDF origin");
 const pdfResult=await external.get(pdfUrl,{timeout:70000});if(!pdfResult.ok())throw Error("Original distributor PDF source HTTP "+pdfResult.status());
 const pdfBytes=await pdfResult.body();if(pdfBytes.length<100||pdfBytes.length>35000000||pdfBytes.toString("ascii",0,5)!=="%PDF-")throw Error("Invalid original distributor PDF bytes");
 const pdfHash=digest(pdfBytes),pdfFilename="pse-distribution-regulation-"+pdfHash.slice(0,14)+".pdf",marker=pdfFilename.slice(0,-4);
 const media=await api("/wp-json/wp/v2/media?context=edit&search="+encodeURIComponent(marker)+"&per_page=100&_fields=id,slug,mime_type,source_url,media_details,guid");
 if(media.status!==200||!Array.isArray(media.data))throw Error("Cannot inspect native distributor Media");
 const matches=media.data.filter(x=>x.slug===marker&&x.mime_type==="application/pdf");if(matches.length>1)throw Error("Duplicate distributor PDF media");
 manifest.pdf={source:pdfUrl,bytes:pdfBytes.length,sha256:pdfHash,filename:pdfFilename,existingId:matches[0]?.id||null};
 manifest.parent={slug:landingSlug,existingId:pageBySlug(landingSlug)[0]?.id||null};
 console.log("PSE_DISTRIBUTION_PAGES_PREFLIGHT="+JSON.stringify({mode:manifest.mode,articles:manifest.articles.map(x=>({slug:x.slug,chars:x.chars,tables:x.tables,links:x.links.length,existingId:x.existingId})),pdf:manifest.pdf,parent:manifest.parent,menu:manifest.menu}).slice(0,13000));
 if(!apply){console.log("PSE_DISTRIBUTION_PAGES=DRY_PASS; originalArticles=3; noCmsMutation=true; noBuild=true");process.exit(0)}
 let mediaId=matches[0]?.id;
 if(!mediaId){
  const upload=await ctx.request.post(cms+"/wp-json/wp/v2/media",{data:pdfBytes,headers:{"X-WP-Nonce":nonce,"Content-Disposition":'attachment; filename="'+pdfFilename+'"',"Content-Type":"application/pdf",Accept:"application/json"},timeout:120000});
  const data=await upload.json().catch(()=>({}));
  if(upload.status()!==201||data.mime_type!=="application/pdf"||!Number.isSafeInteger(Number(data.id)))throw Error("Distribution PDF media upload rejected");
  mediaId=Number(data.id);
 }
 const m=await api("/wp-json/wp/v2/media/"+mediaId+"?context=edit");
 if(m.status!==200||m.data.mime_type!=="application/pdf")throw Error("Native distributor PDF identity invalid");
 const file=String(m.data.media_details?.file||"").replace(new RegExp("^/+"),"");
 const candidates=[m.data.source_url,m.data.guid?.rendered];
 if(file&&file.split("/").every(x=>/^[A-Za-z0-9._-]+$/.test(x))&&file.split("/").at(-1)===pdfFilename)candidates.push(cms+"/wp-content/uploads/"+file);
 let nativePDF="";
 for(const candidate of candidates.filter(Boolean)){
  let u;try{u=new URL(candidate,cms)}catch{continue}
  if(u.hostname!==new URL(cms).hostname||!u.pathname.startsWith("/wp-content/uploads/")||!u.pathname.endsWith("/"+pdfFilename))continue;
  u.protocol="https:";
  try{const test=await ctx.request.get(u.href,{timeout:60000});if(test.ok()&&digest(await test.body())===pdfHash){nativePDF=u.href;break}}catch{}
 }
 if(!nativePDF)throw Error("Distributor WP Media checksum cannot be verified");
 manifest.pdf.id=mediaId;manifest.pdf.nativeUrl=nativePDF;
 const css=`.pse-distribution-body{max-width:1220px;margin:0 auto;color:#2b4335;font-size:1.02rem;line-height:1.8}.pse-distribution-body p{margin:10px 0 18px}.pse-distribution-body table{width:100%!important;border-collapse:collapse;border:1px solid #dde7df;table-layout:fixed}.pse-distribution-body th,.pse-distribution-body td{padding:14px;border:1px solid #dce9df;text-align:left;vertical-align:top;overflow-wrap:anywhere;word-break:normal}.pse-distribution-body th{background:#eaf5ec;color:#1a603c}.pse-distribution-body tr:nth-child(even){background:#f8fbf8}.pse-distribution-body a{color:#16784b;text-decoration:underline}.pse-distribution-index{max-width:1140px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:18px}.pse-distribution-index>a{padding:25px;border:1px solid #dce9df;border-radius:18px;display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff;color:#20593b;text-decoration:none;font-weight:700;box-shadow:0 9px 27px rgba(12,66,32,.07)}.pse-distribution-index>a:hover{border-color:#92bba3;box-shadow:0 14px 31px rgba(12,66,32,.14)}@media(max-width:640px){.pse-distribution-body table,.pse-distribution-body tbody,.pse-distribution-body tr,.pse-distribution-body td,.pse-distribution-body th{display:block;width:100%!important}.pse-distribution-body tr{border:1px solid #dce9df;margin:12px 0;border-radius:12px;overflow:hidden}.pse-distribution-body td,.pse-distribution-body th{border:0;border-bottom:1px solid #e7eee9;padding:12px}.pse-distribution-index{grid-template-columns:1fr}}`;
 const createPage=async(spec,html)=>{
  const existing=pageBySlug(spec.slug)[0];
  let id=existing?.id;
  if(!id){
   const r=await api("/wp-json/wp/v2/pages","POST",{title:spec.name,slug:spec.slug,status:"draft",content:html,acf:{key:prefix+spec.slug,action:"PublicPage",cssmore:css}});
   if(r.status!==201||!Number.isSafeInteger(Number(r.data?.id)))throw Error("WP Distribution draft failed "+spec.slug);
   id=r.data.id;
  }
  const get=()=>api("/wp-json/wp/v2/pages/"+id+"?context=edit&_fields=id,slug,status,acf,content");
  const check=await get();
  if(check.status!==200||check.data.slug!==spec.slug||check.data.acf?.action!=="PublicPage"||check.data.acf?.key!==prefix+spec.slug)throw Error("WP distribution Page ACF identity invalid "+spec.slug);
  const stored=String(check.data.content?.raw||"");
  if(stored.length<Math.min(120,html.length*.3)||!stored.includes("pse-distribution-"))throw Error("WP Page content empty or incomplete "+spec.slug);
  if(check.data.status==="draft"){
   const r=await api("/wp-json/wp/v2/pages/"+id,"POST",{status:"publish"});if(r.status!==200||r.data.status!=="publish")throw Error("WP distribution Page publication failed "+spec.slug);
  }else if(check.data.status!=="publish")throw Error("WP distribution Page invalid status "+spec.slug);
  const verified=await get();if(verified.status!==200||verified.data.status!=="publish")throw Error("WP Page readback failed "+spec.slug);
  return id;
 };
 for(const article of originalArticles){
  const data=await sanitize(article.legacyUrl,{[pdfUrl]:nativePDF},article.min);
  if(data.chars<article.min||data.chars!==article.data.chars||/Подробнее|\.ru\b/i.test(data.html))throw Error("Original article changed or unsafe at apply "+article.slug);
  const id=await createPage(article,'<div class="pse-distribution-body">'+data.html+"</div>");
  manifest.articles.find(x=>x.slug===article.slug).pageId=id;
  console.log("PSE_DISTRIBUTION_PAGE_PUBLISHED="+JSON.stringify({slug:article.slug,pageId:id,chars:data.chars,pdfOwner:article.slug===targets[0].slug?mediaId:null}));
 }
 const landing='<p>Thông tin về hệ thống kho, nhà phân phối và quy chế phân phối của PSE.</p><nav class="pse-distribution-index" aria-label="Thông tin kênh phân phối">'+targets.map(x=>'<a href="'+escapeText(frontend+"/"+x.slug+"/")+'"><span>'+escapeText(x.name)+'</span><span aria-hidden="true">↗</span></a>').join("")+"</nav>";
 const parentPage=await createPage({slug:landingSlug,name:landingName},landing);
 manifest.parent.id=parentPage;manifest.parent.status="publish";
 if(!manifest.menu.alreadyNative){
  const r=await api("/wp-json/wp/v2/menu-items/"+menuId,"POST",{type:"post_type",object:"page",object_id:parentPage});
  if(r.status!==200||Number(r.data.object_id)!==Number(parentPage))throw Error("Distribution parent menu update failed");
 }
 const [parent,menu]=await Promise.all([api("/wp-json/wp/v2/pages/"+parentPage+"?context=edit&_fields=id,slug,status,acf"),api("/wp-json/wp/v2/menu-items/"+menuId+"?context=edit")]);
 if(parent.status!==200||parent.data.status!=="publish"||menu.status!==200||menu.data.object!=="page"||Number(menu.data.object_id)!==Number(parentPage))throw Error("Distribution publication/menu final readback failed");
 console.log("PSE_DISTRIBUTION_PAGES=PASS; sourceArticles=3; publishedPages=4; pdfSha256Verified=true; parentMenu=77013; noAstroBuild=true");
}finally{
 await mkdir("artifacts/pse-distribution",{recursive:true});
 await writeFile("artifacts/pse-distribution/migration.json",JSON.stringify(manifest,null,2)+"\n");
 await external.dispose();await browser.close();
}
