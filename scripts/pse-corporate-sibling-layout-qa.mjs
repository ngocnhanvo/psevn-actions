import { chromium } from "playwright";

// Read-only, derive every sibling from the real rendered WordPress Header menu.
const line=String(process.env.ENV_FILE||"").split(/\r?\n/)
  .map(s=>s.trim().replace(/^export\s+/,""))
  .find(s=>s.startsWith("WC_URL_CLIENT="));
if(!line)throw Error("Missing deployed frontend origin");
const url=new URL(line.slice("WC_URL_CLIENT=".length).replace(/^['"]|['"]$/g,""));
if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||
  !["","/"].includes(url.pathname))throw Error("Invalid configured frontend URL");
const base=url.origin;
const browser=await chromium.launch({headless:true});
let checks=0,failures=0;
try {
  const menuPage=await browser.newPage({viewport:{width:1440,height:900}});
  let menuLinks=[];
  try {
    const response=await menuPage.goto(base+"/",{waitUntil:"domcontentloaded",timeout:60000});
    if(response?.status()!==200)throw Error("Homepage is not 200");
    const trigger=menuPage.locator("#desktop-menu button[data-menu-trigger]")
      .filter({hasText:/PVFCCo-PSE/i}).first();
    if(!await trigger.count())throw Error("PVFCCo-PSE menu missing");
    await trigger.click();
    const id=await trigger.getAttribute("aria-controls");
    if(!id)throw Error("Missing menu panel");
    menuLinks=await menuPage.locator('[id="'+id+'"] a[href]').evaluateAll((anchors,base)=>{
      const seen=new Set();
      return anchors.flatMap(a=>{
        try {
          const url=new URL(a.href);
          const slug=url.pathname.split("/").filter(Boolean).join("/");
          if(url.origin!==base||!slug||slug.includes("/")||seen.has(slug))return [];
          seen.add(slug);
          return [{slug,href:url.pathname,label:(a.textContent||"").trim()}];
        } catch {return []}
      });
    },base);
    if(menuLinks.length<2)throw Error("No sibling menu order available on frontend");
  } finally {await menuPage.close()}

  for(const width of [1440,390]) {
    const context=await browser.newContext({viewport:{width,height:900}});
    const page=await context.newPage();
    try {
      for(let i=0;i<menuLinks.length;i++) {
        const item=menuLinks[i];
        const response=await page.goto(base+item.href,{waitUntil:"domcontentloaded",timeout:60000});
        const actual=await page.evaluate(()=>{
          const main=document.querySelector("#main-content.pse-public-page");
          const related=main?.querySelector("[data-pse-menu-related]");
          const hrefs=[...(related?.querySelectorAll("li a[href]")||[])].map(a=>new URL(a.href).pathname);
          return {
            h1:main?.querySelectorAll("h1").length||0,
            introCount:main?.querySelectorAll(":scope > header p").length||0,
            related:!!related,
            hrefs,
            prev:related?.querySelector("[data-pse-menu-previous]")?.getAttribute("href")||"",
            next:related?.querySelector("[data-pse-menu-next]")?.getAttribute("href")||"",
            disabled:related?.querySelectorAll('[aria-disabled="true"]').length||0,
            overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+3,
          };
        });
        const expectedRelated=menuLinks.filter((_,j)=>j!==i).map(x=>x.href);
        const expectedPrev=i>0?menuLinks[i-1].href:"";
        const expectedNext=i+1<menuLinks.length?menuLinks[i+1].href:"";
        const ok=response?.status()===200&&actual.h1===1&&actual.introCount===0&&
          actual.related&&JSON.stringify(actual.hrefs)===JSON.stringify(expectedRelated)&&
          actual.prev===expectedPrev&&actual.next===expectedNext&&
          actual.disabled===(i===0||i===menuLinks.length-1?1:0)&&!actual.overflow;
        checks++;if(!ok)failures++;
        console.log("PSE_COMPANY_SIBLING_LIVE="+JSON.stringify({
          width,slug:item.slug,http:response?.status()||0,...actual,
          expectedPrev,expectedNext,expectedRelated:expectedRelated.length,ok
        }));
      }
    } finally {await context.close()}
  }
  console.log("PSE_COMPANY_SIBLING_SUMMARY="+JSON.stringify({
    checks,failures,menuItems:menuLinks.length,readOnly:true,
  }));
  if(failures||checks!==menuLinks.length*2)process.exitCode=1;
}finally{await browser.close()}
