/** Source-verified Joomla 7 PDF manuals -> native WordPress Media and readable PublicPage. Dry run by default. */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const evt=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const apply=evt.head_commit?.message==="cms(pse): publish seven verified fertilizer guide PDFs and Page";
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const base=env.filter(x=>x.startsWith("WC_URL="));
if(base.length!==1)throw Error("Missing native PSE WordPress CMS URL");
const cms=new URL(base[0].slice(7).replace(/^['"]|['"]$/g,""));
if(cms.protocol!=="https:"||cms.username||cms.password||cms.search||cms.hash||!["","/"].includes(cms.pathname))throw Error("PSE WP URL contract changed");
const origin=cms.origin,source="https://www.pse.vn/hoat-dong-kinh-doanh/san-pham/huong-dan-su-dung-phan-bon.html",slug="tai-lieu-huong-dan-su-dung-phan-bon",title="Tài liệu hướng dẫn sử dụng phân bón",menuId=77012,parent=77005;
const expected=new Map([
 ["Binh_Duong_Binh_Phuoc_2014.pdf","15d73d7caa5b32bbca26b5ff2c2648336e4dc0127f48709a3d19b7b00b3f873a"],
 ["Daknong_2014.pdf","64293e30e592bb97cbcc51446ac31b75d323fa59f3c5880570692475c1a57648"],
 ["Dong_Nai_BRVT_2014.pdf","f19089a9b97039f21ffef33f1466afbca5a48bb78389664aefe9c1ea00217c18"],
 ["Lam_Dong_2014.pdf","8baad6d951e06f244ea9b7fae92a97e4609ac70655954f32fd2a9b089e05441d"],
 ["Long_An_2014.pdf","c54024102a239ac8df0d31414270f4ee5f648b75d5c3d9e0b02ecc472236a48a"],
 ["Ninh_Thuan_Binh_Thuan_2014.pdf","b4b762612001fff38d0c46a1f74d0a0420c5b47c27813e7962465066b615125f"],
 ["Tay_Ninh_2014.pdf","a3d784617acb31b2bd577b862dbb7d4ec3bdd142d17b53b9830f18e5b2e79329"]
]);
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const browser=await chromium.launch({headless:true}),ctx=await browser.newContext({viewport:{width:1440,height:900}}),p=await ctx.newPage(),download=await request.newContext({timeout:70000});
const saved={mode:apply?"apply":"dry",source,slug,files:[],page:null,menu:null};
try{
 await p.goto(origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await p.locator("#user_login").count()){
  await p.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");await p.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const raw=await p.locator("body").innerText(),m=raw.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||raw.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const f=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("WordPress challenge field missing");await f.fill(String(n))}
  await Promise.all([p.waitForLoadState("domcontentloaded"),p.locator("#wp-submit").click()]);
 }
 if(p.url().includes("wp-login"))throw Error("CMS session denied");
 const nonce=await p.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("Nonce unavailable");const t=(await r.text()).trim();if(!/^[0-9a-z]{8,24}$/i.test(t))throw Error("Invalid REST nonce");return t});
 const api=(path,method="GET",body)=>p.evaluate(async({path,method,body,nonce})=>{const r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});return{http:r.status,data:await r.json().catch(()=>({})),total:r.headers.get("X-WP-Total")}},{path,method,body,nonce});
 const [menus,pages]=await Promise.all([
  api("/wp-json/wp/v2/menu-items?context=edit&per_page=100"),
  api("/wp-json/wp/v2/pages?context=edit&status=publish,draft,private&per_page=100&_fields=id,slug,status,acf,title,content")
 ]);
 if(menus.http!==200||!Array.isArray(menus.data)||pages.http!==200||!Array.isArray(pages.data))throw Error("CMS menu/pages registry query failed");
 const menusFound=menus.data.filter(x=>Number(x.id)===menuId&&Number(x.parent)===parent);
 if(menusFound.length!==1||String(menusFound[0].title?.raw||menusFound[0].title?.rendered||"").trim()!=="Hướng dẫn sử dụng phân bón")throw Error("Original manual menu item not verified");
 const menu=menusFound[0];
 const isNative=menu.type==="post_type"&&menu.object==="page";
 if(!isNative&&!(menu.type==="custom"&&menu.url===source))throw Error("Original Joomla menu link changed; stop");
 const existing=pages.data.filter(x=>x.slug===slug);
 if(existing.length>1||existing.length===1&&(existing[0].acf?.key!=="pse-business-"+slug||existing[0].acf?.action!=="PublicPage"))throw Error("Conflict with existing Page slug");
 saved.menu={id:menuId,currentType:menu.type,originalUrl:menu.url};
 saved.page={id:existing[0]?.id||null,key:"pse-business-"+slug,action:"PublicPage"};
 const legacy=await ctx.newPage();
 const response=await legacy.goto(source,{waitUntil:"domcontentloaded",timeout:60000});
 if(response?.status()!==200)throw Error("Original Joomla manuals unavailable");
 const files=await legacy.evaluate(()=>{
  const body=document.querySelector(".item-page [itemprop=articleBody]");
  if(!body)throw Error("Original manuals body missing");
  const table=body.querySelector("table");if(!table)throw Error("Original 7-row table missing");
  return [...table.querySelectorAll("tr")].map(tr=>{
   const link=tr.querySelector("a[href]");if(!link)return null;
   const label=String(tr.querySelector("td")?.textContent||tr.textContent||"").replace(/\s+/g," ").trim();
   return{label,url:new URL(link.getAttribute("href"),location.href).href}
  }).filter(Boolean);
 });
 if(files.length!==7)throw Error("Original files diverged from verified count "+files.length);
 for(const f of files){
  const u=new URL(f.url);
  if(u.protocol!=="https:"||u.hostname!=="www.pse.vn"||!u.pathname.startsWith("/images/huong-dan-su-dung/")||!u.pathname.endsWith(".pdf"))throw Error("Unknown guide source "+f.url);
  const name=decodeURIComponent(u.pathname.split("/").at(-1));
  if(!expected.has(name))throw Error("Unexpected manual filename "+name);
  const remote=await download.get(f.url,{timeout:70000});
  if(!remote.ok())throw Error("Original manual HTTP "+remote.status()+" "+name);
  const content=await remote.body(),digest=sha(content);
  if(content.toString("ascii",0,5)!=="%PDF-"||digest!==expected.get(name)||content.length<100||content.length>35000000)throw Error("Original PDF bytes hash invalid "+name);
  const filename="pse-guide-"+digest.slice(0,18)+".pdf",marker=filename.slice(0,-4);
  const present=await api("/wp-json/wp/v2/media?context=edit&search="+encodeURIComponent(marker)+"&per_page=100&_fields=id,slug,mime_type,source_url,media_details");
  if(present.http!==200||!Array.isArray(present.data))throw Error("WP Media search unavailable "+name);
  const matches=present.data.filter(x=>x.slug===marker&&x.mime_type==="application/pdf");
  if(matches.length>1)throw Error("Ambiguous WordPress PDF media "+name);
  saved.files.push({...f,name,bytes:content.length,sha256:digest,filename,existingId:matches[0]?.id||null});
 }
 console.log("PSE_MANUALS_PREFLIGHT="+JSON.stringify({mode:saved.mode,page:saved.page,menu:saved.menu,files:saved.files.map(x=>({label:x.label,name:x.name,bytes:x.bytes,existingId:x.existingId,sha256:x.sha256}))}));
 if(!apply){console.log("PSE_MANUALS=DRY_PASS; verified=7; noWordPressWrites=true; noAstroBuild=true");process.exit(0)}
 const mapped=[];
 for(const f of saved.files){
  let id=f.existingId;
  if(!id){
   const original=await download.get(f.url,{timeout:70000});if(!original.ok())throw Error("Source download failed during media import "+f.name);
   const bytes=await original.body();if(sha(bytes)!==f.sha256)throw Error("Original bytes changed before upload "+f.name);
   const uploaded=await ctx.request.post(origin+"/wp-json/wp/v2/media",{data:bytes,headers:{"X-WP-Nonce":nonce,"Content-Type":"application/pdf","Content-Disposition":'attachment; filename="'+f.filename+'"',Accept:"application/json"},timeout:120000});
   const data=await uploaded.json().catch(()=>({}));
   if(uploaded.status()!==201||data.mime_type!=="application/pdf"||!Number.isSafeInteger(Number(data.id)))throw Error("PDF media upload failed "+f.name+" HTTP "+uploaded.status());
   id=Number(data.id);
  }
  const item=await api("/wp-json/wp/v2/media/"+id+"?context=edit");
  if(item.http!==200||item.data.mime_type!=="application/pdf")throw Error("WordPress PDF media mismatch "+f.name);
  const location=String(item.data.source_url||"");
  let u;try{u=new URL(location)}catch{throw Error("WordPress PDF media URL invalid "+f.name)}
  if(u.hostname!==cms.hostname||!u.pathname.startsWith("/wp-content/uploads/")||!u.pathname.endsWith("/"+f.filename))throw Error("PDF WordPress URL unexpected "+f.name);
  u.protocol="https:";
  const downloaded=await ctx.request.get(u.href,{timeout:65000});
  if(!downloaded.ok()||sha(await downloaded.body())!==f.sha256)throw Error("Native PDF checksum invalid "+f.name);
  const edited=await api("/wp-json/wp/v2/media/"+id,"POST",{title:f.label,alt_text:""});
  if(edited.http!==200)throw Error("Native PDF label update refused "+f.label);
  f.id=id;f.nativeUrl=u.href;mapped.push({label:f.label,url:u.href});
  console.log("PSE_MANUALS_MEDIA_VERIFIED="+JSON.stringify({label:f.label,id,sha256:f.sha256,bytes:f.bytes}));
 }
 const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
 const html='<div class="pse-download-guide"><p class="pse-download-intro">Tải tài liệu hướng dẫn sử dụng phân bón theo từng khu vực. Các tài liệu được lưu trực tiếp trong thư viện của PSE.</p><div class="pse-download-grid">'+mapped.map((f,index)=>'<a class="pse-download-card" href="'+esc(f.url)+'" target="_blank" rel="noopener noreferrer" type="application/pdf"><span class="pse-download-symbol" aria-hidden="true">PDF</span><span class="pse-download-info"><strong>'+esc(f.label)+'</strong><small>Tài liệu PDF · Xem hoặc tải xuống</small></span><span class="pse-download-arrow" aria-hidden="true">↗</span></a>').join("")+"</div></div>";
 const css=`.pse-download-guide{max-width:1150px;margin:0 auto;padding:8px 0 32px}.pse-download-intro{color:#456653;line-height:1.8;max-width:840px;font-size:1.06rem;margin-bottom:28px}.pse-download-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr));gap:18px}.pse-download-card{display:flex;align-items:center;gap:18px;padding:23px 20px;border:1px solid #d9e9de;border-radius:18px;background:#fff;text-decoration:none;color:#1b5639;box-shadow:0 12px 32px rgba(12,66,32,.06);min-width:0;transition:box-shadow .2s,border-color .2s,transform .2s}.pse-download-card:hover{border-color:#92b99e;transform:translateY(-2px);box-shadow:0 15px 34px rgba(12,66,32,.12)}.pse-download-card:focus-visible{outline:3px solid #329569;outline-offset:3px}.pse-download-symbol{display:grid;place-items:center;flex:none;background:#e5f2e8;border-radius:12px;color:#19663f;width:54px;height:58px;font-weight:800;font-size:13px}.pse-download-info{display:grid;gap:5px;flex:1;min-width:0}.pse-download-info strong{font-size:1.06rem;line-height:1.4;overflow-wrap:anywhere}.pse-download-info small{font-size:.84rem;color:#607568;line-height:1.6}.pse-download-arrow{color:#1e8854;font-size:23px;flex:none}@media(max-width:520px){.pse-download-grid{grid-template-columns:1fr}.pse-download-card{padding:16px;gap:13px}.pse-download-symbol{width:46px;height:50px}}`;
 let id=existing[0]?.id;
 if(!id){
  const r=await api("/wp-json/wp/v2/pages","POST",{title,slug,status:"draft",content:html,acf:{action:"PublicPage",key:"pse-business-"+slug,cssmore:css}});
  if(r.http!==201||!Number.isSafeInteger(Number(r.data?.id)))throw Error("Could not create native manual Page");
  id=Number(r.data.id);
 }
 const read=async()=>api("/wp-json/wp/v2/pages/"+id+"?context=edit&_fields=id,slug,status,content,acf");
 const stored=await read();
 if(stored.http!==200||stored.data.slug!==slug||stored.data.acf?.action!=="PublicPage"||stored.data.acf?.key!=="pse-business-"+slug)throw Error("Native manual Page ACF action/key mismatch");
 const body=String(stored.data.content?.raw||"");
 if(mapped.some(f=>!body.includes(f.url))||!body.includes("pse-download-grid")||((body.match(/class="pse-download-card"/g)||[]).length!==7))throw Error("Native manual Page 7 documents missing");
 if(stored.data.status==="draft"){
  const r=await api("/wp-json/wp/v2/pages/"+id,"POST",{status:"publish"});
  if(r.http!==200||r.data.status!=="publish")throw Error("Manual Page publish failed");
 }else if(stored.data.status!=="publish")throw Error("Manual Page unsafe status");
 if(!isNative){
  const r=await api("/wp-json/wp/v2/menu-items/"+menuId,"POST",{type:"post_type",object:"page",object_id:id});
  if(r.http!==200||Number(r.data.object_id)!==id)throw Error("Manual Page menu update failed");
 }
 const [final,finalMenu]=await Promise.all([read(),api("/wp-json/wp/v2/menu-items/"+menuId+"?context=edit")]);
 if(final.http!==200||final.data.status!=="publish"||finalMenu.http!==200||finalMenu.data.type!=="post_type"||finalMenu.data.object!=="page"||Number(finalMenu.data.object_id)!==id)throw Error("Native Page/Menu final verification failed");
 saved.page={id,status:"publish",slug,action:"PublicPage",key:"pse-business-"+slug};
 saved.menu={id:menuId,type:"post_type",objectId:id};
 console.log("PSE_MANUALS=PASS; sourceDocuments=7; sha256_readback=7; publishedPage="+id+"; menu=77012; noAstroBuild=true");
}finally{
 await mkdir("artifacts/pse-fertilizer-guides",{recursive:true});
 await writeFile("artifacts/pse-fertilizer-guides/migration.json",JSON.stringify(saved,null,2)+"\n");
 await download.dispose();await browser.close();
}
