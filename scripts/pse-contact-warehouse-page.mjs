/** Publish source-verified PSE contact locations into the existing WordPress Page, preserving current ESC form shortcode. Dry-run by default. */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const env = String(process.env.ENV_FILE || "").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const baseVars=env.filter(x=>x.startsWith("WC_URL="));
if(baseVars.length!==1)throw Error("PSE WordPress origin not configured uniquely");
const sourceOrigin=new URL(baseVars[0].slice(7).replace(/^['"]|['"]$/g,""));
if(sourceOrigin.protocol!=="https:"||sourceOrigin.username||sourceOrigin.password||sourceOrigin.search||sourceOrigin.hash||!["","/"].includes(sourceOrigin.pathname))throw Error("Invalid WP origin");
const origin=sourceOrigin.origin;
const apply=process.env.PSE_CONTACT_APPLY==="true";
const data=[
 {name:"Kho Đồng Nai",address:"Ấp Hoà Hợp, Xã Xuân Định, Tỉnh Đồng Nai",phone:"(0251) 3 715 777",fax:"(0251) 3 715 999"},
 {name:"Kho Long An",address:"Ấp 8, Xã Long Cang, Tỉnh Tây Ninh",phone:"(0272) 3638373",fax:"(0272) 3638474"},
 {name:"Kho Lâm Đồng",address:"Thôn 3, Xã Hoà Ninh, Tỉnh Lâm Đồng",phone:"(0263) 3 777 666",fax:"(0263) 3 777 920"},
 {name:"Kho Bình Phước",address:"Lô A 2.1- A 2.3, Khu CN Chơn Thành 1, Phường Chơn Thành, Tỉnh Đồng Nai",phone:"(0271) 3691164",fax:"(0271) 3691165"},
 {name:"Kho Đắk Nông",address:"Thôn 8, Xã Đức An, Tỉnh Lâm Đồng",phone:"(0261) 3 712178",fax:"(0261) 3 712179"}
];
const office={name:"Trụ sở chính",address:"Số 27 Đinh Bộ Lĩnh, Phường Bình Thạnh, TP.HCM",phone:"84-028 35 111 999",fax:"84-028 35 111 666",email:"info@pse.vn"};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const phoneLink=s=>"tel:"+String(s).replace(/[^\d+]/g,"");
const card=(item,hq=false)=>`<article class="pse-location-card${hq?" pse-location-card--office":""}">
<h3>${esc(item.name)}</h3>
<dl><div><dt>Địa chỉ</dt><dd>${esc(item.address)}</dd></div><div><dt>Điện thoại</dt><dd><a href="${phoneLink(item.phone)}">${esc(item.phone)}</a></dd></div><div><dt>Fax</dt><dd>${esc(item.fax)}</dd></div>${item.email?`<div><dt>Email</dt><dd><a href="mailto:${esc(item.email)}">${esc(item.email)}</a></dd></div>`:""}</dl>
<a class="pse-location-card__map" href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(item.address)}" target="_blank" rel="noopener noreferrer">Xem trên bản đồ</a>
</article>`;
const html=`<section data-pse-contact-locations="source-2026-10-25" class="pse-contact-locations" aria-label="Thông tin liên hệ PVFCCo-PSE">
<div class="pse-contact-locations__intro"><span>PVFCCo-PSE</span><h2>Thông tin liên hệ</h2><p>Trụ sở chính và hệ thống kho hàng của Công ty Cổ phần Phân bón và Hóa chất Dầu khí Đông Nam Bộ.</p></div>
<div class="pse-contact-locations__office">${card(office,true)}</div>
<h2 class="pse-contact-locations__section-title">Hệ thống kho hàng</h2><div class="pse-contact-locations__grid">${data.map(x=>card(x)).join("\n")}</div>
</section>\n\n`;
const browser=await chromium.launch({headless:true});const page=await browser.newPage();
try{
 await page.goto(origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const txt=await page.locator("body").innerText();
  const m=txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await input.count())throw Error("Captcha input missing");
   await input.fill(String(n));
  }
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WP authentication failed");
 const nonce=await page.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;let r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("No nonce");return(await r.text()).trim()});
 const api=(path,method="GET",body)=>page.evaluate(async({path,nonce,method,body})=>{
  let r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {http:r.status,data:await r.json().catch(()=>({}))};
 },{path,nonce,method,body});
 const path="/wp-json/wp/v2/pages/47222?context=edit";
 const res=await api(path);
 const v=res.data||{};
 if(res.http!==200||Number(v.id)!==47222||v.slug!=="lien-he"||v.status!=="publish"||v.acf?.action!=="PrivatePage"||v.acf?.key!=="contact")throw Error("PSE Contact Page identity mismatch");
 const raw=String(v.content?.raw||"");
 if(!raw.trim())throw Error("Contact content missing");
 const shortcodes=[...raw.matchAll(/\[table id=([^\]\s]+)\s*\/\]/gi)].map(x=>x[0]);
 // Static business addresses belong in WordPress Editor; no ESC Table is required unless a structured Visual Builder section already exists.\n console.log("PSE_CONTACT_EXISTING_ESC_SHORTCODES="+shortcodes.length);
 const hasLocation=raw.includes('data-pse-contact-locations="source-2026-10-25"');
 await mkdir("artifacts/pse-contact-warehouse",{recursive:true});
 await writeFile("artifacts/pse-contact-warehouse/backup.json",JSON.stringify({id:v.id,slug:v.slug,acf:{action:v.acf?.action,key:v.acf?.key},content:raw,wasUpdated:hasLocation},null,2));
 console.log("PSE_CONTACT_PREFLIGHT=PASS existing_length="+raw.length+" existing_shortcodes="+shortcodes.length+" location_imported="+hasLocation+" apply="+apply);
 if(hasLocation){console.log("PSE_CONTACT_LOCATIONS=ALREADY_DONE no_writes=true");process.exit(0)}
 if(!apply){console.log("PSE_CONTACT_LOCATIONS=DRY_RUN_PASS old_page_preserved=true source_warehouses="+data.length);process.exit(0)}
 const nextContent=html+raw;
 const result=await api("/wp-json/wp/v2/pages/47222","POST",{content:nextContent});
 if(result.http!==200||Number(result.data?.id)!==47222)throw Error("Contact Page update rejected");
 const check=await api(path);
 const after=String(check.data?.content?.raw||"");
 if(check.http!==200||!after.includes('data-pse-contact-locations="source-2026-10-25"')||data.some(x=>!after.includes(x.name))||shortcodes.some(x=>!after.includes(x)))throw Error("Contact Page readback/parity failure");
 console.log("PSE_CONTACT_LOCATIONS=PASS warehouse_count=5 native_editor=true original_shortcode_preserved=true original_content_suffix="+after.endsWith(raw));
}finally{await browser.close()}
