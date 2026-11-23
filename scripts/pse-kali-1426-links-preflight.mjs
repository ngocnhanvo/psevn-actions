/** Read-only proof: verify exact two legacy links and resolve PSE destinations. */
import { chromium } from 'playwright';
const originValue=(key)=>{
  const a=String(process.env.ENV_FILE||'').split(/\r?\n/)
    .map(s=>s.trim().replace(/^export\s+/,'')).filter(s=>s.startsWith(key+'='));
  if(a.length!==1)throw Error('Missing unique origin '+key);
  const url=new URL(a[0].slice(key.length+1).replace(/^['"]|['"]$/g,''));
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))
    throw Error('Unsafe PSE origin '+key);
  return url.origin;
};
const wp=originValue('WC_URL'),front=originValue('WC_URL_CLIENT');
if(wp!=='https://admin-pse.webnvn.com'||front!=='https://pse.webnvn.com')throw Error('Wrong PSE origin');
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1350,height:900}});
const page=await context.newPage();
try{
  const source=await page.request.get(wp+'/wp-json/wp/v2/pages/83572?_fields=id,status,slug,content,acf',{timeout:45000});
  if(!source.ok())throw Error('Original WP page REST failed '+source.status());
  const d=await source.json();
  if(d.id!==83572||d.slug!=='kali-phu-my-mo-ta-cac-bien-the'||d.acf?.key!=='pse-historical-kali-1426')
    throw Error('Unexpected source page');
  const sourceHref=await page.evaluate(html=>{
    const root=document.createElement('div');root.innerHTML=html;
    return [...root.querySelectorAll('a')].map(a=>({text:a.textContent.replace(/\s+/g,' ').trim(),href:a.getAttribute('href')}));
  },String(d.content?.rendered||''));
  console.log('PSE_LINK_SOURCE='+JSON.stringify({id:d.id,links:sourceHref}));
  const specs=[
    {joomla:1434,title:'NPK Phú Mỹ',old:'https://pse.vn/hoat-dong-kinh-doanh/san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my/8-trang-chu/1434-npk-phu-my.html',slug:'npk-phu-my'},
    {joomla:49,title:'Nội dung đang cập nhật',old:'https://pse.vn/hoat-dong-kinh-doanh/san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my/8-trang-chu/49-noi-dung-dang-cap-nhat.html',slug:'noi-dung-dang-cap-nhat'}
  ];
  for(const s of specs){
    const oldLink=sourceHref.filter(x=>x.href===s.old);
    if(oldLink.length!==1)throw Error('Expected exactly one old link to Joomla ID '+s.joomla);
    let cms=[];
    for(const type of ['pages','posts','product']){
      const u=wp+'/wp-json/wp/v2/'+type+'?per_page=20&slug='+encodeURIComponent(s.slug)+'&_fields=id,type,slug,status,title,link,acf,content';
      const response=await page.request.get(u,{timeout:45000});
      if(!response.ok()){console.log('PSE_LINK_CMS_API_ERROR='+JSON.stringify({type,http:response.status(),slug:s.slug}));continue;}
      const arr=await response.json();
      if(Array.isArray(arr))cms.push(...arr.map(x=>({type,id:x.id,slug:x.slug,status:x.status,title:x.title?.rendered,link:x.link,key:x.acf?.key,htmlChars:x.content?.rendered?.length})));
    }
    const frontend=front+'/'+s.slug;
    const response=await page.goto(frontend,{waitUntil:'domcontentloaded',timeout:60000});
    const data=await page.evaluate(()=>({
      title:document.title,h1:document.querySelector('main h1')?.textContent?.trim(),
      mainText:(document.querySelector('main')?.innerText||'').replace(/\s+/g,' ').trim().slice(0,220),
      canonical:document.querySelector('link[rel="canonical"]')?.href||null
    }));
    console.log('PSE_LINK_DESTINATION='+JSON.stringify({joomla:s.joomla,original:s.old,frontend,http:response?.status(),cms,data,requestedURL:page.url()}));
  }
  const original49='https://pse.vn/hoat-dong-kinh-doanh/san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my/8-trang-chu/49-noi-dung-dang-cap-nhat.html';
  try{
    const response=await page.goto(original49,{waitUntil:'domcontentloaded',timeout:30000});
    const o=await page.evaluate(()=>({title:document.title,h1:document.querySelector('h1')?.textContent?.trim()||null,
      text:(document.querySelector('article')?.innerText||document.querySelector('main')?.innerText||document.body.innerText||'')
        .replace(/\\s+/g,' ').slice(0,1300),canonical:document.querySelector('link[rel="canonical"]')?.href||null}));
    console.log('PSE_LINK_LEGACY_49='+JSON.stringify({http:response?.status(),url:page.url(),...o}));
  }catch(e){console.log('PSE_LINK_LEGACY_49_ERROR='+String(e).slice(0,190));}
  for(const type of ['pages','posts','product']){
    for(const term of ['Nội dung đang cập nhật','NPK Phú Mỹ']){
      const url=wp+'/wp-json/wp/v2/'+type+'?per_page=20&search='+encodeURIComponent(term)+'&_fields=id,slug,title,link,status,acf';
      try{const r=await page.request.get(url,{timeout:25000});
        console.log('PSE_LINK_SEARCH='+JSON.stringify({term,type,http:r.status(),items:r.ok()?(await r.json()).map(x=>({id:x.id,slug:x.slug,title:x.title?.rendered,key:x.acf?.key})):[]}));
      }catch(e){console.log('PSE_LINK_SEARCH_ERROR='+String(e).slice(0,130));}
    }
  }
  console.log('PSE_LINK_PREFLIGHT=PASS readOnly=true');
}finally{await browser.close();}
