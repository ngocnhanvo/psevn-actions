/** Read-only WordPress admin uploader constraints (no data modifications). */
import {chromium} from "playwright";
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const a=env.filter(x=>x.startsWith("WC_URL="));
if(a.length!==1)throw Error("Missing WC_URL");
const url=new URL(a[0].slice(7).replace(/^['"]|['"]$/g,""));
if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||!["","/"].includes(url.pathname))throw Error("Invalid WP origin");
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 await page.goto(url.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const text=(await page.locator("#loginform").innerText()).slice(0,500);
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){
   const x=+m[1],y=+m[3],v=m[2]==="+"?x+y:m[2]==="-"?x-y:x*y;
   const control=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(await control.count())await control.fill(String(v));
  }
  await page.locator("#wp-submit").click();
 }
 await page.goto(url.origin+"/wp-admin/media-new.php",{waitUntil:"domcontentloaded",timeout:60000});
 if(page.url().includes("wp-login")||!(await page.locator("#adminmenu").count()))throw Error("WP admin uploader login not available");
 const data=await page.evaluate(()=>{
  const body=document.body?.innerText||"";
  const matches=[...body.matchAll(/(?:Maximum upload file size|Giới hạn dung lượng tải lên|Dung lượng tối đa)[^.\n]{0,100}/gi)].map(x=>x[0]).slice(0,10);
  const globals=window._wpPluploadSettings||window.wp?.Uploader?.defaults||{};
  const hints=[...document.querySelectorAll(".max-upload-size,#upload-ui,.upload-flash-bypass,.upload-html-bypass")].map(x=>String(x.textContent||"").replace(/\s+/g," ").trim()).filter(Boolean).slice(0,10);
  return{title:document.title,matches,hints,uploaderSettings:JSON.stringify(globals).slice(0,2300)};
 });
 console.log("PSE_WP_UPLOAD_LIMIT="+JSON.stringify(data));
}finally{await browser.close()}
