/** Check the same PDF-icon layout across multiple real PSE article detail pages. READ ONLY. */
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

const origin='https://pse.webnvn.com';
const base='/tin-tuc-su-kien';
const archiveSlugs=['tai-lieu-quan-tri-cong-ty','bao-cao-tai-chinh','bao-cao-thuong-nien','ban-cong-bo-thong-tin'];
const report={schema:'pse-pdf-icons-multipage-readonly-v1',scanned:[],archives:[],errors:[],totals:{},status:'STARTED'};
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1366,height:840}});
await ctx.route(/\.(?:woff2?|ttf|otf)(?:[?#]|$)/i,r=>r.abort());
const home=new URL(origin);
const normalize=(href)=>{
 try {const u=new URL(href,origin);
  if(u.origin!==home.origin||u.search||u.hash)return null;
  const segments=u.pathname.split('/').filter(Boolean);
  return segments.length===1 && /^[a-z0-9][a-z0-9-]+$/i.test(segments[0]) ? u.pathname : null;
 }catch{return null}
};
try{
 const discovery=await ctx.newPage(),paths=new Set(['/quy-che-noi-bo-ve-quan-tri-cong-ty-16-04-2018']);
 for(const slug of archiveSlugs){
  const row={slug,pages:[],articleCount:0};
  for(const pageNum of [1,2]){
   const archive=origin+base+'/'+slug+(pageNum===2?'/2':'');
   try{
    const r=await discovery.goto(archive,{waitUntil:'domcontentloaded',timeout:45000});
    if(r?.status()!==200){row.pages.push({page:pageNum,http:r?.status()||0});continue}
    const anchors=await discovery.locator('main a[href]').evaluateAll(nodes=>nodes.map(a=>a.getAttribute('href')));
    const matched=[...new Set(anchors.map(normalize).filter(Boolean))];
    matched.forEach(path=>paths.add(path));
    row.pages.push({page:pageNum,http:200,links:matched.length});
   }catch(e){row.pages.push({page:pageNum,error:String(e).slice(0,100)})}
  }
  report.archives.push(row);
 }
 await discovery.close();
 // Bound site load. Browse all 24 governance articles plus samples from three sibling archives.
 const urls=[...paths].slice(0,58);
 for(const path of urls){
  const page=await ctx.newPage();
  try{
   const r=await page.goto(origin+path,{waitUntil:'domcontentloaded',timeout:45000});
   if(r?.status()!==200){report.scanned.push({path,http:r?.status()||0});continue}
   const data=await page.evaluate(()=>{
    const root=document.querySelector('.article-content-post');
    if(!root)return {isArticle:false};
    const els=[...root.querySelectorAll('img')];
    const imgs=els.map(img=>{
     const a=img.closest('a[href]'),link=a?.getAttribute('href')||'',
      pdf=/\.pdf(?:[?#]|$)/i.test(link),alt=img.alt||'',
      iconAlt=/^(?:pdf|pdf icon|icon pdf|biểu tượng pdf)$/i.test(alt.trim()),
      rect=img.getBoundingClientRect(),style=getComputedStyle(img);
     return {pdf,iconAlt,alt:alt.slice(0,120),src:img.getAttribute('src')?.slice(0,220)||'',
      pdfHref:pdf?link.slice(0,180):null,width:Math.round(rect.width*10)/10,height:Math.round(rect.height*10)/10,
      maxWidth:style.maxWidth,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight};
    });
    return {isArticle:true,title:document.querySelector('h1')?.textContent?.trim()||'',
      pdfLinkedImages:imgs.filter(x=>x.pdf),pdfLabeledImages:imgs.filter(x=>x.iconAlt),
      imageCount:imgs.length,overflow:document.documentElement.scrollWidth-innerWidth};
   });
   if(!data.isArticle)continue;
   const candidate=data.pdfLinkedImages.filter(x=>x.iconAlt);
   if(candidate.some(x=>x.width>81||x.height>81))
    report.errors.push({path,reason:'known_pdf_icon_oversized',icons:candidate});
   report.scanned.push({path,http:200,...data});
  }catch(e){report.errors.push({path,reason:'navigation',message:String(e).slice(0,160)})}
  finally{await page.close()}
 }
 report.totals={archivePages:report.archives.reduce((n,x)=>n+x.pages.length,0),
  detailPages:report.scanned.filter(x=>x.isArticle).length,
  pdfLinkedImages:report.scanned.reduce((n,x)=>n+(x.pdfLinkedImages?.length||0),0),
  pdfIcons:report.scanned.reduce((n,x)=>n+(x.pdfLabeledImages?.length||0),0),
  unmarkedPdfLinkedImages:report.scanned.reduce((n,x)=>n+(x.pdfLinkedImages?.filter(z=>!z.iconAlt).length||0),0),
  oversizedPdfIcons:report.errors.filter(x=>x.reason==='known_pdf_icon_oversized').length};
 report.status=report.errors.length?'ISSUES':'PASS';
 console.log('PSE_PDF_MULTIPAGE_SUMMARY='+JSON.stringify({status:report.status,totals:report.totals,
  archives:report.archives,errors:report.errors,unmarkedExamples:report.scanned.flatMap(p=>(p.pdfLinkedImages||[]).filter(x=>!x.iconAlt).map(x=>({path:p.path,...x}))).slice(0,12)}));
}catch(e){report.status='FAIL';report.errors.push({reason:'fatal',message:String(e).slice(0,250)})}
finally{await mkdir('artifacts/pse-pdf-multipage',{recursive:true});
 await writeFile('artifacts/pse-pdf-multipage/report.json',JSON.stringify(report,null,2)+'\n');
 await browser.close()}
if(report.status!=='PASS'||report.totals.detailPages<8)process.exitCode=1;
