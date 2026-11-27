/** Compare live 10-page Joomla Tin Cong Ty archive to 37 direct WordPress posts. NO CMS WRITES. */
import {chromium,request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
if((await readFile(".pse-company-source-probe-request","utf8")).trim()!=="MODE=AUDIT"||
 String(event.head_commit?.message||"").split("\n")[0]!=="audit(pse): reconcile company Joomla listing to native WordPress")
 throw Error("Only requested read-only company source parity is supported");
const settings=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const origin=name=>{const rows=settings.filter(s=>s.startsWith(name+"="));if(rows.length!==1)throw Error("Missing "+name);
 const u=new URL(rows[0].slice(name.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid "+name);
 return u.origin;};
const wp=origin("WC_URL"),site=origin("WC_URL_CLIENT");
const old="https://www.pse.vn/21-tin-tuc-su-kien/tin-cong-ty.html";
const firstNew="https://www.pse.vn/21-tin-tuc-su-kien/tin-cong-ty/1739-phu-my-dong-nam-bo-mot-ngay-thu-bay-day-y-nghia.html";
const network=await request.newContext({timeout:45000,userAgent:"Mozilla/5.0 (compatible; PSE content parity QA)"});
const browser=await chromium.launch({headless:true});
const sourceCtx=await browser.newContext({javaScriptEnabled:false});
await sourceCtx.route("**/*",r=>r.abort());
const admin=await browser.newPage({viewport:{width:1300,height:950}});
const report={mode:"AUDIT",time:new Date().toISOString(),source:old,sourcePages:[],wordpress:{},comparisons:{},noCmsWrites:true};
const norm=s=>String(s||"").normalize("NFC").toLocaleLowerCase("vi").replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");
const retry=async(url)=>{
 let last;
 for(let n=0;n<2;n++)try{
  const res=await network.get(url,{timeout:55000,maxRedirects:3});
  if(res.status()===200){const html=await res.text();if(html.length>200&&html.length<9000000)return html}
  last="HTTP "+res.status();
 }catch(e){last=String(e?.message||e).slice(0,140)}
 throw Error("Joomla source "+url+" unavailable after retry: "+last);
};
async function parse(url,html){
 const page=await sourceCtx.newPage();
 try{
  await page.setContent('<base href="'+url+'">'+html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded",timeout:25000});
  return await page.evaluate(()=>{
   const anchor=a=>({text:(a.textContent||"").replace(/\s+/g," ").trim(),href:a.href});
   const selector=".items-leading h2 a,.items-row h2 a,.blog h2 a,.item h2 a,article h2 a";
   const links=[...document.querySelectorAll(selector)].map(anchor)
    .filter(x=>/\/21-tin-tuc-su-kien\/tin-cong-ty\/\d{3,5}-/.test(x.href));
   const anyLinks=[...document.querySelectorAll("h2 a")].map(anchor)
    .filter(x=>/\/21-tin-tuc-su-kien\/tin-cong-ty\/\d{3,5}-/.test(x.href));
   const root=document.querySelector(".item-page [itemprop=articleBody],.item-page,article")||document.body;
   const images=[...root.querySelectorAll("img[src]")].map(img=>({src:img.src,alt:img.alt||""}))
    .filter(x=>/pse\.vn/i.test(x.src)).slice(0,25);
   const canonical=document.querySelector('link[rel="canonical"]')?.href||"";
   const times=[...document.querySelectorAll("time[datetime],meta[property='article:published_time'],meta[property='article:modified_time']")].map(el=>el.getAttribute("datetime")||el.getAttribute("content")||"");
   const headings=[...root.querySelectorAll("h1,h2")].map(x=>(x.textContent||"").replace(/\s+/g," ").trim()).filter(Boolean).slice(0,12);
   const counts={itemsRow:document.querySelectorAll(".items-row").length,
    leading:document.querySelectorAll(".items-leading").length,
    article:document.querySelectorAll("article").length,
    main:document.querySelectorAll(".blog").length};
   const mainHtml=root.outerHTML.slice(0,40000);
   const mainText=(root.textContent||"").replace(/\s+/g," ").trim();
   return{links:links.length?links:anyLinks,allHeadlineAnchors:anyLinks.length,
    pageTitle:document.title,images,canonical,times,headings,counts,
    bodyHtmlLength:root.innerHTML.length,bodyTextLength:mainText.length,
    topLevelMainHtmlSample:mainHtml.slice(0,5000),
    bodyTextSample:mainText.slice(0,900)};
  });
 }finally{await page.close()}
}
try{
 await admin.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const text=await admin.locator("body").innerText();
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const f=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error("WP math challenge field not found");await f.fill(String(v));
  }
  await Promise.all([admin.waitForLoadState("domcontentloaded"),admin.locator("#wp-submit").click()]);
 }
 if(admin.url().includes("wp-login"))throw Error("WordPress login unsuccessful");
 const nonce=await admin.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("Missing nonce");return(await r.text()).trim()});
 const api=async path=>admin.evaluate(async({path,nonce})=>{const r=await fetch(path,{credentials:"same-origin",
   headers:{"X-WP-Nonce":nonce,Accept:"application/json"},cache:"no-store"});
   return{http:r.status,total:Number(r.headers.get("X-WP-Total")||0),data:await r.json().catch(()=>null)};},{path,nonce});
 const posts=[];for(let page=1;page<=4;page++){
  const p=await api("/wp-json/wp/v2/posts?status=publish&per_page=12&page="+page+
   "&categories=1742&categories_exclude=1746,1747,1748,1749&_fields=id,slug,title,categories,date,link");
  if(p.http!==200||!Array.isArray(p.data))throw Error("WordPress parent direct page "+page+" HTTP "+p.http);
  posts.push(...p.data);
  report.wordpress.total=p.total;
 }
 report.wordpress.directPosts=posts.map(p=>({id:p.id,slug:p.slug,title:p.title?.rendered,date:p.date,categories:p.categories}));
 if(posts.length!==37||report.wordpress.total!==37)throw Error("Native WordPress direct category changed from audited 37");
 const exists=await api("/wp-json/wp/v2/posts?status=publish&slug=phu-my-dong-nam-bo-mot-ngay-thu-bay-day-y-nghia&_fields=id,slug,title,categories");
 report.wordpress.known2026Joomla1739NativeSlugCheck={http:exists.http,found:Array.isArray(exists.data)?exists.data:[]};
 const urls=Array.from({length:10},(_,i)=>i===0?old:old+"?start="+(i*6));
 const pages=await Promise.all(urls.map(async(url,index)=>{
  try{const html=await retry(url);const parsed=await parse(url,html);return{index:index+1,url,status:"PASS",...parsed};}
  catch(e){return{index:index+1,url,status:"FAILED",reason:String(e?.message||e).slice(0,220)}}
 }));
 report.sourcePages=pages;
 let detail;try{const html=await retry(firstNew);detail={url:firstNew,status:"PASS",...await parse(firstNew,html)};}
 catch(e){detail={url:firstNew,status:"FAILED",reason:String(e?.message||e).slice(0,220)}}
 report.known2026Joomla1739=detail;
 const source=new Map();
 for(const page of pages){for(const n of(page.links||[])){
  const id=Number((new URL(n.href).pathname.match(/\/(\d{3,5})-/)||[])[1]);
  if(Number.isSafeInteger(id)&&!source.has(id))source.set(id,n);
 }}
 const byName=new Map(posts.map(p=>[norm(p.title?.rendered),p]));
 const bySlug=new Set(posts.map(p=>p.slug));
 const comparison=[...source.entries()].map(([id,n])=>{
  const slug=new URL(n.href).pathname.split("/").pop().replace(/^\d+-/,"").replace(/\.html$/,"");
  const matched=bySlug.has(slug)?posts.find(p=>p.slug===slug):byName.get(norm(n.text));
  return{joomlaId:id,slug,sourceTitle:n.text,wordpressId:matched?.id||null,status:matched?"FOUND":"MISSING_FROM_DIRECT_37"};
 });
 report.comparisons={sourceIdentifiers:comparison.length,missing:comparison.filter(x=>x.status!=="FOUND"),items:comparison};
 console.log("PSE_COMPANY_JOOMLA_SOURCE_PARITY="+JSON.stringify({
  wordpressTotal:report.wordpress.total,sourcePages:pages.map(p=>({page:p.index,status:p.status,headlines:p.links?.length||0,reason:p.reason||""})),
  extractedSourceIds:comparison.length,missing:report.comparisons.missing,
  native1739:report.wordpress.known2026Joomla1739NativeSlugCheck,
  original1739:detail.status==="PASS"?{headers:detail.headings,images:detail.images,bodyLength:detail.bodyHtmlLength,canonical:detail.canonical,times:detail.times}:detail
 }).slice(0,28000));
}finally{
 await mkdir("artifacts/pse-company-news",{recursive:true});
 await writeFile("artifacts/pse-company-news/joomla-source-parity.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();await network.dispose();
}
