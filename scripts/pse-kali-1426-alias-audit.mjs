/** PSE Kali 1426: independent live read-only alias and link inventory. */
import { chromium, request } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong repo");
const front="https://pse.webnvn.com", wp="https://admin-pse.webnvn.com";
const browser=await chromium.launch({headless:true}),net=await request.newContext({timeout:45000});
const report={schema:"pse-kali-1426-live-alias-audit-v1",readOnly:true,sourcePage:83572,links:[],queries:[],legacyPaths:[],targets:[],errors:[]};
const out="artifacts/pse-kali-1426-alias-audit";await mkdir(out,{recursive:true});
try{
 const p=await browser.newPage({viewport:{width:1280,height:900}});
 const r=await p.goto(front+"/kali-phu-my-mo-ta-cac-bien-the",{waitUntil:"domcontentloaded",timeout:65000});
 if(r?.status()!==200)throw Error("Kali page HTTP "+r?.status());
 report.links=await p.evaluate(()=>[...document.querySelectorAll("main a[href]")].map(a=>({text:a.textContent.replace(/\s+/g," ").trim().slice(0,120),href:a.href,raw:a.getAttribute("href"),containsImage:!!a.querySelector("img")})));
 const rest=await net.get(wp+"/wp-json/wp/v2/pages/83572?_fields=id,slug,status,acf,content",{failOnStatusCode:false});
 if(rest.status()!==200)throw Error("Page 83572 public CMS HTTP "+rest.status());
 const d=await rest.json();
 if(d.id!==83572||d.status!=="publish"||d.slug!=="kali-phu-my-mo-ta-cac-bien-the"||d.acf?.key!=="pse-historical-kali-1426")throw Error("Kali CMS identity changed");
 report.cmsSourceHTML=String(d.content?.rendered||"").length;
 const scope=await p.evaluate(html=>{const root=document.createElement("div");root.innerHTML=html;return [...root.querySelectorAll("a[href]")].map(a=>({text:a.textContent.replace(/\s+/g," ").trim().slice(0,120),href:a.getAttribute("href")}))},d.content?.rendered||"");
 report.cmsLinks=scope;
 const paths=["/hoat-dong-kinh-doanh/san-pham/kali-phu-my.html", "/hoat-dong-kinh-doanh/san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my/8-trang-chu/1426-kali-phu-my-mo-ta-cac-bien-the.html"];
 for(const id of ["1425","1427","1430","999999"]){
  const uri=front+paths[0]+"?id="+id,res=await net.get(uri,{maxRedirects:0,failOnStatusCode:false});
  const target=res.headers().location?new URL(res.headers().location,front):null;
  const result={id,http:res.status(),location:res.headers().location??null};
  if(target&&target.origin===front){const dest=await net.get(target.href,{maxRedirects:0,failOnStatusCode:false});result.targetHTTP=dest.status();if(dest.status()===200){const html=await dest.text();result.canonical=html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0]??null;result.hasH1=/<h1(?:\s|>)/i.test(html)}}
  report.queries.push(result);
 }
 for(const path of paths.slice(1)){const r=await net.get(front+path,{maxRedirects:0,failOnStatusCode:false});report.legacyPaths.push({path,http:r.status(),location:r.headers().location??null})}
 for(const path of ["/san-pham/kali-phu-my-mieng-mop-1427","/san-pham/kali-phu-my-bot-mop-1430","/kali-phu-my-mo-ta-cac-bien-the"]){const r=await net.get(front+path,{maxRedirects:0,failOnStatusCode:false});report.targets.push({path,http:r.status()})}
 console.log("PSE_KALI_1426_ALIAS_AUDIT="+JSON.stringify(report)); 
} catch(e){report.errors.push(String(e));throw e}
finally{await writeFile(out+"/report.json",JSON.stringify(report,null,2)+"\n");await net.dispose();await browser.close()}
