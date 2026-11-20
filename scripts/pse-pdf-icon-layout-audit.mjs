/** Diagnose PDF image styles in public PSE WordPress-authored post pages. READ ONLY. */
import {chromium} from 'playwright';
import {writeFile,mkdir} from 'node:fs/promises';
const root='https://pse.webnvn.com';
const example='/quy-che-noi-bo-ve-quan-tri-cong-ty-16-04-2018';
const archive='/tin-tuc-su-kien/tai-lieu-quan-tri-cong-ty';
const result={schema:'pse-pdf-image-layout-audit-v1',pages:[],errors:[],version:1};
const b=await chromium.launch({headless:true});
try{
  const c=await b.newContext({viewport:{width:1366,height:840},deviceScaleFactor:1});
  const index=await c.newPage();const r=await index.goto(root+archive,{waitUntil:'domcontentloaded',timeout:50000});
  if(r?.status()!==200)throw Error('category archive http '+r?.status());
  const hrefs=await index.locator('main a[href]').evaluateAll(as=>[...new Set(as.map(a=>a.getAttribute('href')).filter(Boolean))].filter(u=>!u.includes('tai-lieu-quan-tri-cong-ty')&&u.startsWith('/')).slice(0,8));
  await index.close();
  const paths=[example,...hrefs].filter((x,i,arr)=>arr.indexOf(x)===i).slice(0,7);
  for(const path of paths){
    const page=await c.newPage();
    try{
      const r=await page.goto(new URL(path,root).toString(),{waitUntil:'domcontentloaded',timeout:50000});
      if(r?.status()!==200){result.pages.push({path,http:r?.status()});continue}
      await page.locator('#article-content').waitFor({timeout:10000}).catch(()=>{});
      const data=await page.evaluate(()=>{
        const wrap=document.querySelector('#article-content');
        const imgs=[...(wrap?.querySelectorAll('img')||[])].map(img=>{
          const cs=getComputedStyle(img),rect=img.getBoundingClientRect(),parent=img.parentElement;
          const ancestor=parent?.parentElement;
          return {
            html:img.outerHTML.slice(0,1100),src:img.getAttribute('src'),naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,
            width:img.getAttribute('width'),height:img.getAttribute('height'),style:img.getAttribute('style'),
            displayWidth:Math.round(rect.width),displayHeight:Math.round(rect.height),
            cssWidth:cs.width,cssHeight:cs.height,maxWidth:cs.maxWidth,objectFit:cs.objectFit,
            parent:parent?.outerHTML.slice(0,1200),parentTag:parent?.tagName,parentClass:parent?.className,
            ancestorTag:ancestor?.tagName,ancestorClass:ancestor?.className,
            link:img.closest('a')?.getAttribute('href')||null,
          };
        });
        return {title:document.title,h1:document.querySelector('h1')?.innerText||null,
        wrapClass:wrap?.className,wrapWidth:Math.round(wrap?.getBoundingClientRect().width||0),
        imgs,viewport:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth};
      });
      result.pages.push({path,http:200,...data});
    }catch(e){result.errors.push({path,error:String(e).slice(0,210)})}
    finally{await page.close()}
  }
  console.log('PSE_PDF_ICON_AUDIT='+JSON.stringify(result).slice(0,60000));
}catch(e){result.errors.push({error:String(e)})}
finally{
 await mkdir('artifacts/pse-pdf-icon-layout',{recursive:true});
 await writeFile('artifacts/pse-pdf-icon-layout/report.json',JSON.stringify(result,null,2)+'\n');
 await b.close();
}
if(result.errors.length||!result.pages.find(p=>p.path===example&&p.http===200))process.exitCode=1;
