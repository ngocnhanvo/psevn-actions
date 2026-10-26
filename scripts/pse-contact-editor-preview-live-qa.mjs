/** Read-only verification that WordPress Admin previews CMS / ESC sections, never Astro markup. */
import {chromium} from 'playwright';
const raw=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,''));
const configs=raw.filter(x=>x.startsWith('WC_URL='));
if(configs.length!==1)throw Error('WordPress origin missing');
const parsed=new URL(configs[0].slice(7).replace(/^['"]|['"]$/g,''));
if(parsed.protocol!=='https:'||!parsed.hostname||parsed.username||parsed.password||parsed.search||parsed.hash||!['','/'].includes(parsed.pathname))throw Error('Invalid WP origin');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1600,height:1000}});
try {
 await page.goto(parsed.origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await page.locator('#user_login').count()){
   const user=process.env.WP_ADMIN_USERNAME,pass=process.env.WP_ADMIN_PASSWORD;
   if(!user||!pass)throw Error('Missing WP credentials');
   await page.locator('#user_login').fill(user);
   await page.locator('#user_pass').fill(pass);
   const loginText=await page.locator('body').innerText();
   const captcha=loginText.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||loginText.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
   if(captcha){
     const a=+captcha[1],b=+captcha[3],v=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[captcha[2]];
     const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
     if(!(await f.count()))throw Error('Login challenge input missing');
     await f.fill(String(v));
   }
   await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
 }
 if(page.url().includes('wp-login'))throw Error('WordPress authentication rejected');
 await page.goto(parsed.origin+'/wp-admin/post.php?post=47222&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
 const container=page.locator('#pse-contact-editor-preview');
 await container.waitFor({state:'visible',timeout:15000});
 const iframe=page.locator('#pse-contact-preview-frame');
 await page.waitForFunction(()=>!!document.querySelector('#pse-contact-preview-frame')?.getAttribute('srcdoc')||
 document.querySelector('#pse-contact-preview-status')?.classList.contains('is-error'),{timeout:30000});
 const state=await page.evaluate(()=>({status:document.getElementById('pse-contact-preview-status')?.textContent||'',
   error:document.getElementById('pse-contact-preview-status')?.classList.contains('is-error'),
   content:document.getElementById('content')?.value||''}));
 if(state.error)throw Error('Admin preview failed: '+state.status);
 const shortcodeIds=[...state.content.matchAll(/\[table\s+id=([a-z0-9_-]+)\s*\/\]/gi)].map(m=>m[1]);
 const expected=['pse_contact_office_vi','contact_00_vi','pse_contact_warehouses_vi'];
 if(JSON.stringify(shortcodeIds)!==JSON.stringify(expected))throw Error('Native editor missing ESC references: '+shortcodeIds.join(','));
 const doc=await iframe.getAttribute('srcdoc');
 if(!doc.includes('PSE_CONTACT_ESC_OWNED_SECTIONS_V2')||!doc.includes('pse-contact-hero')||!doc.includes('pse-contact-warehouses'))throw Error('Preview not sourcing WordPress/ESC layout');
 const frame=page.frameLocator('#pse-contact-preview-frame');
 const office=frame.locator('[data-tablepress-preview="pse_contact_office_vi"]');
 const form=frame.locator('[data-tablepress-preview="contact_00_vi"]');
 const warehouses=frame.locator('[data-tablepress-preview="pse_contact_warehouses_vi"]');
 await form.waitFor({state:'visible',timeout:15000});
 if(await frame.locator('.pse-contact-locations__grid .pse-location-card').count()!==5)throw Error('Five warehouses not in admin preview');
 if(await frame.locator('#contact-form input').count()!==4||await frame.locator('#contact-form textarea').count()!==1||
   await frame.locator('#contact-form button:not([disabled])').count()!==0)throw Error('Read-only form controls not safe');
 const bounds=async()=>({office:await office.boundingBox(),form:await form.boundingBox(),warehouses:await warehouses.boundingBox()});
 let b=await bounds();
 if(!b.office||!b.form||!b.warehouses||!(b.office.x+60<b.form.x)||!(b.warehouses.y>b.form.y))throw Error('Desktop CMS layout parity failed');
 console.log('PSE_CONTACT_ADMIN_PREVIEW_DESKTOP=PASS; office_left=true; form_right=true; warehouses_below=true');
 await page.locator('#pse-contact-preview-width').selectOption('mobile');
 await page.waitForTimeout(600);
 b=await bounds();
 if(!b.office||!b.form||!b.warehouses||!(b.office.y+60<b.form.y)||!(b.form.y+60<b.warehouses.y))
   throw Error('Mobile CMS layout stacking failed');
 if((await iframe.evaluate(el=>Math.round(el.getBoundingClientRect().width)))!==390)throw Error('Mobile preview width incorrect');
 console.log('PSE_CONTACT_ADMIN_PREVIEW_MOBILE=PASS; office_then_form_then_warehouses=true; width=390; no_submissions=true');
 console.log('PSE_CONTACT_ADMIN_PREVIEW=PASS; WordPress+ESC_owned=true; no_astro_build=true; read_only=true');
}finally {await browser.close();}
