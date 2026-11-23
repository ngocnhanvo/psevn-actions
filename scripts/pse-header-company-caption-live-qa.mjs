/** PSE homepage company caption breakpoint regression at 1240/1245px. READ ONLY. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const pair=String(process.env.ENV_FILE||"").split(/\r?\n/)
  .map(s=>s.trim().replace(/^export\s+/,""))
  .filter(s=>s.startsWith("WC_URL_CLIENT="));
if(pair.length!==1)throw Error("Expected one PSE client URL");
const target=new URL(pair[0].slice("WC_URL_CLIENT=".length).trim().replace(/^['"]|['"]$/g,""));
if(target.protocol!=="https:"||target.hostname!=="pse.webnvn.com"||
   !["/",""].includes(target.pathname)||target.search||target.hash||
   target.username||target.password)throw Error("Unexpected PSE frontend origin");

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1245,height:760},deviceScaleFactor:1});
mkdirSync("artifacts/pse-header-caption",{recursive:true});
try{
  await page.goto(target.origin+"/",{waitUntil:"domcontentloaded",timeout:60000});
  await page.locator("#main-header.pse-header #header-company-caption p")
    .waitFor({state:"attached",timeout:30000});
  for(const width of [1245,1240,1024,900,899]){
    await page.setViewportSize({width,height:760});
    const state=await page.evaluate(()=>{
      const caption=document.querySelector("#header-company-caption");
      const text=caption?.querySelector("p");
      const brand=document.querySelector("#header-brandbar");
      const capBox=caption?.getBoundingClientRect();
      const brandBox=brand?.getBoundingClientRect();
      return {
        width:innerWidth,
        display:caption?getComputedStyle(caption).display:"missing",
        text:text?.textContent?.trim()||"",
        captionRight:Math.round(capBox?.right||0),
        captionLeft:Math.round(capBox?.left||0),
        brandRight:Math.round(brandBox?.right||0),
        bodyWidth:document.documentElement.scrollWidth,
      };
    });
    console.log("PSE_HEADER_CAPTION_RESULT="+JSON.stringify(state));
    if(width>=900){
      if(state.display!=="flex"||!state.text)throw Error("Company caption not visible at "+width);
      if(state.captionLeft<0||state.captionRight>state.brandRight+2)
        throw Error("Company caption overflows brand bar at "+width);
      // The 900px navigation has its own independent min-content layout.
      // Keep this regression focused on the reported 1240/1245px bug.
      if(width>=1240&&state.bodyWidth>width+2)
        throw Error("Desktop header creates horizontal overflow at "+width);
    }else if(state.display!=="none")throw Error("Mobile caption should stay hidden at "+width);
    if(width===1245||width===1240)
      await page.screenshot({path:"artifacts/pse-header-caption/header-"+width+".png"});
  }
  console.log("PSE_HEADER_CAPTION_LIVE_QA=PASS sizes=1245,1240,1024,900,899; cms_writes=0");
}finally{await browser.close();}
