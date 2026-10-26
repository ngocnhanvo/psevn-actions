/** Read-only post-deploy footer acceptance checks for authenticated-origin PSE release. */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
const rows=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const values=rows.filter(x=>x.startsWith("WC_URL_CLIENT="));
if(values.length!==1)throw Error("Frontend origin missing");
const u=new URL(values[0].slice("WC_URL_CLIENT=".length).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid frontend origin");
const browser=await chromium.launch({headless:true});
await mkdir("artifacts/pse-footer-postdeploy",{recursive:true});
const results=[];
try{
 for(const viewport of [{width:1440,height:900},{width:768,height:1024},{width:390,height:844}]){
  for(const path of ["/","/lien-he"]){
   const p=await browser.newPage({viewport});
   try{
    const response=await p.goto(u.origin+path,{waitUntil:"domcontentloaded",timeout:65000});
    if(!response||response.status()>=400)throw Error("Public request failed: "+path+" HTTP "+response?.status());
    await p.locator("#footer-contact").waitFor({state:"visible",timeout:45000});
    await p.evaluate(()=>document.querySelectorAll("#footer-contact img").forEach(img=>{img.loading="eager"}));
    await p.waitForFunction(()=>[...document.querySelectorAll("#footer-contact img")].every(img=>img.complete && img.naturalWidth>0),null,{timeout:35000});
    const state=await p.evaluate(()=>{
     const f=document.querySelector("#footer-contact"),s=getComputedStyle(f);
     const x=f.querySelector("h2#footer-company-title");
     return {
      count:document.querySelectorAll("#footer-contact").length,
      company:x?.textContent?.trim()||"",
      background:s.backgroundColor,topBorder:s.borderTopWidth,
      hasDefinitionList:Boolean(f.querySelector("dl")),
      faxLabels:[...f.querySelectorAll("dt")].filter(x=>/Fax/i.test(x.textContent||"")).length,
      certificationImages:[...f.querySelectorAll("#footer-cert-title ~ div img")].length,
      badgeImages:[...f.querySelectorAll('img[alt*="Bộ Công Thương"]')].length,
      certOneRow:(()=>{const tops=[...f.querySelectorAll("#footer-cert-title + div > div")].map(x=>x.getBoundingClientRect().top);return tops.length===3 && Math.max(...tops)-Math.min(...tops)<4})(),
      invalidLinks:[...f.querySelectorAll("a[href]")].map(x=>x.getAttribute("href")).filter(x=>!x||/^javascript:/i.test(x)),
      imageNoAlt:[...f.querySelectorAll("img")].filter(x=>!x.hasAttribute("alt")).length,
      overflow:document.documentElement.scrollWidth-window.innerWidth
     };
    });
    if(state.count!==1||!state.company||!state.hasDefinitionList||state.topBorder==="0px"||
       state.certificationImages!==3||state.badgeImages!==1||!state.certOneRow||
       state.invalidLinks.length||state.imageNoAlt||state.overflow>2)throw Error("Footer visual contract failed "+JSON.stringify({path,viewport,state}));
    await p.screenshot({path:"artifacts/pse-footer-postdeploy/"+(path==="/"?"home":"contact")+"-"+viewport.width+".png",fullPage:true});
    results.push({path,viewport:viewport.width,...state});
    console.log("PSE_FOOTER_PUBLIC_QA=PASS "+JSON.stringify({path,width:viewport.width,images:state.certificationImages,bct:state.badgeImages,oneRow:state.certOneRow,overflow:state.overflow}));
   }finally{await p.close()}
  }
 }
 console.log("PSE_FOOTER_PUBLIC_QA=PASS; scenarios="+results.length+"; read_only=true");
}finally{await browser.close();}
