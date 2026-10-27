/** Date exposed by Joomla com_search (CREATED date, not necessarily publish_up).
 * Read-only helper; an exact legacy article-ID and title match are required.
 */
import { chromium } from "playwright";
const base="https://www.pse.vn";
const txt=v=>String(v||"").normalize("NFKC").replace(/\s+/g," ").trim();
const folded=v=>txt(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
export function sourceId(href){
 try {
  const u=new URL(href,base);
  if(!["www.pse.vn","pse.vn"].includes(u.hostname))return null;
  const m=u.pathname.match(/\/(\d{2,6})-[^/]+\.html$/i);
  if(m)return Number(m[1]);
  if(u.searchParams.get("option")==="com_content"&&u.searchParams.get("view")==="article"){
   const q=u.searchParams.get("id")?.match(/^(\d{2,6})(?::|$)/);
   return q?Number(q[1]):null;
  }
 }catch{}
 return null;
}
const months={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
export function parseCreated(text){
 const s=folded(text);
 let y,m,d;let x=s.match(/\b(20\d\d|19\d\d)-(\d\d?)-(\d\d?)\b/);
 if(x){[,y,m,d]=x}
 else if((x=s.match(/\b(\d\d?)[\/.\-](\d\d?)[\/.\-](20\d\d|19\d\d)\b/))){[,d,m,y]=x}
 else if((x=s.match(/\b(?:ngay\s+)?(\d\d?)\s+thang\s+(\d\d?)\s+(?:nam\s+)?(20\d\d|19\d\d)\b/))){[,d,m,y]=x}
 else if((x=s.match(/\b(\d\d?)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(20\d\d|19\d\d)\b/))){d=x[1];m=months[x[2]];y=x[3]}
 else return null;
 y=Number(y);m=Number(m);d=Number(d);
 const v=new Date(Date.UTC(y,m-1,d));
 if(v.getUTCFullYear()!==y||v.getUTCMonth()+1!==m||v.getUTCDate()!==d)return null;
 const day=`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
 const time=s.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/);
 return {day,time:time?`${time[1].padStart(2,"0")}:${time[2]}:${time[3]||"00"}`:null,precision:time?"second":"day"};
}
export async function searchDate(page,{id,sourceUrl,title,opening}){
 if(!Number.isSafeInteger(id)||sourceId(sourceUrl)!==id)throw Error("Invalid legacy ID/source URL");
 const queries=[txt(opening).split(" ").slice(0,18).join(" "),txt(title),txt(opening).split(" ").slice(0,9).join(" ")].filter((s,i,a)=>s.length>18&&a.indexOf(s)===i);
 const attempts=[];
 for(const query of queries){
  const url=new URL("/component/search/",base);
  url.searchParams.set("searchword",query);
  url.searchParams.set("ordering","newest");
  url.searchParams.set("searchphrase","all");
  let res;
  try{res=await page.goto(url.toString(),{waitUntil:"domcontentloaded",timeout:45000})}
  catch(e){attempts.push({query,error:String(e).slice(0,100)});continue}
  if(!res||res.status()!==200){attempts.push({query,http:res?.status()});continue}
  const rows=await page.evaluate(()=>{
   return [...document.querySelectorAll("dl.search-results dt.result-title a[href],.search-results a[href],.result-title a[href]")].map(a=>{
    let date="";
    const dt=a.closest("dt");
    if(dt){
     let sibling=dt.nextElementSibling;
     while(sibling&&sibling.tagName!=="DT"){
      if(sibling.matches(".result-created,[class*=result-created]")){date=sibling.textContent||"";break}
      sibling=sibling.nextElementSibling;
     }
    }
    if(!date)date=a.closest(".search-result,li,article")?.querySelector(".result-created,[class*=result-created]")?.textContent||"";
    return {href:a.href,title:a.textContent||"",date};
   });
  });
  const matches=rows.filter(r=>sourceId(r.href)===id);
  attempts.push({query,results:rows.length,matches:matches.length});
  if(matches.length!==1)continue;
  const item=matches[0];
  if(folded(item.title)!==folded(title)){attempts.at(-1).error="TITLE_MISMATCH";continue}
  const parsed=parseCreated(item.date);
  if(!parsed){attempts.at(-1).error="DATE_MISSING_OR_INVALID";continue}
  return {id,matchedUrl:item.href,title:txt(item.title),displayedDate:txt(item.date),...parsed,source:"joomla_com_search_created",query};
 }
 return {id,source:"unverified",attempts};
}
if(process.argv.includes("--probe")){
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1366,height:850}});
  await context.route(/\.(?:png|jpe?g|webp|svg|gif|woff2?|ttf)(?:[?#]|$)/i,route=>route.abort());
  const page=await context.newPage();
  const result=await searchDate(page,{
   id:1635,
   sourceUrl:"https://www.pse.vn/21-tin-tuc-su-kien/tin-cong-ty/1635-pvfcco-pse-to-chuc-le-cong-bo-va-trao-quyet-dinh-ve-cong-tac-can-bo-2.html",
   title:"PVFCCo-PSE tổ chức Lễ công bố và trao quyết định về công tác cán bộ",
   opening:"Vào sáng ngày 21/04/2025, tại Thành phố Hồ Chí Minh, Công ty Cổ phần Phân bón và Hóa chất Dầu khí Đông Nam Bộ (PVFCCo-PSE) đã tổ chức Lễ công bố và trao quyết định về công tác cán bộ."
  });
  console.log("PSE_LEGACY_SEARCH_DATE_PROBE="+JSON.stringify(result));
  if(!result.day)process.exitCode=2;
 }finally{await browser.close()}
}
