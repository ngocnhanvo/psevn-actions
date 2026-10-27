/** Add old Joomla 1155 category to an exact, already published WP PDF notice.
 * No content/date/status changes; preserves all previous categories and rollback record. */
import {chromium} from "playwright";
import {createHash} from "node:crypto";
import {writeFile,mkdir} from "node:fs/promises";
const report={sourceId:1155,wpId:79462,changed:false,beforeCategories:null,afterCategories:null,error:null};
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")
 throw Error("Wrong PSE actions repository");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const candidate=env.filter(x=>x.startsWith("WC_URL="));
if(candidate.length!==1)throw Error("Missing unique WC_URL");
const site=new URL(candidate[0].slice(7).replace(/^['"]|['"]$/g,""));
if(site.protocol!=="https:"||site.username||site.password)throw Error("Untrusted WordPress origin");
const norm=v=>String(v||"").normalize("NFKC").replace(/<[^>]*>/g,"").replace(/\s+/g," ").trim().toLocaleLowerCase("vi");
const title="Chi trả cổ tức đợt 1 năm 2015";
const slug="chi-tra-co-tuc-dot-1-nam-2015";
const source="https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/hoat-dong-chi-bo-hdqt-bks/1155-"+slug+".html";
const media="https://www.pse.vn/images/pdf/2015/Chi_tra_co_tuc_dot_1_2015.pdf";
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 const [article,pdf]=await Promise.all([
  page.request.get(source,{timeout:45000}),page.request.get(media,{timeout:45000})
 ]);
 if(!article.ok()||!pdf.ok())throw Error("Legacy 1155 source article/PDF unavailable");
 const bytes=await pdf.body();
 const hash=createHash("sha256").update(bytes).digest("hex").slice(0,16);
 if(!bytes.subarray(0,8).toString("latin1").startsWith("%PDF-")||
    hash!=="d31708f56877784b")throw Error("Legacy PDF checksum/magic changed");
 await page.goto(site.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=await page.locator("body").innerText();
  const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||
    t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error("Login math input missing");await f.fill(String(n));
  }
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WordPress login failed");
 await page.goto(site.origin+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("WP nonce unavailable");
  return(await r.text()).trim();
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("Invalid WP REST nonce");
 const api=(path,method="GET",body)=>page.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{
   "X-WP-Nonce":nonce,"Accept":"application/json",
   ...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,data:await r.json().catch(()=>null)};
 },{path,method,body,nonce});
 const cats=await api("/wp-json/wp/v2/categories?slug=hoat-dong-chi-bo-hdqt-bks&_fields=id,slug,parent");
 if(cats.status!==200||cats.data?.length!==1||
    cats.data[0].id!==1747||cats.data[0].parent!==1742)
   throw Error("Child taxonomy changed");
 const read=()=>api("/wp-json/wp/v2/posts/79462?context=edit&_fields=id,slug,title,content,status,categories,date");
 const before=await read(),post=before.data;
 if(before.status!==200||post?.id!==79462||post.slug!==slug||
    post.status!=="publish"||norm(post.title?.raw||post.title?.rendered)!==norm(title))
   throw Error("Post 79462 is no longer the exact published Joomla 1155 match");
 const body=String(post.content?.raw||"");
 if(!/\.pdf(?:[?#"' <]|$)/i.test(body)||body.length<40)
   throw Error("Existing WP content has no PDF reference; stop rather than relabel");
 report.beforeCategories=[...post.categories];
 if(!post.categories.includes(1747)||!post.categories.includes(1742)){
  const next=[...new Set([...post.categories,1742,1747])];
  const applied=await api("/wp-json/wp/v2/posts/79462","POST",{categories:next});
  if(applied.status!==200||applied.data?.id!==79462)
   throw Error("Category write rejected HTTP "+applied.status);
  report.changed=true;
 }
 const after=await read();
 if(after.status!==200||after.data.status!==post.status||after.data.date!==post.date||
    !after.data.categories.includes(1742)||!after.data.categories.includes(1747)||
    !report.beforeCategories.every(x=>after.data.categories.includes(x)))
   throw Error("WordPress category readback mismatch");
 report.afterCategories=after.data.categories;
 console.log("PSE_CHI_BO_1155_BIND=PASS; "+JSON.stringify({
   wpId:79462,sourceId:1155,changed:report.changed,
   before:report.beforeCategories,after:report.afterCategories,no_build:true
 }));
}catch(e){
 report.error=String(e?.message||e).slice(0,250);
 console.error("PSE_CHI_BO_1155_BIND=FAIL; "+report.error);
 throw e;
}finally{
 await mkdir("docs/reports",{recursive:true});
 await writeFile("docs/reports/pse-chi-bo-2015-existing-bind-rollback.json",
  JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
