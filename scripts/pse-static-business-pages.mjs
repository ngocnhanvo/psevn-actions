/** Migrate only verified static PSE business information Pages, with content parity and menu bind. */
import {chromium} from "playwright";
import {createHash} from "node:crypto";
const hash=s=>createHash("sha256").update(String(s)).digest("hex");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim());
const x=env.filter(v=>v.startsWith("WC_URL="));if(x.length!==1)throw Error("PSE WP origin absent");
const u=new URL(x[0].slice(7).replace(/^['"]|['"]$/g,""));if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid WP origin");
const dry=process.env.PSE_STATIC_SUBPAGES_APPLY!=="1";
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900}});
const page=await context.newPage();
try{
 await page.goto(u.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const txt=await page.locator("body").innerText(),m=txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("Math captcha missing");await f.fill(String(v))}
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WordPress auth unavailable");
 const nonce=await page.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("Nonce");return (await r.text()).trim()});
 const api=async(path,method="GET",body)=>page.evaluate(async({path,method,body,nonce})=>{const r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});return{http:r.status,data:await r.json().catch(()=>({}))}},{path,method,body,nonce});
 const ms=await api("/wp-json/wp/v2/menu-items?context=edit&per_page=100");
 if(ms.http!==200||!Array.isArray(ms.data))throw Error("Cannot verify WordPress Header");
 const pages=await api("/wp-json/wp/v2/pages?context=edit&status=publish,draft,private&per_page=100&_fields=id,slug,status,acf,content,title");
 if(pages.http!==200||!Array.isArray(pages.data))throw Error("Cannot inspect Page slug conflicts");
 const specs=[
  {menuId:77018,name:"Hỏi đáp",slug:"hoi-dap",lengthMin:12000},
  {menuId:77019,name:"Đường dây nóng",slug:"duong-day-nong",lengthMin:75}
 ];
 const legacy=await context.newPage();
 const prepared=[];
 for(const sp of specs){
  const m=ms.data.find(x=>Number(x.id)===sp.menuId);
  if(!m||Number(m.parent)!==77004||String(m.title?.raw||m.title?.rendered||"").trim()!==sp.name)throw Error("Unverified business menu item "+sp.slug);
  const expected="https://www.pse.vn/hoat-dong-kinh-doanh/"+sp.slug+".html";
  const already=m.type==="post_type"&&m.object==="page";
  if(!already&&(m.type!=="custom"||m.url!==expected))throw Error("PSE source menu mismatch "+sp.slug);
  const res=await legacy.goto(expected,{waitUntil:"domcontentloaded",timeout:60000});
  if(res?.status()!==200)throw Error("Missing Joomla source "+sp.slug);
  const extracted=await legacy.evaluate(()=>{
   const orig=document.querySelector(".item-page [itemprop='articleBody']");
   if(!orig)throw Error("Missing original articleBody");
   const c=orig.cloneNode(true);
   c.querySelectorAll("script,style,noscript,iframe,form,input,button,.relateditems,.pager,.pagination,.item-page__related").forEach(el=>el.remove());
   const links=[...c.querySelectorAll("a[href]")];
   const toPlain=a=>{const s=document.createElement("span");s.innerHTML=a.innerHTML;a.replaceWith(s)};
   for(const a of links){const href=a.getAttribute("href")||"";let dest;try{dest=new URL(href,location.href)}catch{toPlain(a);continue}
    if(!["https:","http:","mailto:","tel:"].includes(dest.protocol)){toPlain(a);continue}
    if(["http:","https:"].includes(dest.protocol)&&!["www.pse.vn","pse.vn","dpm.vn","www.dpm.vn"].includes(dest.hostname)){toPlain(a);continue}
    a.removeAttribute("onclick");a.removeAttribute("onmouseover");a.setAttribute("href",dest.href);
   }
   c.querySelectorAll("*").forEach(e=>{for(const a of [...e.attributes])if(/^on/i.test(a.name))e.removeAttribute(a.name)});
   const text=(c.textContent||"").replace(/\s+/g," ").trim();
   return{html:c.innerHTML,text,links:links.length,images:c.querySelectorAll("img").length};
  });
  if(extracted.text.length<sp.lengthMin||extracted.html.length>145000||extracted.images!==0||/<script|javascript:/i.test(extracted.html))throw Error("Legacy article not safe/complete "+sp.slug);
  const found=pages.data.filter(x=>x.slug===sp.slug);
  if(found.length>1||(found.length===1&&(found[0].acf?.action!=="PublicPage"||found[0].acf?.key!=="pse-business-"+sp.slug)))throw Error("Page slug occupied "+sp.slug);
  prepared.push({...sp,menu:m,sourceUrl:expected,source:extracted,existing:found[0]||null});
  console.log("PSE_STATIC_SUBPAGE_PREFLIGHT="+JSON.stringify({slug:sp.slug,characters:extracted.text.length,sha:hash(extracted.text),cleanLinkCount:extracted.links,existingId:found[0]?.id||null,mode:dry?"dry":"apply"}));
 }
 if(dry){console.log("PSE_STATIC_SUBPAGES=DRY_PASS; count=2; no_wp_write=true");process.exit(0)}
 const backups=prepared.map(v=>({slug:v.slug,menuId:v.menuId,menuType:v.menu.type,originalUrl:v.menu.url,existingId:v.existing?.id||null,originalRaw:v.existing?.content?.raw||""}));
 const {mkdir,writeFile}=await import("node:fs/promises");await mkdir("artifacts/pse-static-subpages",{recursive:true});await writeFile("artifacts/pse-static-subpages/prewrite.json",JSON.stringify(backups,null,2)+"\n");
 let published=0,links=0;
 for(const sp of prepared){
  let wpPage=sp.existing;
  if(!wpPage){
   const r=await api("/wp-json/wp/v2/pages","POST",{title:sp.name,slug:sp.slug,status:"draft",content:sp.source.html,acf:{action:"PublicPage",key:"pse-business-"+sp.slug}});
   if(r.http!==201||!Number.isSafeInteger(Number(r.data?.id)))throw Error("Page creation failed "+sp.slug+" HTTP "+r.http);
   wpPage=r.data;
  }
  const get=()=>api("/wp-json/wp/v2/pages/"+wpPage.id+"?context=edit&_fields=id,slug,status,acf,content");
  const before=await get();
  if(before.http!==200||before.data?.acf?.action!=="PublicPage"||before.data.acf?.key!=="pse-business-"+sp.slug||before.data.slug!==sp.slug)throw Error("Page metadata mismatch "+sp.slug);
  const normalized=await page.evaluate(html=>{const d=document.createElement("div");d.innerHTML=html;return (d.textContent||"").replace(/\s+/g," ").trim()},String(before.data.content?.raw||""));
  if(normalized!==sp.source.text)throw Error("WordPress Page source parity failed "+sp.slug);
  if(before.data.status==="draft"){
   const r=await api("/wp-json/wp/v2/pages/"+wpPage.id,"POST",{status:"publish"});if(r.http!==200||r.data?.status!=="publish")throw Error("Publish failed "+sp.slug);
   published++;
  }else if(before.data.status!=="publish")throw Error("Page status unsafe "+sp.slug);
  if(sp.menu.type!=="post_type"){
   const r=await api("/wp-json/wp/v2/menu-items/"+sp.menuId,"POST",{type:"post_type",object:"page",object_id:Number(wpPage.id)});
   if(r.http!==200||Number(r.data.object_id)!==Number(wpPage.id))throw Error("Menu bind failed "+sp.slug);
   links++;
  }
  const [fresh,link]=await Promise.all([get(),api("/wp-json/wp/v2/menu-items/"+sp.menuId+"?context=edit")]);
  if(fresh.http!==200||fresh.data.status!=="publish"||link.http!==200||link.data.object!=="page"||Number(link.data.object_id)!==Number(wpPage.id))throw Error("Readback failed "+sp.slug);
  console.log("PSE_STATIC_SUBPAGE_PUBLISHED="+JSON.stringify({slug:sp.slug,id:wpPage.id,menuId:sp.menuId,originalTextHash:hash(sp.source.text),action:"PublicPage",key:"pse-business-"+sp.slug}));
 }
 console.log("PSE_STATIC_SUBPAGES=PASS; total=2; published="+published+"; linked="+links+"; no_astro_build=true");
}finally{await browser.close()}
