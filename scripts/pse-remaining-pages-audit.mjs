/** Read-only checkpoint for all remaining PSE submenu destinations. No WP writes, no build. */
import {chromium} from "playwright";
const env=Object.fromEntries(String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,"")).filter(s=>/^WC_URL(_CLIENT)?=/.test(s)).map(s=>{const k=s.slice(0,s.indexOf("=")),v=s.slice(s.indexOf("=")+1).replace(/^['"]|['"]$/g,"");const u=new URL(v);if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid origin "+k);return[k,u.origin]}));
if(!env.WC_URL||!env.WC_URL_CLIENT)throw Error("PSE env origins unavailable");
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.goto(env.WC_URL+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const txt=await page.locator("body").innerText(),m=txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("WP math missing");await f.fill(String(v))}
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WP login failed");
 const nonce=await page.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("Nonce fail");return (await r.text()).trim()});
 const routes=["/wp-json/wp/v2/menu-items?context=edit&per_page=100&_fields=id,title,url,parent,type,object,object_id,menus,menu_order","/wp-json/wp/v2/categories?context=edit&per_page=100&hide_empty=false&_fields=id,slug,name,parent,count","/wp-json/wp/v2/pages?context=edit&status=publish&per_page=100&_fields=id,title,slug,status,acf,parent","/wp-json/wp/v2/pages/77030?context=edit&_fields=id,title,slug,status,acf,content","/wp-json/wp/v2/chuyen-huong-link?context=edit&status=publish&per_page=100&_fields=id,status,acf"];
 const results=await page.evaluate(async ({routes,nonce})=>Promise.all(routes.map(async path=>{const r=await fetch(path,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,"Cache-Control":"no-cache"}});return {http:r.status,path,headers:{total:r.headers.get("X-WP-Total"),pages:r.headers.get("X-WP-TotalPages")},data:await r.json().catch(()=>null)}})),{routes,nonce});
 for(const x of results){if(x.http!==200)throw Error("WP inventory HTTP "+x.http+" "+x.path)}
 const [menus,categories,pages,archive,redirects]=results.map(x=>x.data);
 if(!Array.isArray(menus)||!Array.isArray(categories)||!Array.isArray(pages))throw Error("Incorrect WordPress inventory type");
 const refs=menus.map(m=>({id:m.id,parent:m.parent||0,label:String(m.title?.raw||m.title?.rendered||"").replace(/<[^>]*>/g,"").trim(),url:m.url||"",type:m.type||"",object:m.object||"",objectId:m.object_id||0}));
 console.log("PSE_SUBPAGE_MENU="+JSON.stringify(refs));
 console.log("PSE_SUBPAGE_TAXONOMY="+JSON.stringify(categories));
 console.log("PSE_SUBPAGE_PAGE_COUNT="+JSON.stringify({publishedPageCount:results[2].headers.total,returned:pages.length,ids:pages.map(p=>({id:p.id,slug:p.slug,title:p.title?.raw||p.title?.rendered,action:p.acf?.action,key:p.acf?.key})).filter(p=>/tin|thu|hoat|quan|lien|co-dong|kinh-doanh|cong-ty|chuong|bao-cao|thong-diep|tam-nhin/.test(p.slug))}));
 console.log("PSE_SUBPAGE_ARCHIVE="+JSON.stringify({http:results[3].http,id:archive?.id,status:archive?.status,slug:archive?.slug,action:archive?.acf?.action,key:archive?.acf?.key,contentSize:String(archive?.content?.raw||"").length}));
 console.log("PSE_SUBPAGE_REDIRECTS="+JSON.stringify({count:redirects.length,news:redirects.filter(x=>/tin-tuc-su-kien/.test(String(x.acf?.from_link||"")+String(x.acf?.to_link||""))).map(x=>({id:x.id,from:x.acf?.from_link,to:x.acf?.to_link,type:x.acf?.type,match:x.acf?.match_type}))}));
 const navPaths=[...new Set(refs.filter(x=>/^(https?:\/\/|\/)/.test(x.url)).map(x=>{try{const u=new URL(x.url,env.WC_URL_CLIENT);return u.origin===env.WC_URL_CLIENT?u.pathname+u.search:null}catch{return null}}).filter(Boolean))].slice(0,45);
 const probe=await page.evaluate(async ({origin,paths})=>Promise.all(paths.map(async path=>{try{const r=await fetch(origin+path,{redirect:"follow",signal:AbortSignal.timeout(13000)});return {path,http:r.status,final:new URL(r.url).pathname}}catch(e){return{path,error:String(e).slice(0,100)}}})),{origin:env.WC_URL_CLIENT,paths:navPaths});
 console.log("PSE_SUBPAGE_PUBLIC="+JSON.stringify(probe));
 console.log("PSE_SUBPAGE_AUDIT=PASS; mode=read-only; no-cms-write=true; no-build=true");
}finally{await browser.close()}
