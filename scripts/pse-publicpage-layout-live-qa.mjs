import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const value=String(process.env.ENV_FILE||"").split(/\r?\n/)
  .map(s=>s.trim()).find(s=>s.startsWith("WC_URL_CLIENT="));
if(!value)throw Error("No frontend URL in authorized Actions env");
const configured=new URL(value.slice("WC_URL_CLIENT=".length).replace(/^['"]|['"]$/g,""));
if(configured.protocol!=="https:"||configured.username||configured.password||
  configured.search||configured.hash||!["","/"].includes(configured.pathname))
  throw Error("Unsafe frontend origin");
const origin=configured.origin;
const slugs=["thong-diep","hoi-dong-quan-tri","ban-kiem-soat","ban-giam-doc",
  "so-do-to-chuc","qua-trinh-hinh-thanh-phat-trien","tam-nhin-su-menh",
  "dinh-huong-phat-trien","nganh-nghe-kinh-doanh","thanh-tuu"];
const screenshots=new Set(["hoi-dong-quan-tri","ban-giam-doc","qua-trinh-hinh-thanh-phat-trien","thanh-tuu"]);
const folder="artifacts/pse-corporate-live";
mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({headless:true});
let checks=0,failed=0;
try {
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1});
  const page=await context.newPage();
  try {
   for(const slug of slugs) {
    const response=await page.goto(origin+"/"+slug,{waitUntil:"domcontentloaded",timeout:60000});
    const result=await page.evaluate(()=>{
      const main=document.querySelector("#main-content.pse-public-page");
      const article=main?.querySelector(".pse-public-body .article-content");
      const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}};
      const tables=[...(article?.querySelectorAll("table")||[])];
      const top=tables.filter(t=>!t.parentElement?.closest("table"));
      const nestedScroll=[...(article?.querySelectorAll("*")||[])].filter(el=>{
        const style=getComputedStyle(el);
        return /^(auto|scroll)$/.test(style.overflowY)&&el.scrollHeight>el.clientHeight+12;
      }).slice(0,8).map(e=>({
        tag:e.tagName,scroll:e.scrollHeight,client:e.clientHeight,style:e.getAttribute("style")?.slice(0,90)||""
      }));
      const widths=top.map(t=>{
        const r=box(t),parent=box(article);
        const preferred=Math.min(parent.width,1200);
        const centered=Math.abs((r.x-parent.x)-(parent.width-r.width-(r.x-parent.x)))<65;
        return {w:Math.round(r.width),target:Math.round(preferred),
          centered,scroll:t.scrollHeight,client:t.clientHeight,
          overflow:getComputedStyle(t).overflowY,tableDisplay:getComputedStyle(t).display};
      });
      const emptyTail=top.filter(t=>{
        const ownRows=[...t.querySelectorAll("tr")].filter(row=>row.parentElement?.closest("table")===t);
        const last=ownRows.at(-1);
        return last&&last.textContent.replace(/[\s\u00a0\u200b\ufeff]/g,"")===""&&
          !last.querySelector("img,svg,video,a,iframe,button,hr");
      }).length;
      const related=main?.querySelector("[data-pse-menu-related]");
      const body=main?.querySelector(".pse-public-body");
      const lastTable=top.at(-1);
      const tailGap=lastTable?Math.round(box(lastTable).bottom-
        Math.max(...[...lastTable.querySelectorAll("p,img")].map(e=>box(e).bottom),box(lastTable).y)):null;
      return {
        h1:main?.querySelectorAll("h1").length||0,
        introCount:main?.querySelectorAll(":scope > header p").length||0,
        overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+3,
        nestedScroll,tableCount:tables.length,topTables:widths,emptyTail,
        tailGap,bodyGap:body&&article?Math.round(box(body).bottom-box(article).bottom):null,
        related:!!related,articleHeight:Math.round(article?.getBoundingClientRect().height||0),
        images:[...(article?.querySelectorAll("img")||[])].map(i=>({alt:i.alt?.slice(0,60)||"",natural:i.naturalWidth,complete:i.complete})).slice(0,5)
      };
    });
    const bodyGapOk=result.bodyGap!==null&&result.bodyGap<=75;
    const widthOk=result.topTables.every(t=>t.centered&&t.w>=t.target*.74&&
      t.tableDisplay==="table"&&t.scroll<=t.client+12);
    const tailOk=slug!=="hoi-dong-quan-tri"||result.tailGap===null||result.tailGap<90;
    const ok=response?.status()===200&&result.h1===1&&result.introCount===0&&
      !result.overflow&&result.nestedScroll.length===0&&bodyGapOk&&widthOk&&
      result.emptyTail===0&&tailOk&&result.related;
    checks++;if(!ok)failed++;
    console.log("PSE_PUBLICPAGE_LAYOUT_LIVE="+JSON.stringify({
      width,slug,http:response?.status()||0,...result,ok
    }));
    if(screenshots.has(slug))await page.screenshot({
      path:folder+"/g7-"+width+"-"+slug+".png",fullPage:true
    });
   }
  } finally {await context.close()}
 }
 console.log("PSE_PUBLICPAGE_LAYOUT_SUMMARY="+JSON.stringify({
   checks,failed,pageCount:slugs.length,readOnly:true
 }));
 if(checks!==20||failed)process.exitCode=1;
}finally{await browser.close()}
