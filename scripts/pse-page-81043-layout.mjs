/** PSE 81043: read-only source/layout evidence. No WordPress save or Astro build. */
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
const lines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const value=key=>{
  const values=lines.filter(s=>s.startsWith(key+"="));
  if(values.length!==1)throw Error("Missing PSE configuration "+key);
  return values[0].slice(key.length+1).replace(/^['"]|['"]$/g,"");
};
const wp=new URL(value("WC_URL"));
if(wp.protocol!=="https:"||wp.username||wp.password||!["","/"].includes(wp.pathname)||wp.search||wp.hash)
  throw Error("Unsafe WP origin");
const frontend=new URL(value("WC_URL_CLIENT"));
if(frontend.protocol!=="https:"||frontend.username||frontend.password)throw Error("Unsafe frontend origin");
const sha=s=>createHash("sha256").update(String(s||"")).digest("hex");
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900}});
const page=await context.newPage();
try{
  const user=process.env.WP_ADMIN_USERNAME, pass=process.env.WP_ADMIN_PASSWORD;
  if(!user||!pass)throw Error("PSE WordPress credentials unavailable");
  await page.goto(wp.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
  if(await page.locator("#user_login").count()){
    await page.locator("#user_login").fill(user);await page.locator("#user_pass").fill(pass);
    const body=await page.locator("body").innerText();
    const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if(m){
      const a=Number(m[1]),b=Number(m[3]),v=({"+":a+b,"-":a-b,"x":a*b,"×":a*b,"*":a*b})[m[2]];
      const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if(!await f.count())throw Error("Unrecognized WP login challenge");
      await f.fill(String(v));
    }
    await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
  }
  if(page.url().includes("wp-login"))throw Error("WP login rejected");
  const nonce=await page.evaluate(async()=>{
    if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
    const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
    if(!r.ok)throw Error("REST nonce HTTP "+r.status);
    const n=(await r.text()).trim();
    if(!/^[a-zA-Z0-9]{8,24}$/.test(n)||n==="0")throw Error("REST nonce invalid");
    return n;
  });
  const get=async route=>page.evaluate(async({route,nonce})=>{
    const r=await fetch(route,{credentials:"same-origin",headers:{Accept:"application/json","X-WP-Nonce":nonce}});
    return {http:r.status,payload:await r.json().catch(()=>null)};
  },{route,nonce});
  const types=await get("/wp-json/wp/v2/types?context=edit");
  if(types.http!==200||!types.payload)throw Error("Cannot inspect WP post types");
  const candidates=[...new Set(Object.values(types.payload).map(v=>v.rest_base).filter(x=>typeof x==="string"&&/^[a-z0-9_-]+$/.test(x)))];
  const matches=[];
  for(const base of candidates){
    const response=await get("/wp-json/wp/v2/"+base+"/81043?context=edit");
    if(response.http===200&&response.payload?.id===81043)matches.push({base,data:response.payload});
  }
  if(matches.length!==1)throw Error("Expected exactly one WP record 81043, found "+matches.length+" (REST bases: "+candidates.join(",")+")");
  const {base,data}=matches[0],html=String(data.content?.raw||"");
  if(!html.trim())throw Error("WP 81043 content is empty");
  const shape=await page.evaluate(html=>{
    const root=document.createElement("div");root.innerHTML=html;
    const tag=e=>e.tagName.toLowerCase();
    const norm=e=>(e.textContent||"").replace(/[\s\u00a0\u200b\ufeff]+/g," ").trim();
    const tables=[...root.querySelectorAll("table")].map((t,i)=>{
      const ownRows=[...t.querySelectorAll("tr")].filter(r=>r.closest("table")===t);
      const cells=ownRows.flatMap(r=>[...r.children].filter(x=>/^(TH|TD)$/.test(x.tagName)));
      return {index:i,depth:(()=>{let d=0,p=t.parentElement;while(p&&p!==root){if(p.tagName==="TABLE")d++;p=p.parentElement}return d})(),
        width:t.getAttribute("width"),height:t.getAttribute("height"),
        inlineStyle:t.getAttribute("style"),attrs:{cellspacing:t.getAttribute("cellspacing"),cellpadding:t.getAttribute("cellpadding")},
        rows:ownRows.length,cells:cells.length,emptyRows:ownRows.filter(r=>!norm(r)&&!r.querySelector("img,video,iframe,a,svg")).length,
        cellWidths:cells.map(c=>c.getAttribute("width")||c.style.width).filter(Boolean).slice(0,20),
        cellHeights:cells.map(c=>c.getAttribute("height")||c.style.height).filter(Boolean).slice(0,20),
        firstRows:ownRows.slice(0,4).map(r=>[...r.children].filter(x=>/^(TD|TH)$/.test(x.tagName)).map(c=>({
          text:norm(c).slice(0,110),colspan:c.getAttribute("colspan"),rowspan:c.getAttribute("rowspan"),
          width:c.getAttribute("width")||c.style.width,height:c.getAttribute("height")||c.style.height
        }))),
        firstHTML:t.outerHTML.slice(0,450)};
    });
    const block=[...root.children].map((n,i)=>({i,tag:tag(n),className:n.className||"",style:n.getAttribute("style"),
      text:norm(n).slice(0,130),htmlLen:n.outerHTML.length})).slice(0,35);
    const paragraphs=[...root.querySelectorAll("p")];
    return {textLength:norm(root).length,topBlocks:block,tables,
      spacerParagraphs:paragraphs.filter(p=>!norm(p)&&!p.querySelector("img,video,iframe,svg")).length,
      inlineFixedHeights:root.querySelectorAll('[style*="height"],[height]').length,
      imageCount:root.querySelectorAll("img").length,
      headingCount:root.querySelectorAll("h1,h2,h3").length};
  },html);
  const summary={id:81043,base,type:data.type,status:data.status,slug:data.slug,title:data.title?.raw||data.title?.rendered,
    link:data.link,acf:data.acf||{},rawLength:html.length,rawSha256:sha(html),shape};
  console.log("PSE_81043_SOURCE_LAYOUT="+JSON.stringify(summary).slice(0,27000));
  await mkdir("artifacts/pse-page-81043",{recursive:true});
  await writeFile("artifacts/pse-page-81043/source-backup.json",JSON.stringify({
    id:81043,base,sha256:sha(html),rawContent:html,metadata:{slug:data.slug,title:summary.title,acf:data.acf,status:data.status}
  },null,2));
  await writeFile("artifacts/pse-page-81043/audit.json",JSON.stringify(summary,null,2));
  const publicCandidates=[data.slug, String(data.acf?.key||"")].filter(x=>/^[a-z0-9-]+$/.test(x));
  for(const slug of publicCandidates){
    const site=await context.newPage({viewport:{width:1440,height:900}});
    try{
      const response=await site.goto(frontend.origin+"/"+slug,{waitUntil:"domcontentloaded",timeout:45000});
      const snapshot=await site.evaluate(()=>{
        const article=document.querySelector(".pse-public-body .article-content");
        return {title:document.title,headings:[...document.querySelectorAll("main h1")].map(e=>e.textContent.trim()),
          hasArticle:!!article,tableCount:article?.querySelectorAll("table").length||0,
          contentLength:article?.textContent?.trim().length||0,
          viewportOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+3,
          tableRects:[...article?.querySelectorAll("table")||[]].slice(0,8).map(t=>({
            w:Math.round(t.getBoundingClientRect().width),h:Math.round(t.getBoundingClientRect().height),
            scrollWidth:t.scrollWidth,display:getComputedStyle(t).display,layout:getComputedStyle(t).tableLayout
          }))};
      });
      console.log("PSE_81043_PUBLIC_CANDIDATE="+JSON.stringify({slug,http:response?.status(),...snapshot}));
    }finally{await site.close()}
  }
}finally{await browser.close()}
