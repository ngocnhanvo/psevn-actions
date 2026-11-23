/** Read-only browser/CMS investigation: PSE original Joomla 1434 -> Page 83593. */
import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";

function origin(key){
 const matches=String(process.env.ENV_FILE||"").split(/\r?\n/)
   .map(s=>s.trim().replace(/^export\s+/,"")).filter(x=>x.startsWith(key+"="));
 if(matches.length!==1)throw Error("Missing one "+key);
 const u=new URL(matches[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid "+key);
 return u.origin;
}
const wp=origin("WC_URL"),front=origin("WC_URL_CLIENT");
if(wp!=="https://admin-pse.webnvn.com"||front!=="https://pse.webnvn.com")throw Error("Origin mismatch");
const target=front+"/npk-phu-my";
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const p=await context.newPage();
await mkdir("artifacts/npk-1434-layout",{recursive:true});
const issues=[];
p.on("pageerror",e=>issues.push("JS "+String(e.message).slice(0,150)));
p.on("console",m=>{if(m.type()==="error")issues.push("console "+m.text().slice(0,150));});
try{
 const rest=await p.request.get(wp+"/wp-json/wp/v2/pages/83593?_fields=id,slug,status,acf,title,content",{timeout:45000});
 if(!rest.ok())throw Error("WP REST failed HTTP "+rest.status());
 const item=await rest.json();
 if(item.id!==83593||item.slug!=="npk-phu-my"||item.acf?.key!=="pse-historical-npk-1434"||item.acf?.action!=="PublicPage")throw Error("Wrong NPK Page");
 const source=String(item.content?.rendered||"");
 const shape=await p.evaluate(html=>{
  const root=document.createElement("div");root.innerHTML=html;
  const t=[...root.querySelectorAll("table")];
  const imgs=[...root.querySelectorAll("img")];
  return {textLength:root.textContent.length,rootHTMLBytes:html.length,
    firstHTML:html.slice(0,1300),rootChildren:[...root.children].slice(0,14).map(el=>({
      tag:el.tagName,cls:el.className,style:el.getAttribute("style"),
      html:el.outerHTML.slice(0,400)})),
    tables:t.map((el,i)=>({i,style:el.getAttribute("style"),width:el.getAttribute("width"),
      rows:el.rows.length,cellWidths:[...el.querySelectorAll("td")].slice(0,8).map(e=>({w:e.getAttribute("width"),style:e.getAttribute("style")}))})),
    images:imgs.slice(0,25).map((im,i)=>({i,src:im.getAttribute("src"),style:im.getAttribute("style"),
      attrWidth:im.getAttribute("width"),attrHeight:im.getAttribute("height")})),
    imagesCount:imgs.length,cssSelectors:[...root.querySelectorAll("style")].map(e=>e.textContent.slice(0,450)),
    fixedWidthAttributes:root.querySelectorAll("[width]").length,
    fixedWidthStyles:root.querySelectorAll('[style*="width"]').length,
    fixedHeightStyles:root.querySelectorAll('[style*="height"]').length};
 },source);
 console.log("PSE_NPK_WP_SOURCE="+JSON.stringify({id:item.id,slug:item.slug,title:item.title?.rendered,
   cssmoreChars:String(item.acf?.cssmore||"").length,cssmoreExcerpt:String(item.acf?.cssmore||"").slice(0,1100),
   ...shape}).slice(0,23000));
 const wpLinks=await p.evaluate(html=>{
   const root=document.createElement("div");root.innerHTML=html;
   return [...root.querySelectorAll("a[href]")].map((a,i)=>({
     i,text:a.textContent.replace(/\s+/g," ").trim().slice(0,90),
     href:a.getAttribute("href"),image:!!a.querySelector("img")
   }));
 },source);
 console.log("PSE_NPK_WP_LINKS="+JSON.stringify(wpLinks));
 const sourceProductTargets=wpLinks.filter(x=>x.href && /pse\\.vn/i.test(x.href));
 console.log("PSE_NPK_LEGACY_PRODUCT_LINKS="+JSON.stringify({total:sourceProductTargets.length,links:sourceProductTargets}));
  const res=await p.goto(target,{waitUntil:"domcontentloaded",timeout:60000});
  console.log("PSE_NPK_HTTP="+JSON.stringify({http:res?.status(),url:p.url(),title:await p.title()}));
 const geometry=await p.evaluate(()=>{
   const rect=el=>{if(!el)return null;const r=el.getBoundingClientRect();return {
     top:Math.round(r.top),bottom:Math.round(r.bottom),height:Math.round(r.height)};};
   const title=document.querySelector("main header h1");
   const header=document.querySelector("main > header");
   const body=document.querySelector("main .pse-public-body");
   const article=document.querySelector("main .article-content");
   const catalog=article?.querySelector("table");
   const links=[...document.querySelectorAll("main a[href]")].map((a,i)=>({
      i,text:a.textContent.replace(/\s+/g," ").trim().slice(0,85),
      href:a.getAttribute("href"),image:!!a.querySelector("img")
   }));
   const related=[...document.querySelectorAll("main h2")].find(h=>
      h.textContent.includes("Các bài viết khác"));
   return {title:rect(title),header:rect(header),body:rect(body),
     article:rect(article),catalog:rect(catalog),related:rect(related),
     rawLinks:links.filter(x=>/pse\.vn/i.test(x.href)),
     relatedLinks:related?[...(related.closest("section")?.querySelectorAll("a[href]")||[])].map(a=>({
       title:a.textContent.trim(),href:a.getAttribute("href")})):[],
     totalLinks:links.length};
 });
 console.log("PSE_NPK_TITLE_AND_LINKS="+JSON.stringify(geometry));
 // Keep image load behavior reproducible: force lazy media, inspect after they settle.
 await p.locator("main img").evaluateAll(imgs=>imgs.forEach(im=>im.loading="eager"));
 await p.waitForTimeout(1500);
 for(const width of [1440,1240,1024,768,390]){
   await p.setViewportSize({width,height:900});
   await p.waitForTimeout(350);
   const data=await p.evaluate(()=>{
     const win=innerWidth;
     const article=document.querySelector("main .article-content"),main=document.querySelector("main");
     const bounds=el=>{const r=el.getBoundingClientRect();const cs=getComputedStyle(el);return {
       tag:el.tagName.toLowerCase(),cls:String(el.className||"").slice(0,100),
       x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),
       right:Math.round(r.right),scrollW:el.scrollWidth,
       display:cs.display,overflowX:cs.overflowX,
       minWidth:cs.minWidth,maxWidth:cs.maxWidth,width:cs.width}};
     const tables=article?[...article.querySelectorAll("table")].map((t,i)=>({
       i,...bounds(t),rows:t.rows.length,
       cells:[...t.rows].slice(0,4).map(row=>[...row.cells].slice(0,6).map(td=>({
         ...bounds(td),txt:td.textContent.replace(/\s+/g," ").trim().slice(0,75),
         style:td.getAttribute("style"),attrWidth:td.getAttribute("width")})))})):[];
     const imgs=article?[...article.querySelectorAll("img")].map((im,i)=>({
       i,...bounds(im),src:(im.currentSrc||im.src).slice(0,160),
       naturalW:im.naturalWidth,naturalH:im.naturalHeight,complete:im.complete,
       cssMaxHeight:getComputedStyle(im).maxHeight,
       style:im.getAttribute("style"),attrW:im.getAttribute("width"),attrH:im.getAttribute("height")})):[];
     const overflow=[...main.querySelectorAll("*")].filter(el=>{
       const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
       return r.height>0&&r.width>0&&cs.display!=="none"&&(r.right>win+18||r.left<-18||r.width>win+18);
     }).sort((a,b)=>b.getBoundingClientRect().right-a.getBoundingClientRect().right)
       .slice(0,16).map(el=>({...bounds(el),txt:el.textContent.replace(/\s+/g," ").trim().slice(0,90),style:el.getAttribute("style")?.slice(0,120)}));
     const text=(article?.innerText||"").replace(/\s+/g," ").trim();
     return {viewport:win,scrollWidth:document.documentElement.scrollWidth,
       bodyScrollW:document.body.scrollWidth,
       h1:main.querySelector("h1")?.textContent?.trim(),
       article:article?bounds(article):null,
       excerpt:text.slice(0,500),
       children:article?[...article.children].slice(0,15).map(bounds):[],
       tables,images:imgs.slice(0,24),overflow,
       cssmore:article?.querySelector("style")?.textContent.slice(0,400)||null};
   });
   console.log("PSE_NPK_LAYOUT_"+width+"="+JSON.stringify(data).slice(0,30000));
   if(width===1240||width===390)await p.screenshot({path:"artifacts/npk-1434-layout/npk-"+width+".png",fullPage:true});
 }
 console.log("PSE_NPK_ERRORS="+JSON.stringify(issues.slice(0,15)));
 console.log("PSE_NPK_LAYOUT_DIAGNOSTIC=PASS read_only=true");
}finally{await browser.close();}
