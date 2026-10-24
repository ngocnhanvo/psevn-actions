/** Bind existing PSE news/investor category Pages to CMS-owned SSR archive routes. No post mutations. */
import {chromium} from "playwright";
const env=Object.fromEntries(String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim()).filter(x=>/^WC_URL(_CLIENT)?=/.test(x)).map(x=>{const i=x.indexOf("="),v=new URL(x.slice(i+1).replace(/^['"]|['"]$/g,""));if(v.protocol!=="https:"||v.username||v.password||v.search||v.hash||!["","/"].includes(v.pathname))throw Error("Invalid URL env");return[x.slice(0,i),v.origin]}));
if(!env.WC_URL||!env.WC_URL_CLIENT)throw Error("Missing PSE origins");
const b=await chromium.launch({headless:true});const p=await b.newPage();
try{
 await p.goto(env.WC_URL+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await p.locator("#user_login").count()){
  await p.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await p.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const text=await p.locator("body").innerText(),m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],v=+m[3],z=({"+":a+v,"-":a-v,x:a*v,"×":a*v,"*":a*v})[m[2]];const f=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("Captcha");await f.fill(String(z))}
  await Promise.all([p.waitForLoadState("domcontentloaded"),p.locator("#wp-submit").click()]);
 }
 const nonce=await p.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});return(await r.text()).trim()});
 const api=async(path,method="GET",body)=>p.evaluate(async({path,method,body,nonce})=>{const r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});return{http:r.status,data:await r.json().catch(()=>({}))}},{path,method,body,nonce});
 const archive=await api("/wp-json/wp/v2/pages/77030?context=edit&_fields=id,status,slug,acf");
 if(archive.http!==200||archive.data?.status!=="publish"||archive.data.acf?.action!=="PostsPage"||archive.data.acf?.key!=="ssr-posts")throw Error("WordPress archive not published");
 const specs=[{id:77022,label:"Tin tức cổ đông",parent:77021,slug:"thong-tin-co-dong",legacy:"/quan-he-nha-dau-tu/tin-tuc-co-dong.html"},{id:77017,label:"Thông tin thị trường",parent:77004,slug:"thong-tin-thi-truong",legacy:"/hoat-dong-kinh-doanh/thong-tin-thi-truong.html"}];
 for(const sp of specs){
  const [menu,category]=await Promise.all([api("/wp-json/wp/v2/menu-items/"+sp.id+"?context=edit"),api("/wp-json/wp/v2/categories?slug="+sp.slug+"&_fields=id,slug,parent,count,name")]);
  if(menu.http!==200||menu.data?.id!==sp.id||Number(menu.data.parent)!==sp.parent||String(menu.data.title?.raw||menu.data.title?.rendered||"").trim()!==sp.label||category.http!==200||category.data?.length!==1||!Number(category.data[0].count))throw Error("Menu/category identity mismatch "+sp.slug);
  const target=env.WC_URL_CLIENT+"/tin-tuc-su-kien/?cat="+sp.slug;
  if(menu.data.url===target){console.log("PSE_EXISTING_ARCHIVE_MENU=ALREADY_DONE; id="+sp.id);continue}
  const old=new URL(menu.data.url||"");if(menu.data.type!=="custom"||old.protocol!=="https:"||old.hostname!=="www.pse.vn"||old.pathname!==sp.legacy)throw Error("Legacy target not verified "+sp.slug);
  const r=await api("/wp-json/wp/v2/menu-items/"+sp.id,"POST",{type:"custom",url:target});
  if(r.http!==200||r.data?.url!==target)throw Error("WordPress menu update failed "+sp.slug);
  const saved=await api("/wp-json/wp/v2/menu-items/"+sp.id+"?context=edit");
  if(saved.http!==200||saved.data.url!==target)throw Error("Menu not persisted "+sp.slug);
  console.log("PSE_EXISTING_ARCHIVE_MENU=PASS; id="+sp.id+"; category="+sp.slug+"; posts="+category.data[0].count+"; no_posts_mutated=true");
 }
 const home=await api("/wp-json/wp/v2/pages/248?context=edit&_fields=id,slug,status,acf");
 if(home.http!==200||home.data?.id!==248||home.data.status!=="publish"||home.data.acf?.action!=="HomePage"||home.data.acf?.key!=="home")throw Error("PSE WordPress homepage identity changed");
 const item=await api("/wp-json/wp/v2/menu-items/76983?context=edit");
 if(item.http!==200||item.data?.id!==76983||Number(item.data.parent)!==0||String(item.data.title?.raw||item.data.title?.rendered||"").trim()!=="TRANG CHỦ")throw Error("Original homepage menu identity changed");
 const old=item.data.url||"";
 const dest=env.WC_URL_CLIENT+"/";
 if(old!==dest){
  const source=new URL(old);
  if(item.data.type!=="custom"||source.href!=="https://www.pse.vn/")throw Error("Homepage menu no longer has verified original URL");
  const saved=await api("/wp-json/wp/v2/menu-items/76983","POST",{type:"custom",url:dest});
  if(saved.http!==200||saved.data?.url!==dest)throw Error("Homepage menu Save failed");
  const read=await api("/wp-json/wp/v2/menu-items/76983?context=edit");
  if(read.http!==200||read.data.url!==dest)throw Error("Homepage menu readback mismatch");
  console.log("PSE_HOMEPAGE_MENU=PASS; native_page=248; item=76983; frontend_origin=true");
 }else console.log("PSE_HOMEPAGE_MENU=ALREADY_DONE; no_write=true");
}finally{await b.close()}
