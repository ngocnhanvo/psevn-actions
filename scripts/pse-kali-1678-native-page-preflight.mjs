/** Read-only source/cms proof for faithful native historical Kali description page. */
import {chromium,request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong repository");
const proof=JSON.parse(await readFile("inputs/dam/report.json","utf8"));
const row=proof.rows.find(x=>x.id===1678),wp="https://admin-pse.webnvn.com",front="https://pse.webnvn.com";
const source="https://pse.vn/hoat-dong-kinh-doanh/san-pham/dam-phu-my/8-trang-chu/1678-kali-phu-my-mo-ta-va-hdsd.html";
const slug="kali-phu-my-mo-ta-va-hdsd";
const expectedSha="21ff53b4019c5349a0d010ca5fc8b0b9ce7600097ac9ce4c2620dfdfc83e3a53";
const sha=b=>createHash("sha256").update(b).digest("hex");
if(proof.schema!=="pse-dam-related-links-audit-v1"||row.sourceLink.url!==source||row.sourceArticle.bodySha256!==expectedSha||row.sourceArticle.images.length!==1)throw Error("Pinned source evidence changed");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
for(const [k,v] of [["WC_URL",wp],["WC_URL_CLIENT",front]]){const a=env.filter(x=>x.startsWith(k+"="));if(a.length!==1||new URL(a[0].slice(k.length+1).replace(/^['"]|['"]$/g,"")).origin!==v)throw Error("Origin mismatch "+k)}
const out="artifacts/pse-kali-1678-native-page-preflight";await mkdir(out,{recursive:true});
const net=await request.newContext({timeout:45000}),b=await chromium.launch({headless:true}),ctx=await b.newContext({javaScriptEnabled:false});await ctx.route("**/*",r=>r.abort());const page=await ctx.newPage();
const report={sourceId:1678,source,slug,readOnly:true,noCmsWrites:true,noProductWrites:true,ready:false};
try{
 const r=await net.get(source,{maxRedirects:0,failOnStatusCode:false});if(r.status()!==200)throw Error("Original detail HTTP "+r.status());
 const html=await r.text();if(html.length>8000000)throw Error("Source too large");
 await page.setContent('<base href="'+source+'">'+html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded"});
 const data=await page.evaluate(()=>{
  const n=s=>String(s||"").replace(/\s+/g," ").trim(),root=document.querySelector(".item-page [itemprop=articleBody]");
  if(!root)throw Error("No original body");
  const tables=[...root.querySelectorAll("table")];
  return{title:n(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent||document.title),text:n(root.textContent),tables:tables.map(t=>({html:t.outerHTML,text:n(t.textContent),rows:[...t.rows].map(r=>[...r.cells].map(c=>n(c.textContent)))})),images:[...root.querySelectorAll("img[src]")].map(x=>x.src),links:[...root.querySelectorAll("a[href]")].map(a=>({href:a.getAttribute("href"),text:n(a.textContent),url:a.href}))};
 });
 if(sha(data.text)!==expectedSha||data.tables.length!==2||data.images[0]!==row.sourceArticle.images[0]||data.images.length!==1||data.title!=="Kali Phú Mỹ - Mô tả và HDSD")throw Error("Source body changed");
 report.original=data;
 await writeFile(out+"/source-tables.json",JSON.stringify(data,null,2)+"\n");
 const imageUrl=data.images[0],iu=new URL(imageUrl);
 if(iu.origin!=="https://pse.vn"||!iu.pathname.startsWith("/images/")||!iu.pathname.endsWith("/4_KALI-MIENG_Phu_My_2019_cai_tien.png"))throw Error("Wrong source image");
 const ir=await net.get(imageUrl,{timeout:35000,maxRedirects:0,failOnStatusCode:false});
 report.sourceImage={url:imageUrl,http:ir.status()};
 let imageBytes=null;
 if(ir.status()===200){
  const bytes=await ir.body();if(bytes.length>12000000||bytes.length<180||bytes.subarray(0,8).toString("hex")!=="89504e470d0a1a0a")throw Error("Invalid source PNG");
  imageBytes=bytes;report.sourceImage.bytes=bytes.length;report.sourceImage.sha256=sha(bytes);await writeFile(out+"/original.png",bytes);
 }
 const q=await net.get(wp+"/wp-json/wp/v2/product/80938?_fields=id,slug,status,featured_media");
 const p=await q.json();if(q.status()!==200||p.id!==80938||p.status!=="publish"||!p.featured_media)throw Error("Native candidate product changed");
 const mr=await net.get(wp+"/wp-json/wp/v2/media/"+p.featured_media+"?_fields=id,source_url,media_details");
 const m=await mr.json();if(mr.status()!==200||m.id!==p.featured_media||typeof m.source_url!=="string"||!m.source_url.trim())throw Error("Native media identity mismatch");
 const mu=new URL(m.source_url,wp+"/");if(mu.origin!==wp||!mu.pathname.startsWith("/wp-content/uploads/")||mu.username||mu.password)throw Error("Native media identity mismatch");
 const nativeR=await net.get(mu.href,{maxRedirects:0,failOnStatusCode:false});if(nativeR.status()!==200)throw Error("Native media unavailable");
 const nb=await nativeR.body();if(nb.length>12000000)throw Error("Native media too large");
 report.nativeMedia={productId:p.id,id:m.id,url:mu.href,sha256:sha(nb),sourceByteMatch:!!imageBytes&&sha(nb)===sha(imageBytes)};
 const [pages,posts,products,live,examples]=await Promise.all([
  net.get(wp+"/wp-json/wp/v2/pages?slug="+slug+"&_fields=id,slug,status,acf"),
  net.get(wp+"/wp-json/wp/v2/posts?slug="+slug+"&_fields=id,slug,status"),
  net.get(wp+"/wp-json/wp/v2/product?slug="+slug+"&_fields=id,slug,status"),
  net.get(front+"/"+slug,{maxRedirects:0,failOnStatusCode:false}),
  net.get(wp+"/wp-json/wp/v2/pages?per_page=100&_fields=id,slug,status,acf")
 ]);
 const [pa,po,pr,ex]=await Promise.all([pages.json(),posts.json(),products.json(),examples.json()]);
 if([pages,posts,products,examples].some(x=>x.status()!==200)||[pa,po,pr,ex].some(x=>!Array.isArray(x)))throw Error("Page route inventory failed");
 report.route={slug,publicHTTP:live.status(),pages:pa,posts:po,products:pr,publicPageExamples:ex.filter(x=>x.acf?.action==="PublicPage").slice(0,4).map(x=>({id:x.id,slug:x.slug,acf:x.acf}))};
 report.ready=!!imageBytes&&pa.length===0&&po.length===0&&pr.length===0&&live.status()===404&&report.route.publicPageExamples.length>0;
 console.log("PSE_KALI_1678_NATIVE_PAGE_PREFLIGHT="+JSON.stringify({sourceId:1678,title:data.title,tables:data.tables.map(t=>t.rows),links:data.links,sourceImage:report.sourceImage,nativeMedia:report.nativeMedia,route:report.route,ready:report.ready,noCmsWrites:true}));
}finally{await writeFile(out+"/report.json",JSON.stringify(report,null,2)+"\n");await net.dispose();await b.close()}
