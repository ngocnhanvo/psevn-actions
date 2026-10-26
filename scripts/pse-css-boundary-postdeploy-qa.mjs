/** All published PSE Page routes plus ESC component CSS parity after normal PHP-triggered deploy; READ ONLY. */
import { chromium } from 'playwright';
const config=Object.fromEntries(String(process.env.ENV_FILE||'').split(/\r?\n/)
  .map(s=>s.trim().replace(/^export\s+/,'')).filter(s=>/^WC_URL(_CLIENT)?=/.test(s))
  .map(s=>{const [k,...v]=s.split('=');const u=new URL(v.join('=').replace(/^['"]|['"]$/g,''));
    if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))throw Error('Invalid origin');
    return[k,u.origin]}));
if(!config.WC_URL||!config.WC_URL_CLIENT)throw Error('Missing WordPress/Astro origin');
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
try {
 const rest=await ctx.request.get(config.WC_URL+'/wp-json/wp/v2/pages?status=publish&per_page=100&_fields=id,slug,status',{timeout:60000});
 if(!rest.ok())throw Error('Public Page list HTTP '+rest.status());
 const pages=await rest.json();
 if(!Array.isArray(pages)||pages.length<20)throw Error('Unexpectedly few published Pages');
 const results=[];
 for(const p of pages){
   const route=p.slug==='trang-chu'?'/':'/'+p.slug;
   let status=0,final='',error='';
   try{
     const r=await ctx.request.get(config.WC_URL_CLIENT+route,{timeout:20000,maxRedirects:10});
     status=r.status();final=new URL(r.url()).pathname;
   }catch(e){error=String(e).slice(0,75)}
   results.push({id:p.id,slug:p.slug,status,final,error});
 }
 console.log('PSE_CSS_BOUNDARY_ALL_PAGES='+JSON.stringify({
   count:results.length,bad:results.filter(x=>x.status!==200)}));
 const broken=results.filter(x=>x.status!==200);
 if(broken.length)throw Error('Published Page routes failing '+broken.map(x=>x.id).join(','));
 const one=await ctx.newPage();
 for(const width of [1440,390]){
   await one.setViewportSize({width,height:950});
   for(const [slug,rootSelector] of [['duong-day-nong','.pse-hotline'],['hoi-dap','.pse-faq']]){
     const response=await one.goto(config.WC_URL_CLIENT+'/'+slug,{waitUntil:'domcontentloaded',timeout:65000});
     if(response?.status()!==200)throw Error('Page HTTP '+slug);
     await one.locator(rootSelector).waitFor({state:'visible',timeout:15000});
     const info=await one.evaluate(({slug})=>{
       const hotline=slug==='duong-day-nong',root=document.querySelector(hotline?'.pse-hotline':'.pse-faq');
       const card=root?.querySelector(hotline?'.pse-hotline__card':'.pse-faq__item');
       const grid=root?.querySelector(hotline?'.pse-hotline__grid':'.pse-faq__list');
       const astroTailwindSource=hotline
         ? String(card?.getAttribute('class')||'').includes('shadow-[0_6px_22px')
         : String(card?.getAttribute('class')||'').includes('[&[open]]:border-[#c7e3d1]');
       const legacyCssmoreInline=[...document.querySelectorAll('style')]
         .some(el=>String(el.textContent||'').includes(hotline?'PSE_HOTLINE_CMS_LAYOUT_V1':'PSE_FAQ_CMS_LAYOUT_V1'));
       const button=root?.querySelector('summary');
       return {astroTailwindSource,legacyCssmoreInline,grid:getComputedStyle(grid).display,
         cardBorder:getComputedStyle(card).borderTopStyle,
         cardRadius:parseFloat(getComputedStyle(card).borderTopLeftRadius),
         display:getComputedStyle(card).display,
         source:root?.getAttribute(hotline?'data-pse-hotline-source':'data-pse-faq-source'),
         items:root?.querySelectorAll(hotline?'.pse-hotline__card':'.pse-faq__item').length||0,
         summaryDisplay:button?getComputedStyle(button).display:null,
         contentWidth:root?.getBoundingClientRect().width||0,
         viewport:document.documentElement.clientWidth};
     },{slug});
     if(info.source!=='esc-table'||info.grid!=='grid'||info.cardBorder!=='solid'||info.cardRadius<10||info.items===0||
        (!rootSelector.includes('hotline')&&info.summaryDisplay!=='flex')||
        info.contentWidth>info.viewport+5)
       throw Error('Styling/ESC source mismatch '+slug+' width='+width+' '+JSON.stringify(info));
     if(slug==='hoi-dap'){
       const target=one.locator('.pse-faq__item').last();
       await target.locator('summary').click();
       if(!await target.evaluate(el=>el.open))throw Error('FAQ accordion stopped responding to click');
     }
     console.log('PSE_CSS_BOUNDARY_PAGE_VISUAL='+JSON.stringify({slug,width,...info,passed:true}));
   }
   for(const slug of ['lien-he','trang-chu','ve-chung-toi']){
     const response=await one.goto(config.WC_URL_CLIENT+(slug==='trang-chu'?'/':'/'+slug),
       {waitUntil:'domcontentloaded',timeout:65000});
     if(response?.status()!==200)throw Error('Recovered CSS page unavailable '+slug);
     const found=await one.locator('main').count();
     if(!found)throw Error('Main disappeared '+slug);
     console.log('PSE_CSS_BOUNDARY_LEGACY_PAGE='+JSON.stringify({slug,width,status:200,hasMain:true}));
   }
 }
 console.log('PSE_CSS_BOUNDARY_POSTDEPLOY=PASS allPublishedPages='+results.length+' readOnly=true noBuild=true');
}finally{await browser.close()}
