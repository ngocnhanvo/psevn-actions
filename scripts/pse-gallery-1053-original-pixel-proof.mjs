/** Read-only proof of exact problematic original photo. No writes. */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
const v=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const origin=k=>{const a=v.filter(x=>x.startsWith(k+"="));if(a.length!==1)throw Error("missing "+k);const u=new URL(a[0].slice(k.length+1).replace(/^['"]|['"]$/g,""));if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("bad origin");return u.origin};
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("wrong repo");
const wp=origin("WC_URL"),front=origin("WC_URL_CLIENT");
const legacy="https://www.pse.vn/tin-tuc-su-kien/thu-vien/anh/1053-ngay-hoi-truyen-thong-2014.html";
const file="/wp-content/uploads/2026/11/pse-gallery-1053-1cb2b19e6cbdbe47.jpg";
const sha=b=>createHash("sha256").update(b).digest("hex");
const net=await request.newContext({timeout:45000});
const browser=await chromium.launch({headless:true});
try{
 const ctx=await browser.newContext({javaScriptEnabled:false});await ctx.route("**/*",r=>r.abort());
 const p=await ctx.newPage();const r=await net.get(legacy,{maxRetries:2});
 if(r.status()!==200)throw Error("original page "+r.status());
 await p.setContent('<base href="'+legacy+'">'+(await r.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded"});
 const links=await p.evaluate(()=>[...new Set([...document.querySelectorAll(".item-page a[href],article a[href]")].map(a=>a.href).filter(h=>{try{const u=new URL(h);return u.hostname==="www.pse.vn"&&u.pathname.startsWith("/images/gallery/")&&/\.(jpe?g|png|webp)$/i.test(u.pathname)}catch{return false}}))]);
 const matches=links.filter(u=>sha(u).slice(0,16)==="1cb2b19e6cbdbe47");
 if(matches.length!==1)throw Error("source hash not unique");
 await ctx.close();
 const results=[];
 const decode=await browser.newPage();
 for(const [kind,url] of [["original",matches[0]],["native",wp+file],["proxy",front+"/api/files"+file]]){
  const r=await net.get(url,{maxRetries:2,failOnStatusCode:false,maxRedirects:2});
  const bytes=await r.body(),mime=String(r.headers()["content-type"]||"");
  const dimensions=await decode.evaluate(async({b,mime})=>{
   try{const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(b),c=>c.charCodeAt(0))],{type:mime.split(";")[0]}));const result={width:bitmap.width,height:bitmap.height};bitmap.close();return result}
   catch(e){return {error:String(e)}}
  },{b:bytes.toString("base64"),mime});
  const row={kind,path:new URL(url).pathname,status:r.status(),mime,bytes:bytes.length,sha256:sha(bytes),jpegStart:bytes.subarray(0,2).toString("hex"),jpegEnd:bytes.subarray(-2).toString("hex"),dimensions};
  console.log("PSE_GALLERY_1053_PIXEL_PROOF_ROW="+JSON.stringify(row));results.push(row);
 }
 const sameBytes=results.every(x=>x.sha256===results[0].sha256);
 const allDecoded=results.every(x=>x.status===200&&x.dimensions.width>0&&x.dimensions.height>0);
 console.log("PSE_GALLERY_1053_PIXEL_PROOF="+JSON.stringify({sameBytes,allDecoded,sourceIndex:links.indexOf(matches[0]),decision:sameBytes&&allDecoded?"ASSET_BYTES_AND_PIXEL_DECODE_PASS_BROWSER_TRANSPORT_INVESTIGATION":"ASSET_OR_PROXY_DIFFERENCE_REVIEW",readOnly:true}));
}finally{await browser.close();await net.dispose()}
