/** Read-only frontend/browser parity after PHP-controlled Astro deployment. */
import {chromium} from "playwright";
import {mkdir} from "node:fs/promises";
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const hits=env.filter(x=>x.startsWith("WC_URL_CLIENT="));
if(hits.length!==1)throw Error("Missing frontend base URL");
const u=new URL(hits[0].slice(14).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid frontend URL");
await mkdir("artifacts/pse-support-live-qa",{recursive:true});
const browser=await chromium.launch({headless:true});const failures=[];
try{
 for(const viewport of [{width:390,height:900},{width:768,height:950},{width:1440,height:950}]){
  const page=await browser.newPage({viewport,deviceScaleFactor:1});
  const errors=[];
  page.on("pageerror",e=>errors.push(String(e).slice(0,170)));
  try{
   for(const spec of [{slug:"duong-day-nong",kind:"hotline",expected:3},{slug:"hoi-dap",kind:"faq",expected:15}]){
    const res=await page.goto(u.origin+"/"+spec.slug,{waitUntil:"domcontentloaded",timeout:60000});
    await page.waitForLoadState("networkidle",{timeout:9000}).catch(()=>{});
    const found=await page.evaluate(spec=>{
     const main=document.querySelector("#main-content");
     const root=main?.querySelector(spec.kind==="faq"?"[data-pse-faq-source='esc-table']":"[data-pse-hotline-source='esc-table']");
     const nodes=root?[...root.querySelectorAll(spec.kind==="faq"?".pse-faq__item":".pse-hotline__card")]:[];
     const h1=[...main?.querySelectorAll("h1")||[]].map(x=>x.textContent?.trim());
     const overflow=document.documentElement.scrollWidth>document.documentElement.clientWidth+4;
     const links=spec.kind==="faq"?[...root?.querySelectorAll("a[href]")||[]]:[...root?.querySelectorAll("a[href^='tel:']")||[]];
     return{root:!!root,count:nodes.length,h1,overflow,links:links.length,editorAccordion:!!main?.querySelector(".accordionfaq"),legacyTables:main?.querySelectorAll(".article-content table").length||0,
      details:spec.kind==="faq"?nodes.map(x=>({summary:!!x.querySelector("summary"),textLength:(x.querySelector(".pse-faq__answer")?.textContent||"").trim().length})):[],
      phoneNumbers:spec.kind==="hotline"?nodes.map(x=>({phone:x.querySelector("a[href^='tel:']")?.textContent?.trim(),href:x.querySelector("a[href^='tel:']")?.getAttribute("href")})):[]};
    },spec);
    if(spec.kind==="faq"&&found.root){await page.locator(".pse-faq__item").nth(1).locator("summary").click();
      found.secondOpen=await page.locator(".pse-faq__item").nth(1).evaluate(el=>el.open)}
    const ok=res?.status()===200&&found.root&&found.count===spec.expected&&found.h1.length===1&&!found.overflow&&!found.editorAccordion&&
      (spec.kind==="faq"?found.details.every(x=>x.summary&&x.textLength>10)&&found.secondOpen:found.phoneNumbers.every(x=>x.phone&&x.href?.startsWith("tel:")));
    console.log("PSE_SUPPORT_LIVE="+JSON.stringify({width:viewport.width,slug:spec.slug,status:res?.status(),pass:ok,...found,errors}));
    if(!ok||errors.length)failures.push({width:viewport.width,slug:spec.slug,pass:ok,errors});
    if(res?.status()===200&&[390,1440].includes(viewport.width))await page.screenshot({path:"artifacts/pse-support-live-qa/"+spec.slug+"-"+viewport.width+".png",fullPage:true});
   }
  }finally{await page.close()}
 }
 console.log("PSE_SUPPORT_LIVE_QA_SUMMARY="+JSON.stringify({checks:6,failures,readOnly:true}));
 if(failures.length)process.exitCode=1;
}finally{await browser.close()}
