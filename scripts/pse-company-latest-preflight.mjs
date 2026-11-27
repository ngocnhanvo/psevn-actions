import {chromium,request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {searchDate,sourceId,parseCreated} from "./pse-legacy-search-date.mjs";
const marker=(await readFile(".pse-company-latest-preflight-request","utf8")).trim();
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
if(marker!=="MODE=READONLY"||String(event.head_commit?.message||"").split("\n")[0]!=="audit(pse): preflight latest exact Joomla company news and native media")
 throw Error("Only read-only source preflight authorized");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const origin=name=>{const rows=env.filter(s=>s.startsWith(name+"="));if(rows.length!==1)throw Error("Missing "+name);
 const u=new URL(rows[0].slice(name.length+1).replace(/^['"]|['"]$/g,""));if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid "+name);return u.origin;};
const wp=origin("WC_URL");
const website="https://www.pse.vn";
const browser=await chromium.launch({headless:true});
const network=await request.newContext({timeout:50000});
const page=await browser.newPage({viewport:{width:1366,height:1000}});
const datePage=await browser.newPage({viewport:{width:1366,height:1000}});
const auth=await browser.newPage({viewport:{width:1366,height:1000}});
const report={mode:"READONLY",news:[],dateResults:[],media:[],sourceLinks:[],noWrites:true};
const normalize=x=>String(x||"").normalize("NFKC").trim().replace(/\s+/g," ").toLocaleLowerCase("vi");
try{
 const res=await network.get(website+"/21-tin-tuc-su-kien/tin-cong-ty.html",{timeout:55000});
 if(res.status()!==200)throw Error("Joomla source archive HTTP "+res.status());
 await page.goto(website+"/21-tin-tuc-su-kien/tin-cong-ty.html",{waitUntil:"domcontentloaded",timeout:60000});
 const firstTwo=await page.evaluate(()=>{
  const rows=[...document.querySelectorAll(".blog .items-row")].slice(0,2);
  return rows.map((row,i)=>({index:i,title:(row.querySelector(".page-header h2")?.textContent||"").replace(/\s+/g," ").trim(),
   text:(row.querySelector(".item")?.textContent||"").replace(/\s+/g," ").trim().slice(0,1300),
   htmlLength:row.querySelector(".item")?.innerHTML.length||0,
   images:[...row.querySelectorAll(".item img[src]")].map(e=>({src:e.src,alt:e.alt})),
   links:[...row.querySelectorAll("a[href]")].map(e=>({label:(e.textContent||"").trim().slice(0,90),href:e.href})).slice(0,12)}));
 });
 if(firstTwo.length!==2||!normalize(firstTwo[0].title).includes("công tác cán bộ")||
  !normalize(firstTwo[1].title).includes("một ngày thứ bảy")||
  !firstTwo[0].text.includes("12/11/2026")||!firstTwo[1].text.includes("7 tháng 11 năm 2026")||
  firstTwo[0].images.length!==4||firstTwo[1].images.length!==5)throw Error("Original first two Joomla news sources changed");
 report.news=firstTwo;
 const searchWord=encodeURIComponent("Phú Mỹ Đông Nam Bộ tổ chức Lễ công bố và trao quyết định về công tác cán bộ");
 const searchRes=await datePage.goto(website+"/component/search/?searchword="+searchWord+"&ordering=newest&searchphrase=all",{waitUntil:"domcontentloaded",timeout:60000});
 if(searchRes?.status()!==200)throw Error("Joomla com_search unavailable");
 const rows=await datePage.evaluate(()=>[...document.querySelectorAll("dl.search-results dt.result-title a[href],.search-results a[href],.result-title a[href]")].map(a=>{
  let date="";let dt=a.closest("dt");
  if(dt){let s=dt.nextElementSibling;while(s&&s.tagName!=="DT"){if(s.matches(".result-created,[class*=result-created]")){date=s.textContent||"";break}s=s.nextElementSibling}}
  if(!date)date=a.closest(".search-result,li,article")?.querySelector(".result-created,[class*=result-created]")?.textContent||"";
  return{title:(a.textContent||"").trim(),href:a.href,date};
 }));
 report.sourceLinks=rows.map(x=>({...x,sourceId:sourceId(x.href),parsed:parseCreated(x.date)}));
 const appointment=report.sourceLinks.filter(x=>normalize(x.title)===normalize(firstTwo[0].title));
 report.appointmentSearch=appointment;
 const valid=appointment.filter(x=>x.sourceId&&x.parsed?.day?.startsWith("2026"));
 if(valid.length===1)report.appointmentSource={...valid[0]};
 const knownUrl=website+"/21-tin-tuc-su-kien/tin-cong-ty/1739-phu-my-dong-nam-bo-mot-ngay-thu-bay-day-y-nghia.html";
 const date=await searchDate(datePage,{id:1739,sourceUrl:knownUrl,title:firstTwo[1].title,opening:firstTwo[1].text.slice(0,500)});
 report.dateResults=[date];
 if(report.appointmentSource?.sourceId){
  const adate=await searchDate(datePage,{id:report.appointmentSource.sourceId,sourceUrl:report.appointmentSource.href,title:firstTwo[0].title,opening:firstTwo[0].text.slice(0,500)});
  report.dateResults.push(adate);
 }
 await auth.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await auth.locator("#user_login").count()){
  await auth.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await auth.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const body=await auth.locator("body").innerText(),m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,"×":a*b,"*":a*b,x:a*b})[m[2]];
   const field=auth.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error("Missing WP challenge");await field.fill(String(n));
  }
  await Promise.all([auth.waitForLoadState("domcontentloaded"),auth.locator("#wp-submit").click()]);
 }
 if(auth.url().includes("wp-login"))throw Error("No WP auth");
 const nonce=await auth.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("No nonce");return(await r.text()).trim()});
 const api=async path=>auth.evaluate(async({path,nonce})=>{const r=await fetch(path,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json"}});return{status:r.status,data:await r.json().catch(()=>null)};},{path,nonce});
 const media=firstTwo.flatMap(x=>x.images);
 for(const img of media){
  const filename=new URL(img.src).pathname.split("/").pop();
  const [wpMedia,srcCheck]=await Promise.all([
   api("/wp-json/wp/v2/media?context=edit&search="+encodeURIComponent(filename.replace(/\.jpe?g$/i,""))+"&per_page=30&_fields=id,slug,source_url,media_details,mime_type"),
   network.head(img.src,{timeout:40000}).catch(e=>({status:()=>0,headers:()=>({})})),
  ]);
  if(wpMedia.status!==200||!Array.isArray(wpMedia.data))throw Error("Media register unreadable "+filename);
  const matching=wpMedia.data.filter(m=>String(m.media_details?.file||"").split("/").at(-1)===filename);
  report.media.push({original:img.src,filename,sourceStatus:srcCheck.status(),contentType:srcCheck.headers()["content-type"]||"",
   existing:matching.map(m=>({id:m.id,slug:m.slug,url:m.source_url,file:m.media_details?.file})),searchMatches:wpMedia.data.length});
 }
 const wpSearch=await api("/wp-json/wp/v2/posts?context=edit&status=any&search="+encodeURIComponent("Hoàng Tuấn Vinh")+"&per_page=30&_fields=id,title,date,slug,status,categories");
 const p1739=await api("/wp-json/wp/v2/posts?context=edit&status=any&slug=phu-my-dong-nam-bo-mot-ngay-thu-bay-day-y-nghia&_fields=id,title,date,slug,status,categories");
 report.wordpress={appointmentNameMentions:{status:wpSearch.status,results:wpSearch.data},post1739:{status:p1739.status,results:p1739.data}};
 console.log("PSE_COMPANY_LATEST_PREFLIGHT="+JSON.stringify({latest:report.news,dateResults:report.dateResults,appointmentSource:report.appointmentSource,
  appointmentSearch:report.appointmentSearch,media:report.media,wordpress:report.wordpress}).slice(0,29000));
}finally{
 await mkdir("artifacts/pse-company-news",{recursive:true});
 await writeFile("artifacts/pse-company-news/latest-preflight.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();await network.dispose();
}
