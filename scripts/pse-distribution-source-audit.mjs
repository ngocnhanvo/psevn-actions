/** Original PSE Distribution Channel content/data mapping; read-only, no CMS writes. */
import {chromium,request} from "playwright";
const origin="https://www.pse.vn";
const target=origin+"/hoat-dong-kinh-doanh/kenh-phan-phoi.html";
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const wc=vars.filter(x=>x.startsWith("WC_URL="));if(wc.length!==1)throw Error("PSE WP origin missing");
const site=new URL(wc[0].slice(7).replace(/^['"]|['"]$/g,""));if(site.protocol!=="https:"||site.username||site.password)throw Error("PSE WP origin invalid");
const browser=await chromium.launch({headless:true});const source=await browser.newPage();const api=await request.newContext({timeout:50000});
try{
 const r=await source.goto(target,{waitUntil:"domcontentloaded",timeout:60000});
 if(r?.status()!==200)throw Error("Joomla Kênh phân phối HTTP "+r?.status());
 const result=await source.evaluate(()=>{
  const root=document.querySelector(".blog");if(!root)throw Error("Original Joomla distribution blog missing");
  const articles=[];
  for(const node of root.querySelectorAll(".item,.leading,.items-row")){
   const links=[...node.querySelectorAll('a[href]')].map(a=>({href:a.href,label:(a.textContent||"").replace(/\s+/g," ").trim()}));
   const article=links.find(x=>/\/\d+-[a-z0-9-]+\.html$/i.test(new URL(x.href).pathname));
   if(!article)continue;
   const title=(node.querySelector("h1,h2,h3,h4")?.textContent||article.label).replace(/\s+/g," ").trim();
   const text=(node.textContent||"").replace(/\s+/g," ").trim().slice(0,250);
   const docs=links.filter(x=>/\.(pdf|docx?|xlsx?)(?:$|\?)/i.test(x.href));
   articles.push({title,url:article.href,preview:text,docs});
  }
  const pages=[...new Set([...root.querySelectorAll('a[href*="start="]')].map(a=>a.href))];
  return {articles,pages};
 });
 const rows=new Map(),pages=[target,...result.pages],seen=new Set();
 for(const next of pages){
  if(seen.has(next))continue;seen.add(next);
  const doc=await source.goto(next,{waitUntil:"domcontentloaded",timeout:50000});
  if(doc?.status()!==200)throw Error("Joomla distribution page HTTP "+doc?.status());
  const v=await source.evaluate(()=>{
   const root=document.querySelector(".blog");if(!root)throw Error("Distribution pagination missing blog");
   return[...root.querySelectorAll(".item,.leading")].flatMap(node=>{
    const link=[...node.querySelectorAll('a[href]')].find(a=>/\/\d+-[a-z0-9-]+\.html$/i.test(new URL(a.href).pathname));
    return link?[{url:link.href,title:(node.querySelector("h1,h2,h3,h4")?.textContent||link.textContent||"").replace(/\s+/g," ").trim(),preview:(node.textContent||"").replace(/\s+/g," ").trim().slice(0,500),pdf:[...node.querySelectorAll("a[href]")].filter(x=>/\.pdf(?:\?|$)/i.test(x.href)).map(x=>({label:(x.textContent||"").trim(),url:x.href}))}]:[];
   });
  });for(const item of v){const u=new URL(item.url);if(u.hostname!== "www.pse.vn"||!u.pathname.startsWith("/hoat-dong-kinh-doanh/kenh-phan-phoi/"))continue;rows.set(u.pathname,item)}
 }
 const verified=[];
 for(const [path,item] of rows){
  const name=path.split("/").at(-1).replace(/^\d+-/,"").replace(/\.html$/,"");
  const postsUrl=site.origin+"/wp-json/wp/v2/posts?slug="+encodeURIComponent(name)+"&_fields=id,slug,status,title,categories&per_page=10";
  const fetchRes=await api.get(postsUrl,{timeout:50000});
  if(!fetchRes.ok())throw Error("WP Posts registry HTTP "+fetchRes.status());
  const posts=await fetchRes.json();
  verified.push({...item,slug:name,matchedPosts:posts.map(p=>({id:p.id,slug:p.slug,status:p.status,categories:p.categories}))});
 }
 console.log("PSE_DISTRIBUTION_PARITY="+JSON.stringify({sourcePages:seen.size,sourceArticles:rows.size,exactWpMatches:verified.filter(x=>x.matchedPosts.length===1).length,records:verified}).slice(0,19000));
 if(rows.size<3||rows.size>30)throw Error("Distribution source article list unexpectedly changed: "+rows.size);
 console.log("PSE_DISTRIBUTION_AUDIT=PASS; noCmsWrite=true; noBuild=true");
}finally{await api.dispose();await browser.close()}
