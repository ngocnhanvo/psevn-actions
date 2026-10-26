/** Populate only the missing PSE WordPress Info BCT image from the existing PSE-owned source asset. No Astro build. */
import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const lines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,"")).filter(s=>s.startsWith("WC_URL="));
if(lines.length!==1)throw Error("WordPress origin missing or ambiguous");
const u=new URL(lines[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid WordPress origin");
const file="pse-source/public/home-first/banner/dathongbaoBoCongThuong.png";
const bytes=await readFile(file);
if(bytes.length<1000||bytes.length>2000000||bytes.subarray(0,8).toString("hex")!=="89504e470d0a1a0a")throw Error("Existing PSE badge source is not a valid sized PNG");
const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
if(width<80||height<40||width>4000||height>4000)throw Error("Invalid BCT source image dimensions");
console.log("PSE_BCT_SOURCE=VERIFIED; bytes="+bytes.length+"; dimensions="+width+"x"+height+"; sha256="+createHash("sha256").update(bytes).digest("hex"));
if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("WordPress credentials absent");
const browser=await chromium.launch({headless:true});
const p=await browser.newPage();
try{
 await p.goto(u.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await p.locator("#user_login").count()){
  await p.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await p.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const text=await p.locator("body").innerText(),m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],val=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const f=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("Login challenge without control");await f.fill(String(val))}
  await p.locator("#wp-submit").click({noWaitAfter:true,timeout:25000});
  await p.waitForFunction(()=>location.pathname.startsWith("/wp-admin")&&!document.querySelector("#loginform"),null,{timeout:45000});
 }
 if(p.url().includes("wp-login"))throw Error("WordPress auth failed");
 const nonce=await p.evaluate(async()=>{
  const n=window.wpApiSettings?.nonce;
  if(n)return n;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("Cannot obtain native WP nonce");
  return (await r.text()).trim();
 });
 const call=({path,method="GET",data})=>p.evaluate(async({path,method,data,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",cache:"no-store",headers:{"X-WP-Nonce":nonce,"Accept":"application/json",...(data?{"Content-Type":"application/json"}:{})},...(data?{body:JSON.stringify(data)}:{})});
  return {http:r.status,data:await r.json().catch(()=>({}))}
 },{path,method,data,nonce});
 const infoPath="/wp-json/wp/v2/thong-tin-chung/62?context=edit&_fields=id,status,acf";
 const old=await call({path:infoPath});
 if(old.http!==200||old.data?.id!==62||old.data?.status!=="publish"||!old.data?.acf||!("bocongthuong" in old.data.acf))throw Error("Cannot verify existing PSE corporate ACF image field");
 const cur=old.data.acf.bocongthuong;
 if(cur&&((typeof cur==="object"&&cur.url)||(typeof cur==="number"&&cur>0)||(typeof cur==="string"&&cur.trim()))) {
  console.log("PSE_BCT_ACF=ALREADY_POPULATED; existing source untouched; no_build=true");
  process.exit(0);
 }
 await mkdir("artifacts/pse-footer-bct",{recursive:true});
 await writeFile("artifacts/pse-footer-bct/wp-info-before.json",JSON.stringify({id:old.data.id,bct:cur,bctLink:old.data.acf.link_bocongthuong||""},null,2)+"\n");
 const query=await call({path:"/wp-json/wp/v2/media?context=edit&search=pse-footer-bct-notified&per_page=50"});
 if(query.http!==200||!Array.isArray(query.data))throw Error("Cannot inspect PSE WP media before writing");
 let media=query.data.filter(x=>x.slug==="pse-footer-bct-notified");
 if(media.length>1)throw Error("Duplicate BCT native media records");
 let id=media[0]?.id;
 const alt="Biểu trưng Đã thông báo Bộ Công Thương";
 if(!id){
  const created=await p.evaluate(async({encoded,nonce,alt})=>{
   const binary=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
   const r=await fetch("/wp-json/wp/v2/media",{method:"POST",credentials:"same-origin",headers:{"X-WP-Nonce":nonce,"Content-Disposition":'attachment; filename="pse-footer-bct-notified.png"',"Content-Type":"image/png"},body:binary});
   const json=await r.json().catch(()=>({}));
   return {http:r.status,id:json.id,error:r.ok?"":String(json.message||"").slice(0,150)};
  },{encoded:bytes.toString("base64"),nonce,alt});
  if(created.http!==201||!created.id)throw Error("Native WordPress BCT media upload failed: "+JSON.stringify(created));
  id=created.id;
  console.log("PSE_BCT_MEDIA=UPLOADED; id="+id);
 }
 const updatedMedia=await call({path:"/wp-json/wp/v2/media/"+id,method:"POST",data:{alt_text:alt,title:"Đã thông báo Bộ Công Thương — PSE"}});
 if(updatedMedia.http!==200||updatedMedia.data?.id!==id)throw Error("Could not save BCT media metadata");
 const verifyMedia=await call({path:"/wp-json/wp/v2/media/"+id+"?context=edit"});
 if(verifyMedia.http!==200||verifyMedia.data?.alt_text!==alt||!String(verifyMedia.data?.mime_type||"").includes("png"))throw Error("BCT Media read-after-write failed");
 const beforeAssign=await call({path:infoPath});
 if(beforeAssign.http!==200||beforeAssign.data.acf?.bocongthuong)throw Error("ACF BCT changed concurrently, refusing to overwrite");
 const update=await call({path:"/wp-json/wp/v2/thong-tin-chung/62",method:"POST",data:{acf:{bocongthuong:id}}});
 if(update.http!==200||update.data?.id!==62)throw Error("ACF native BCT field update failed: HTTP "+update.http+" "+String(update.data?.message||"").slice(0,130));
 const saved=await call({path:infoPath});
 const v=saved.data?.acf?.bocongthuong;
 if(saved.http!==200||!v||(typeof v==="object"&&!(v.url||v.ID||v.id)))throw Error("WordPress ACF BCT field not saved as a usable image value: "+JSON.stringify({http:saved.http,type:typeof v,id:v?.id||v?.ID||v}).slice(0,140));
 if(saved.data?.acf?.link_bocongthuong!==(old.data.acf.link_bocongthuong||""))throw Error("BCT external verification link unexpectedly changed");
 console.log("PSE_BCT_ACF=PASS; corporate_info_id=62; media_id="+id+"; rest_shape="+(typeof v)+"; bct_link_preserved=true; no_build=true");
}finally{await browser.close()}
