/** Exact #379 Joomla feed-to-WordPress draft preflight. GET-only, no CMS mutations. */
import {chromium,request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong PSE repo");
const id=379,wpId=82119,
 source="https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/379-pvfcco-se-to-chuc-tham-quan-phong-truyen-thong-pvfcco.html",
 feed="https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop?format=feed&type=rss&limitstart=210",
 date="Wed, 03 Jul 2013 02:10:17 +0700",
 slug="pvfcco-se-to-chuc-tham-quan-phong-truyen-thong-pvfcco";
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const prev=JSON.parse(await readFile("docs/pse-legacy-date-backfill-state.json","utf8"));
const entry=state.articles?.[id];
if(state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified||
 entry?.source_url!==source||entry?.status!=="draft_needs_date"||entry?.wp_id!==wpId||
 prev.records?.[id]?.wp_id!==wpId)throw Error("Historical Joomla 379 identity changed");
const settings=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const matches=settings.filter(x=>x.startsWith("WC_URL="));
if(matches.length!==1)throw Error("Missing WC_URL");
const wp=new URL(matches[0].slice(7).replace(/^['"]|['"]$/g,""));
if(wp.protocol!=="https:"||wp.username||wp.password||wp.search||wp.hash||
 !["","/"].includes(wp.pathname))throw Error("Untrusted WP origin");
const normalized=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .replace(/đ/gi,"d").toLowerCase().replace(/\s+/g," ").trim();
const field=(s,k)=>String(s.match(new RegExp("<"+k+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+k+">","i"))?.[1]||"")
 .replace(/^<!\[CDATA\[|\]\]>$/g,"").replace(/&amp;/g,"&").trim();
const browser=await chromium.launch({headless:true}),net=await request.newContext({timeout:65000});
const admin=await browser.newPage(), inert=await browser.newContext({javaScriptEnabled:false});
await inert.route("**/*",r=>r.abort());
const report={schema:"pse-379-original-source-vs-wp-draft-readonly-v1",readOnly:true,wpWrites:0,
 source,wpId,dateEvidence:null,post:null,sourceInfo:null,reason:null,ready:false};
try{
 const [rssRes,sourceRes]=await Promise.all([net.get(feed),net.get(source)]);
 if(rssRes.status()!==200||sourceRes.status()!==200)throw Error("Original source article or RSS unavailable");
 const found=( (await rssRes.text()).match(/<item\b[\s\S]*?<\/item>/gi)||[]).map(s=>({
  link:field(s,"link"),title:field(s,"title"),pubDate:field(s,"pubDate")
 })).filter(x=>{try{const u=new URL(x.link);return u.pathname===new URL(source).pathname&&
 ["www.pse.vn","pse.vn"].includes(u.hostname)}catch{return false}});
 if(found.length!==1||found[0].pubDate!==date||
 new Date(found[0].pubDate).toISOString()!=="2013-07-02T19:10:17.000Z")
  throw Error("Original Joomla 379 RSS identity/date changed");
 report.dateEvidence={source:"exact_joomla_rss_pubDate",raw:date,local:"2013-07-03T02:10:17",originalTitle:found[0].title};
 const original=await inert.newPage();
 const html=await sourceRes.text();
 if(html.length<250||html.length>8000000)throw Error("Unsafe original source size");
 await original.setContent('<base href="'+source+'">'+html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded"});
 const j=await original.evaluate(()=>{
  // Query the exact standalone Joomla articleBody, not its enclosing .item-page
  // (which also includes pager and unrelated article links after the real post).
  const root=document.querySelector('[itemprop="articleBody"]');
  if(!root)throw Error("Original Joomla articleBody missing");
  const txt=s=>String(s||"").replace(/\s+/g," ").trim();
  return{title:txt(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent),
   text:txt(root?.textContent),
   rootLabel:root?.getAttribute("itemprop")||root?.className||root?.tagName,
   hasExplicitArticleBody:!!document.querySelector(".item-page [itemprop=articleBody]"),
   sections:[...(root?.children||[])].slice(0,22).map((c,i)=>({
    index:i,tag:c.tagName,className:String(c.className||"").slice(0,90),
    bodyChars:txt(c.textContent).length,start:txt(c.textContent).slice(0,140)
   })),
   images:[...(root?.querySelectorAll("img[src]")||[])].map(x=>new URL(x.getAttribute("src"),document.baseURI).href),
   documents:[...(root?.querySelectorAll("a[href]")||[])].map(x=>x.href).filter(x=>/\.(?:pdf|docx?|zip|xlsx?)(?:[?#]|$)/i.test(x))};
 });
 await original.close();
 if(j.text.length<130||normalized(j.title)!==normalized(found[0].title))
  throw Error("Original Joomla title/body mismatch");
 report.sourceInfo={title:j.title,bodyChars:j.text.length,images:j.images.length,documents:j.documents.length,
  rootLabel:j.rootLabel,hasExplicitArticleBody:j.hasExplicitArticleBody};
 console.log("PSE_379_JOOMLA_DOM_BOUNDARY="+JSON.stringify({rootLabel:j.rootLabel,
  hasExplicitArticleBody:j.hasExplicitArticleBody,sections:j.sections,
  migrationBodyChars:String(entry.bodyText||"").length,
  migrationBodyStart:normalized(entry.bodyText||"").slice(0,120)}));
 await admin.goto(wp.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const text=(await admin.locator("#loginform").innerText()).slice(0,650);
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){
   const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,"*":a*b,"×":a*b,x:a*b})[m[2]];
   const input=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await input.count())throw Error("Unknown WP challenge");await input.fill(String(n));
  }
  await admin.locator("#wp-submit").click();
 }
 await admin.goto(wp.origin+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:65000});
 if(admin.url().includes("wp-login")||!await admin.locator("#adminmenu").count())
  throw Error("Authenticated WordPress session not established");
 const nonce=await admin.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("REST nonce missing");
  return(await r.text()).trim();
 });
 const rest=async path=>admin.evaluate(async({path,nonce})=>{
  const r=await fetch(path,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,"Accept":"application/json"}});
  return{status:r.status,data:await r.json().catch(()=>null)};
 },{path,nonce});
 const [p,c]=await Promise.all([
  rest("/wp-json/wp/v2/posts/"+wpId+"?context=edit&_fields=id,slug,status,title,content,acf,categories,date,featured_media"),
  rest("/wp-json/wp/v2/categories?slug=tin-tong-hop&hide_empty=false&_fields=id,slug,parent")
 ]);
 if(p.status!==200||p.data?.id!==wpId||p.data.slug!==slug||
  !["draft","publish"].includes(p.data.status)||
  !p.data.categories?.includes(1742)||!p.data.categories?.includes(1746)||
  c.status!==200||c.data?.length!==1||c.data[0].id!==1746||c.data[0].parent!==1742)
  throw Error("WordPress draft 379 native identity/category mismatch");
 const wpTitle=String(p.data.title?.raw||""),wpHtml=String(p.data.content?.raw||"");
 if(normalized(wpTitle)!==normalized(found[0].title)||wpHtml.length<150)
  throw Error("Native draft title/body mismatch");
 const local=await inert.newPage();
 await local.setContent(wpHtml,{waitUntil:"domcontentloaded"});
 const native=await local.evaluate(()=>({text:(document.body.textContent||"").replace(/\s+/g," ").trim(),
 images:[...document.querySelectorAll("img[src]")].map(x=>x.getAttribute("src")),
 documents:[...document.querySelectorAll("a[href]")].map(x=>x.getAttribute("href"))
 .filter(x=>/\.(?:pdf|docx?|zip|xlsx?)(?:[?#]|$)/i.test(x||""))}));
 await local.close();
 const opening=normalized(j.text).slice(0,90),text=normalized(native.text);
 const comparison={sourceChars:normalized(j.text).length,nativeChars:text.length,
  sourceStart:normalized(j.text).slice(0,170),nativeStart:text.slice(0,170),
  sourceEnd:normalized(j.text).slice(-200),nativeEnd:text.slice(-200),
  nativeFullyContained:normalized(j.text).includes(text),
  sourceContainsMigrationBody:normalized(j.text).includes(normalized(entry.bodyText||"")),
  openingFound:!!opening&&text.includes(opening),
  lengthRatio:normalized(j.text).length?Number((text.length/normalized(j.text).length).toFixed(3)):0};
 report.textComparison=comparison;
 console.log("PSE_379_NATIVE_TEXT_COMPARISON="+JSON.stringify(comparison));
 if(!comparison.openingFound||comparison.lengthRatio<0.7)
  throw Error("Native draft omitted original text");
 if(native.images.length!==j.images.length||native.documents.length!==j.documents.length)
  throw Error("Native draft omits mandatory source images/documents");
 const assets=Array.isArray(entry.assets)?entry.assets:[];
 for(const a of assets)if(!state.media?.[a]?.url||!wpHtml.includes(state.media[a].url))
  throw Error("Native draft missing verified legacy media mapping");
 report.post={id:wpId,status:p.data.status,slug:p.data.slug,date:p.data.date,
  categories:p.data.categories,originalTitleMatch:true,nativeBodyChars:native.text.length,
  nativeImages:native.images.length,nativeDocuments:native.documents.length,
  sourceMediaMapped:assets.length};
 report.ready=p.data.status==="draft";
 console.log("PSE_379_NATIVE_READONLY_PROOF="+JSON.stringify({...report.dateEvidence,...report.sourceInfo,...report.post,ready:report.ready}));
}catch(e){report.reason=String(e?.message||e).slice(0,200);console.log("PSE_379_NATIVE_READONLY_BLOCKER="+report.reason);process.exitCode=1}
finally{
 await mkdir("artifacts/pse-379-native-preflight",{recursive:true});
 await writeFile("artifacts/pse-379-native-preflight/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await inert.close();await browser.close();
}
