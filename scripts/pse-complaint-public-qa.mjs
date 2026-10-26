/** Public complaint page QA only. No form submission, no email. */
import {chromium} from "playwright";
import {mkdir} from "node:fs/promises";
const entries=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,"")).filter(x=>x.startsWith("WC_URL_CLIENT="));
if(entries.length!==1)throw Error("Frontend origin missing or duplicate");
const base=new URL(entries[0].slice(14).replace(/^['"]|['"]$/g,""));
if(base.protocol!=="https:"||!base.hostname||base.username||base.password||base.search||base.hash||!["","/"].includes(base.pathname))throw Error("Unsafe frontend origin");
const url=base.origin+"/xu-ly-khieu-nai-y-kien-khach-hang";
const wpLine=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,"")).find(x=>x.startsWith("WC_URL="));
if(!wpLine)throw Error("Missing private WordPress origin");
const privateHost=new URL(wpLine.slice(7).replace(/^['"]|['"]$/g,"")).hostname;
await mkdir("artifacts/pse-complaint-live",{recursive:true});
const browser=await chromium.launch({headless:true});
const failures=[];
try {
 for(const width of [390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  const errors=[];
  page.on("pageerror",e=>errors.push(String(e).slice(0,140)));
  try{
   const res=await page.goto(url,{waitUntil:"domcontentloaded",timeout:60000});
   const out=await page.evaluate((privateHost)=>{
    const main=document.querySelector("#main-content");
    const form=main?.querySelector("#pse-complaint-form");
    const fields=["name","email","phone","address","product","subject","complaints"];
    const required=fields.every(x=>Boolean(form?.querySelector('[name="'+x+'"][required]')));
    const h1=[...document.querySelectorAll("main h1")].map(x=>x.textContent?.trim());
    const submit=main?.querySelector("#pse-complaint-submit");
    const security=main?.querySelector("#pse-complaint-turnstile");
    const header=document.querySelector(".pse-header");
    const footer=document.querySelector(".pse-footer");
    return {h1,main:!!main,form:!!form,fieldsRequired:required,submitDisabled:submit?.disabled===true,security:!!security,
     header:!!header,footer:!!footer,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+3,
     adminHostLeak:document.documentElement.outerHTML.includes(privateHost),
     menuLinked:[...document.querySelectorAll(".pse-header a[href]")].some(a=>{
       if(!/xử lý khiếu nại/i.test(a.textContent||""))return false;
       try{return new URL(a.href).pathname.replace(/\/+$/,"")==="/xu-ly-khieu-nai-y-kien-khach-hang"}
       catch{return false}
     }),
     hasContent:(main?.textContent||"").length>200};
   },privateHost);
   const ok=res?.status()===200&&out.main&&out.form&&out.fieldsRequired&&out.h1.length===1&&out.security&&out.header&&out.footer&&out.menuLinked
    &&!out.overflow&&!out.adminHostLeak&&out.hasContent&&errors.length===0;
   console.log("PSE_COMPLAINT_PUBLIC_QA="+JSON.stringify({width,http:res?.status()||0,...out,pageErrors:errors,pass:ok}));
   if(!ok)failures.push({width,http:res?.status()||0});
   if(res?.status()===200)await page.screenshot({path:"artifacts/pse-complaint-live/"+width+".png",fullPage:true});
  }catch(e){failures.push({width,error:String(e).slice(0,120)})}
  finally{await page.close()}
 }
 console.log("PSE_COMPLAINT_PUBLIC_SUMMARY="+JSON.stringify({checks:3,failures,readOnly:true,noEmail:true}));
 if(failures.length)process.exitCode=1;
}finally{await browser.close()}
