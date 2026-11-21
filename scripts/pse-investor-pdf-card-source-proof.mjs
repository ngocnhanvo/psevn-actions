/** PSE native PDFs used in real investor/news list card placeholders.
 * READ ONLY; actual three category list card order from deployed Astro
 * is joined to canonical WP Post by its exact slug. No inferred source PDFs.
 */
import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main")throw Error("Unexpected PSE Actions branch");
const wp="https://admin-pse.webnvn.com",front="https://pse.webnvn.com";
const paths=["/tin-tuc-su-kien/ban-cong-bo-thong-tin",
 "/tin-tuc-su-kien/bao-cao-thuong-nien",
 "/tin-tuc-su-kien/tai-lieu-quan-tri-cong-ty"];
const base=wp+"/wp-json/wp/v2/posts?status=publish&per_page=100&_fields=id,slug,status,title,content,featured_media,categories";
async function pageWp(n){
 const r=await fetch(base+"&page="+n,{redirect:"manual",signal:AbortSignal.timeout(45000)});
 if(r.status!==200)throw Error("Native WordPress Post registry HTTP "+r.status);
 const total=Number(r.headers.get("x-wp-total")),pages=Number(r.headers.get("x-wp-totalpages"));
 if(!(total>=740&&total<=900&&pages>=8&&pages<=12))throw Error("Untrusted WP Post count");
 const rows=await r.json();if(!Array.isArray(rows))throw Error("WordPress REST invalid");
 return{rows,total,pages};
}
const first=await pageWp(1),pages=Array(first.pages);pages[0]=first.rows;let cursor=2;
await Promise.all(Array.from({length:3},async()=>{for(;;){
 const i=cursor++;if(i>first.pages)return;
 const n=await pageWp(i);
 if(n.total!==first.total||n.pages!==first.pages)throw Error("Source WP changed during read");
 pages[i-1]=n.rows;
}}));
const posts=pages.flat();
if(posts.length!==758||posts.length!==first.total)throw Error("WordPress Post count drift");
const bySlug=new Map(posts.map(p=>[p.slug,p]));
if(bySlug.size!==posts.length)throw Error("Duplicate WordPress slug; cannot join cards");
const pdfHref=/\bhref\s*=\s*(["'])(https?:\/\/[^"']+|\/[^"']+)\1/gi;
const hrefs=html=>[...String(html||"").matchAll(pdfHref)].map(m=>m[2].replace(/&amp;/g,"&"));
const isPdfLink=url=>{try{
 const u=new URL(url,front);return ["http:","https:"].includes(u.protocol)&&
 /\.pdf$/i.test(u.pathname)
}catch{return false}};
const browser=await chromium.launch({headless:true}),ctx=await browser.newContext({viewport:{width:1440,height:900}});
const report={schema:"pse-36-investor-native-list-card-pdf-source-classification-v1",
 readOnly:true,noCmsWrites:true,noBuild:true,postCount:posts.length,pages:[],summary:null};
try{
 for(const path of paths){
  const page=await ctx.newPage();
  try{
   const r=await page.goto(front+path,{waitUntil:"domcontentloaded",timeout:55000});
   if(r?.status()!==200)throw Error("Public investor category "+path+" status "+r?.status());
   const visible=await page.evaluate(()=>{
    const container=document.querySelector("#posts-grid .grid");
    return[...container?.children||[]].map(card=>{
      const anchor=card.querySelector('a[href]');
      const img=card.querySelector('.post-card-img');
      const tile=card.querySelector('[data-pse-document-thumb="pdf"]');
      const title=card.querySelector("h2")?.textContent?.replace(/\s+/g," ").trim()||"";
      return{href:anchor?.href||null,title,img:img?.getAttribute("src")||null,
       pdfTile:!!tile,placeholder:img?.getAttribute("src")==="/images/posts/no-image.svg"};
    });
   });
   if(visible.length<5||visible.length>30)throw Error("Unexpected investor category card count");
   const rows=[];
   for(const v of visible){
    const url=new URL(v.href||front);
    if(url.origin!==front||url.pathname==="/")throw Error("Card URL outside Astro");
    const slug=decodeURIComponent(url.pathname.replace(/\/$/,"").split("/").at(-1));
    const post=bySlug.get(slug);
    if(!post)throw Error("Card has no matching public WP Post "+slug);
    const body=String(post.content?.rendered||""),pdfLinks=[...new Set(hrefs(body).filter(isPdfLink))];
    rows.push({wpPostId:post.id,slug,title:v.title,imageSrc:v.img,
      placeholder:v.placeholder,pdfTile:v.pdfTile,pdfLinks:pdfLinks.slice(0,5),
      pdfCount:pdfLinks.length,featuredMedia:post.featured_media||0,
      bodyImageTags:(body.match(/<img\b/gi)||[]).length,bodyTextChars:body.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().length});
   }
   const out={path,cardCount:rows.length,placeholder:rows.filter(x=>x.placeholder).length,
    placeholderWithActualPDF:rows.filter(x=>x.placeholder&&x.pdfCount>0).length,
    placeholderWithoutPDF:rows.filter(x=>x.placeholder&&x.pdfCount===0).length,
    existingPdfTile:rows.filter(x=>x.pdfTile).length,rows};
   report.pages.push(out);
   console.log("PSE_INVESTOR_PDF_CARD_CATEGORY="+JSON.stringify({path,
    cards:out.cardCount,placeholders:out.placeholder,
    withPDF:out.placeholderWithActualPDF,withoutPDF:out.placeholderWithoutPDF,
    documentTiles:out.existingPdfTile,
    pdfSourcePostIds:rows.filter(x=>x.placeholder&&x.pdfCount>0).map(x=>x.wpPostId)
   }));
  }finally{await page.close()}
 }
 report.summary={pages:report.pages.length,
  cards:report.pages.reduce((n,x)=>n+x.cardCount,0),
  noImageCards:report.pages.reduce((n,x)=>n+x.placeholder,0),
  noImageButRealPdfCards:report.pages.reduce((n,x)=>n+x.placeholderWithActualPDF,0),
  noImageAndNoPdfCards:report.pages.reduce((n,x)=>n+x.placeholderWithoutPDF,0),
  existingPdfTiles:report.pages.reduce((n,x)=>n+x.existingPdfTile,0),
  readOnly:true,noCMSWrites:true};
 console.log("PSE_INVESTOR_DOCUMENT_THUMBNAIL_SOURCE_SUMMARY="+JSON.stringify(report.summary));
}finally{
 await mkdir("artifacts/pse-investor-pdf-card-sources",{recursive:true});
 await writeFile("artifacts/pse-investor-pdf-card-sources/report.json",JSON.stringify(report,null,2)+"\n");
 await ctx.close();await browser.close();
}
