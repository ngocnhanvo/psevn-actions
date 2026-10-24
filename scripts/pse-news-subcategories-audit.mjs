/** Audit remaining PSE news submenu source categories versus migrated WordPress Posts. No writes. */
import {chromium} from "playwright";
const w=String(process.env.ENV_FILE||"").split(/\r?\n/).find(s=>s.trim().startsWith("WC_URL="));if(!w)throw Error("WordPress origin missing");
const origin=new URL(w.trim().slice(7).replace(/^['"]|['"]$/g,"")).origin;
const browser=await chromium.launch({headless:true});const admin=await browser.newPage();
try{
 await admin.goto(origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=await admin.locator("body").innerText(),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],sum=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const input=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await input.count())throw Error("WP captcha missing");await input.fill(String(sum))}
  await Promise.all([admin.waitForLoadState("domcontentloaded"),admin.locator("#wp-submit").click()]);
 }
 const nonce=await admin.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});return(await r.text()).trim()});
 const api=async path=>admin.evaluate(async({path,nonce})=>{const r=await fetch(path,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce}});return{http:r.status,pages:r.headers.get("X-WP-TotalPages"),total:r.headers.get("X-WP-Total"),data:await r.json().catch(()=>null)}},{path,nonce});
 const first=await api("/wp-json/wp/v2/posts?status=publish&categories=1742&per_page=100&page=1&_fields=id,slug,categories");
 if(first.http!==200||!Array.isArray(first.data))throw Error("WP company Posts unavailable");
 const posts=[...first.data];const pages=Number(first.pages||1);
 for(let i=2;i<=pages;i++){const r=await api("/wp-json/wp/v2/posts?status=publish&categories=1742&per_page=100&page="+i+"&_fields=id,slug,categories");if(r.http!==200||!Array.isArray(r.data))throw Error("WP company Posts truncated");posts.push(...r.data)}
 const bySlug=new Map(posts.map(p=>[p.slug,p]));
 const specs=[
  {label:"Tin tổng hợp",slug:"tin-tong-hop",path:"/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop.html"},
  {label:"Hoạt động Chi bộ – HĐQT – BKS",slug:"hoat-dong-chi-bo-hdqt-bks",path:"/tin-tuc-su-kien/tin-cong-ty/hoat-dong-chi-bo-hdqt-bks.html"},
  {label:"Hoạt động Công đoàn – Đoàn TN – Nữ công",slug:"hoat-dong-cong-doan-doan-tn-nu-cong",path:"/tin-tuc-su-kien/tin-cong-ty/hoat-dong-cong-doan-doan-tn-nu-cong.html"},
  {label:"Đảng ủy",slug:"dang-uy",path:"/tin-tuc-su-kien/tin-cong-ty/dang-uy.html"},
  {label:"Ảnh",slug:"anh",path:"/tin-tuc-su-kien/thu-vien/anh.html"},
  {label:"Video",slug:"video",path:"/tin-tuc-su-kien/thu-vien/video.html"}
 ];
 const cat=await api("/wp-json/wp/v2/categories?hide_empty=false&per_page=100&_fields=id,slug,name,parent,count");
 if(cat.http!==200||!Array.isArray(cat.data))throw Error("Current WP taxonomy unavailable");
 const page=await browser.newPage();const out=[];
 await page.route(/\.(?:woff2?|ttf|png|jpe?g|webp)(?:\?.*)?$/i,route=>route.abort());
 for(const spec of specs){
  const found=cat.data.filter(x=>x.slug===spec.slug);
  if(found.length!==1)throw Error("Missing WP category "+spec.slug);
  const r=await page.goto("https://www.pse.vn"+spec.path,{waitUntil:"domcontentloaded",timeout:60000});
  const scan=await page.evaluate(()=>{
   const node=document.querySelector(".blog")||document.querySelector(".item-page")||document.querySelector("main");
   const items=[...(node?.querySelectorAll('a[href]')||[])].map(a=>({href:a.href,text:(a.textContent||"").trim().slice(0,90)})).filter(a=>{try{const u=new URL(a.href);return u.hostname==="www.pse.vn"&&/\/\d+-[a-z0-9-]+\.html$/.test(u.pathname)}catch{return false}});
   const pages=[...(node?.querySelectorAll('a[href*="start="]')||[])].map(x=>x.href).filter(x=>x.includes(".html?start=")).slice(0,10);
   return{title:document.title,selector:node?.className||"",chars:(node?.textContent||"").replace(/\s+/g," ").trim().length,items,pages,articleCards:node?.querySelectorAll(".items-row,.item,.leading,.item-title").length||0};
  });
  const matched=scan.items.map(x=>({slug:x.href.split("/").at(-1).replace(/^\d+-/,"").replace(/\.html$/,""),url:x.href})).filter(x=>bySlug.has(x.slug));
  const record={...spec,http:r?.status(),wpCategory:{id:found[0].id,parent:found[0].parent,count:found[0].count},sourceItems:scan.items.length,sourcePages:scan.pages.length,articles:scan.articleCards,matchedWp:matched.length,matched:matched.slice(0,7),textChars:scan.chars};
  out.push(record);console.log("PSE_NEWS_SUBCATEGORY_AUDIT="+JSON.stringify(record));
 }
 console.log("PSE_NEWS_SUBCATEGORY_SUMMARY="+JSON.stringify({total:out.length,withSourceArticles:out.filter(x=>x.sourceItems).length,matches:out.reduce((a,x)=>a+x.matchedWp,0),readOnly:true,wpPosts:posts.length}));
}finally{await browser.close()}
