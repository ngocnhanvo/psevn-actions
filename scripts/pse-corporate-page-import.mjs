/** PSE corporate Joomla -> WordPress Pages; verified source, idempotent and drafts only.
 * Run only from the dedicated Actions workflow. No Astro build, no menu rewrite.
 */
import {chromium} from "playwright";
import {createHash} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
const hash=b=>createHash("sha256").update(b).digest("hex");
const rows=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const value=key=>{const a=rows.filter(x=>x.startsWith(key+"="));if(a.length!==1)throw Error("Missing config "+key);return a[0].slice(key.length+1).replace(/^['"]|['"]$/g,"")};
const wp=new URL(value("WC_URL"));
if(wp.protocol!=="https:"||!wp.hostname||wp.username||wp.password||!["","/"].includes(wp.pathname)||wp.search||wp.hash)throw Error("Invalid PSE WP origin");
const wpOrigin=wp.origin;
const legacyHost="www.pse.vn";
const legacyRoot="https://"+legacyHost;
const dryRun=process.env.PSE_CORPORATE_DRY_RUN!=="0";
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:900}});
const admin=await context.newPage();
admin.on("dialog",async d=>{if(d.type()==="confirm")await d.accept();else await d.dismiss()});
const output={schema:"pse-corporate-pages-v1",mode:dryRun?"dryrun":"drafts",results:[],errors:[]};
const apiPath=(p)=>"/wp-json/wp/v2/"+p;
try{
 const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
 if(!username||!password)throw Error("Missing PSE WP credentials");
 await admin.goto(wpOrigin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(username);
  await admin.locator("#user_pass").fill(password);
  const body=await admin.locator("body").innerText();
  const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=Number(m[1]),b=Number(m[3]),v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const f=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error("Unknown WP login challenge");
   await f.fill(String(v));
  }
  await Promise.all([admin.waitForLoadState("domcontentloaded"),admin.locator("#wp-submit").click()]);
 }
 if(admin.url().includes("wp-login"))throw Error("PSE WP login rejected");
 const nonce=await admin.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("WP nonce HTTP "+r.status);
  const v=(await r.text()).trim();
  if(!/^[a-zA-Z0-9]{8,24}$/.test(v)||v==="0")throw Error("WP REST nonce invalid");
  return v;
 });
 const api=async(route,method="GET",data)=>admin.evaluate(async({route,method,data,nonce})=>{
  const r=await fetch(route,{method,credentials:"same-origin",headers:{
   "X-WP-Nonce":nonce,Accept:"application/json",...(data?{"Content-Type":"application/json"}:{})
  },...(data?{body:JSON.stringify(data)}:{})});
  return {http:r.status,payload:await r.json().catch(()=>({}))};
 },{route,method,data,nonce});
 const menu=await api(apiPath("menu-items?context=edit&per_page=100"));
 if(menu.http!==200||!Array.isArray(menu.payload))throw Error("Cannot read PSE WP menu-item references");
 const parent=menu.payload.filter(x=>String(x.title?.raw||x.title?.rendered||"").trim()==="PVFCCo-PSE");
 if(parent.length!==1)throw Error("Missing unique PSE original company navigation");
 const items=menu.payload.filter(x=>Number(x.parent)===Number(parent[0].id)).sort((a,b)=>a.id-b.id);
 if(items.length!==10)throw Error("Expected ten verified PSE company menu children");
 const current=await api(apiPath("pages?context=edit&status=publish,draft,private&per_page=100&_fields=id,slug,status,title,content,acf,link"));
 if(current.http!==200||!Array.isArray(current.payload))throw Error("Cannot inspect PSE target pages");
 const paths=new Set();
 for(const item of items){
  const u=new URL(item.url||"");
  if(u.protocol!=="https:"||u.hostname!==legacyHost||!u.pathname.startsWith("/pvfcco-pse/")||!u.pathname.endsWith(".html"))
   throw Error("Corporate legacy URL not within verified source");
  const slug=u.pathname.split("/").at(-1).replace(/\.html$/,"");
  if(!/^[a-z0-9-]+$/.test(slug)||paths.has(slug))throw Error("Invalid or duplicate PSE company slug");
  paths.add(slug);
  const conflicts=current.payload.filter(p=>p.slug===slug);
  if(conflicts.length>1)throw Error("Ambiguous WP corporate Page slug");
  if(conflicts.length===1&&String(conflicts[0].acf?.key||"")!=="pse-company-"+slug)
   throw Error("Corporate Page slug occupied by an unrelated WP Page "+slug);
 }
 const site=await context.newPage();
 let imported=0,ready=0;
 for(const item of items){
  const src=new URL(item.url);
  const slug=src.pathname.split("/").at(-1).replace(/\.html$/,"");
  const title=String(item.title?.raw||item.title?.rendered||"").trim();
  const key="pse-company-"+slug;
  const existing=current.payload.find(p=>p.slug===slug);
  try{
   const response=await site.goto(src.href,{waitUntil:"domcontentloaded",timeout:40000});
   if(response?.status()!==200)throw Error("Joomla original page HTTP "+response?.status());
   const parsed=await site.evaluate(()=>{
    const main=document.querySelector(".item-page");
    if(!main)throw Error("Joomla .item-page not found");
    const article=main.querySelector('[itemprop="articleBody"]');
    if(!article)throw Error("Joomla articleBody missing");
    const node=article.cloneNode(true);
    node.querySelectorAll("script,style,noscript,form,.pager,.pagination,.relateditems,.items-more,.article-info,.icons,.print-icon").forEach(e=>e.remove());
    // Only remove Joomla's related-articles chrome if it occurs in articleBody.
    const related=[...node.querySelectorAll("h2,h3,h4,strong")].find(e=>/^(Các bài viết khác|Other Articles)$/i.test((e.textContent||"").trim()));
    if(related){
      let cur=related.closest("h2,h3,h4")||related;
      while(cur){const next=cur.nextElementSibling;cur.remove();cur=next}
    }
    node.querySelectorAll("img[src]").forEach(img=>{img.removeAttribute("srcset");img.removeAttribute("sizes");img.removeAttribute("loading")});
    node.querySelectorAll("[onload],[onclick],[onerror],[onmouseover]").forEach(e=>{
      for(const attr of ["onload","onclick","onerror","onmouseover"])e.removeAttribute(attr);
    });
    const text=(node.textContent||"").replace(/\s+/g," ").trim();
    const images=[...node.querySelectorAll("img[src]")].map(img=>({src:img.getAttribute("src"),alt:img.getAttribute("alt")||""}));
    return {html:node.innerHTML,text,images};
   });
   const textLength=parsed.text.length;
   const images=parsed.images.length;
   if(textLength<40&&images===0)throw Error("Unverified empty Joomla article content");
   if(parsed.text.includes("Các bài viết khác"))throw Error("Related-articles chrome remains in content");
   if(parsed.html.length>220000)throw Error("HTML exceeds safe import limit");
   if((slug==="so-do-to-chuc"||slug==="thanh-tuu")&&images===0)
     throw Error("Required corporate image missing in extracted Joomla article");
   const oldContent=existing?.content?.raw||"";
   const result={menu_item_id:item.id,slug,title,source_path:src.pathname,source_text_length:textLength,
     images,source_content_sha256:hash(parsed.html),wordpress_id:existing?.id||null,
     status:existing?.status||"not-created",action:existing?"already-present":"proposed"};
   // Previous run saved 6 text-only drafts and REST verified all fields.
   // Do not write those six Pages again while recovering the four image Pages.
   if(!dryRun && existing?.status==="draft" && parsed.images.length===0 &&
      existing.acf?.action==="PublicPage" && existing.acf?.key===key &&
      String(existing.title?.raw||existing.title?.rendered||"").trim()===title &&
      oldContent.trim().length>40 && !oldContent.includes("Các bài viết khác")){
     ready++;
     output.results.push({...result,wordpress_id:existing.id,action:"already-imported",status:"draft"});
     console.log("PSE_CORPORATE_PAGE_REUSED="+JSON.stringify({id:existing.id,slug,status:"draft"}));
     continue;
   }
   // Media must be copied before a Page draft is written; source hotlinks are never published.
   const replacements=new Map();
   if(!dryRun){
    for(const asset of parsed.images){
     const u=new URL(asset.src,src);
     if(u.protocol!=="https:"||!["www.pse.vn","pse.vn"].includes(u.hostname)||
        !u.pathname.startsWith("/images/")||!/\.jpe?g$|\.png$|\.webp$/i.test(u.pathname))
       throw Error("Unverified legacy corporate image URL: "+src.pathname);
     if(replacements.has(asset.src))continue;
     const res=await context.request.get(u.href,{timeout:45000});
     if(!res.ok())throw Error("Legacy corporate image unavailable HTTP "+res.status());
     const body=await res.body();
     const ct=(res.headers()["content-type"]||"").split(";")[0].toLowerCase();
     const ext=/\.png$/i.test(u.pathname)?"png":/\.webp$/i.test(u.pathname)?"webp":"jpg";
     const expected=ext==="png"?"image/png":ext==="webp"?"image/webp":"image/jpeg";
     if(body.length<100||body.length>20*1024*1024||ct!==expected||
       (ext==="jpg"&&(body[0]!==0xff||body[1]!==0xd8))||
       (ext==="png"&&!body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))||
       (ext==="webp"&&body.toString("ascii",0,4)!=="RIFF"))
       throw Error("Legacy corporate image MIME or bytes invalid");
     const checksum=hash(body);
     const filename="pse-corp-"+slug+"-"+checksum.slice(0,12)+"."+ext;
     const marker=filename.replace(/\.[^.]+$/,"");
     const search=await api(apiPath("media?context=edit&per_page=100&search="+encodeURIComponent(marker)));
     if(search.http!==200||!Array.isArray(search.payload))throw Error("Cannot inspect PSE CMS existing media");
     const candidates=search.payload.filter(m=>m.slug===marker&&m.mime_type===expected);
     if(candidates.length>1)throw Error("Ambiguous corporate media import");
     let media=candidates[0];
     if(!media){
      const upl=await context.request.post(wpOrigin+apiPath("media"),{data:body,
        headers:{"X-WP-Nonce":nonce,"Content-Disposition":'attachment; filename="'+filename+'"',
          "Content-Type":expected,Accept:"application/json"},timeout:90000});
      const data=await upl.json().catch(()=>({}));
      if(upl.status()!==201||!Number.isSafeInteger(data.id)||data.mime_type!==expected)
       throw Error("WP corporate media upload HTTP "+upl.status());
      media=data;
     }
     const fresh=await api(apiPath("media/"+media.id+"?context=edit"));
     if(fresh.http!==200||fresh.payload.id!==media.id)throw Error("WP corporate media readback failed");
     // PSE WordPress sometimes omits source_url/guid. Use only authenticated
      // WordPress Media metadata as an alternative, verifying exact bytes.
      const metadataFile=String(fresh.payload.media_details?.file||"").replace(/^\/+/, "");
      const candidates=[fresh.payload.source_url,fresh.payload.guid?.rendered];
      if(/^(?:[0-9]{4}\\/[0-9]{2}\\/)?[a-zA-Z0-9._\\/-]+$/.test(metadataFile) &&
         metadataFile.split("/").at(-1)===filename && !metadataFile.includes(".."))
         candidates.push(new URL("/wp-content/uploads/"+metadataFile,wpOrigin).href);
      let mediaUrl="";
      for(const candidate of candidates.filter(Boolean)){
        let target;
        try{target=new URL(String(candidate),wpOrigin)}catch{continue}
        if(target.hostname!==wp.hostname||!["https:","http:"].includes(target.protocol)||
           !target.pathname.startsWith("/wp-content/uploads/")||
           !target.pathname.endsWith("/"+filename))continue;
        target.protocol="https:";
        try{
          const check=await context.request.get(target.href,{timeout:55000});
          if(check.ok()&&hash(await check.body())===checksum){mediaUrl=target.href;break}
        }catch{}
      }
      if(!mediaUrl){
        console.log("PSE_CORPORATE_MEDIA_DIAGNOSTIC="+JSON.stringify({
          slug,mediaId:media.id,mime:fresh.payload.mime_type,
          sourceUrlPresent:Boolean(fresh.payload.source_url),
          guidPresent:Boolean(fresh.payload.guid?.rendered),
          mediaFile:metadataFile.slice(0,150),expectedFilename:filename
        }));
        throw Error("PSE corporate Media URL/checksum not verified for "+slug);
      }
      replacements.set(asset.src,mediaUrl);
      console.log("PSE_CORPORATE_MEDIA=PASS; slug="+slug+"; id="+media.id+"; sha256="+checksum.slice(0,16));
    }
   }
   const finalHtml=await site.evaluate(({html,mapping})=>{
     const el=document.createElement("div");el.innerHTML=html;
     const pairs=new Map(mapping);
     el.querySelectorAll("img[src]").forEach(img=>{
       const src=img.getAttribute("src");
       if(pairs.has(src))img.setAttribute("src",pairs.get(src));
       img.removeAttribute("srcset");img.removeAttribute("sizes");
     });
     return el.innerHTML;
   },{html:parsed.html,mapping:[...replacements]});
   if(!dryRun){
    if(/<script\b|onerror=|onclick=/i.test(finalHtml))throw Error("Unsafe corporate HTML");
    if(parsed.images.length && [...replacements].length!==new Set(parsed.images.map(x=>x.src)).size)
     throw Error("Corporate media map incomplete");
    const post={title,slug,status:"draft",content:finalHtml,
      acf:{key,action:"PublicPage",product_lang:"vi",label:title}};
    let answer;
    if(existing){
      if(existing.status!=="draft")throw Error("Existing corporate Page is not a safe draft");
      if(oldContent && hash(oldContent)===hash(finalHtml)){ready++;output.results.push({...result,wordpress_id:existing.id,action:"already-imported",status:"draft"});continue}
      answer=await api(apiPath("pages/"+existing.id),"POST",post);
    }else answer=await api(apiPath("pages"),"POST",post);
    if(![200,201].includes(answer.http)||!Number.isSafeInteger(answer.payload.id))
      throw Error("WordPress Page draft save failed HTTP "+answer.http);
    const after=await api(apiPath("pages/"+answer.payload.id+"?context=edit&_fields=id,status,slug,acf,title,content"));
    const saved=after.payload||{};
    if(after.http!==200||saved.id!==answer.payload.id||saved.slug!==slug||
       saved.status!=="draft"||saved.acf?.action!=="PublicPage"||saved.acf?.key!==key||
       !String(saved.content?.raw||"").trim())
      throw Error("Corporate Page draft REST read-after-write mismatch");
    if((saved.content?.raw||"").includes("Các bài viết khác"))throw Error("Joomla related block remained in CMS Page");
    imported++;
    result.wordpress_id=saved.id;result.status="draft";result.action="created-or-updated";
   }
   ready++;output.results.push(result);
   console.log("PSE_CORPORATE_PAGE="+JSON.stringify({...result,images:images}));
  }catch(e){
   const error={slug,reason:String(e).slice(0,240)};
   output.errors.push(error);
   console.log("PSE_CORPORATE_PAGE_ERROR="+JSON.stringify(error));
  }
 }
 console.log("PSE_CORPORATE_IMPORT_SUMMARY="+JSON.stringify({mode:output.mode,planned:items.length,ready,imported,errors:output.errors.length,all_drafts:true,no_menu_change:true,no_build:true}));
 if(output.errors.length)process.exitCode=1;
}finally{
 await mkdir("artifacts",{recursive:true});
 await writeFile("artifacts/pse-corporate-page-manifest.json",JSON.stringify(output,null,2)+"\n");
 await browser.close();
}
