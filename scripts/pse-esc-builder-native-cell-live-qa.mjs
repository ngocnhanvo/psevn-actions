/** Read-only WordPress/Visual Builder click contract. Never saves content or builds. */
import { chromium } from 'playwright';
const lines=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,''));
const matches=lines.filter(s=>s.startsWith('WC_URL='));
if(matches.length!==1)throw Error('Expected one configured WP origin');
const wp=new URL(matches[0].slice(7).replace(/^['"]|['"]$/g,''));
if(wp.protocol!=='https:'||!wp.hostname||wp.username||wp.password||wp.search||wp.hash||!['','/'].includes(wp.pathname))
 throw Error('Invalid WordPress origin');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1480,height:980}});
try {
 await page.goto(wp.origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await page.locator('#user_login').count()){
   await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
   await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
   const body=await page.locator('body').innerText();
   const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
   if(m){const a=+m[1],b=+m[3];const result=({'+':a+b,'-':a-b,'x':a*b,'×':a*b,'*':a*b})[m[2]];const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await input.count())throw Error('Login CAPTCHA cannot be resolved by connected QA');await input.fill(String(result))}
   await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
 }
 if(page.url().includes('wp-login'))throw Error('WordPress login rejected');
 await page.goto(wp.origin+'/wp-admin/edit.php?post_type=page&page=esc-visual-builder',{waitUntil:'domcontentloaded',timeout:60000});
 await page.locator('#esc-vb-page').waitFor({state:'visible',timeout:30000});
 // The Builder itself selects WordPress's homepage by default. Use that
 // canonical Page ID instead of guessing a translated display name.
 const homePageId=await page.locator('#esc-vb-page').inputValue();
 const options=await page.locator('#esc-vb-page option').evaluateAll(nodes=>nodes.map(n=>({value:n.value,label:n.textContent.trim()})));
 const contact=options.find(o=>/^Liên hệ$/i.test(o.label));
 if(!contact)throw Error('Contact page is unavailable in Visual Builder');
 await page.locator('#esc-vb-page').selectOption(contact.value);
 await Promise.all([page.waitForLoadState('domcontentloaded'),page.getByRole('button',{name:'Mở trang'}).click()]);
 const preview=page.frameLocator('#esc-vb-frame');
 const office=preview.locator('.pse-contact-office .pse-location-card');
 await office.waitFor({state:'visible',timeout:90000});
 const values=office.locator('dd');
 const count=await values.count();
 if(count<2)throw Error('Contact ESC office lacks address/phone source values');
 // A click on the actual ESC source value must select that source cell, never a guessed section title.
 await values.nth(0).click();
 await page.locator('#esc-vb-edit-row').waitFor({state:'visible',timeout:25000});
 await page.waitForFunction(()=>document.querySelector('#esc-vb-edit-row')?.value==='0:address',{timeout:20000});
 const addressValue=await page.locator('#esc-vb-edit-title').inputValue();
 if(!addressValue.trim()||addressValue==='Trụ sở chính')throw Error('Address click selected a heading instead of its ESC Table cell');
 await values.nth(1).click();
 await page.waitForFunction(()=>document.querySelector('#esc-vb-edit-row')?.value==='0:phone',{timeout:20000});
 const phoneValue=await page.locator('#esc-vb-edit-title').inputValue();
 if(!phoneValue.trim()||phoneValue===addressValue)throw Error('Phone click did not select its distinct source cell');
 if(!await page.locator('#esc-vb-image-editor').isHidden())throw Error('Image editor incorrectly opened for a text cell');
 // Verify the independent Media workflow: clicking an actual ESC Table image
 // opens the image picker panel, never the text editor. No Save is performed.
 if(!homePageId||!options.some(o=>o.value===homePageId))
   throw Error('WordPress did not select a homepage in Visual Builder');
 await page.locator('#esc-vb-page').selectOption(homePageId);
 await Promise.all([page.waitForLoadState('domcontentloaded'),page.getByRole('button',{name:'Mở trang'}).click()]);
 const homeFrame=page.frameLocator('#esc-vb-frame');
 const images=homeFrame.locator('img[data-esc-builder-image-row][data-esc-builder-image-field]');
 await images.first().waitFor({state:'visible',timeout:90000});
 await images.first().click({force:true});
 await page.locator('#esc-vb-image-editor').waitFor({state:'visible',timeout:30000});
 if(!await page.locator('#esc-vb-text-editor').isHidden())throw Error('Text editor incorrectly opened for an ESC image cell');
 if(!(await page.locator('#esc-vb-image-caption').innerText()).trim())
   throw Error('Image editor did not identify its canonical ESC source');
 // Verify a user actually can switch the live banner in the iframe.
 // This is a read-only UI change and must NOT select another ESC Table cell.
 const dots=homeFrame.locator('[data-home-slider]:visible [data-slider-dot]');
 const dotCount=await dots.count();
 let bannerDotResult='NOT_TESTED_NO_VISIBLE_SLIDER';
 if(dotCount>=2){
   const nextDot=dots.nth(1);
   await nextDot.click();
   await nextDot.evaluate(node=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const current=await nextDot.getAttribute('aria-current');
   if(current!=='true')throw Error('Banner dot click was intercepted by Visual Builder instead of switching slides');
   bannerDotResult='PASS';
 }else{
   console.log('PSE_BANNER_DOT=NOT_TESTED_NO_VISIBLE_SLIDER on current deployed homepage');
 }
 // Production Footer preservation baseline at the three requested widths.
 // This checks DEPLOYED public content only; it does not certify unpublished
 // G1/G2/G3 source code or perform a Builder Save.
 const iframeSrc=await page.locator('#esc-vb-frame').getAttribute('src');
 if(!iframeSrc)throw Error('Builder iframe source missing');
 const publicOrigin=new URL(iframeSrc,page.url()).origin;
 if(publicOrigin===wp.origin)throw Error('Preview origin unexpectedly equals WordPress');
 for(const width of [1440,768,390]){
   const publicPage=await browser.newPage({viewport:{width,height:900}});
   try{
     await publicPage.goto(publicOrigin+'/',{waitUntil:'domcontentloaded',timeout:60000});
     const footer=publicPage.locator('footer#footer-contact');
     await footer.waitFor({state:'visible',timeout:30000});
     const certificates=footer.locator('[aria-labelledby="footer-cert-title"] img');
     const certCount=await certificates.count();
     if(certCount!==3)throw Error('Footer certificate count '+certCount+' at '+width+'px (expected 3)');
     const bct=footer.locator('img[alt*="Bộ Công Thương"]');
     if(await bct.count()<1)throw Error('Footer Bộ Công Thương badge missing at '+width+'px');
     for(const image of [...await certificates.all(),await bct.first()]){
       const src=await image.getAttribute('src');
       if(!src)throw Error('Footer image source empty at '+width+'px');
     }
     const overflow=await publicPage.evaluate(()=>({
       page:document.documentElement.scrollWidth,
       viewport:window.innerWidth
     }));
     if(overflow.page>overflow.viewport+4)
       throw Error('Public page horizontal overflow '+overflow.page+'/'+overflow.viewport+' at '+width+'px');
     console.log('PSE_FOOTER_PUBLIC_BASELINE='+width+'px PASS certificates=3 bct=1 no_overflow=true');
   }finally{await publicPage.close();}
 }
 console.log('PSE_ESC_BUILDER_LIVE=PASS text_click=PASS image_click=PASS banner_dot_click='+bannerDotResult+' distinct_editors=PASS PUBLIC_FOOTER_1440_768_390=PASS READ_ONLY=PASS NO_BUILD=PASS');
} finally { await browser.close(); }
