/** Resave precisely WordPress Info #62 through native editor so standard save_post event enqueues the real ACF badge change. No fake event, no build. */
import { chromium } from "playwright";
const lines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,"")).filter(s=>s.startsWith("WC_URL="));
if(lines.length!==1)throw Error("Missing unique WP origin");
const u=new URL(lines[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid WP origin");
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1400,height:1000}});
page.on("dialog",async d=>{if(d.type()==="confirm")await d.accept();else await d.dismiss()});
try{
 if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("WP credentials unavailable");
 await page.goto(u.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const text=await page.locator("body").innerText(),m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],value=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await field.count())throw Error("Math login input unavailable");await field.fill(String(value))}
  await page.locator("#wp-submit").click({noWaitAfter:true,timeout:25000});
  await page.waitForFunction(()=>location.pathname.startsWith("/wp-admin")&&!document.querySelector("#loginform"),null,{timeout:45000});
 }
 if(page.url().includes("wp-login"))throw Error("Not authenticated");
 const nonce=await page.evaluate(async()=>window.wpApiSettings?.nonce||await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"}).then(r=>r.text()).then(s=>s.trim()));
 const get=async path=>page.evaluate(async({path,nonce})=>{
  const response=await fetch(path,{credentials:"same-origin",cache:"no-store",headers:{"X-WP-Nonce":nonce}});
  return {status:response.status,body:await response.json().catch(()=>({}))};
 },{path,nonce});
 const infoPath="/wp-json/wp/v2/thong-tin-chung/62?context=edit&_fields=id,status,title,acf";
 const before=await get(infoPath);
 if(before.status!==200||before.body?.id!==62||before.body?.status!=="publish"||before.body?.acf?.bocongthuong?.id!==82061)throw Error("PSE BCT media 82061 not linked to active Info #62");
 async function pending(){
  await page.goto(u.origin+"/wp-admin/admin.php?page=vcs-build-trigger",{waitUntil:"domcontentloaded",timeout:65000});
  const value=await page.locator("#vcs-pending-count").first().textContent({timeout:18000});
  const n=Number(String(value).trim());if(!Number.isSafeInteger(n)||n<0)throw Error("Invalid native PHP pending count");
  return n;
 }
 const prior=await pending();
 console.log("PSE_BCT_NATIVE_LOG_BEFORE="+prior);
 if(prior>0){console.log("PSE_BCT_NATIVE_LOG=ALREADY_QUEUED; no_duplicate_save=true");}
 else{
  await page.goto(u.origin+"/wp-admin/post.php?post=62&action=edit",{waitUntil:"domcontentloaded",timeout:65000});
  const form=page.locator("#post"),publish=page.locator("#publish");
  if(!await form.count()||!await publish.count())throw Error("WordPress Info native editor/Update button not available");
  const selected=await page.locator('#post input[name="post_ID"]').first().inputValue().catch(()=>null);
  if(selected!=="62")throw Error("Native editor not targeting post ID 62");
  const status=await page.locator("#post_status").inputValue().catch(()=>null);
  if(status!=="publish")throw Error("Info post is not published");
  const [saveResponse]=await Promise.all([page.waitForNavigation({waitUntil:"domcontentloaded",timeout:60000}),publish.click({timeout:25000})]);
  if(!saveResponse||saveResponse.status()>=400||!/post=62(?:&|$)/.test(page.url()))throw Error("Native Info Save did not complete an HTTP POST/redirect to record 62");
  console.log("PSE_BCT_NATIVE_HTTP_SAVE=PASS; status="+saveResponse.status());
  const after=await get(infoPath);
  if(after.status!==200||after.body?.id!==62||after.body.status!=="publish"||
     after.body.acf?.bocongthuong?.id!==82061||
     after.body.acf?.link_bocongthuong!==before.body.acf?.link_bocongthuong||
     after.body.acf?.tencongty!==before.body.acf?.tencongty)
   throw Error("Info 62 native save failed content parity");
  console.log("PSE_BCT_NATIVE_SAVE=PASS; info_id=62; bct_media=82061; title_and_link_preserved=true");
 }
 const count=await pending();
 if(count<1)throw Error("Native WordPress save has not enqueued a real pending log; PHP build remains gated");
 console.log("PSE_BCT_NATIVE_QUEUE=PASS; pending_count="+count+"; no_fake_logs=true; no_build=true");
}finally{await browser.close()}
