/** PSE verified investor/agriculture taxonomy routes, mobile+desktop live browser QA. READ ONLY. */
import {chromium} from "playwright";
import {mkdir} from "node:fs/promises";
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const parse=(key)=>{const x=vars.filter(s=>s.startsWith(key+"="));if(x.length!==1)throw Error("Missing PSE "+key);const u=new URL(x[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));if(u.protocol!=="https:"||u.username||u.password)throw Error("Unsafe PSE "+key);return u.origin};
const frontend=parse("WC_URL_CLIENT"),cms=parse("WC_URL");
const names=[
 {slug:"thong-tin-quan-tri",parent:"thong-tin-co-dong",min:1},
 {slug:"ban-cong-bo-thong-tin",parent:"thong-tin-co-dong",min:1},
 {slug:"bao-cao-tai-chinh",parent:"thong-tin-co-dong",min:1},
 {slug:"bao-cao-thuong-nien",parent:"thong-tin-co-dong",min:1},
 {slug:"tai-lieu-quan-tri-cong-ty",parent:"thong-tin-co-dong",min:1},
 {slug:"kien-thuc-nong-nghiep",parent:"",min:1},
 {slug:"huong-dan-su-dung-phan-bon",parent:"kien-thuc-nong-nghiep",min:1},
 {slug:"phan-biet-va-chon-mua-phan-bon",parent:"kien-thuc-nong-nghiep",min:0}
];
const browser=await chromium.launch({headless:true});const results=[];
try{
 const auth=await browser.newPage();
 await auth.goto(cms+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await auth.locator("#user_login").count()){
  await auth.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await auth.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const s=await auth.locator("body").innerText(),m=s.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||s.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],answer=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const f=auth.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("Cannot solve login challenge");await f.fill(String(answer))}
  await Promise.all([auth.waitForLoadState("domcontentloaded"),auth.locator("#wp-submit").click()]);
 }
 if(auth.url().includes("wp-login"))throw Error("WP login rejected");
 const nonce=await auth.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("REST nonce fail");return(await r.text()).trim()});
 const api=(path)=>auth.evaluate(async({path,nonce})=>{const r=await fetch(path,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce}});return{http:r.status,data:await r.json().catch(()=>({}))}},{path,nonce});
 const [catResponse,menus]=await Promise.all([api("/wp-json/wp/v2/categories?per_page=100&hide_empty=false&_fields=id,slug,name,parent,count"),api("/wp-json/wp/v2/menu-items?context=edit&per_page=100")]);
 if(catResponse.http!==200||!Array.isArray(catResponse.data)||menus.http!==200||!Array.isArray(menus.data))throw Error("WordPress taxonomy/menu registry API unavailable");
 const cats=catResponse.data;
 const verified=names.map(row=>{const matches=cats.filter(c=>c.slug===row.slug);if(matches.length!==1)throw Error("Category not unique "+row.slug);const c=matches[0];if(row.parent){const p=cats.find(x=>x.slug===row.parent);if(!p||Number(c.parent)!==Number(p.id))throw Error("WP category ancestry changed "+row.slug)}else if(Number(c.parent)!==0)throw Error("WP top-level category moved "+row.slug);if(Number(c.count)<row.min)throw Error("Missing expected published posts "+row.slug);const target=frontend+"/tin-tuc-su-kien/?cat="+row.slug;const item=menus.data.find(m=>String(m.url||"")===target);if(!item)throw Error("Missing WordPress header category route "+row.slug);return{...row,id:c.id,name:c.name,count:c.count,target}});
 await mkdir("artifacts/pse-taxonomy-live-qa",{recursive:true});
 let passed=0;
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  try{
   for(const spec of verified){
    try{
     const res=await page.goto(spec.target,{waitUntil:"domcontentloaded",timeout:55000});
     const d=await page.evaluate(()=>{
      const main=document.querySelector("#main-content");
      const cards=main?.querySelectorAll("#posts-grid .grid > div").length||0;
      const h1=[...(main?.querySelectorAll("h1")||[])].map(x=>(x.textContent||"").trim());
      return{h1,header:!!document.querySelector(".pse-header"),footer:!!document.querySelector(".pse-footer"),main:!!main,cards,
       overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+3,
       catFilter:[...document.querySelectorAll("#dropdown-menu a")].length,
       breadcrumb:[...document.querySelectorAll('nav[aria-label="Đường dẫn trang"] li')].map(x=>x.textContent?.replace(/\s+/g," ").trim())};
     });
     const expected=spec.name.replace(/&amp;/g,"&");
     const ok=res?.status()===200&&d.main&&d.header&&d.footer&&d.h1.length===1&&d.h1[0]===expected&&!d.overflow&&d.catFilter>=10&&d.cards>=Math.min(spec.count,12);
     const result={width,slug:spec.slug,http:res?.status(),id:spec.id,count:spec.count,...d,pass:ok};results.push(result);
     console.log("PSE_NEW_CATEGORY_QA="+JSON.stringify(result));
     if(ok)passed++;
    }catch(e){results.push({width,slug:spec.slug,error:String(e).slice(0,200),pass:false})}
   }
  }finally{await page.close()}
 }
 console.log("PSE_NEW_CATEGORY_QA_SUMMARY="+JSON.stringify({checked:results.length,passed,failed:results.filter(x=>!x.pass),readOnly:true,noBuild:true}));
 if(passed!==names.length*2)process.exitCode=1;
}finally{await browser.close()}
