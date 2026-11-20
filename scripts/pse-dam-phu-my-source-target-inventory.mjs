/** PSE Đạm Phú Mỹ source-to-target inventory, read only. No WP writes. */
import {chromium} from 'playwright';
import {writeFile,mkdir} from 'node:fs/promises';
const sourceURL='https://pse.vn/hoat-dong-kinh-doanh/san-pham/dam-phu-my.html';
const targetURL='https://pse.webnvn.com/san-pham/dam-phu-my';
const wpURL='https://admin-pse.webnvn.com';
const out={schema:'pse-dam-phu-my-inventory-v1',sourceURL,targetURL,source:{},target:{},cms:{},errors:[]};
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1366,height:860}});
try{
 for(const [type,url] of [['source',sourceURL],['target',targetURL]]){
  const p=await ctx.newPage();
  try{
    const response=await p.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
    await p.waitForTimeout(1000);
    const data=await p.evaluate(()=>{
      const trims=s=>(s||'').replace(/\s+/g,' ').trim();
      const nodes=['main','.item-page','.item-page > div','.article-content','article','#content','.entry-content','.product-description','[data-product-description]'];
      const candidates=nodes.flatMap(sel=>[...document.querySelectorAll(sel)].slice(0,4).map(e=>({
        selector:sel,tag:e.tagName,cls:String(e.className).slice(0,120),
        textLen:trims(e.textContent).length,htmlLen:e.innerHTML.length,
        tables:e.querySelectorAll('table').length,imgs:e.querySelectorAll('img').length,
        htmlSample:e.innerHTML.slice(0,1600)
      }))).sort((a,b)=>b.textLen-a.textLen);
      const headings=[...document.querySelectorAll('h1,h2,h3,h4')].slice(0,70).map(e=>({tag:e.tagName,text:trims(e.textContent).slice(0,160)}));
      const tables=[...document.querySelectorAll('main table,.item-page table,article table,.product-description table')].slice(0,35).map(t=>({
        rows:t.rows.length,cols:Math.max(0,...[...t.rows].map(r=>r.cells.length)),
        firstCells:[...t.querySelectorAll('td,th')].slice(0,8).map(x=>trims(x.textContent).slice(0,120))
      }));
      const imgs=[...document.querySelectorAll('main img,.item-page img,article img,.product-description img')].slice(0,65).map(i=>({
        src:i.getAttribute('src'),alt:i.getAttribute('alt'),w:i.getAttribute('width'),h:i.getAttribute('height')
      }));
      return {title:document.title,metaDescription:document.querySelector('meta[name="description"]')?.getAttribute('content')||null,
        headings,candidates:candidates.slice(0,18),tables,imgs,
        pageText:trims(document.querySelector('.item-page')?.textContent||document.querySelector('.product-description')?.textContent||document.querySelector('main')?.textContent).slice(0,25000),
        overflow:document.documentElement.scrollWidth-window.innerWidth};
    });
    out[type]={status:response?.status()||0,url:p.url(),...data};
    console.log('PSE_DAM_INVENTORY_'+type.toUpperCase()+'='+JSON.stringify({
     status:out[type].status,headings:out[type].headings,
     candidates:out[type].candidates.map(x=>({...x,htmlSample:x.htmlSample.slice(0,260)})),
     tables:out[type].tables,imgs:out[type].imgs.slice(0,25),
     textLength:out[type].pageText.length,tail:out[type].pageText.slice(-1000)
    }).slice(0,14500));
  }catch(err){out.errors.push({type,message:String(err).slice(0,350)})}
  finally{await p.close()}
 }
 const api=wpURL+'/wp-json/wp/v2/product?slug=dam-phu-my&status=publish&_fields=id,slug,status,type,modified,content,excerpt,featured_media_url,gallery_images,acf,yoast_head_json,title';
 const response=await ctx.request.get(api,{timeout:50000,failOnStatusCode:false});
 const json=await response.json().catch(()=>null);
 out.cms={http:response.status(),matches:Array.isArray(json)?json.map(p=>({
  id:p.id,slug:p.slug,status:p.status,type:p.type,modified:p.modified,
  title:p.title?.rendered,excerpt:p.excerpt?.rendered,content:p.content?.rendered,
  featuredMedia:p.featured_media_url,gallery:p.gallery_images,acf:p.acf,
  seoTitle:p.yoast_head_json?.title,seoDescription:p.yoast_head_json?.description
 })):null,error:!Array.isArray(json)?String(JSON.stringify(json)).slice(0,600):null};
 console.log('PSE_DAM_WP_RECORD='+JSON.stringify(out.cms).slice(0,14500));
}catch(err){out.errors.push({type:'fatal',message:String(err).slice(0,350)})}
finally{await mkdir('artifacts/pse-dam-phu-my',{recursive:true});
 await writeFile('artifacts/pse-dam-phu-my/inventory.json',JSON.stringify(out,null,2)+'\n');
 await browser.close();}
if(out.errors.length||out.source.status!==200||out.target.status!==200)process.exitCode=1;
