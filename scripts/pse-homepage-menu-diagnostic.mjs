import {chromium} from "playwright";
import {mkdir} from "node:fs/promises";
const entry=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,"")).filter(x=>x.startsWith("WC_URL_CLIENT="));
if(entry.length!==1)throw Error("Missing PSE client origin");
const url=new URL(entry[0].slice(14).trim().replace(/^['"]|['"]$/g,""));
if(url.protocol!=="https:"||url.username||url.password||!["","/"].includes(url.pathname))throw Error("Unexpected origin");
const browser=await chromium.launch({headless:true});
const dir="artifacts/pse-menu-diagnostic";await mkdir(dir,{recursive:true});
const rect=e=>{const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}};
try{
 for(const width of [1120,1440,1920]){
  const page=await browser.newPage({viewport:{width,height:950}});
  try {
   await page.goto(url.origin+"/",{waitUntil:"domcontentloaded",timeout:60000});
   const roots=page.locator('#desktop-menu [data-menu-trigger]');
   const labels=await roots.allTextContents();
   const investor=roots.filter({hasText:/quan hệ nhà đầu tư/i}).first();
   if(!await investor.count())throw Error("Investor trigger missing; available="+JSON.stringify(labels));
   await investor.click();
   await page.waitForTimeout(350);
   const id=await investor.getAttribute("aria-controls");
   const panel=page.locator('[id="'+id+'"]');
   const diag=await page.evaluate(id=>{
      const text=e=>(e?.textContent||"").replace(/\s+/g," ").trim().slice(0,100);
      const rect=e=>{const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}};
      const root=document.getElementById(id);
      if(!root)return {error:"No panel"};
      const els=[...root.querySelectorAll("a,button,[data-menu-panel],[data-submenu-panel]")];
      return {root:{id,rect:rect(root),htmlSample:root.outerHTML.slice(0,1300),className:root.className},
       controls:els.slice(0,35).map(e=>({tag:e.tagName,text:text(e),dataMenuTrigger:e.hasAttribute("data-submenu-trigger"),dataPanel:e.hasAttribute("data-submenu-panel"),hidden:e.hidden,rect:rect(e),id:e.id||"",aria:e.getAttribute("aria-expanded")}))
      }
   },id);
   console.log("PSE_INVESTOR_MENU_DIAGNOSTIC="+JSON.stringify({width,labels,diag}));
   const sub=panel.locator('[data-submenu-trigger]').first();
   if(await sub.count()){
    await sub.click();
    await page.waitForTimeout(350);
    const t=await page.evaluate(()=>{
      const all=[...document.querySelectorAll("#desktop-menu [data-menu-panel],#desktop-menu [data-submenu-panel]")].filter(x=>!x.hidden);
      return all.map(e=>({id:e.id,text:(e.textContent||"").replace(/\s+/g," ").trim().slice(0,110),rect:(()=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()}));
    });
    console.log("PSE_INVESTOR_EXPANDED_DIAGNOSTIC="+JSON.stringify({width,panels:t}));
   }
   await page.screenshot({path:dir+"/investor-"+width+".png",fullPage:false});
  }finally{await page.close()}
 }
}finally{await browser.close()}
