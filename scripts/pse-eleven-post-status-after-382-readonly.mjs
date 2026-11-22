/** Read-only proof for all 11 recovered owner Joomla SQL article identities after #382 release.
 * WP native GET-only, no save/delete/publish, no external media substitution.
 */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const repo=process.env.GITHUB_REPOSITORY;
if(repo!=="ngocnhanvo/psevn-actions")throw Error("Wrong repository");
const doc=JSON.parse(await readFile("docs/source/pse-original-public-articles-11-2026-11-22.json","utf8"));
const ids=[114,121,127,178,186,196,202,237,341,382,1090];
const targets=[83534,83535,83536,83537,83538,83539,83540,83541,83542,83543,83544];
if(doc.schema!=="pse-original-joomla-selected-public-articles-v1"||
 JSON.stringify(doc.source_ids)!==JSON.stringify(ids)||doc.entries?.length!==11)
 throw Error("Original Joomla public-only source fixture changed");
const records=new Map(doc.entries.map(r=>[r.source_id,r]));
const variables=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const origin=variables.filter(s=>s.startsWith("WC_URL="));
if(origin.length!==1||origin[0].slice(7).replace(/^['"]|['"]$/g,"").replace(/\/$/,"")!=="https://admin-pse.webnvn.com")
 throw Error("Wrong WordPress host");
const report={schema:"pse-eleven-owner-sql-native-post-status-2026-11-22-v1",noWpWrites:true,
 noFTPReads:true,noBuild:true,expectedOriginalPosts:11,publishedExpected:[382],draftExpected:ids.filter(x=>x!==382),articles:[],summary:{}};
const dir="artifacts/pse-eleven-after-382-public-qa";
await mkdir(dir,{recursive:true});
const save=()=>writeFile(dir+"/report.json",JSON.stringify(report,null,2)+"\n");
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1366,height:860}});
const page=await ctx.newPage();
try{
 const first=await page.goto("https://admin-pse.webnvn.com/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 const initialLoginInput=await page.locator("#user_login").count();
 console.log("PSE_ELEVEN_AUTH_PRELOGIN="+JSON.stringify({http:first?.status()||null,path:new URL(page.url()).pathname,hasLoginForm:!!initialLoginInput}));
 if(initialLoginInput){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const login=(await page.locator("#loginform").innerText()).slice(0,750);
  const m=login.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){
   const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error("Login CAPTCHA unsupported");
   await f.fill(String(v));
  }
  await page.locator("#wp-submit").click();
 }
 const edit=await page.goto("https://admin-pse.webnvn.com/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:65000});
 const adminMenu=await page.locator("#adminmenu").count(),loginField=await page.locator("#user_login").count();
 console.log("PSE_ELEVEN_AUTH_EDIT="+JSON.stringify({http:edit?.status()||null,path:new URL(page.url()).pathname,adminMenuPresent:!!adminMenu,loginFieldPresent:!!loginField}));
 if(page.url().includes("wp-login")||!adminMenu)
  throw Error("WP admin session unavailable");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("REST nonce unavailable");
  return(await r.text()).trim();
 });
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error("Wrong REST nonce");
 for(let i=0;i<ids.length;i++){
  const sourceId=ids[i],wpId=targets[i],original=records.get(sourceId);
  const r=await page.evaluate(async({wpId,nonce})=>{
   const res=await fetch("/wp-json/wp/v2/posts/"+wpId+
     "?context=edit&_fields=id,slug,status,date,title,content,categories,acf",
    {headers:{"X-WP-Nonce":nonce,Accept:"application/json"},credentials:"same-origin"});
   return {http:res.status,data:await res.json().catch(()=>null)};
  },{wpId,nonce});
  const p=r.data||{},body=String(p.content?.raw||"");
  const remaining=original.inline_image_src.filter(src=>body.includes(src));
  const expectedStatus=sourceId===382?"publish":"draft";
  const valid=r.http===200&&p.id===wpId&&p.slug===original.slug&&p.status===expectedStatus&&
    p.title?.raw===original.title&&p.date===original.created_at_joomla.replace(" ","T")&&
    p.acf?.action==="PostDetails"&&p.acf?.key==="ssr-post";
  const row={sourceId,wpPostId:wpId,expectedStatus,actualStatus:p.status||null,
    publicContentIdentityValid:valid,originalImageOccurrences:original.inline_image_src.length,
    originalSourceUrlsStillPresent:remaining.length,expectedMigratedSourcePhotoCount:sourceId===382?3:0,
    nativePhotoReferences:sourceId===382?["Ao_2.jpg","Ba_Lan.jpg","Mo_muoi_Wieliczka_duoi_mat_dat_135m_-_Ba_lan.jpg"].filter(s=>body.includes(s)).length:0,
    wpWrites:0};
  report.articles.push(row);
  console.log("PSE_ELEVEN_POST_AFTER_382="+JSON.stringify(row));
  if(!valid)throw Error("Owner original native post identity/status changed sourceId "+sourceId);
  if(sourceId===382){
   if(row.originalSourceUrlsStillPresent!==0||row.nativePhotoReferences!==3)
    throw Error("Published #382 original three native photos unexpectedly changed");
  }else if(row.originalSourceUrlsStillPresent!==original.inline_image_src.length)
   throw Error("Quarantined historical original image reference changed sourceId "+sourceId);
 }
 report.summary={published:report.articles.filter(r=>r.actualStatus==="publish").length,
  quarantined:report.articles.filter(r=>r.actualStatus==="draft").length,
  verifiedSourceIdentities:report.articles.filter(r=>r.publicContentIdentityValid).length,
  remainingOriginalExternalImageOccurrences:report.articles.filter(r=>r.sourceId!==382).reduce((n,r)=>n+r.originalImageOccurrences,0),
  publishedFullOriginalMediaSourceIds:[382],noWordPressWrites:true};
 await save();
 console.log("PSE_ELEVEN_POST_AFTER_382_SUMMARY="+JSON.stringify(report.summary));
}finally{
 await save();await ctx.close();await browser.close();
}
