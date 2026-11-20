/** Independent browser parity against original Joomla product technical tables, no writes. */
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const original='https://pse.vn/hoat-dong-kinh-doanh/san-pham/dam-phu-my.html';
const current='https://pse.webnvn.com/san-pham/dam-phu-my';
const wp='https://admin-pse.webnvn.com';
const report={schema:'pse-dam-phu-my-independent-live-parity-v1',source:original,target:current,errors:[],checks:[],status:'STARTED'};
const out='artifacts/pse-dam-phu-my-final';
await mkdir(out,{recursive:true});
const b=await chromium.launch({headless:true});
const n=s=>String(s||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
try{
 const desktop=await b.newContext({viewport:{width:1366,height:860}});
 const s=await desktop.newPage();
 const sr=await s.goto(original,{waitUntil:'domcontentloaded',timeout:60000});
 if(sr?.status()!==200)throw Error('Joomla source HTTP '+sr?.status());
 const expected=await s.evaluate(()=>{
  const root=document.querySelector('.item-page [itemprop="articleBody"]');
  if(!root)throw Error('Source article body missing');
  return [...root.querySelectorAll('table')].slice(2).map(t=>
   [...t.querySelectorAll('tr')].map(row=>[...row.querySelectorAll('th,td')]
    .map(c=>(c.textContent||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim()).join(' | ')).join(' || ')
  );
 });
 if(expected.length!==10)throw Error('Expected source ten technical/usage tables, got '+expected.length);
 report.checks.push('source_technical_tables_10');

 const wr=await desktop.request.get(wp+'/wp-json/astro/v1/get-product-categories',{timeout:50000});
 if(wr.status()!==200)throw Error('Public WP category data HTTP '+wr.status());
 const items=await wr.json(),term=Array.isArray(items)?items.find(x=>x.id===1763&&x.slug==='dam-phu-my'):null;
 if(!term?.description||!/<table\b/i.test(term.description))throw Error('WordPress custom product category API omits editor description');
 report.checks.push('wp_category_api_description');

 for(const width of [1366,390]){
  const context=width===1366?desktop:await b.newContext({viewport:{width,height:844},isMobile:true,deviceScaleFactor:1});
  const p=await context.newPage();
  const r=await p.goto(current,{waitUntil:'domcontentloaded',timeout:60000});
  if(r?.status()!==200)throw Error('Frontend category HTTP '+r?.status()+' width '+width);
  await p.locator('.pse-category-editorial').waitFor({timeout:35000});
  const found=await p.evaluate(()=>{
   const content=document.querySelector('.pse-category-editorial');
   const tables=[...content.querySelectorAll('table')].map(t=>
    [...t.querySelectorAll('tr')].map(row=>[...row.querySelectorAll('th,td')]
     .map(c=>(c.textContent||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim()).join(' | ')).join(' || ')
   );
   const cards=[...document.querySelectorAll('main article.group')];
   const panel=document.querySelector('.pse-editorial-panel');
   const header=panel?.querySelector('.pse-editorial-header h2');
   const cardTitle=cards[0]?.querySelector('h2');
   const techCell=content.querySelector('table td,table th');
   const style=e=>e?getComputedStyle(e):null;
   return {tables,cards:cards.length,legacyImages:content.querySelectorAll('img[src*="pse.vn"]').length,
    horizontalOverflow:document.documentElement.scrollWidth-window.innerWidth,
    textLength:(content.textContent||'').replace(/\s+/g,' ').trim().length,
    design:{
     panelRadius:parseFloat(style(panel)?.borderTopLeftRadius||'0'),
     headerFont:parseFloat(style(header)?.fontSize||'0'),
     cardRadius:parseFloat(style(cards[0])?.borderTopLeftRadius||'0'),
     cardHeadingFont:parseFloat(style(cardTitle)?.fontSize||'0'),
     tableFont:parseFloat(style(techCell)?.fontSize||'0'),
     mediaBackground:style(cards[0]?.querySelector('.pse-catalog-card__media'))?.backgroundImage||'none',
     contentScrollWidth:content.scrollWidth,
     contentClientWidth:content.clientWidth
    }};
  });
  if(found.tables.length!==10||found.tables.some((x,i)=>n(x)!==n(expected[i])))
   throw Error('Technical table content does not match independently crawled Joomla source at width '+width+
    '; count='+found.tables.length+' mismatch='+found.tables.findIndex((x,i)=>n(x)!==n(expected[i])));
  if(found.cards!==4)throw Error('Existing four product cards not preserved width '+width+' got '+found.cards);
  if(found.legacyImages)throw Error('Legacy image hotlink present in category content');
  if(found.horizontalOverflow>5)throw Error('Page horizontal overflow at width '+width+': '+found.horizontalOverflow);
  if(found.textLength<2500)throw Error('Category technical text unexpectedly short');
  const design=found.design;
  if(design.panelRadius<16||design.cardRadius<18||design.headerFont<21||
    design.cardHeadingFont<18||design.tableFont<14||design.mediaBackground==='none')
    throw Error('New CMS-driven product layout styles missing at width '+width+': '+JSON.stringify(design));
  if(width===390&&design.contentScrollWidth<=design.contentClientWidth)
    throw Error('Technical tables should scroll inside editorial container on narrow viewport');
  report.checks.push('modern_product_card_and_editorial_styles_'+width);
  await p.screenshot({path:out+'/category-'+width+'.png',fullPage:true,timeout:45000});
  report.checks.push('live_'+width+'_10_tables_4_cards_no_overflow');
  if(context!==desktop)await context.close();
 }
 // The rich description is editable in the existing WooCommerce category screen.
 // Verify the real administrator form is hydrated; do not submit or mutate.
 const adm=await desktop.newPage();
 const categoryEditor='/wp-admin/term.php?taxonomy=product_cat&tag_ID=1763&post_type=product';
 await adm.goto(wp+categoryEditor,{waitUntil:'domcontentloaded',timeout:60000});
 if(await adm.locator('#user_login').count()){
  await adm.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await adm.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const loginText=await adm.locator('#loginform').innerText();
  const match=loginText.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(match){
   const a=Number(match[1]),b=Number(match[3]);
   const answer=match[2]==='+'?a+b:match[2]==='-'?a-b:a*b;
   const field=adm.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error('Admin verification captcha input unavailable');
   await field.fill(String(answer));
  }
  await adm.locator('#wp-submit').click();
 }
 await adm.goto(wp+categoryEditor,{waitUntil:'domcontentloaded',timeout:60000});
 if(!await adm.locator('#adminmenu').count())throw Error('WordPress taxonomy editor requires admin session');
 const richField=adm.locator('textarea[name="vcs_category_rich_description"]');
 if(!await richField.count())throw Error('WooCommerce category rich text editor not present');
 const richHTML=await richField.inputValue();
 if((richHTML.match(/<table\b/gi)||[]).length!==10)throw Error('WooCommerce admin rich editor is missing original ten tables');
 report.checks.push('wordpress_category_native_editor_readonly_verified');
 await adm.close();

 report.status='PASS';
 console.log('PSE_DAM_FINAL_QA='+JSON.stringify(report));
}catch(e){report.status='FAIL';report.errors.push(String(e).slice(0,650));process.exitCode=1;
 console.error('PSE_DAM_FINAL_QA='+JSON.stringify(report))}
finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');await b.close()}
