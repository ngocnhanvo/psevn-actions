/** Read-only exact five related links in legacy Đạm Phú Mỹ category description. */
import {chromium,request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong repository");
const ids=[1668,1669,1676,1677,1678],slugs=["dam-phu-my-chuyen-dung-cho-drone-mo-ta-va-hdsd","dam-phu-my-chuyen-dung-cho-nong-lam-truong-mo-ta-va-hdsd","sa-phu-my-mo-ta-va-hdsd","dap-phu-my-mo-ta-va-hdsd","kali-phu-my-mo-ta-va-hdsd"];
const old="/hoat-dong-kinh-doanh/san-pham/dam-phu-my";
const source="https://pse.vn"+old+".html",front="https://pse.webnvn.com",wp="https://admin-pse.webnvn.com";
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
for(const [k,v] of [["WC_URL",wp],["WC_URL_CLIENT",front]]){const a=env.filter(x=>x.startsWith(k+"="));if(a.length!==1||new URL(a[0].slice(k.length+1).replace(/^['"]|['"]$/g,"")).origin!==v)throw Error("Origin mismatch "+k)}
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const out="artifacts/pse-dam-related-links-audit";await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});const ctx=await browser.newContext({javaScriptEnabled:false});await ctx.route("**/*",r=>r.abort());const page=await ctx.newPage();
const net=await request.newContext({timeout:45000});
const sha=s=>createHash("sha256").update(s).digest("hex");
const report={schema:"pse-dam-related-links-audit-v1",source,front,readOnly:true,noCMSWrites:true,rows:[]};
const normalize=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/gi,"d").toLowerCase().replace(/[^\w]+/g," ").trim();
const read=async url=>{try{const r=await net.get(url,{maxRedirects:0,failOnStatusCode:false});return {http:r.status(),location:r.headers().location||null,html:r.status()===200?await r.text():""}}catch(e){return{http:null,error:String(e?.message||e).slice(0,160),html:""}}};
const parse=async(html,base,sel)=>{await page.setContent('<base href="'+base+'">'+html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,""),{waitUntil:"domcontentloaded"});return page.evaluate(sel=>{const root=document.querySelector(sel);const n=s=>String(s||"").replace(/\s+/g," ").trim();return {title:n(document.querySelector(".item-page h1,.item-page h2,h1")?.textContent||document.title),body:n(root?.textContent),links:[...(root?.querySelectorAll("a[href]")||[])].map(a=>({text:n(a.textContent),href:a.getAttribute("href"),url:a.href})),images:[...(root?.querySelectorAll("img[src]")||[])].map(x=>x.src),canonical:document.querySelector('link[rel="canonical"]')?.href||null,tables:root?.querySelectorAll("table").length||0}},sel)};
try{
 const [sourceR,frontR,catR,productR]=await Promise.all([read(source),read(front+"/san-pham/dam-phu-my"),net.get(wp+"/wp-json/astro/v1/get-product-categories"),net.get(wp+"/wp-json/wp/v2/product?status=publish&per_page=100&_fields=id,slug,title,content,excerpt,acf,product_categories,featured_media")]);
 if(sourceR.http!==200||frontR.http!==200||catR.status()!==200||productR.status()!==200)throw Error("Required source/CMS/public inventory unavailable "+JSON.stringify([sourceR.http,frontR.http,catR.status(),productR.status()]));
 const sourceDoc=await parse(sourceR.html,source,".item-page");const current=await parse(frontR.html,front+"/san-pham/dam-phu-my",".pse-category-editorial");
 const cats=await catR.json(),products=await productR.json(),cat=cats.find(x=>x.id===1763&&x.slug==="dam-phu-my");
 if(!cat||typeof cat.description!=="string"||!Array.isArray(products)||products.length!==53)throw Error("Unexpected native registry");
 const cms=await parse(cat.description,front+"/san-pham/dam-phu-my","body");
 report.cms={id:cat.id,descriptionSha256:sha(cat.description),tables:cms.tables,links:cms.links};
 report.current={tables:current.tables,links:current.links};
 report.products=products.map(p=>({id:p.id,slug:p.slug,title:p.title?.rendered,origin:p.acf?.origin_page_id}));
 report.categories=cats.map(c=>({id:c.id,slug:c.slug,name:c.name,parent:c.parent}));
 for(const [i,id] of ids.entries()){
  const suffix="/"+id+"-"+slugs[i]+".html";
  const expected=old+"/8-trang-chu"+suffix;
  const matches=sourceDoc.links.filter(a=>new URL(a.url).pathname===expected);
  if(matches.length!==1)throw Error("Original related link identity differs "+id+" count "+matches.length);
  const originLink=matches[0];const related=current.links.filter(a=>normalize(a.text)===normalize(originLink.text)||a.url.includes(suffix)||a.url.includes(slugs[i]));
  const native=cms.links.filter(a=>normalize(a.text)===normalize(originLink.text)||a.url.includes(suffix)||a.url.includes(slugs[i]));
  const row={id,sourceLink:originLink,manifest:state.articles?.[String(id)]?{source_url:state.articles[String(id)].source_url,status:state.articles[String(id)].status,wp_id:state.articles[String(id)].wp_id}:null,current:related,cms:native,sourceArticle:null,candidates:[],checks:[]};
  report.rows.push(row);
  const sr=await read(originLink.url);
  if(sr.http===200){const body=await parse(sr.html,originLink.url,".item-page [itemprop=articleBody]");row.sourceArticle={http:200,title:body.title,text:body.body,bodySha256:sha(body.body),images:body.images,tables:body.tables};}else row.sourceArticle={http:sr.http,location:sr.location,error:sr.error};
  const key=normalize(slugs[i].replace("-mo-ta-va-hdsd",""));
  const terms=key.split(" ").filter(x=>!["phu","my","cho","dung","chuyen"].includes(x));
  const cand=products.filter(p=>{const n=normalize(p.title?.rendered);return String(p.acf?.origin_page_id)===String(id)||terms.every(t=>n.split(" ").includes(t))});
  for(const p of cand.slice(0,10)){const doc=await parse(p.content?.rendered||"",wp,"body");row.candidates.push({id:p.id,slug:p.slug,title:p.title?.rendered,sourceId:p.acf?.origin_page_id,body:doc.body,images:doc.images,exactSourceText:!!row.sourceArticle.text&&row.sourceArticle.text===doc.body});}
  const urls=new Set([front+expected,...related.map(x=>x.url),...row.candidates.map(x=>front+"/san-pham/"+x.slug)]);
  for(const u of urls){if(new URL(u).origin!==front)continue;const r=await read(u);let canonical=null;if(r.http===200){const doc=await parse(r.html,u,"main");canonical=doc.canonical;}row.checks.push({url:u,http:r.http,location:r.location,canonical});}
  console.log("PSE_DAM_RELATED_ROW="+JSON.stringify({...row,candidates:row.candidates.map(c=>({...c,body:c.body.slice(0,1400)})),sourceArticle:{...row.sourceArticle,text:row.sourceArticle.text?.slice(0,1800)}}));
 }
 console.log("PSE_DAM_RELATED_SUMMARY="+JSON.stringify({links:report.rows.length,cms:report.cms,current:report.current,products:report.products,readOnly:true}));
}finally{await writeFile(out+"/report.json",JSON.stringify(report,null,2)+"\n");await net.dispose();await browser.close()}
