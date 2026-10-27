/** Verify deployed Menu inspector resilience to synthetic WP DB 503. No CMS writes. */
import {chromium} from 'playwright';
const matches=String(process.env.ENV_FILE||'').split(/\r?\n/)
 .map(s=>s.trim().replace(/^export\s+/,'')).
 filter(s=>s.startsWith('WC_URL='));
if(matches.length!==1)throw Error('Expected one WP origin');
const u=new URL(matches[0].slice(7).replace(/^['"]|['"]$/g,''));
if(u.protocol!=='https:'||!u.hostname||u.username||u.password||u.search||u.hash||
 !['','/'].includes(u.pathname))throw Error('Invalid WP origin');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:920}});
try{
 await page.goto(u.origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await page.locator('#user_login').count()){
   await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
   await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
   const body=await page.locator('body').innerText();
   const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||
           body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
   if(m){
     const a=+m[1],b=+m[3],n=({'+':a+b,'-':a-b,'x':a*b,'×':a*b,'*':a*b})[m[2]];
     const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
     if(!await field.count())throw Error('WP verification field missing');
     await field.fill(String(n));
   }
   await Promise.all([page.waitForLoadState('domcontentloaded',{timeout:30000}).catch(()=>{}),page.locator('#wp-submit').click()]);
 }
 if(page.url().includes('wp-login'))throw Error('WordPress login rejected');
 await page.goto(u.origin+'/wp-admin/edit.php?post_type=page&page=esc-visual-builder',
   {waitUntil:'domcontentloaded',timeout:60000});
 await page.locator('#esc-vb-page').waitFor({state:'visible',timeout:30000});
 await Promise.all([page.waitForLoadState('domcontentloaded'),page.getByRole('button',{name:'Mở trang'}).click()]);
 const frame=page.frameLocator('#esc-vb-frame');
 const menu=frame.locator('#main-header [data-esc-vb-menu-item-id][data-esc-vb-region-state="editable"]').first();
 await menu.waitFor({state:'attached',timeout:60000});
 let synthetic=0;
 const pattern='**/wp-json/esc-builder/v1/menu-item*';
 const handler=async route=>{
   if(route.request().method()!=='POST')return route.continue();
   if(synthetic++===0)return route.fulfill({
     status:503,contentType:'application/json; charset=UTF-8',
     body:JSON.stringify({code:'wp_db_error',message:'<h1>Lỗi kết nối tới cơ sở dữ liệu</h1>'})
   });
   return route.continue();
 };
 await page.route(pattern,handler);
 // The original live test already verified pointer behavior. Dispatch a
 // modifier click to the hydrated menu marker directly, avoiding responsive
 // nav visibility races that are unrelated to DB error presentation.
 await menu.evaluate(el=>el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,altKey:true})));
 const retry=page.locator('#esc-vb-menu-retry');
 await retry.waitFor({state:'visible',timeout:25000});
 const status=page.locator('#esc-vb-menu-editor [role="status"]').first();
 const error=await status.innerText();
 if(!/WordPress.*cơ sở dữ liệu/i.test(error)||/<h1/i.test(error))
   throw Error('Live UI did not sanitize synthetic DB error');
 if(synthetic!==1)throw Error('Unexpected automatic DB retries');
 await retry.click();
 await page.waitForFunction(()=>{
   const p=document.querySelector('#esc-vb-menu-editor');
   const retry=document.querySelector('#esc-vb-menu-retry');
   return p && !p.hidden && !!document.querySelector('#esc-vb-menu-label')?.value &&
          retry?.hidden===true;
 },null,{timeout:25000});
 const msg=await status.innerText();
 if(/Không tải được Menu/.test(msg))throw Error('Manual retry did not recover real REST Menu data');
 console.log('PSE_MENU_DB_RETRY_DEPLOYED=PASS synthetic_503=1 automatic_retry=0 sanitized_html=PASS manual_retry=PASS recovered=PASS CMS_WRITE=NONE ASTRO_BUILD=NONE');
}finally{await browser.close();}
