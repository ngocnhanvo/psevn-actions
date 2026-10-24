/** Verified original PSE fertilizer guides (7 documents) - read only, no WordPress mutations. */
import {chromium} from "playwright";
import {createHash} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
const url="https://www.pse.vn/hoat-dong-kinh-doanh/san-pham/huong-dan-su-dung-phan-bon.html";
const browser=await chromium.launch({headless:true});const p=await browser.newPage({viewport:{width:1440,height:900}});
try{
 const response=await p.goto(url,{waitUntil:"domcontentloaded",timeout:65000});
 if(response?.status()!==200)throw Error("Original Joomla fertilizer guidance HTTP "+response?.status());
 const files=await p.evaluate(()=>{
  const root=document.querySelector(".item-page [itemprop=articleBody]");
  if(!root)throw Error("Joomla fertilizer document articleBody missing");
  const table=root.querySelector("table");if(!table)throw Error("Guide document table missing");
  return [...table.querySelectorAll("tr")].map((row,index)=>{
   const a=row.querySelector("a[href]");if(!a)return null;
   const link=new URL(a.getAttribute("href"),location.href);
   const cells=[...row.children].filter(x=>x.tagName==="TD"||x.tagName==="TH");
   const label=(cells[0]?.textContent||row.textContent||"").replace(/\s+/g," ").trim();
   return {index,label,url:link.href,pathname:link.pathname,originalLinkText:(a.textContent||"").replace(/\s+/g," ").trim()};
  }).filter(Boolean);
 });
 const unique=new Set();const audited=[];
 for(const item of files){
  const u=new URL(item.url);
  if(u.protocol!=="https:"||!["www.pse.vn","pse.vn"].includes(u.hostname)||!/^\/.*\.(?:pdf|docx?|xlsx?)(?:$)/i.test(u.pathname))throw Error("Unverified original download URL "+item.url);
  if(!item.label||item.label.length>155||unique.has(item.url))throw Error("Ambiguous original source document label/link");
  unique.add(item.url);
  const res=await browser.request.get(item.url,{timeout:70000});
  if(!res.ok())throw Error("Original file download HTTP "+res.status()+" "+item.label);
  const content=await res.body();const ext=u.pathname.split(".").at(-1).toLowerCase();
  if(content.length<100||content.length>35000000)throw Error("Unexpected file size "+item.label);
  if(ext==="pdf"&&content.toString("ascii",0,5)!=="%PDF-")throw Error("Invalid PDF file header "+item.label);
  if(["docx","xlsx"].includes(ext)&&content.toString("ascii",0,2)!=="PK")throw Error("Invalid Office ZIP "+item.label);
  if(ext==="doc"&&!content.subarray(0,8).equals(Buffer.from([208,207,17,224,161,177,26,225])))throw Error("Invalid Office DOC "+item.label);
  const sha=createHash("sha256").update(content).digest("hex");
  const record={...item,format:ext,bytes:content.length,sha256:sha,contentType:res.headers()["content-type"]||""};
  audited.push(record);
  console.log("PSE_GUIDANCE_DOCUMENT="+JSON.stringify(record));
 }
 if(audited.length!==7)throw Error("Original guide count diverged; expected 7 got "+audited.length);
 await mkdir("artifacts/pse-fertilizer-guides",{recursive:true});
 await writeFile("artifacts/pse-fertilizer-guides/source-audit.json",JSON.stringify({url,total:audited.length,files:audited},null,2)+"\n");
 console.log("PSE_GUIDANCE_DOCUMENT_AUDIT=PASS; verified="+audited.length+"; noWordPressMutation=true; noBuild=true");
}finally{await browser.close()}
