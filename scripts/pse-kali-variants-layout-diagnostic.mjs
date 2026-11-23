/** Read-only PSE Kali variants public page layout diagnostics. No CMS writes. */
import { chromium } from 'playwright';

const matches=String(process.env.ENV_FILE||"").split(/\r?\n/)
 .map(v=>v.trim().replace(/^export\s+/,"")).filter(v=>v.startsWith("WC_URL_CLIENT="));
if(matches.length!==1)throw Error("Missing unique frontend origin");
const client=new URL(matches[0].split("=").slice(1).join("=").trim().replace(/^['"]|['"]$/g,""));
if(client.protocol!=="https:"||client.username||client.password||client.hash||client.search
  ||client.hostname!=="pse.webnvn.com"||!["/",""].includes(client.pathname))
  throw Error("Unexpected PSE frontend origin");

const site=client.origin+'/kali-phu-my-mo-ta-cac-bien-the';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
page.on('pageerror',err=>console.log('PSE_KALI_JS_ERROR='+String(err.message).slice(0,220)));
page.on('console',msg=>{if(msg.type()==='error')console.log('PSE_KALI_CONSOLE_ERROR='+msg.text().slice(0,220));});
try{
  const response=await page.goto(site,{waitUntil:'domcontentloaded',timeout:60000});
  console.log('PSE_KALI_NAV='+JSON.stringify({status:response?.status(),url:page.url(),title:await page.title()}));
  await page.waitForTimeout(1400);
  for(const width of [1440,1240,1024,768,390]){
    await page.setViewportSize({width,height:900});
    await page.waitForTimeout(300);
    const diagnostic=await page.evaluate(()=>{
      const w=window.innerWidth;
      const describe=(el)=>{
        const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
        return {tag:el.tagName.toLowerCase(),id:el.id||undefined,cls:String(el.className||'').slice(0,110),
          text:String(el.textContent||'').trim().replace(/\s+/g,' ').slice(0,105),
          x:Math.round(rect.x),y:Math.round(rect.y),w:Math.round(rect.width),
          h:Math.round(rect.height),right:Math.round(rect.right),
          scrollW:el.scrollWidth,clientW:el.clientWidth,
          display:style.display,position:style.position,overflowX:style.overflowX,
          whiteSpace:style.whiteSpace,wordBreak:style.wordBreak};
      };
      const body=document.querySelector('main'), article=document.querySelector('#article-content')
        ||document.querySelector('.pse-public-body .article-content')
        ||document.querySelector('.article-content-post')
        ||document.querySelector('.article-content');
      const candidates=[...document.querySelectorAll('main *,#main-content *')].filter(el=>{
        const r=el.getBoundingClientRect(),s=getComputedStyle(el);
        return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&
          (r.right>w+16||r.left<-16||r.width>w+16);
      }).sort((a,b)=>b.getBoundingClientRect().right-a.getBoundingClientRect().right).slice(0,22).map(describe);
      const wide=[...document.querySelectorAll('main table,main img,main iframe,main pre,main [style]')]
        .filter(el=>el.getBoundingClientRect().width>Math.min(700,w*.8))
        .sort((a,b)=>b.getBoundingClientRect().width-a.getBoundingClientRect().width).slice(0,25).map(el=>{
          const desc=describe(el);
          if(el.tagName==='IMG'){desc.naturalW=el.naturalWidth;desc.naturalH=el.naturalHeight;desc.src=(el.currentSrc||el.src).slice(0,180);}
          desc.inlineStyle=el.getAttribute('style')?.slice(0,250);
          return desc;
        });
      const articleChildren=article?[...article.children].slice(0,24).map(describe):[];
      const tables=article?[...article.querySelectorAll('table')].slice(0,15).map(el=>{
        const d=describe(el);
        d.attrWidth=el.getAttribute('width');
        d.inlineStyle=el.getAttribute('style')?.slice(0,200);
        d.rows=el.rows.length;
        return d;
      }):[];
      return {innerWidth:w,docScrollW:document.documentElement.scrollWidth,bodyScrollW:document.body.scrollWidth,
        main:body?describe(body):null,article:article?describe(article):null,
        articleChildren,tables,overflow:candidates,largeMedia:wide,
        h1:document.querySelector('main h1')?.textContent?.trim().slice(0,180),
        mainText:(body?.innerText||'').replace(/\s+/g,' ').slice(0,900)};
    });
    console.log('PSE_KALI_LAYOUT_'+width+'='+JSON.stringify(diagnostic));
  }
  const apis=['pages','posts'];
  for(const type of apis){
    const wpUrl=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim())
      .find(x=>x.startsWith('WC_URL='))?.split('=').slice(1).join('=').replace(/^['"]|['"]$/g,'');
    if(!wpUrl)continue;
    const url=new URL('/wp-json/wp/v2/'+type+'?slug=kali-phu-my-mo-ta-cac-bien-the&_fields=id,slug,status,type,link,title,content,acf',wpUrl);
    try{
      const response=await page.request.get(url.href,{timeout:25000});
      if(response.ok()){
        const rows=await response.json();
        console.log('PSE_KALI_WP_'+type.toUpperCase()+'='+JSON.stringify((Array.isArray(rows)?rows:[]).map(r=>({
          id:r.id,slug:r.slug,type:r.type,title:r.title?.rendered,htmlLength:r.content?.rendered?.length,
          hasTables:/<table/i.test(r.content?.rendered||''),hasInlineWidth:/width\s*:/i.test(r.content?.rendered||''),
          snippets:String(r.content?.rendered||'').slice(0,1600),
          acfKeys:Object.keys(r.acf||{}),
        }))));
      }else{console.log('PSE_KALI_WP_'+type.toUpperCase()+'_HTTP='+response.status());}
    }catch(e){console.log('PSE_KALI_WP_'+type.toUpperCase()+'_ERROR='+String(e).slice(0,180));}
  }

  // Force lazy images to complete in the browser (no server-side changes).
  await page.setViewportSize({width:1240,height:900});
  await page.locator('main img').evaluateAll(items=>items.forEach(img=>{img.loading='eager';}));
  await page.waitForTimeout(2200);
  const rows=await page.evaluate(()=>{
    const table=document.querySelector('.pse-public-body .article-content table');
    if(!table)return null;
    const rect=(el)=>{const r=el.getBoundingClientRect();return {x:Math.round(r.x),w:Math.round(r.width),h:Math.round(r.height),y:Math.round(r.y)};};
    return {table:rect(table),cssmore:[...document.querySelectorAll('main style')].map(s=>s.textContent.slice(0,1800)),
      rows:[...table.rows].map((tr,i)=>({index:i,rect:rect(tr),cells:[...tr.cells].map((td,j)=>({
        index:j,rect:rect(td),html:td.innerHTML.slice(0,850),
        style:{width:getComputedStyle(td).width,minWidth:getComputedStyle(td).minWidth,wordBreak:getComputedStyle(td).wordBreak},
        images:[...td.querySelectorAll('img')].map(img=>({rect:rect(img),src:(img.currentSrc||img.src).slice(0,220),
          naturalW:img.naturalWidth,naturalH:img.naturalHeight,complete:img.complete,
          inlineStyle:img.getAttribute('style'),cssMaxWidth:getComputedStyle(img).maxWidth,
          cssMaxHeight:getComputedStyle(img).maxHeight}))}))}))};
  });
  console.log('PSE_KALI_DETAILED_ROWS='+JSON.stringify(rows));

  const wpUrl=String(process.env.ENV_FILE||"").split(/\\r?\\n/).map(x=>x.trim())
    .find(x=>x.startsWith('WC_URL='))?.split('=').slice(1).join('=').replace(/^['"]|['"]$/g,'');
  if(wpUrl){
    const resp=await page.request.get(new URL('/wp-json/wp/v2/pages?slug=kali-phu-my-mo-ta-cac-bien-the&_fields=id,acf,content',wpUrl).href,{timeout:25000});
    if(resp.ok()){
      const items=await resp.json();
      const item=Array.isArray(items)?items[0]:null;
      console.log('PSE_KALI_WP_SOURCE='+JSON.stringify({
        pageId:item?.id,
        cssmore:String(item?.acf?.cssmore||'').slice(0,4000),
        content:String(item?.content?.rendered||'').slice(0,6500)
      }));
    }
  }

  console.log('PSE_KALI_DIAGNOSTIC=PASS read_only=true');
}finally{await browser.close();}
