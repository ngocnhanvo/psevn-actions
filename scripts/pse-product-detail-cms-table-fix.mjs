/** Correct one verified legacy Product table's genuinely bad fixed dimensions in
 * native WordPress source, with exact slug/content guards and readback parity.
 * AUDIT is read-only. APPLY allowed only on exact approved owner task marker.
 */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const subject=String(event.head_commit?.message||"").split("\n")[0];
const dry=subject==="audit(pse): inspect native NPK Product fixed table";
const apply=subject==="cms(pse): correct genuine NPK Product fixed description table";
if(!dry&&!apply)throw Error("Unsupported PSE Product detail source task");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const rows=env.filter(x=>x.startsWith("WC_URL="));
if(rows.length!==1)throw Error("Missing verified PSE WordPress origin");
const u=new URL(rows[0].slice("WC_URL=".length).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Unsafe WordPress origin");
const origin=u.origin;
const slug="npk-phu-my-15-15-15-nhap-khau-1714";
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1366,height:900}});
const report={mode:dry?"audit":"apply",slug,verified:false,changed:false,beforeLength:0,afterLength:0,restoredText:true,backup:null};
try{
 if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("Missing WordPress admin credentials");
 await page.goto(origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
   await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
   await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
   const t=await page.locator("body").innerText(),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
   if(m){const a=+m[1],b=+m[3],answer=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
     const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
     if(!await f.count())throw Error("Unexpected login challenge");await f.fill(String(answer));
   }
   await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WordPress admin login failed");
 const nonce=await page.evaluate(async()=>{
   if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
   const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
   if(!r.ok)throw Error("Cannot obtain WP REST nonce");
   return(await r.text()).trim();
 });
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error("Invalid WP REST nonce");
 const api=(path,method="GET",body)=>page.evaluate(async({path,method,body,nonce})=>{
   const r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json","Cache-Control":"no-cache",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
   return{http:r.status,data:await r.json().catch(()=>null)};
 },{path,method,body,nonce});
 const found=await api("/wp-json/wp/v2/product?context=edit&status=publish&slug="+encodeURIComponent(slug)+"&_fields=id,slug,status,title,content,excerpt,featured_media,product_cat");
 if(found.http!==200||!Array.isArray(found.data)||found.data.length!==1)throw Error("Target WordPress Product not uniquely accessible");
 const p=found.data[0];
 if(p.slug!==slug||p.status!=="publish"||!Number.isSafeInteger(Number(p.id))||p.id<=0)throw Error("Unexpected native Product identity");
 const title=String(p.title?.raw||p.title?.rendered||"");
 if(!title.includes("NPK Phú Mỹ 15-15-15"))throw Error("Unexpected WordPress Product title");
 const original=String(p.content?.raw||"");
 if(!original.includes("Mã số")||!original.includes("00095")||!original.includes("Hàm lượng dinh dưỡng"))throw Error("Required native Product body data missing");
 report.beforeLength=original.length;
 const tables=[...original.matchAll(/<table\b[^>]*>/gi)];
 if(tables.length<1||tables.length>12)throw Error("Unexpected source table structure");
 const bad=tables.filter(t=>/\bwidth\s*:\s*909px\b/i.test(t[0])&&/\bheight\s*:\s*699px\b/i.test(t[0]));
 if(bad.length!==1)throw Error("Expected one WordPress legacy 909x699 table; got "+bad.length);
 const tag=bad[0][0];
 const m=tag.match(/\sstyle=(["'])(.*?)\1/i);
 if(!m)throw Error("Target table inline style missing");
 const cleaned=m[2].replace(/(?:^|;)\s*(?:width\s*:\s*909px|height\s*:\s*699px)\s*(?=;|$)/gi,"")
    .replace(/^;+\s*|\s*;+$/g,"").trim();
 const repairedTag=cleaned?tag.replace(m[0]," style="+m[1]+cleaned+m[1]):tag.replace(m[0],"");
 const changed=original.replace(tag,repairedTag);
 if(changed===original||changed.includes('width: 909px; height: 699px')||changed.length>=original.length)throw Error("Native table cleanup was not isolated");
 const textParity=await page.evaluate(([before,after])=>{
   const text=html=>{const el=document.createElement("div");el.innerHTML=html;return(el.textContent||"").replace(/\s+/g," ").trim()};
   return text(before)===text(after);
 },[original,changed]);
 if(!textParity)throw Error("Native Product body text parity check failed");
 report.backup={productId:p.id,slug,content:original};
 report.afterLength=changed.length;
 report.verified=true;
 console.log("PSE_PRODUCT_TABLE_PREFLIGHT="+JSON.stringify({mode:report.mode,id:p.id,slug,tableCount:tables.length,badTables:bad.length,before:original.length,after:changed.length,textParity:true,otherFieldsUntouched:true}));
 if(dry) {console.log("PSE_PRODUCT_TABLE_AUDIT=PASS; writes=0");}
 else {
   const saved=await api("/wp-json/wp/v2/product/"+p.id,"POST",{content:changed});
   if(saved.http!==200||saved.data?.id!==p.id)throw Error("WordPress Product content update rejected "+saved.http);
   const verify=await api("/wp-json/wp/v2/product/"+p.id+"?context=edit&_fields=id,slug,status,content,excerpt,featured_media,product_cat");
   if(verify.http!==200||verify.data?.id!==p.id||verify.data.slug!==slug||verify.data.status!=="publish"||
      Number(verify.data.featured_media)!==Number(p.featured_media)||
      JSON.stringify(verify.data.product_cat)!==JSON.stringify(p.product_cat)||
      String(verify.data.excerpt?.raw||"")!==String(p.excerpt?.raw||""))
     throw Error("Product fields changed unexpectedly: abort and inspect saved revision");
   const actual=String(verify.data?.content?.raw||"");
   const parity=await page.evaluate(([before,after])=>{
     const text=html=>{const el=document.createElement("div");el.innerHTML=html;return(el.textContent||"").replace(/\s+/g," ").trim()};
     return text(before)===text(after);
   },[original,actual]);
   if(!parity||/\bwidth\s*:\s*909px\b/i.test(actual)||/\bheight\s*:\s*699px\b/i.test(actual))
     throw Error("Product table saved but content parity/dimension readback failed: inspect WP revision before retry");
   report.changed=true;
   console.log("PSE_PRODUCT_TABLE_CMS=PASS; record="+p.id+"; content-only=true; text-parity=true; excerpt/categories/media-unchanged=true");
 }
}finally{
 await mkdir("artifacts/pse-product-detail",{recursive:true});
 await writeFile("artifacts/pse-product-detail/native-product-table.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
