/** PSE actual source-verified Distribution Pages / native PDF responsive acceptance; no writes. */
import {chromium} from "playwright";
import {mkdir} from "node:fs/promises";
const varLine=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,"")).filter(x=>x.startsWith("WC_URL_CLIENT="));
if(varLine.length!==1)throw Error("PSE WordPress frontend origin absent");
const origin=new URL(varLine[0].slice(14).replace(/^['"]|['"]$/g,""));
if(origin.protocol!=="https:"||origin.username||origin.password||origin.search||origin.hash||!["","/"].includes(origin.pathname))throw Error("Invalid PSE frontend origin");
const wpLine=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,"")).filter(x=>x.startsWith("WC_URL="));
if(wpLine.length!==1)throw Error("PSE WordPress origin missing for Media host comparison");
const wpOrigin=new URL(wpLine[0].slice(7).replace(/^['"]|['"]$/g,"")).origin;
const cases=[
 {path:"/kenh-phan-phoi/",name:"Kênh phân phối",type:"landing",minLinks:3},
 {path:"/quy-che-nha-phan-phoi/",name:"Quy chế Nhà phân phối",type:"pdf",minDocs:1},
 {path:"/he-thong-kho/",name:"Hệ thống kho",type:"cards",minRows:5},
 {path:"/he-thong-phan-phoi-san-pham-tai-cac-tinh-mien-dong-nam-bo/",name:"Hệ thống phân phối sản phẩm tại các tỉnh miền Đông Nam Bộ",type:"cards",minRows:13}
];
const browser=await chromium.launch({headless:true}),fail=[];let done=0;
await mkdir("artifacts/pse-distribution-live",{recursive:true});
try{
 for(const width of [390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
  try{
   for(const item of cases){
    try{
     const res=await page.goto(origin.origin+item.path,{waitUntil:"domcontentloaded",timeout:60000});
     const data=await page.evaluate(()=>{
      const root=document.querySelector("#main-content")||document.querySelector("main");
      const body=document.querySelector(".pse-distribution-body");
      const hrefs=[...(root?.querySelectorAll("a[href]")||[])].map(x=>x.href);
      const tables=[...(body?.querySelectorAll("table")||[])];
      const rows=tables.reduce((n,t)=>n+t.querySelectorAll("tr").length,0);
      const cards=[...(body?.querySelectorAll("[data-pse-dist-card]")||[])];
      const hasToolbar=!!root?.querySelector("[data-pse-dist-search]");
      const cardValues=cards.map(x=>(x.textContent||"").replace(/\s+/g," ").trim());
      return{heading:[...(root?.querySelectorAll("h1")||[])].map(x=>(x.textContent||"").replace(/\s+/g," ").trim()),
       header:!!document.querySelector(".pse-header"),footer:!!document.querySelector(".pse-footer"),
       main:!!root,links:hrefs,
       docs:hrefs.filter(x=>/\.pdf($|\?)/i.test(new URL(x).pathname)),
       tables:tables.length,rows,cards:cards.length,hasToolbar,cardValues:cardValues.slice(0,3),textLength:(body?.textContent||"").replace(/\s+/g," ").trim().length,
       internalScrolling:[...(root?.querySelectorAll("*")||[])].filter(el=>{const s=getComputedStyle(el);return /auto|scroll/.test(s.overflowY)&&el.scrollHeight>el.clientHeight+4}).slice(0,4).map(el=>el.tagName),
       overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+3};
     });
     let ok=res?.status()===200&&data.main&&data.header&&data.footer&&!data.overflow&&data.heading.length===1&&data.heading[0]===item.name&&!data.internalScrolling.length;
     if(item.type==="landing")ok=ok&&cases.slice(1).every(other=>data.links.some(link=>new URL(link).pathname===other.path));
     if(item.type==="pdf")ok=ok&&data.docs.length>=item.minDocs&&data.docs.every(x=>new URL(x).origin===wpOrigin);
     if(item.type==="cards")ok=ok&&data.cards>=item.minRows&&data.textLength>=200;
     if(item.type==="cards"&&item.path.includes("he-thong-phan-phoi-san-pham")){
      const probe=await page.evaluate(()=>{
        const input=document.querySelector("[data-pse-dist-search]"),card=document.querySelector("[data-pse-dist-card]");
        const sample=(card?.textContent||"").trim().match(/\b(?:MST|Mã số thuế)\s*:\s*(\d{6,})/i)?.[1];
        if(!input||!card)return {searchAvailable:false};
        input.value=sample||"unlikely-to-match-unique-query";
        input.dispatchEvent(new Event("input",{bubbles:true}));
        const initial=[...document.querySelectorAll("[data-pse-dist-card]")];
        const visible=initial.filter(el=>!el.hidden).length;
        const filteredCount=Number(document.querySelector("[data-pse-dist-count]")?.textContent);
        const empty=!document.querySelector("[data-pse-dist-empty]")?.hidden;
        input.value="";input.dispatchEvent(new Event("input",{bubbles:true}));
        return{searchAvailable:true,query:sample?"cms-tax-id":"no-match",visible,filteredCount,empty,restored:initial.every(el=>!el.hidden)};
      });
      ok=ok&&probe.searchAvailable&&probe.restored&&(probe.query==="cms-tax-id"?probe.visible>=1&&probe.visible<13&&probe.filteredCount===probe.visible:probe.visible===0&&probe.empty);
      data.searchProbe=probe;
     }
     const record={width,path:item.path,http:res?.status(),...data,links:data.links.slice(0,6),pass:ok};
     console.log("PSE_DISTRIBUTION_LIVE="+JSON.stringify(record).slice(0,4400));
     if(ok)done++;else fail.push(record);
     if(width!==768&&res?.status()===200)await page.screenshot({path:"artifacts/pse-distribution-live/"+item.type+"-"+item.path.replace(/^\/+|\/+$/g,"").slice(0,34)+"-"+width+".png",fullPage:true,animations:"disabled"});
    }catch(e){fail.push({width,path:item.path,error:String(e).slice(0,250)})}
   }
  }finally{await page.close()}
 }
 console.log("PSE_DISTRIBUTION_LIVE_SUMMARY="+JSON.stringify({tested:cases.length*3,passed:done,failed:fail,readOnly:true,noBuild:true}).slice(0,18000));
 if(fail.length)process.exitCode=1;
}finally{await browser.close()}
