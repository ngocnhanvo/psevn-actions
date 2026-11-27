/** Owner-authorized PSE disclosure #1742 publication date; historical title day stays 2026-08-13.
 * Source archive sorts 2026.11.12 before 2026.08.13. Requires fresh DB backup
 * in the calling workflow; checks original source, WP identity, and readback.
 */
import {chromium} from "playwright";
const SOURCE="https://www.pse.vn/quan-he-nha-dau-tu/tin-tuc-co-dong/ban-cong-bo-thong-tin.html";
const EXPECTED_DATE="2026-11-17T12:00:00"; // Owner-approved publication date; retain 2026.08.13 in historical disclosure title
const POST_ID=82508, CATEGORY_ID=1753;
const EXPECTED_SLUG="20260813-cbtt-bao-cao-tai-chinh-ban-nien-2026";
const entries=String(process.env.ENV_FILE||"").split(/\r?\n/).map(v=>v.trim().replace(/^export\s+/,"")).filter(x=>x.startsWith("WC_URL="));
if(entries.length!==1)throw Error("Exactly one WordPress origin required");
const u=new URL(entries[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid WP origin");
const wp=u.origin;
const browser=await chromium.launch({headless:true});
try {
 const ctx=await browser.newContext({viewport:{width:1280,height:820}});
 const source=await ctx.newPage();
 const res=await source.goto(SOURCE,{waitUntil:"domcontentloaded",timeout:45000});
 if(res?.status()!==200)throw Error("Source archive unavailable");
 const proof=await source.evaluate(()=>{
  const root=document.querySelector(".blog"); if(!root)return null;
  const links=[...root.querySelectorAll('a[href]')].map(a=>a.href);
  return {older:links.findIndex(x=>x.includes("/1742-20260813-")),newer:links.findIndex(x=>x.includes("/1740-20261112-"))};
 });
 if(!proof||proof.older<0||proof.newer<0||proof.newer>=proof.older)
  throw Error("Source date order changed; refuse publication-date mutation "+JSON.stringify(proof));
 const page=await ctx.newPage();
 await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("Missing WP login");
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const t=(await page.locator("#loginform").innerText()).slice(0,500);
  const match=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(match){
   const a=+match[1],b=+match[3],answer=match[2]==="+"?a+b:match[2]==="-"?a-b:a*b;
   const captcha=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(await captcha.count())await captcha.fill(String(answer));
  }
  await page.locator("#wp-submit").click();
 }
 await page.goto(wp+"/wp-admin/post.php?post="+POST_ID+"&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 if(page.url().includes("wp-login")||!await page.locator("#adminmenu").count())throw Error("WP authenticated admin unavailable");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const res=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!res.ok)throw Error("No WP REST nonce");
  return(await res.text()).trim();
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("WP REST nonce invalid");
 const api=(path,method="GET",body)=>page.evaluate(async({path,nonce,method,body})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return{http:r.status,data:await r.json().catch(()=>null)};
 },{path,nonce,method,body});
 const path="/wp-json/wp/v2/posts/"+POST_ID;
 const fields="?context=edit&_fields=id,slug,status,title,content,categories,date";
 const before=await api(path+fields);
 const p=before.data;
 if(before.http!==200||p?.id!==POST_ID||p.slug!==EXPECTED_SLUG||
    p.status!=="publish"||!p.categories?.includes(CATEGORY_ID)||
    !String(p.title?.raw||p.title?.rendered||"").includes("2026.08.13"))
  throw Error("Original disclosure post identity changed; refusing write");
 if(String(p.date||"").startsWith("2026-11-17")){
  console.log("PSE_DISCLOSURE_DATE=ALREADY_CORRECT; wp_id="+POST_ID+"; date="+p.date);
 }else{
  if(!/^2026-08-13T/.test(p.date||""))
   throw Error("Unexpected current WP publication date: "+p.date);
  const updated=await api(path,"POST",{date:EXPECTED_DATE});
  if(updated.http!==200||updated.data?.id!==POST_ID)
   throw Error("Date update refused HTTP "+updated.http);
  const after=await api(path+fields);
  if(after.http!==200||after.data?.id!==POST_ID||
      !String(after.data.date||"").startsWith("2026-11-17")||
      after.data.content?.raw!==p.content?.raw||
      after.data.slug!==p.slug||after.data.status!=="publish"||
      JSON.stringify(after.data.categories)!==JSON.stringify(p.categories))
   throw Error("Date readback/content preservation check failed");
  console.log("PSE_DISCLOSURE_DATE=PASS; wp_id="+POST_ID+"; owner_publication_day=2026-11-17; before="+p.date+"; after="+after.data.date+"; content_unchanged=true");
 }
 const frontend=await ctx.newPage();
 const target="https://pse.webnvn.com/tin-tuc-su-kien/ban-cong-bo-thong-tin";
 try{
  const r=await frontend.goto(target,{waitUntil:"domcontentloaded",timeout:45000});
  const t=await frontend.locator("body").innerText();
  const n=t.indexOf("2026.11.12: CBTT"),o=t.indexOf("2026.08.13: CBTT");
  console.log("PSE_DISCLOSURE_DATE_FRONTEND="+JSON.stringify({http:r?.status(),newerIndex:n,olderIndex:o,correct:n>=0&&o>=0&&n<o,cacheMayDelay:true}));
 }catch(e){console.log("PSE_DISCLOSURE_DATE_FRONTEND_PENDING="+String(e).slice(0,180))}
}finally{await browser.close()}
