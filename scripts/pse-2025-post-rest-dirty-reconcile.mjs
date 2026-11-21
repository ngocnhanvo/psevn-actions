/** Write-only source revision signal for two already-verified published 2025 Joomla Posts.
 * No content/date/category/media changes; no direct build dispatch. Run after PHP
 * mu-plugin REST write hook has been SHA-verified live via scoped FTPS.
 */
import {chromium} from "playwright";
const env=Object.fromEntries(String(process.env.ENV_FILE||"").split(/\r?\n/)
 .filter(x=>/^(?:export\s+)?(WC_URL|WC_URL_CLIENT)=/.test(x.trim()))
 .map(line=>{const v=line.trim().replace(/^export\s+/,"");const n=v.indexOf("=");return[v.slice(0,n),v.slice(n+1).trim().replace(/^['"]|['"]$/g,"")]}));
const origin=value=>{const u=new URL(value);if(u.protocol!=="https:"||u.username||u.password||u.port||
 !["","/"].includes(u.pathname)||u.search||u.hash)throw Error("Invalid configured HTTPS PSE origin");return u.origin};
const wp=origin(env.WC_URL),front=origin(env.WC_URL_CLIENT);
if(wp===front||process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")
 throw Error("Untrusted WordPress/tenant configuration");
const expected=[
 {id:82840,source:1651,day:"2025-08-18",images:2,title:"Ứng dụng “Phú Mỹ”: Gia tăng tương tác và trải nghiệm cho bà con nông dân"},
 {id:82846,source:1641,day:"2025-05-14",images:3,title:"“Miền Đông khúc ca tự hào” - Từ bản hùng ca lịch sử đến khát vọng phát triển tương lai"}
];
const browser=await chromium.launch({headless:true});
try{
 const ctx=await browser.newContext({viewport:{width:1280,height:860}});
 const page=await ctx.newPage();
 let resp=await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:50000});
 if(!resp||resp.status()>=500)throw Error("PSE WP admin unavailable");
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const form=await page.locator("#loginform").innerText();
  const math=form.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(math){
   const a=Number(math[1]),b=Number(math[3]);
   const answer=math[2]==="+"?a+b:math[2]==="-"?a-b:a*b;
   const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(await input.count())await input.fill(String(answer));
  }
  await page.locator("#wp-submit").click();
 }
 await page.goto(wp+"/wp-admin/post.php?post=82840&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 if(page.url().includes("wp-login")||!(await page.locator("#adminmenu").count()))throw Error("Authenticated WP protected admin verification failed");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("No WordPress REST nonce");
  return(await r.text()).trim();
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("No valid authenticated REST nonce");
 const api=async(path,method="GET",data)=>await page.evaluate(async({path,method,data,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{"Accept":"application/json","X-WP-Nonce":nonce,
    ...(data?{"Content-Type":"application/json"}:{})},...(data?{body:JSON.stringify(data)}:{})});
  return{status:r.status,data:await r.json().catch(()=>null)};
 },{path,method,data,nonce});
 const snapshot=x=>JSON.stringify({
  id:x.id,status:x.status,date:x.date,slug:x.slug,categories:x.categories,
  title:x.title?.raw,content:x.content?.raw,excerpt:x.excerpt?.raw
 });
 const read=async(id)=>await api("/wp-json/wp/v2/posts/"+id+"?context=edit&_fields=id,status,date,slug,categories,title,content,excerpt");
 const rows=[];
 for(const x of expected){
  const before=await read(x.id),p=before.data;
  const html=String(p?.content?.raw||"");
  if(before.status!==200||p?.id!==x.id||p?.status!=="publish"||
    !String(p.date||"").startsWith(x.day)||!p.categories?.length||
    !String(p.title?.raw||"").includes(x.title.slice(0,10))||
    (html.match(/<img\b/ig)||[]).length<x.images)
   throw Error("Prior independent Joomla source/Post proof drifted #"+x.source);
  const preserved=snapshot(p);
  // WordPress core save_post must enqueue one revision via github-trigger.
  // A minimal re-save does not modify the original published body or date.
  const save=await api("/wp-json/wp/v2/posts/"+x.id,"POST",{status:"publish"});
  if(save.status!==200||save.data?.id!==x.id||save.data.status!=="publish")
   throw Error("Native WordPress REST re-save rejected #"+x.source);
  const after=await read(x.id);
  if(after.status!==200||snapshot(after.data)!==preserved)
   throw Error("REST re-save changed source article canonical fields #"+x.source);
  rows.push({source:x.source,wpId:x.id,day:x.day,imageCount:(html.match(/<img\b/ig)||[]).length,unchanged:true});
  console.log("PSE_2025_POST_DIRTY_REVISION=PASS; source="+x.source+"; wp_id="+x.id+"; post_body_date_media_unchanged=true");
 }
 const build=await page.goto(wp+"/wp-admin/admin.php?page=vcs-build-trigger",{waitUntil:"domcontentloaded",timeout:50000});
 const countText=await page.locator("#vcs-pending-count").first().textContent();
 const pending=Number(String(countText||"").replace(/[^0-9]/g,""));
 if(build?.status()!==200||!Number.isSafeInteger(pending)||pending<2)
  throw Error("WordPress build pending revision count did not include both imported Posts: "+countText);
 console.log("PSE_2025_POSTS_BUILD_REVISION_SUMMARY="+JSON.stringify({status:"PASS",posts:rows,
  pending,phpMuPluginRelease:44853005827,noContentMutation:true,buildNotDispatched:true}));
 await ctx.close();
}finally{await browser.close()}