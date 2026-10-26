/** PSE footer BCT source diagnostic. Read-only: inspect ACF image binding and media candidates. */
import { chromium } from "playwright";
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
function origin(key){const matches=vars.filter(x=>x.startsWith(key+"="));if(matches.length!==1)throw Error("Expected unique "+key);const u=new URL(matches[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid "+key);return u.origin}
const wp=origin("WC_URL"),frontend=origin("WC_URL_CLIENT");
const browser=await chromium.launch({headless:true});
try{
 const p=await browser.newPage();
 await p.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await p.locator("#user_login").count()){
  if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("Missing WP credentials");
  await p.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await p.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const text=await p.locator("body").innerText(),m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],result=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const f=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("Login challenge without input");await f.fill(String(result))}
  await p.locator("#wp-submit").click({noWaitAfter:true,timeout:25000});
  await p.waitForFunction(()=>location.pathname.startsWith("/wp-admin")&&!document.querySelector("#loginform"),null,{timeout:45000});
 }
 if(p.url().includes("wp-login"))throw Error("WP auth failed");
 const data=await p.evaluate(async()=>{
  const nonce=window.wpApiSettings?.nonce||await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"}).then(r=>r.text()).then(s=>s.trim());
  async function get(path){const r=await fetch(path,{credentials:"same-origin",cache:"no-store",headers:{"X-WP-Nonce":nonce}});return {http:r.status,data:await r.json().catch(()=>({}))}}
  const inf=await get("/wp-json/wp/v2/thong-tin-chung/62?context=edit&_fields=id,type,status,acf");
  const acf=inf.data?.acf||{},v=acf.bocongthuong;
  const media=[];
  for(const term of ["bocongthuong","bo-cong-thuong","thong-bao","dathongbao","bct"]){
   const x=await get("/wp-json/wp/v2/media?context=edit&search="+encodeURIComponent(term)+"&per_page=50");
   media.push({term,http:x.http,items:Array.isArray(x.data)?x.data.map(q=>({id:q.id,slug:q.slug,mime:q.mime_type,alt:q.alt_text,file:q.media_details?.file,source:q.source_url})).slice(0,20):[]});
  }
  return {info:{http:inf.http,id:inf.data?.id,type:inf.data?.type,status:inf.data?.status,acfHasField:Object.hasOwn(acf,"bocongthuong"),acfKeys:Object.keys(acf).filter(x=>/bocong|link.bocong|logo/i.test(x)),bctKind:Array.isArray(v)?"array":typeof v,bctValue:typeof v==="object"?{id:v?.ID||v?.id,url:v?.url,alt:v?.alt}:String(v||"").slice(0,150),bctLink:acf.link_bocongthuong||""},media};
 });
 console.log("PSE_FOOTER_BCT_WP_INSPECT="+JSON.stringify(data));
 await p.goto(frontend+"/",{waitUntil:"domcontentloaded",timeout:65000});
 const front=await p.evaluate(()=>({images:[...document.querySelectorAll('#footer-contact img')].map(x=>({alt:x.alt,src:x.getAttribute("src"),naturalWidth:x.naturalWidth})),classes:document.querySelector('#footer-cert-title')?.parentElement?.querySelector("div")?.className}));
 console.log("PSE_FOOTER_BCT_LIVE_INSPECT="+JSON.stringify(front));
}finally{await browser.close()}
