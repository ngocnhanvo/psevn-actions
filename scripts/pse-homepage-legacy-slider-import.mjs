/** Import real original PSE homepage .imageslider-item images into editable WordPress ESC Table. No Astro build. */
import { chromium } from "playwright";
import { createHash } from "node:crypto";
const audit=process.env.PSE_SLIDER_AUDIT_ONLY==="1";
const rows=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,"")).filter(x=>x.startsWith("WC_URL="));
if(rows.length!==1)throw Error("Missing configured WordPress host");
const u=new URL(rows[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Bad WP origin");
const origin=u.origin;
const legacy="https://www.pse.vn";
const names=["1-Ai.png","1-Abcddl.jpg","2-slide-021.jpg","2-slide-022.jpg","4-slide-002.JPG","5-slide-001.jpg","6-slide-001.jpg","silde-021.jpg","slide-001.jpg","slide-003.jpg","slide-0041.JPG"];
const sha=b=>createHash("sha256").update(b).digest("hex");
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900}});
const page=await context.newPage();
page.on("dialog",async d=>{try{if(d.type()==="confirm")await d.accept();else await d.dismiss()}catch(e){if(!String(e).includes("already handled"))throw e}});
try{
 const user=process.env.WP_ADMIN_USERNAME,pass=process.env.WP_ADMIN_PASSWORD;
 if(!user||!pass)throw Error("No WP credentials");
 await page.goto(origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(user);await page.locator("#user_pass").fill(pass);
  const txt=await page.locator("body").innerText();
  const m=txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],ans=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error("Captcha unavailable");await f.fill(String(ans));
  }
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WP login failed");
 await page.goto(origin+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 let nonce=await page.evaluate(()=>window.wpApiSettings?.nonce||"");
 if(!nonce)nonce=await page.evaluate(async()=>{
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("Nonce request HTTP "+r.status);return(await r.text()).trim();
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce)||nonce==="0")throw Error("Standard WP REST nonce not available");
 const api=async route=>page.evaluate(async({route,nonce})=>{
  const r=await fetch(route,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json","Cache-Control":"no-cache"}});
  return {status:r.status,data:await r.json().catch(()=>null)};
 },{route,nonce});
 const table=(await api("/wp-json/tablepress/v1/table/pse_00_vi"));
 const columns=(table.data?.fields||[]).map(f=>f.key);
 if(table.status!==200||table.data?.id!=="pse_00_vi"||
   JSON.stringify(columns)!==JSON.stringify(["label","title","description","img","href","cta"])||
   !Array.isArray(table.data?.items)||!table.data.items[0]?.img)throw Error("PSE original hero table/schema missing");
 const first=String(table.data.items[0].img);
 if(!first.startsWith(origin+"/wp-content/uploads/"))throw Error("First PSE slider image is not verified WordPress media");
 const home=await context.request.get(legacy+"/",{timeout:65000});
 if(!home.ok())throw Error("Legacy PSE homepage unavailable "+home.status());
 const html=await home.text();
 const candidates=[...html.matchAll(/(?:src|data-src)\s*=\s*["']([^"']*\/images\/banners\/[^"']+)["']/gi)]
  .map(m=>m[1].split("?")[0].split("/").at(-1));
 const seen=new Set(),assets=[];
 for(const name of names){
  if(!candidates.includes(name))throw Error("Source slider item missing from legacy HTML: "+name);
  const r=await context.request.get(legacy+"/images/banners/"+name,{timeout:90000});
  if(!r.ok())throw Error("Original banner HTTP "+r.status()+": "+name);
  const bytes=await r.body(),mime=(r.headers()["content-type"]||"").split(";")[0].toLowerCase();
  if(!["image/jpeg","image/png"].includes(mime)||bytes.length<10000||bytes.length>30000000)throw Error("Original banner invalid "+name);
  const digest=sha(bytes);
  if(seen.has(digest)){console.log("PSE_SLIDER_DEDUP="+name);continue}
  seen.add(digest);assets.push({name,bytes,mime});
  console.log("PSE_LEGACY_SLIDER_IMAGE="+JSON.stringify({name,size:bytes.length,mime,sha256:digest.slice(0,16)}));
 }
 if(assets.length<2||assets[0].name!=="1-Ai.png")throw Error("Distinct legacy slides not verified");
 console.log("PSE_LEGACY_SLIDER_AUDIT="+JSON.stringify({sourceCount:assets.length,oldTableRows:table.data.items.length,auditOnly:audit}));
 if(audit){console.log("PSE_LEGACY_SLIDER_AUDIT=PASS; no_writes=true");process.exit(0)}
 const urls=[];
 for(let i=1;i<assets.length;i++){
  const asset=assets[i],slot=String(i+1).padStart(2,"0"),filename="pse-legacy-home-slider-"+slot+".webp",slug=filename.slice(0,-5);
  const existing=await api("/wp-json/wp/v2/media?search="+encodeURIComponent(slug)+"&per_page=100&context=edit");
  if(existing.status!==200||!Array.isArray(existing.data))throw Error("WP media lookup unavailable");
  const found=existing.data.filter(x=>x.slug===slug);
  if(found.length>1)throw Error("Ambiguous existing media "+slug);
  let media=found[0];
  if(!media){
   const optimized=await page.evaluate(async({data,mime})=>{
    const img=new Image();img.src="data:"+mime+";base64,"+data;await img.decode();
    if(img.naturalWidth<800||img.naturalHeight<240)throw Error("Image below hero resolution");
    const c=document.createElement("canvas"),ratio=Math.min(1,1920/img.naturalWidth);
    c.width=Math.round(img.naturalWidth*ratio);c.height=Math.round(img.naturalHeight*ratio);
    c.getContext("2d").drawImage(img,0,0,c.width,c.height);
    const b=await new Promise((resolve,reject)=>c.toBlob(x=>x?resolve(x):reject(Error("WebP encode failed")),"image/webp",.9));
    const array=new Uint8Array(await b.arrayBuffer());let chars="";
    for(let p=0;p<array.length;p+=16384)chars+=String.fromCharCode(...array.subarray(p,p+16384));
    return{b64:btoa(chars),w:c.width,h:c.height};
   },{data:asset.bytes.toString("base64"),mime:asset.mime});
   const bytes=Buffer.from(optimized.b64,"base64");
   if(bytes.length<10000||bytes.length>8000000||bytes.toString("ascii",8,12)!=="WEBP")throw Error("Bad optimized image "+asset.name);
   const response=await context.request.post(origin+"/wp-json/wp/v2/media",{timeout:90000,data:bytes,headers:{"X-WP-Nonce":nonce,"Content-Type":"image/webp","Content-Disposition":'attachment; filename="'+filename+'"',Accept:"application/json"}});
   media=await response.json().catch(()=>null);
   if(response.status()!==201||!Number.isSafeInteger(media?.id)||media.mime_type!=="image/webp")throw Error("WP media upload failed "+asset.name+" HTTP "+response.status());
   console.log("PSE_SLIDER_MEDIA_UPLOADED="+JSON.stringify({name:asset.name,id:media.id,w:optimized.w,h:optimized.h,bytes:bytes.length}));
  }
  if(media.mime_type!=="image/webp")throw Error("Existing media MIME mismatch "+filename);
  const verified=await api("/wp-json/wp/v2/media/"+media.id+"?context=edit");
  if(verified.status!==200||verified.data?.media_details?.file?.split("/").at(-1)!==filename)throw Error("WP media readback mismatch "+filename);
  let target="";
  for(const candidate of [verified.data.source_url,verified.data.guid?.rendered].filter(Boolean)){
   const candidateUrl=new URL(candidate,origin);
   if(candidateUrl.origin!==origin||!candidateUrl.pathname.includes("/wp-content/uploads/")||!candidateUrl.pathname.endsWith("/"+filename))continue;
   const head=await context.request.head(candidateUrl.href,{timeout:45000});
   if(head.ok()&&(head.headers()["content-type"]||"").startsWith("image/webp")){target=candidateUrl.href;break}
  }
  if(!target)throw Error("Uploaded PSE media URL unverifiable "+filename);
  urls.push(target);
  console.log("PSE_SLIDER_MEDIA_VERIFIED=PASS; slot="+slot+"; id="+media.id);
 }
 const desired=[first,...urls],old=table.data.items.map(x=>String(x.img||"")),filled=old.filter(Boolean);
 if(old.length>desired.length||filled.some((x,i)=>x!==desired[i]))throw Error("Hero table contains unexpected editor changes; refuse overwrite");
 if(JSON.stringify(old)===JSON.stringify(desired)){console.log("PSE_SLIDER_CMS=ALREADY_COMPLETE");process.exit(0)}
 await page.goto(origin+"/wp-admin/admin.php?page=tablepress&action=edit&table_id=pse_00_vi",{waitUntil:"domcontentloaded",timeout:60000});
 await page.waitForFunction(()=>Array.isArray(window.tp?.table?.data)&&typeof window.tp?.editor?.setValueFromCoords==="function",null,{timeout:25000});
 const editor=await page.evaluate(()=>({id:window.tp.table.id||window.tp.table.meta?.id,data:window.tp.table.data.map(r=>Array.from(r))}));
 const imageCol=columns.indexOf("img");
 if(editor.id!=="pse_00_vi"||editor.data[0].join(",")!==columns.join(",")||String(editor.data[2]?.[imageCol]||"")!==first)throw Error("Native ESC Table editor changed unexpectedly");
 const add=desired.length-(editor.data.length-2);
 if(add<0)throw Error("Unexpected extra live rows");
 if(add>0){await page.evaluate(n=>{if(typeof window.tp?.callbacks?.append!=="function")throw Error("Native add rows unavailable");window.tp.callbacks.append("rows",n)},add);await page.waitForTimeout(600)}
 await page.evaluate(({desired,imageCol})=>{
  const tp=window.tp;if(tp.table.data.length!==desired.length+2)throw Error("Unexpected slider table row count");
  for(let i=1;i<desired.length;i++){
   const row=i+2,current=String(tp.table.data[row]?.[imageCol]||"");
   if(current&&current!==desired[i])throw Error("Unexpected existing hero image");
   if(!current)tp.editor.setValueFromCoords(imageCol,row,desired[i]);
  }
  tp.helpers.unsaved_changes.set();
 },{desired,imageCol});
 await page.getByRole("button",{name:"Save Changes",exact:true}).first().click();
 let saved=false;
 for(let i=0;i<18;i++){
  await page.waitForTimeout(1000);
  const q=await api("/wp-json/tablepress/v1/table/pse_00_vi");
  if(q.status===200&&JSON.stringify(q.data?.items?.map(x=>String(x.img||"")))===JSON.stringify(desired)){saved=true;break}
 }
 if(!saved)throw Error("ESC Table slider read-after-write mismatch");
 console.log("PSE_SLIDER_CMS_SAVE=PASS; slides="+desired.length+"; first_media_preserved=true; no_astro_build=true");
}finally{await browser.close()}
