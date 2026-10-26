/** READ ONLY — validate WordPress Admin renders hotline/FAQ from the same ESC Table and cssmore as Astro. */
import {chromium} from "playwright";
import {mkdir} from "node:fs/promises";
const list=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,"")).filter(s=>s.startsWith("WC_URL="));
if(list.length!==1)throw Error("WP origin not configured");
const url=new URL(list[0].slice(7).replace(/^['"]|['"]$/g,""));
if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||!["","/"].includes(url.pathname))throw Error("Unsafe WP URL");
const specs=[
 {id:80932,kind:"hotline",table:"pse_hotline_vi",count:3,marker:"PSE_HOTLINE_CMS_LAYOUT_V1",selector:".pse-hotline__card"},
 {id:80930,kind:"faq",table:"pse_faq_vi",count:15,marker:"PSE_FAQ_CMS_LAYOUT_V1",selector:".pse-faq__item"}
];
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1520,height:1000},deviceScaleFactor:1});
 if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("WP Admin secret missing");
 await page.goto(url.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
   await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
   await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
   const t=await page.locator("body").innerText();
   const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
   if(m){const a=+m[1],b=+m[3],ans=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
     const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
     if(!(await f.count()))throw Error("WP login challenge unavailable");await f.fill(String(ans));
   }
   await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WP login rejected");
 await mkdir("artifacts/pse-support-admin-preview",{recursive:true});
 for(const spec of specs){
   await page.goto(url.origin+"/wp-admin/post.php?post="+spec.id+"&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
   await page.locator("#pse-support-editor-preview").waitFor({state:"visible",timeout:15000});
   await page.waitForFunction(()=>Boolean(document.querySelector("#pse-support-preview-frame")?.getAttribute("srcdoc")||
     document.querySelector("#pse-support-preview-status")?.classList.contains("is-error")),null,{timeout:30000});
   const s=await page.evaluate(()=>({
     error:document.querySelector("#pse-support-preview-status")?.classList.contains("is-error"),
     message:document.querySelector("#pse-support-preview-status")?.textContent,
     editor:document.querySelector("#content")?.value,
     srcdoc:document.querySelector("#pse-support-preview-frame")?.getAttribute("srcdoc")||""
   }));
   if(s.error)throw Error("CMS preview "+spec.kind+" failed: "+s.message);
   if(!s.srcdoc.includes(spec.marker)||!s.srcdoc.includes('data-'+(spec.kind==="faq"?"pse-faq":"pse-hotline")+'-source='))throw Error("Admin CSS/ESC source missing "+spec.kind);
   if(!String(s.editor||"").includes("[table id="+spec.table+" /]"))throw Error("Editor native shortcode missing "+spec.kind);
   const f=page.frameLocator("#pse-support-preview-frame");
   if(await f.locator(spec.selector).count()!==spec.count)throw Error("Wrong ESC item count in Admin "+spec.kind);
   if(spec.kind==="faq"){
     if(await f.locator("summary").count()!==15)throw Error("FAQ summaries missing");
     await f.locator("summary").nth(1).click();
     if(!await f.locator(".pse-faq__item").nth(1).evaluate(e=>e.open))throw Error("FAQ native accordion did not open");
   }else{
     if(await f.locator('a[href^="tel:"]').count()!==3)throw Error("Hotline links missing");
   }
   await page.locator("#pse-support-preview-width").selectOption("mobile");
   await page.waitForTimeout(250);
   const size=await page.locator("#pse-support-preview-frame").evaluate(e=>Math.round(e.getBoundingClientRect().width));
   if(size!==390)throw Error("Admin mobile viewport not 390px");
   const overflow=await f.locator("html").evaluate(e=>e.scrollWidth>e.clientWidth+4);
   if(overflow)throw Error("Admin mobile horizontal overflow "+spec.kind);
   await page.screenshot({path:"artifacts/pse-support-admin-preview/"+spec.kind+"-admin.png",fullPage:true});
   console.log("PSE_SUPPORT_ADMIN_PREVIEW="+JSON.stringify({kind:spec.kind,pageId:spec.id,table:spec.table,items:spec.count,cssMarker:spec.marker,mobileWidth:size,mobileOverflow:overflow,pass:true,readOnly:true}));
 }
 console.log("PSE_SUPPORT_ADMIN_PREVIEW_QA=PASS pages=2 native_esc=true cssmore=true no_astro_build=true");
}finally{await browser.close()}
