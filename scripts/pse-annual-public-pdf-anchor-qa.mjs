/** PSE 2014/2016 annual report: verify actual public Astro anchor href before any CMS rewrite.
 * WordPress REST relative /api/files must be resolved against FRONTEND on public page.
 */
import {mkdir,writeFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong project");
const cms="https://admin-pse.webnvn.com",front="https://pse.webnvn.com";
const cases=[
 {wpId:82410,slug:"bao-cao-thuong-nien-2016",filename:"pse-legacy-bcf327da931e56e4.pdf",
  path:"/api/files/wp-content/uploads/2026/10/pse-legacy-bcf327da931e56e4.pdf"},
 {wpId:82777,slug:"bao-cao-thuong-nien-2014",filename:"PSE_2015.3.18_9a1940e_18-_BCTN_2014.pdf",
  path:"/api/files/wp-content/uploads/2026/11/PSE_2015.3.18_9a1940e_18-_BCTN_2014.pdf"}
];
const report={schema:"pse-original-annual-pdf-live-public-anchor-proof-v1",readOnly:true,
 noCmsWrites:true,noBuild:true,rows:[],summary:null};
const head=async url=>{
 const r=await fetch(url,{method:"HEAD",redirect:"manual",signal:AbortSignal.timeout(22000)});
 return{status:r.status,type:r.headers.get("content-type")||null,length:r.headers.get("content-length")||null};
};
for(const item of cases){
 const url=front+"/"+item.slug,resp=await fetch(url,{redirect:"manual",signal:AbortSignal.timeout(38000)});
 if(resp.status!==200)throw Error("Public annual Post not 200 "+item.wpId);
 const html=await resp.text();
 if(html.length<7000||html.length>3_000_000)throw Error("Unexpected annual page size "+item.wpId);
 const anchors=[...html.matchAll(/<a\b[^>]*href\s*=\s*(["'])([^"']+)\1[^>]*>/gi)]
   .map(m=>({html:m[0].slice(0,700),raw:m[2].replace(/&amp;/gi,"&")}));
 const expected=anchors.filter(x=>{try{return decodeURIComponent(new URL(x.raw,front).pathname)===
  decodeURIComponent(item.path)}catch{return false}});
 const suspect=anchors.filter(x=>x.raw.includes(item.filename));
 const output={wpId:item.wpId,publicPage:url,anchorCount:anchors.length,
  matchingExactPdf:expected.length,matchingFilename:suspect.length,
  anchorRaw:expected[0]?.raw||suspect[0]?.raw||null,
  anchorAbsolute:null,pdfHead:null,canonical:null,decision:null};
 const canonical=html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)||
  html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical/i);
 output.canonical=canonical?.[1]||null;
 const can=output.canonical?new URL(output.canonical,front):null;
 const canOkay=can?.origin===front&&can.pathname==="/"+item.slug;
 if(expected.length!==1||suspect.length!==1||!canOkay){
  output.decision="PUBLIC_PDF_ANCHOR_MISSING_OR_AMBIGUOUS";
 }else{
  const parsed=new URL(expected[0].raw,front);output.anchorAbsolute=parsed.href;
  if(parsed.origin!==front||parsed.pathname!==item.path){
   output.decision="PUBLIC_LINK_POINTS_WRONG_HOST";
  }else{
   output.pdfHead=await head(parsed.href);
   output.decision=output.pdfHead.status===200&&
    String(output.pdfHead.type).toLowerCase().includes("application/pdf")?
    "PUBLIC_ANNUAL_PDF_ANCHOR_ALREADY_CORRECT":
    "PUBLIC_PDF_ANCHOR_TARGET_UNAVAILABLE";
  }
 }
 report.rows.push(output);
 console.log("PSE_ANNUAL_PUBLIC_LINK_QA="+JSON.stringify(output).slice(0,3500));
}
report.summary={checked:cases.length,alreadyCorrect:report.rows.filter(x=>x.decision==="PUBLIC_ANNUAL_PDF_ANCHOR_ALREADY_CORRECT").map(x=>x.wpId),
 needsCmsRepair:report.rows.filter(x=>x.decision!=="PUBLIC_ANNUAL_PDF_ANCHOR_ALREADY_CORRECT").map(x=>x.wpId),
 readOnly:true,noCmsWrites:true};
console.log("PSE_ANNUAL_PUBLIC_LINK_QA_SUMMARY="+JSON.stringify(report.summary));
await mkdir("artifacts/pse-annual-public-links",{recursive:true});
await writeFile("artifacts/pse-annual-public-links/report.json",JSON.stringify(report,null,2)+"\n");
