/** Restore 14 PSE market Posts' source-authentic Joomla created/publish_up times, strictly one category.
 * Exact source: owner's 2026-11-27 uploaded compressed Joomla SQL sha256 ec8543...;
 * rows are pinned in docs/source/pse-market-joomla-created-2026-11-27.json.
 * 13 source-date corrections, 1 already correct. No new posts or content mutation.
 */
import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const manifest=JSON.parse(await readFile("docs/source/pse-market-joomla-created-2026-11-27.json","utf8"));
const marker=await readFile(".pse-market-joomla-date-apply-request","utf8");
const expectedMarker="SCOPE=JOOMLA_MARKET_CAT_93_TO_WORDPRESS_1743\nSOURCE_SHA256=ec85436b4e7a475b13c2955e8e0adcbbae11c87e8502669b3ae77e51f2bc4f2c\nAPPLY=OWNER_APPROVED\n";
if(marker!==expectedMarker||process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
process.env.PSE_MARKET_DB_BACKUP_VERIFIED!=="yes"||
manifest.schema!=="pse-market-joomla-created-date-v1"||
manifest.source?.sha256!=="ec85436b4e7a475b13c2955e8e0adcbbae11c87e8502669b3ae77e51f2bc4f2c"||
manifest.source?.sourceCatId!==93||manifest.target?.wordpressCategoryId!==1743||
manifest.records?.length!==14||
!manifest.records.every(r=>r.created===r.publishUp&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(r.created)))
  throw Error("PSE source manifest, owner authorization, backup or row count failed");

const baselines=new Map([
[369,[76976,"2013-06-14T08:12:14"]],
[360,[82280,"2013-05-03T00:00:00"]],
[352,[82282,"2013-03-25T00:00:00"]],
[351,[82275,"2013-03-25T00:00:00"]],
[347,[82288,"2013-03-18T00:00:00"]],
[346,[82284,"2013-03-18T00:00:00"]],
[345,[77885,"2013-03-14T00:00:00"]],
[343,[82286,"2013-03-14T00:00:00"]],
[342,[82278,"2013-03-13T00:00:00"]],
[341,[83542,"2013-03-13T09:42:44"]],
[218,[77402,"2011-09-07T00:00:00"]],
[217,[77395,"2011-09-07T00:00:00"]],
[215,[77379,"2011-08-29T00:00:00"]],
[110,[77067,"2011-06-27T23:55:16"]]
]);
if(baselines.size!==14||new Set(manifest.records.map(r=>r.joomlaId)).size!==14||
 manifest.records.some(r=>!baselines.has(r.joomlaId))||
 manifest.records.some((r,i)=>i&&r.created>=manifest.records[i-1].created))
 throw Error("PSE source date order or baseline identities changed");

const env=Object.fromEntries(String(process.env.ENV_FILE||"").split(/\r?\n/)
 .map(s=>s.trim().replace(/^export\s+/,"")).filter(s=>/^(WC_URL|WC_URL_CLIENT)=/.test(s))
 .map(s=>{const i=s.indexOf("=");return[s.slice(0,i),s.slice(i+1).trim().replace(/^['"]|['"]$/g,"")]}));
function trustedOrigin(raw){const u=new URL(raw);
 if(u.protocol!=="https:"||!u.hostname||u.port||u.username||u.password||u.search||u.hash||
 !["","/"].includes(u.pathname))throw Error("Untrusted PSE WordPress origin");
 return u.origin;}
const wp=trustedOrigin(env.WC_URL);
if(wp!=="https://admin-pse.webnvn.com"||trustedOrigin(env.WC_URL_CLIENT)!=="https://pse.webnvn.com"||
!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("Unexpected WordPress project or missing admin permissions");
const report={schema:"pse-market-joomla-created-applied-v1",sourceSha256:manifest.source.sha256,
  targetCategory:1743,expected:14,changed:[],already:[],failed:[],status:"UNVERIFIED"};
const browser=await chromium.launch({headless:true});
try{
 const ctx=await browser.newContext({viewport:{width:1280,height:850}});
 const page=await ctx.newPage();
 await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const text=(await page.locator("#loginform").innerText()).slice(0,700);
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){
   const a=Number(m[1]),b=Number(m[3]),ans=m[2]==="+"?a+b:m[2]==="-"?a-b:a*b;
   const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await input.count())throw Error("Captcha input missing");
   await input.fill(String(ans));
  }
  await page.locator("#wp-submit").click();
 }
 const editor=baselines.get(369)[0];
 await page.goto(wp+"/wp-admin/post.php?post="+editor+"&action=edit",
 {waitUntil:"domcontentloaded",timeout:60000});
 if(page.url().includes("wp-login")||!await page.locator("#adminmenu").count())throw Error("Authenticated WordPress Editor unavailable");

 // Source Joomla date strings are preserved in the site's configured local timezone.
 // Guard UTC+07 so date_gmt remains consistent with existing WordPress settings.
 await page.goto(wp+"/wp-admin/options-general.php",{waitUntil:"domcontentloaded",timeout:45000});
 if(!await page.locator("#adminmenu").count())throw Error("WordPress timezone settings inaccessible");
 const zone=await page.locator('select#timezone_string,select[name="timezone_string"]').first().inputValue();
 if(!["Asia/Ho_Chi_Minh","Asia/Saigon","Asia/Bangkok","Etc/GMT-7","UTC+7"].includes(zone))
  throw Error("Expected UTC+07 WordPress timezone setting, got: "+zone);
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const res=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!res.ok)throw Error("Cannot obtain authenticated WordPress REST nonce");
  return(await res.text()).trim();
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("Invalid REST nonce");
 const api=(url,method="GET",data)=>page.evaluate(async({url,method,data,nonce})=>{
  const response=await fetch(url,{method,credentials:"same-origin",
  headers:{"Accept":"application/json","X-WP-Nonce":nonce,...(data?{"Content-Type":"application/json"}:{})},
  ...(data?{body:JSON.stringify(data)}:{})});
  return{status:response.status,body:await response.json().catch(()=>null),
   total:Number(response.headers.get("x-wp-total")||0)};
 },{url,method,data,nonce});
 const fields="?context=edit&_fields=id,slug,status,date,date_gmt,title,content,excerpt,categories,tags,featured_media,acf";
 const endpoint=id=>"/wp-json/wp/v2/posts/"+id;
 const read=id=>api(endpoint(id)+fields);
 const keep=p=>JSON.stringify({id:p.id,slug:p.slug,status:p.status,title:p.title?.raw,
  content:p.content?.raw,excerpt:p.excerpt?.raw,categories:p.categories,tags:p.tags,
  featured_media:p.featured_media,acf:p.acf});
 const snapshots=[];
 // Preflight all 14 before the first write, fail-closed if even one row differs.
 for(const row of manifest.records){
  const [wpId,expectedOld]=baselines.get(row.joomlaId);
  const readback=await read(wpId),post=readback.body;
  const title=String(post?.title?.raw||post?.title?.rendered||"");
  if(readback.status!==200||post?.id!==wpId||post.slug!==row.slug||
  post.status!=="publish"||!post.categories?.includes(1743)||
  !title||!post.content?.raw||post.date!==row.created&&post.date!==expectedOld)
   throw Error("Published WP article changed since audit; no write Joomla "+row.joomlaId+
    " WP "+wpId+" date="+post?.date);
  snapshots.push({row,wpId,expectedOld,before:post,preserved:keep(post)});
 }
 console.log("PSE_MARKET_DATE_WRITER_PREFLIGHT=PASS; found=14; backup=yes; timezone="+zone+
  "; to_correct="+snapshots.filter(x=>x.before.date!==x.row.created).length);
 for(const s of snapshots){
  if(s.before.date===s.row.created){
   report.already.push({joomlaId:s.row.joomlaId,wpId:s.wpId,date:s.row.created});
   continue;
  }
  const result=await api(endpoint(s.wpId),"POST",{date:s.row.created});
  if(result.status!==200||result.body?.id!==s.wpId)
   throw Error("WordPress date write rejected for Joomla "+s.row.joomlaId+" HTTP "+result.status);
  const after=await read(s.wpId);
  if(after.status!==200||after.body?.date!==s.row.created||
      keep(after.body)!==s.preserved)
   throw Error("WordPress date readback or content/metadata integrity FAIL for Joomla "+s.row.joomlaId);
  report.changed.push({joomlaId:s.row.joomlaId,wpId:s.wpId,before:s.before.date,after:after.body.date});
  console.log("PSE_MARKET_JOOMLA_DATE_POST=PASS; joomla="+s.row.joomlaId+
   "; wp="+s.wpId+"; old="+s.before.date+"; new="+after.body.date+"; body_unchanged=true");
 }
 const expected=manifest.records.map(r=>r.slug);
 const list=await api("/wp-json/wp/v2/posts?categories=1743&status=publish&orderby=date&order=desc&per_page=100&page=1&_fields=id,slug,date,categories");
 if(list.status!==200||list.total!==14||list.body?.length!==14||
 JSON.stringify(list.body.map(p=>p.slug))!==JSON.stringify(expected)||
 list.body.some((p,i)=>p.date!==manifest.records[i].created))
  throw Error("Original full 14 Joomla date order not reflected in WP public REST");
 report.status="PASS";
 console.log("PSE_MARKET_JOOMLA_CREATED_DATES=PASS; changed="+report.changed.length+
 "; already="+report.already.length+"; WP_RANK=14/14; TOP5="+expected.slice(0,5).join(",")+
 "; other_contents_unchanged=true");
} catch(error){
 report.status="FAIL";
 report.failed.push(String(error).slice(0,600));
 console.error("PSE_MARKET_JOOMLA_CREATED_DATES_FAIL="+String(error).slice(0,600));
 process.exitCode=1;
}finally{
 await mkdir("artifacts/pse-market-joomla-date",{recursive:true});
 await writeFile("artifacts/pse-market-joomla-date/report.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
if(report.status!=="PASS")process.exitCode=1;
