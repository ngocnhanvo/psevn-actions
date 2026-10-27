/** Read-only parity audit: full Joomla Chi bo listing vs WP taxonomy and Astro. */
import {chromium} from "playwright";
import {readFile} from "node:fs/promises";
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(v=>v.trim().replace(/^export\s+/,""));
const entry=env.filter(x=>x.startsWith("WC_URL="));
if(entry.length!==1)throw Error("WP environment missing");
const origin=new URL(entry[0].slice(7).replace(/^['"]|['"]$/g,"")).origin;
const browser=await chromium.launch({headless:true});
const admin=await browser.newPage();
try{
 await admin.goto(origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=await admin.locator("body").innerText(),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const field=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error("WP login captcha control missing");await field.fill(String(n));
  }
  await Promise.all([admin.waitForLoadState("domcontentloaded"),admin.locator("#wp-submit").click()]);
 }
 if(admin.url().includes("wp-login"))throw Error("WP auth failed");
 await admin.goto(origin+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 const nonce=await admin.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("Missing REST nonce");return(await r.text()).trim();
 });
 const api=(path)=>admin.evaluate(async({path,nonce})=>{
  const r=await fetch(path,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json"}});
  return {http:r.status,total:Number(r.headers.get("X-WP-Total")||0),pages:Number(r.headers.get("X-WP-TotalPages")||1),data:await r.json().catch(()=>null)};
 },{path,nonce});
 const cats=await api("/wp-json/wp/v2/categories?slug=hoat-dong-chi-bo-hdqt-bks&hide_empty=false&_fields=id,slug,parent,count");
 const child=cats.data?.[0];
 const parent=(await api("/wp-json/wp/v2/categories?slug=tin-cong-ty&_fields=id,slug")).data?.[0];
 if(cats.http!==200||cats.data?.length!==1||child?.parent!==parent?.id)throw Error("WP taxonomy mismatch");
 const fetchPosts=async(cat,status)=>{
  const path="/wp-json/wp/v2/posts?context=edit&categories="+cat+"&status="+status+"&per_page=100&_fields=id,slug,status,categories";
  const first=await api(path+"&page=1");
  if(first.http!==200||!Array.isArray(first.data))throw Error("Posts not readable "+status);
  const rows=[...first.data];
  for(let n=2;n<=first.pages;n++){const p=await api(path+"&page="+n);if(p.http!==200||!Array.isArray(p.data))throw Error("Posts pagination failed "+n);rows.push(...p.data)}
  return{total:first.total,rows};
 };
 const [publishedChild,publishedParent,draftsParent]=await Promise.all([
   fetchPosts(child.id,"publish"),fetchPosts(parent.id,"publish"),fetchPosts(parent.id,"draft")
 ]);
 const bySlug=new Map();
 for(const p of [...publishedParent.rows,...draftsParent.rows]){
  if(!bySlug.has(p.slug))bySlug.set(p.slug,[]);
  bySlug.get(p.slug).push(p);
 }
 const oldBase="https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/hoat-dong-chi-bo-hdqt-bks.html";
 const source=await browser.newPage();
 await source.route(/\.(?:woff2?|png|jpe?g|webp|gif)(?:\?.*)?$/i,r=>r.abort());
 const pages=[],queue=[oldBase],visited=new Set();
 while(queue.length && visited.size<8){
  const url=queue.shift();
  if(visited.has(url))continue;
  visited.add(url);
  const response=await source.goto(url,{waitUntil:"domcontentloaded",timeout:60000});
  if(response?.status()!==200)throw Error("Joomla category page HTTP "+response?.status());
  const extraction=await source.evaluate(()=>{
   const root=document.querySelector(".blog");
   if(!root)throw Error("Original Joomla blog DOM unavailable");
   const links=[...new Set([...root.querySelectorAll("a[href]")].map(a=>a.href))];
   const article=links.filter(h=>{try{const u=new URL(h);return ["pse.vn","www.pse.vn"].includes(u.hostname)&&/^\/tin-tuc-su-kien\/tin-cong-ty\/hoat-dong-chi-bo-hdqt-bks\/\d+-[a-z0-9-]+\.html$/i.test(u.pathname)}catch{return false}});
   const pages=links.filter(h=>{try{const u=new URL(h);return ["pse.vn","www.pse.vn"].includes(u.hostname)&&u.pathname==="/tin-tuc-su-kien/tin-cong-ty/hoat-dong-chi-bo-hdqt-bks.html"&&/^\d+$/.test(u.searchParams.get("start")||"")}catch{return false}});
   const text=root.textContent||"";
   const pager=text.match(/Page\s+\d+\s+of\s+\d+/i)?.[0]||"";
   const headings=[...root.querySelectorAll("h1,h2,h3")].map(el=>el.textContent.trim()).filter(Boolean).slice(0,15);
   const blocks=[...root.querySelectorAll("h2,h3")].slice(0,12).map(h=>{
    const el=h.closest("article,.leading-0,.leading,.item,.items-row,.item-page,[itemprop='blogPost']");
    const time=el?.querySelector("time,[itemprop='datePublished'],.published,.createdate");
    return {heading:h.textContent.trim().slice(0,180),tag:el?.tagName||"",id:el?.id||"",
      className:String(el?.className||"").slice(0,120),
      htmlStart:(el?.outerHTML||h.parentElement?.outerHTML||"").slice(0,450),
      date:time?.getAttribute("datetime")||time?.textContent.trim().slice(0,90)||"",
      fullTextLength:el?.textContent?.length||0,
      directLinks:[...el?.querySelectorAll("a[href]")||[]].map(a=>a.href).slice(0,6)};
   });
   return {article,pages,pager,headings,blocks,allAnchors:links.length};
  });
  pages.push({url,pager:extraction.pager,links:extraction.article,heads:extraction.headings,blocks:extraction.blocks,allAnchors:extraction.allAnchors,paginationLinks:extraction.pages});
  for(const u of extraction.pages)if(!visited.has(u)&&!queue.includes(u))queue.push(u);
 }
 const listed=[...new Set(pages.flatMap(p=>p.links))];
 const mapped=listed.map(url=>{
  const match=url.match(/\/(\d+)-([a-z0-9-]+)\.html$/i);
  if(!match)return null;
  const wp=bySlug.get(match[2])||[];
  return{sourceId:Number(match[1]),slug:match[2],url,wp:wp.map(p=>({id:p.id,status:p.status,categories:p.categories})),
    childPublished:wp.some(p=>p.status==="publish"&&p.categories.includes(child.id))};
 }).filter(Boolean);
 // Check the three full-text Joomla items which have no article-detail URL.
 const unlinkedSourceTitles=pages[0]?.blocks.slice(0,3).map(x=>x.heading)||[];
 const searched=[];
 for(const title of unlinkedSourceTitles){
  const keyword=title.split(/\s+/).slice(0,9).join(" ");
  const wpResult=await api("/wp-json/wp/v2/posts?context=edit&status=any&search="+
    encodeURIComponent(keyword)+"&per_page=25&_fields=id,slug,title,status,categories");
  searched.push({title,keyword,http:wpResult.http,results:
    (Array.isArray(wpResult.data)?wpResult.data:[]).map(p=>({id:p.id,slug:p.slug,
      status:p.status,categories:p.categories,title:p.title?.rendered})).slice(0,12)});
 }
 const legacyCollisionChecks=[];
 for(const slug of [
   "chi-tra-co-tuc-dot-1-nam-2015",
   "nghi-quyet-ve-viec-thuc-hien-tam-ung-chi-tra-co-tuc-dot-12015",
   "nghi-quyet-ve-viec-phe-duyet-don-vi-kiem-toan-bao-cao-tai-chinh-nam-2015"
 ]){
   const result=await api("/wp-json/wp/v2/posts?context=edit&status=any&slug="+encodeURIComponent(slug)+
     "&_fields=id,slug,status,categories,title,content");
   legacyCollisionChecks.push({slug,http:result.http,
     posts:(Array.isArray(result.data)?result.data:[]).map(p=>({
       id:p.id,status:p.status,categories:p.categories,
       title:p.title?.raw||p.title?.rendered||"",contentLength:p.content?.raw?.length||0
     }))});
 }
 const checkpoint=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
 const legacy=Object.entries(checkpoint.articles).filter(([id,p])=>
  /^https:\/\/(?:www\.)?pse\.vn\/tin-tuc-su-kien\/tin-cong-ty\/hoat-dong-chi-bo-hdqt-bks\/\d+-/i.test(p.source_url)
 ).map(([id,p])=>({sourceId:id,wpId:p.wp_id||null,status:p.status,sourceUrl:p.source_url}));
 const site=await browser.newPage();
 const live=await site.goto("https://pse.webnvn.com/tin-tuc-su-kien/hoat-dong-chi-bo-hdqt-bks",{waitUntil:"domcontentloaded",timeout:60000});
 const display=await site.evaluate(()=>({
  title:document.title,count:document.querySelectorAll("#posts-grid .grid > div").length,
  description:document.querySelector("#posts-grid")?.textContent?.replace(/\s+/g," ").slice(-170)||""
 }));
 const report={categories:{child,parent},wordpress:{publishedChild:publishedChild.total,publishedParent:publishedParent.total,draftsParent:draftsParent.total},
  joomla:{pageCount:pages.length,pages,foundArticleUrls:listed.length,mapped,unlinkedSearch:searched,legacyCollisionChecks},
  checkpoint:{total:legacy.length,rows:legacy},
  astro:{http:live?.status(),...display},readonly:true};
 console.log("PSE_CHI_BO_CATEGORY_PARITY="+JSON.stringify(report));
 const sourceArticleItems=pages.reduce((n,p)=>n+
   p.blocks.filter(b=>/\bitem\b/.test(b.className)).length,0);
 const publishedIds=new Set(publishedChild.rows.map(p=>p.id));
 const missingWp=legacy.filter(row=>!row.wpId||!publishedIds.has(Number(row.wpId)));
 const unlinkedNames=pages[0]?.blocks.filter(b=>b.tag==="DIV"&&b.directLinks.length===0).length||0;
 const actualSiteTotal=Number(display.description.match(/Tổng\s+(\d+)\s+bài viết/i)?.[1]||0);
 if(pages.length!==2||sourceArticleItems!==9||legacy.length!==9||
    mapped.length!==6||mapped.some(p=>!p.childPublished)||
    missingWp.length>0||unlinkedNames!==3||
    publishedChild.total!==sourceArticleItems||
    live?.status()!==200||display.count!==sourceArticleItems||
    actualSiteTotal!==sourceArticleItems)
   throw Error("Chi bo category migration parity mismatch: "+
     JSON.stringify({pages:pages.length,oldItems:sourceArticleItems,
       manifest:legacy.length,linked: mapped.length,
       missingWp,unlinkedNames,wp:publishedChild.total,
       astro:display.count,siteTotal:actualSiteTotal}));
 console.log("PSE_CHI_BO_DATA_PARITY=PASS; legacy="+sourceArticleItems+
   "; wordpress="+publishedChild.total+"; astro="+actualSiteTotal+
   "; all_nine_source_ids_verified=true; no_astro_build=true");
 console.log("PSE_CHI_BO_PARITY_READ_ONLY=PASS; pages="+pages.length+
  "; source_article_urls="+listed.length+"; child_published="+publishedChild.total+
  "; astro_cards="+display.count);
 await site.close();await source.close();
}finally{await admin.close();await browser.close()}
