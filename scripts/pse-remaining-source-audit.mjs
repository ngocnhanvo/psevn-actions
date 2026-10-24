/** Read-only original Joomla page type and media inventory for non-migrated WP menu links. */
import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const cfg=Object.fromEntries(String(process.env.ENV_FILE||"").split(/\r?\n/).map(v=>v.trim()).filter(v=>/^WC_URL=/.test(v)).map(v=>{const u=new URL(v.slice(7).replace(/^['"]|['"]$/g,""));if(u.protocol!=="https:"||u.username||u.password)throw Error("CMS origin");return["cms",u.origin]}));
const b=await chromium.launch({headless:true});
const p=await b.newPage({viewport:{width:1440,height:900}});
try{
 await p.goto(cfg.cms+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await p.locator("#user_login").count()){
  await p.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");await p.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=await p.locator("body").innerText(),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],v=+m[3],r=({"+":a+v,"-":a-v,x:a*v,"×":a*v,"*":a*v})[m[2]];const f=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("math challenge");await f.fill(String(r))}
  await Promise.all([p.waitForLoadState("domcontentloaded"),p.locator("#wp-submit").click()]);
 }
 const nonce=await p.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});return(await r.text()).trim()});
 const menus=await p.evaluate(async n=>{const r=await fetch("/wp-json/wp/v2/menu-items?context=edit&per_page=100",{headers:{"X-WP-Nonce":n},credentials:"same-origin"});if(!r.ok)throw Error("Menu API "+r.status);return r.json()},nonce);
 const items=menus.map(x=>({id:x.id,parent:x.parent||0,name:String(x.title?.raw||x.title?.rendered||"").trim(),url:x.url||""})).filter(x=>{try{const u=new URL(x.url);return u.hostname==="www.pse.vn"&&u.pathname!=="/"}catch{return false}});
 const scanned=[]; const source=await b.newPage({viewport:{width:1440,height:900}});
 await source.route(/\.(woff2?|ttf)(\?.*)?$/i,route=>route.abort());
 for(const x of items){
  let http=0,final="",data=null;
  try{
   const r=await source.goto(x.url,{waitUntil:"domcontentloaded",timeout:45000});
   http=r?.status()||0;final=source.url();
   data=await source.evaluate(()=>{
    const options=[".item-page [itemprop=articleBody]",".item-page",".blog",".category-list",".category-blog",".category-desc",".com-content-article__body","main"];
    const found=options.filter(k=>!!document.querySelector(k));
    const node=document.querySelector(options.find(k=>document.querySelector(k))||"main");
    const headings=[...(node?.querySelectorAll("h1,h2,h3,h4")||[])].slice(0,25).map(a=>(a.textContent||"").replace(/\s+/g," ").trim());
    const links=[...(node?.querySelectorAll("a[href]")||[])].map(a=>({text:(a.textContent||"").replace(/\s+/g," ").trim().slice(0,100),href:a.href})).filter(a=>a.href&&!a.href.startsWith("javascript:"));
    const imgs=[...(node?.querySelectorAll("img")||[])].map(a=>({src:a.src,alt:a.alt||"",w:a.naturalWidth,h:a.naturalHeight}));
    const text=(node?.textContent||"").replace(/\s+/g," ").trim();
    return {selectors:found,kind:node?.className||"",headings,chars:text.length,preview:text.slice(0,720),images:imgs.slice(0,30),imgCount:imgs.length,links:links.slice(0,30),linkCount:links.length,tableCount:node?.querySelectorAll("table").length||0,fileLinks:links.filter(x=>/\.(pdf|docx?|xlsx?|zip)(\?|$)/i.test(x.href)).slice(0,25),articleCards:node?.querySelectorAll(".items-row,.item,.leading,.item-title,.cat-children,.category-list li").length||0};
   });
  }catch(e){data={error:String(e).slice(0,180)}}
  const record={...x,http,final,data};scanned.push(record);
  console.log("PSE_REMAINING_SOURCE="+JSON.stringify({id:x.id,parent:x.parent,name:x.name,url:x.url,http,kind:data?.kind,selectors:data?.selectors,chars:data?.chars,preview:data?.preview,imgCount:data?.imgCount,linkCount:data?.linkCount,fileLinks:data?.fileLinks?.length,articleCards:data?.articleCards,error:data?.error}));
 }
 await mkdir("artifacts/pse-remaining-pages",{recursive:true});
 await writeFile("artifacts/pse-remaining-pages/legacy-source.json",JSON.stringify(scanned,null,2)+"\n");
 console.log("PSE_REMAINING_SOURCE_SUMMARY="+JSON.stringify({total:items.length,http200:scanned.filter(x=>x.http===200).length,withArticles:scanned.filter(x=>x.data?.articleCards>0).length,media:scanned.reduce((n,x)=>n+(x.data?.imgCount||0),0),files:scanned.reduce((n,x)=>n+(x.data?.fileLinks?.length||0),0),readonly:true}));
}finally{await b.close()}
