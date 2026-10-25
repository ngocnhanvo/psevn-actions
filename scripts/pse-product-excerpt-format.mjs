/** Format existing PSE native WordPress Product short descriptions in place (44 source-backed records).
 * No Product creation, content/detail edits, images, taxonomy changes, or Astro build.
 * Triggers: audit(pse): product excerpt lines dry-run / cms(pse): format product excerpt lines batch N.
 */
import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";

const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
const subject = String(event.head_commit?.message || "").split("\n")[0];
const dry = subject === "audit(pse): product excerpt lines dry-run";
const match = subject.match(/^cms\(pse\): format product excerpt lines batch ([1-9][0-9]*)$/);
if (!dry && !match) throw Error("Unsupported PSE Product excerpt formatter trigger");
const batch = match ? Number(match[1]) : 0, batchSize = 8;
const entry = String(process.env.ENV_FILE || "").split(/\r?\n/).map(s=>s.trim()).filter(s=>s.replace(/^export\s+/,"").startsWith("WC_URL="));
if(entry.length!==1)throw Error("Missing single verified WP origin");
const url = new URL(entry[0].replace(/^export\s+/,"").slice(7).replace(/^['"]|['"]$/g,""));
if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||!["","/"].includes(url.pathname))throw Error("Unexpected WP URL");
const origin=url.origin,esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const clean=s=>String(s||"").replace(/\u00a0/g," ").replace(/\s+/g," ").trim();
const labelRe=/(?:^|\s)(?=(?:Hữu\s+cơ|Đạm(?:\s+tổng\s+số)?|Lân(?:\s+hữu\s+hiệu)?|Kali(?:\s+hữu\s+hiệu)?|Cadimi|Cadmium|Độ\s+ẩm|pH|PH|Canxi|Magiê|Magie|Lưu\s+huỳnh|Kẽm|Bo|Boron|Natri|Silic|Sắt|Mangan|Đồng|Mn|Zn|CaO|MgO|P2O5|K2O|NPK|Nts|Chất\s+hữu\s+cơ|Axít\s+humic|Acid\s+humic|Axit\s+humic|Fulvic|Humic|Vi\s+sinh|Vi\s+sinh\s+vật|Tỷ\s+lệ\s+C\/N)(?:\s*\([^)]{1,40}\))?\s*:)/giu;
function format(text){
 const source=clean(text);
 const m=source.match(/^Mã\s*số\s*:\s*([\s\S]*?)\s+Thành\s*phần\s*:\s*([\s\S]*?)\s+Loại\s*cây\s*:\s*([\s\S]+)$/iu);
 if(!m)throw Error("No verified Ma so / Thanh phan / Loai cay sections");
 const code=m[1].trim(),comp=m[2].trim(),crops=m[3].trim();
 if(!code||!comp||!crops||!/[0-9]/.test(code))throw Error("Missing required Product spec values");
 const starts=[0];for(const x of comp.matchAll(labelRe)){let i=x.index+(x[0].length||0);if(i>0&&!starts.includes(i))starts.push(i)}
 starts.sort((a,b)=>a-b);
 const parts=starts.map((pos,i)=>comp.slice(pos,starts[i+1]??comp.length).trim()).filter(Boolean);
 const html="<p>Mã số: "+esc(code)+"</p><p><strong>Thành phần:</strong></p>"+parts.map(t=>"<p>"+esc(t)+"</p>").join("")+"<p><strong>Loại cây:</strong></p><p>"+esc(crops)+"</p>";
 const textAfter="Mã số: "+code+" Thành phần: "+parts.join(" ")+" Loại cây: "+crops;
 if(source!==clean(textAfter))throw Error("Text parity guard failed");
 return{html,code,parts,crops,source};
}
const browser=await chromium.launch({headless:true}); const ctx=await browser.newContext({viewport:{width:1366,height:820}});
const page=await ctx.newPage();
const report={mode:dry?"dry-run":"apply",batch,selected:0,total:0,changed:0,unchanged:0,failures:[],products:[],backups:[],preflightComplete:false};
try{
 await page.goto(origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=await page.locator("body").innerText(),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await field.count())throw Error("Unexpected login challenge");await field.fill(String(v))}
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("Admin login failed");
 const nonce=await page.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("No REST nonce");return(await r.text()).trim()});
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error("Bad REST nonce");
 const api=(path,method="GET",body)=>page.evaluate(async({path,method,body,nonce})=>{let r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});return{http:r.status,data:await r.json().catch(()=>null)}},{path,method,body,nonce});
 const response=await api("/wp-json/wp/v2/product?context=edit&status=publish&per_page=100&_fields=id,slug,title,excerpt,content,featured_media,product_cat");
 if(response.http!==200||!Array.isArray(response.data)||response.data.length<44)throw Error("Unexpected Product registry");
 const native=response.data.filter(p=>/-[0-9]{3,5}$/.test(String(p.slug||""))).sort((a,b)=>Number(a.slug.match(/-([0-9]{3,5})$/)[1])-Number(b.slug.match(/-([0-9]{3,5})$/)[1]));
 if(native.length!==44)throw Error("Native original products identity/count mismatch "+native.length);
 report.total=native.length;
 const selected=batch?native.slice((batch-1)*batchSize,batch*batchSize):native;
 if(!selected.length)throw Error("Batch outside Product set");
 report.selected=selected.length;
 const prepared=[];
 for(const p of selected){
  const raw=String(p.excerpt?.raw||"");
  const plain=await page.evaluate(html=>{const el=document.createElement("div");el.innerHTML=html.replace(/<br\s*\/?>/gi," ").replace(/<\/(?:p|div|li)>/gi," ");return el.textContent||""},raw);
  try{
   const plan=format(plain);
   const existingNormalized=raw.replace(/\s+/g," ").trim();
   const targetNormalized=plan.html.replace(/\s+/g," ").trim();
   const already=existingNormalized===targetNormalized;
   prepared.push({p,raw,plan,already});
   report.products.push({id:p.id,slug:p.slug,title:clean(p.title?.raw||p.title?.rendered),code:plan.code,componentLines:plan.parts.length,beforeChars:raw.length,afterChars:plan.html.length,already,preview:dry?plan.html.slice(0,650):undefined});
  }catch(e){report.failures.push({id:p.id,slug:p.slug,reason:String(e.message||e),excerpt:plain.slice(0,350)})}
 }
 console.log("PSE_PRODUCT_EXCERPT_PREFLIGHT="+JSON.stringify({mode:report.mode,batch,total:report.total,selected:report.selected,failures:report.failures,samples:report.products.slice(0,10)}).slice(0,19000));
 if(report.failures.length)throw Error("Unsafe WordPress excerpts; no writes in this batch");
 report.preflightComplete=true;
 if(dry){console.log("PSE_PRODUCT_EXCERPT_DRY_PASS="+JSON.stringify({native:native.length,verified:prepared.length,multiLine:prepared.filter(x=>x.plan.parts.length>1).length,unchanged:prepared.filter(x=>x.already).length,noWpWrites:true}));}
 else{
  report.backups=prepared.filter(x=>!x.already).map(({p,raw})=>({id:p.id,slug:p.slug,excerpt:raw}));
  for(const {p,plan,already} of prepared){
   if(already){report.unchanged++;continue}
   const update=await api("/wp-json/wp/v2/product/"+p.id,"POST",{excerpt:plan.html});
   if(update.http!==200)throw Error("Product excerpt save failed ID "+p.id+" HTTP "+update.http);
   const read=await api("/wp-json/wp/v2/product/"+p.id+"?context=edit&_fields=id,status,slug,excerpt,content,featured_media,product_cat");
   const actual=String(read.data?.excerpt?.raw||"");
   const plain=await page.evaluate(html=>{const el=document.createElement("div");el.innerHTML=html.replace(/<br\s*\/?>/gi," ").replace(/<\/(?:p|div|li)>/gi," ");return el.textContent||""},actual);
   const canonical=clean(plain);
   if(read.http!==200||read.data?.status!=="publish"||read.data.slug!==p.slug||canonical!==plan.source||
      Number(read.data.featured_media)!==Number(p.featured_media)||JSON.stringify(read.data.product_cat)!==JSON.stringify(p.product_cat)||
      String(read.data?.content?.raw||"")!==String(p.content?.raw||"")||!actual.includes("<strong>Thành phần:</strong>"))
      throw Error("Readback parity mismatch ID "+p.id);
   report.changed++;
   console.log("PSE_PRODUCT_EXCERPT_UPDATED="+JSON.stringify({id:p.id,slug:p.slug,lines:plan.parts.length+4,verified:true}));
  }
  console.log("PSE_PRODUCT_EXCERPT_BATCH_PASS="+JSON.stringify({batch,selected:prepared.length,changed:report.changed,unchanged:report.unchanged}));
 }
}finally{
 await mkdir("artifacts/pse-product-batch",{recursive:true});
 await writeFile("artifacts/pse-product-batch/product-excerpt-format.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
