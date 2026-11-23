/** NPK WP Page 83593: replace one broken external thumbnail URL, keep original image hosted by dpm.vn. */
import {chromium} from "playwright";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";

const ev=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const apply=ev.head_commit?.message==="cms(pse): restore NPK external photo"&&process.env.PSE_NPK_PHOTO_PREVIEW_ONLY!=="true";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
   process.env.GITHUB_REF!=="refs/heads/main")throw Error("Unexpected GitHub context");
if(apply&&process.env.PSE_NPK_PHOTO_FRESH_BACKUP!=="true")throw Error("Fresh WordPress DB backup required");
function origin(key){
  const arr=String(process.env.ENV_FILE||"").split(/\r?\n/)
    .map(s=>s.trim().replace(/^export\s+/,"")).filter(s=>s.startsWith(key+"="));
  if(arr.length!==1)throw Error("Missing unique "+key);
  const u=new URL(arr[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
  if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid origin "+key);
  return u.origin;
}
const wp=origin("WC_URL"),front=origin("WC_URL_CLIENT");
if(wp!=="https://admin-pse.webnvn.com"||front!=="https://pse.webnvn.com")
  throw Error("Wrong PSE environment");
const newImage="https://dpm.vn/static/upload/users/dpm.vn/2021/SP%20Phan%20bon%20luu%20hanh/02.png";
const oldRegex=/https:\/\/dpm\.vn\/_thumbs\/w270-h372-q80-b0-f0-v2019\.12\.30\.1-eorig-wt0\/static\/upload\/users\/dpm\.vn\/2021\/SP%20Phan%20bon%20luu%20hanh\/02\.png(?:\?v=v1\.0r1(?:&amp;|&)t=1fdfc29b)?/g;
const h=s=>createHash("sha256").update(String(s||"")).digest("hex");
const dir="artifacts/pse-npk-external-photo";
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
try{
  // Independently verified source on the host of the ORIGINAL product photo.
  const imageResp=await page.request.get(newImage,{timeout:30000,maxRedirects:3});
  const mime=imageResp.headers()["content-type"]||"";
  const bytes=await imageResp.body();
  if(imageResp.status()!==200||!mime.startsWith("image/png")||bytes.length<100000)
    throw Error("Original dpm.vn image not available");
  console.log("PSE_NPK_PHOTO_ORIGINAL=PASS http=200 type=image/png bytes="+bytes.length+
              " sha256="+h(bytes).slice(0,16));

  if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)
    throw Error("Missing WordPress credentials");
  await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
  if(await page.locator("#user_login").count()){
    await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
    await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
    const txt=await page.locator("body").innerText();
    const m=txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||
      txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if(m){
      const a=+m[1],b=+m[3],ans=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
      const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if(!await f.count())throw Error("Unknown login challenge");
      await f.fill(String(ans));
    }
    await page.locator("#wp-submit").click();
  }
  if(page.url().includes("wp-login"))throw Error("WordPress login failed");
  const nonce=await page.evaluate(async()=>{
    if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
    const response=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
    if(!response.ok)throw Error("REST nonce unavailable");
    return(await response.text()).trim();
  });
  if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("Invalid nonce");
  const get=async()=>page.evaluate(async nonce=>{
    const r=await fetch("/wp-json/wp/v2/pages/83593?context=edit&_fields=id,slug,status,acf,content,modified",{
      credentials:"same-origin",cache:"no-store",headers:{"X-WP-Nonce":nonce}});
    return {http:r.status,page:await r.json().catch(()=>null)};
  },nonce);
  const prev=await get(),p=prev.page||{},raw=String(p.content?.raw||"");
  if(prev.http!==200||p.id!==83593||p.slug!=="npk-phu-my"||p.status!=="publish"||
     p.acf?.action!=="PublicPage"||p.acf?.key!=="pse-historical-npk-1434"||
     !String(p.acf.cssmore||"").includes("/* WordPress Page 83593"))
    throw Error("Wrong Page or CSS must be saved first");
  const match=[...raw.matchAll(oldRegex)];
  if(match.length!==1||raw.includes(newImage))throw Error("Unexpected external image URL count or already migrated");
  const content=raw.replace(oldRegex,newImage);
  const before=await page.evaluate(html=>{
    const root=document.createElement("div");root.innerHTML=html;
    const tables=[...root.querySelectorAll("table")];
    return {rows:tables.map(t=>t.rows.length),imgs:root.querySelectorAll("img").length};
  },raw);
  const after=await page.evaluate(html=>{
    const root=document.createElement("div");root.innerHTML=html;
    const tables=[...root.querySelectorAll("table")];
    return {rows:tables.map(t=>t.rows.length),imgs:root.querySelectorAll("img").length,
      imageFifthSrc:[...root.querySelectorAll("img")][4]?.getAttribute("src")};
  },content);
  if(before.rows.join(",")!=="20,4,4"||before.imgs!==20||
     before.imgs!==after.imgs||before.rows.join(",")!==after.rows.join(",")||
     !(after.imageFifthSrc===newImage||
       [...content.matchAll(/srcset="[^"]*02\.png/gi)].length===1))
    throw Error("Product image ordinal or content structure changed");
  const oldHash=h(raw),cssHash=h(p.acf.cssmore);
  await writeFile(dir+"/rollback.json",JSON.stringify({
    page:83593,modified:p.modified,originalContentSha256:oldHash,
    originalContent:raw,cssmoreSha256:cssHash,newContentSha256:h(content),
    externalImageSha256:h(bytes)},null,2)+"\n");
  console.log("PSE_NPK_PHOTO_PREFLIGHT="+JSON.stringify({
    page:p.id,oldUrlCount:match.length,images:after.imgs,tables:after.rows,
    originalImageBytes:bytes.length,cssmoreChars:p.acf.cssmore.length,
    oldHash:oldHash.slice(0,16),newHash:h(content).slice(0,16),apply}));

  if(apply){
    const refreshed=await get();
    if(refreshed.http!==200||refreshed.page.modified!==p.modified||
       h(refreshed.page.content?.raw)!==oldHash||h(refreshed.page.acf?.cssmore)!==cssHash)
      throw Error("Concurrent WordPress edit; refuse image update");
    const saved=await page.evaluate(async({nonce,content})=>{
      const r=await fetch("/wp-json/wp/v2/pages/83593",{
        method:"POST",credentials:"same-origin",
        headers:{"X-WP-Nonce":nonce,"Content-Type":"application/json"},
        body:JSON.stringify({content})});
      const j=await r.json().catch(()=>null);
      return {http:r.status,id:j?.id,code:j?.code};
    },{nonce,content});
    if(saved.http!==200||saved.id!==83593)
      throw Error("WordPress image URL save failed "+saved.http+" "+saved.code);
    const verify=await get();
    if(verify.http!==200||verify.page?.id!==83593||
       h(verify.page.content?.raw)!==h(content)||
       h(verify.page.acf?.cssmore)!==cssHash||
       verify.page.acf?.action!==p.acf.action||
       verify.page.acf?.key!==p.acf.key||
       verify.page.slug!==p.slug||verify.page.status!==p.status)
      throw Error("WordPress image URL readback mismatch");
    console.log("PSE_NPK_PHOTO_SAVED=PASS page=83593 content_one_url_changed=true cssmore_untouched=true");
  }
  console.log("PSE_NPK_PHOTO_QA=PASS write="+apply+" originals_preserved=true");
}finally{await browser.close();}
