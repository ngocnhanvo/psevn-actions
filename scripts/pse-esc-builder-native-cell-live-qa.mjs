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
 let contactError='';
 try{
   await office.waitFor({state:'visible',timeout:20000});
 }catch(error){
   // Fail fast on a missing source section. Record safe structural facts,
   // not the actual WordPress contact details or session-bearing URLs.
   const diagnostic=await preview.locator('body').evaluate(body=>({
     pathname:location.pathname,
     tableIds:[...document.querySelectorAll('[data-tablepress-preview]')]
       .map(el=>el.getAttribute('data-tablepress-preview')).slice(0,30),
     officeCount:body.querySelectorAll('.pse-contact-office').length,
     cardCount:body.querySelectorAll('.pse-location-card').length,
     tableCount:body.querySelectorAll('[data-tablepress-preview]').length,
     iframeTitle:document.title.slice(0,100),
   })).catch(e=>({readError:String(e).slice(0,160)}));
   console.log('PSE_CONTACT_RENDER_DIAGNOSTIC='+JSON.stringify(diagnostic));
   contactError='office location card not rendered or not visible';
 }
 if(!contactError){
 // Confirm only canonical physical ESC cells, never an inferred text value.
 // A transiently missing/partial CMS row must be diagnosed without aborting
 // independent homepage and Page-source coverage checks.
 const expectedFields=['name','address','phone','fax','email','mapUrl'];
 const missing=[];
 for(const field of expectedFields){
   const cell=office.locator('[data-esc-builder-cell-row="0"][data-esc-builder-cell-field="'+field+'"]');
   const rows=await cell.evaluateAll(nodes=>nodes.map(node=>({
     row:node.getAttribute('data-esc-builder-cell-row'),
     field:node.getAttribute('data-esc-builder-cell-field')
   })));
   // Phone/email can be displayed both as a link and text; both must map
   // to the SAME physical TablePress cell, not to one DOM location only.
   if(!rows.length||rows.some(x=>x.row!=='0'||x.field!==field))
     missing.push(field);
 }
 const physicalRow=await office.getAttribute('data-esc-builder-row');
 if(missing.length||physicalRow!=='0'){
   const shape=await office.evaluate(node=>({
     pathname:location.pathname,
     physicalRow:node.getAttribute('data-esc-builder-row'),
     renderedFields:[...node.querySelectorAll('[data-esc-builder-cell-field]')]
       .map(el=>({row:el.getAttribute('data-esc-builder-cell-row'),
         field:el.getAttribute('data-esc-builder-cell-field')})),
     tableIds:[...document.querySelectorAll('[data-tablepress-preview]')]
       .map(el=>el.getAttribute('data-tablepress-preview')).slice(0,20),
   })).catch(()=>({readError:'iframe shape unavailable'}));
   console.log('PSE_CONTACT_SOURCE_FIELD_DIAGNOSTIC='+JSON.stringify({
     missing,expectedRow:'0',shape
   }));
   contactError='physical Contact ESC cell mapping missing or ambiguous';
 }else{
 console.log('PSE_CONTACT_SOURCE_COORDINATES=PASS fields=6 row=0 READ_ONLY=true');
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
 }
 }
 // Verify the independent Media workflow: clicking an actual ESC Table image
 // opens the image picker panel, never the text editor. No Save is performed.
 if(!homePageId||!options.some(o=>o.value===homePageId))
   throw Error('WordPress did not select a homepage in Visual Builder');
 await page.locator('#esc-vb-page').selectOption(homePageId);
 await Promise.all([page.waitForLoadState('domcontentloaded'),page.getByRole('button',{name:'Mở trang'}).click()]);
 const homeFrame=page.frameLocator('#esc-vb-frame');
 // A visible iframe body is not proof that the deferred Astro selection
 // module finished bootstrapping. Wait for its installed style sentinel,
 // avoiding a false click failure when WordPress switches Page source.
 await homeFrame.locator('style[data-esc-vb-item-pick-style]')
   .waitFor({state:'attached',timeout:60000});
 const images=homeFrame.locator('img[data-esc-builder-image-row][data-esc-builder-image-field]');
 await images.first().waitFor({state:'visible',timeout:90000});
 await images.first().click({force:true});
 await page.locator('#esc-vb-image-editor').waitFor({state:'visible',timeout:30000});
 if(!await page.locator('#esc-vb-text-editor').isHidden())throw Error('Text editor incorrectly opened for an ESC image cell');
 if(!(await page.locator('#esc-vb-image-caption').innerText()).trim())
   throw Error('Image editor did not identify its canonical ESC source');
 // Section lifecycle: verify that a real Preview click exposes the new
 // Page-only removal action. Do NOT activate confirmation or Save in live QA.
 const removeSection=page.locator('#esc-vb-section-remove-open');
 await removeSection.waitFor({state:'visible',timeout:15000});
 if(await removeSection.isDisabled())
   throw Error('Source-selected Page section cannot enter guarded removal mode');
 if(await page.locator('#esc-vb-section-order-open').count()!==1)
   throw Error('Direct Preview section swap inspector missing');
 console.log('PSE_BUILDER_SECTION_REMOVE_CONTROL=PASS selected_preview=true READ_ONLY=true');
 // PSE homepage latest news has local ESC Table tab configuration but the
 // fetched Posts themselves belong to WordPress. The normal tab click must
 // remain interactive, while Alt+click selects the exact local ESC source.
 const newsTabs=homeFrame.locator('.pse-news [data-pse-news-tab]');
 const newsCount=await newsTabs.count();
 if(newsCount>=2){
   const second=newsTabs.nth(1),first=newsTabs.first();
   await second.click();
   if(await second.getAttribute('aria-selected')!=='true')
     throw Error('PSE_LATEST_NEWS_TAB=FAIL native tab interaction intercepted');
   await first.click();
   if(await first.getAttribute('aria-selected')!=='true')
     throw Error('PSE_LATEST_NEWS_TAB=FAIL returning to first tab');
   const localCell=first.locator('[data-esc-builder-cell-row="0"][data-esc-builder-cell-field]');
   if(await localCell.count()!==1)
     throw Error('PSE_LATEST_NEWS_SOURCE=FAIL first ESC tab label not mapped');
   const field=await localCell.getAttribute('data-esc-builder-cell-field');
   if(!['label','title'].includes(field||''))
     throw Error('PSE_LATEST_NEWS_SOURCE=FAIL unsupported local field '+field);
   await localCell.click({modifiers:['Alt']});
   await page.waitForFunction(expected=>
     document.querySelector('#esc-vb-edit-row')?.value===expected,
     '0:'+field,{timeout:20000});
   console.log('PSE_LATEST_NEWS_TAB_SOURCE=PASS normal_tab=PASS alt_source='+field+
     ' Posts_API=READ_ONLY no_CMS_write=true');
 }else{
   console.log('PSE_LATEST_NEWS_TAB_SOURCE=NOT_TESTED no published news tabs on current Page');
 }
 // Utility links are raw ESC Table S1 rows. Verify the physical row and
 // the exact source field on the displayed link; no external navigation.
 const utilityRows=homeFrame.locator('.pse-tools__links li[data-esc-builder-row]');
 const utilityCount=await utilityRows.count();
 if(utilityCount>0){
   const selected=utilityRows.first();
   const row=await selected.getAttribute('data-esc-builder-row');
   const source=selected.locator('[data-esc-builder-cell-row][data-esc-builder-cell-field]').first();
   const field=await source.getAttribute('data-esc-builder-cell-field');
   if(!/^[0-9]+$/.test(row||'')||!['label','title','href','url'].includes(field||'') ||
      await source.getAttribute('data-esc-builder-cell-row')!==row)
     throw Error('PSE_UTILITIES_SOURCE=FAIL invalid physical row or ESC local field');
   // A source-owned link's visible arrow belongs to the parent <a> href
   // field. Normal click must open that canonical URL editor without
   // navigating; Alt+click on an anchor is a native browser shortcut and is
   // not the production-first interaction contract.
   const arrow=selected.locator('a[data-esc-builder-cell-row][data-esc-builder-cell-field] span[aria-hidden="true"]').first();
   if(!await arrow.count())throw Error('PSE_UTILITIES_SOURCE=FAIL missing source link arrow');
   await arrow.click();
   await page.locator('#esc-vb-text-editor').waitFor({state:'visible',timeout:20000});
   await page.waitForFunction(expected=>
     document.querySelector('#esc-vb-edit-row')?.value===expected,
     row+':'+field,{timeout:20000});
   console.log('PSE_UTILITIES_SOURCE=PASS physical_row='+row+' field='+field+' READ_ONLY=true');
 }else{
   console.log('PSE_UTILITIES_SOURCE=NOT_TESTED no visible useful-link items on current Page');
 }
 // Wave 1 G1/G2/G3 Builder preview smoke (READ ONLY): not a Save test.
 // Header Menu markers and capability cues must exist in the deployed iframe;
 // activating the menu must never switch the inspected WordPress Page.
 const menuItems=homeFrame.locator('#main-header [data-esc-vb-menu-item-id]');
 await menuItems.first().waitFor({state:'attached',timeout:30000});
 const editableMenu=homeFrame.locator('#main-header [data-esc-vb-menu-item-id][data-esc-vb-region-state="editable"]');
 if(await editableMenu.count()<1)
   throw Error('Wave1 menu editability markers missing on deployed Builder preview');
 const toggle=homeFrame.locator('#desktop-menu button[data-menu-trigger]:visible').first();
 if(!await toggle.count())throw Error('Wave1 Header dropdown toggle unavailable');
 const previewUrl=await page.locator('#esc-vb-frame').getAttribute('src');
 await toggle.click();
 if(await toggle.getAttribute('aria-expanded')!=='true')
   throw Error('Wave1 Builder intercepted dropdown open');
 await toggle.click();
 if(await toggle.getAttribute('aria-expanded')!=='false')
   throw Error('Wave1 Builder intercepted dropdown close');
 await toggle.click({modifiers:['Alt']});
 await page.locator('#esc-vb-menu-editor').waitFor({state:'visible',timeout:25000});
 if(await page.locator('#esc-vb-frame').getAttribute('src')!==previewUrl)
   throw Error('Wave1 menu click navigated Builder Page unexpectedly');
 const visibleLink=homeFrame.locator('#desktop-menu a[href]:visible').first();
 if(await visibleLink.count()){
   await visibleLink.click();
   if(await page.locator('#esc-vb-frame').getAttribute('src')!==previewUrl)
     throw Error('Wave1 menu link navigated Builder Page unexpectedly');
 }
 const wpFields=homeFrame.locator('#footer-contact [data-esc-vb-footer-field][data-esc-vb-region-state="editable"]');
 await wpFields.first().waitFor({state:'visible',timeout:20000});
 await wpFields.first().click();
 await page.locator('#esc-vb-footer-editor').waitFor({state:'visible',timeout:20000});
 const footerRowStates=await homeFrame.locator('#footer-contact [data-esc-vb-footer-asset-row]').evaluateAll(nodes=>nodes.map(node=>({
   row:node.getAttribute('data-esc-vb-footer-asset-row'),
   state:node.getAttribute('data-esc-vb-region-state'),
   label:node.getAttribute('data-esc-vb-region-label')?.includes('quyền')?'permission_denied':'other'
 })));
 const regionCaps=await homeFrame.locator('#esc-vb-region-rules').evaluate(node=>({
   asset:node.getAttribute('data-footer-assets-editable'),
   info:node.getAttribute('data-footer-info-editable'),
   menu:node.getAttribute('data-menu-editable')
 })).catch(()=>({error:'marker_missing'}));
 console.log('PSE_WAVE1_FOOTER_DIAGNOSTIC='+JSON.stringify({rows:footerRowStates,caps:regionCaps}));
 const assetRows=homeFrame.locator('#footer-contact [data-esc-vb-footer-asset-row][data-esc-vb-region-state="editable"]');
 await assetRows.first().waitFor({state:'visible',timeout:20000});
 await assetRows.first().click();
 await page.locator('#esc-vb-footer-assets-editor').waitFor({state:'visible',timeout:20000});
 console.log('PSE_ESC_BUILDER_WAVE1_LIVE=PASS menu_markers=PASS toggle=PASS no_navigation=PASS footer_info_select=PASS footer_esc_select=PASS READ_ONLY=PASS');
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
 // Read-only WordPress Page source inventory for the current PSE instance.
 // Use page selector and actual authenticated iframe rather than guessing
 // TablePress IDs from project names; no WordPress REST write is performed.
 const sourceSurvey=[];
 const targets=options.filter(o=>o.value&&o.value!==homePageId).slice(0,29);
 for(const option of targets){
   try{
     await page.locator('#esc-vb-page').selectOption(option.value);
     await Promise.all([
       page.waitForLoadState('domcontentloaded',{timeout:35000}),
       page.getByRole('button',{name:'Mở trang'}).click({timeout:25000})
     ]);
     const frame=page.frameLocator('#esc-vb-frame');
     await frame.locator('body').waitFor({state:'visible',timeout:30000});
     const result=await frame.locator('body').evaluate(()=>({
       htmlParts:document.querySelectorAll('[data-esc-builder-html-part]').length,
       sections:[...document.querySelectorAll('[data-tablepress-preview]')]
         .filter(n=>!n.parentElement?.closest('[data-tablepress-preview]'))
         .slice(0,32).map(n=>({
           id:n.getAttribute('data-tablepress-preview'),
           source:n.getAttribute('data-esc-builder-api-source')||'static',
           dynamic:n.getAttribute('data-esc-builder-dynamic')==='true',
           rowCount:n.querySelectorAll('[data-esc-builder-row]').length,
           localCells:n.querySelectorAll('[data-esc-builder-cell-row][data-esc-builder-cell-field]').length,
           fields:[...new Set([...n.querySelectorAll('[data-esc-builder-cell-row][data-esc-builder-cell-field]')]
             .map(el=>el.getAttribute('data-esc-builder-cell-field')).filter(Boolean))].sort(),
           mediaFields:[...new Set([...n.querySelectorAll('[data-esc-builder-image-row][data-esc-builder-image-field]')]
             .map(el=>el.getAttribute('data-esc-builder-image-field')).filter(Boolean))].sort()
         }))
     }));
     sourceSurvey.push({pageId:option.value,htmlParts:result.htmlParts,sections:result.sections});
   }catch(error){
     sourceSurvey.push({pageId:option.value,sourceAudit:'NOT_TESTED',
       reason:String(error?.message||error).slice(0,100)});
   }
 }
 console.log('PSE_VB_SOURCE_SITE_INVENTORY='+JSON.stringify({
   inspected:sourceSurvey.length,availablePages:options.length,results:sourceSurvey
 }));
 // Current PSE's actually discovered S1 sources. Don't infer an editable
 // API record from a data row, and don't pass source parity based on HTTP 200.
 const mandatory={
   pse_hotline_vi:['group','label','phone','note'],
   pse_faq_vi:['question','answer','visible'],
   pse_history_vi:['date','title','details'],
   pse_vision_vi:['title','details'],
   pse_contact_office_vi:['name','address','phone','fax','email','mapUrl'],
 };
 const found=sourceSurvey.flatMap(page=>page.sections||[]);
 for(const [table,fields] of Object.entries(mandatory)){
   const instances=found.filter(source=>source.id===table);
   if(instances.length!==1)
     throw Error('PSE_VB_PAGE_SOURCE=FAIL missing_or_duplicated '+table+' instances='+instances.length);
   const missing=fields.filter(field=>!instances[0].fields.includes(field));
   if(missing.length)
     throw Error('PSE_VB_PAGE_SOURCE=FAIL '+table+' missing='+missing.join(',')+
       ' present='+instances[0].fields.join(','));
 }
 console.log('PSE_VB_PAGE_SOURCE=PASS all_5_real_ESC_tables=true physical_fields=true READ_ONLY=true');
 if(contactError)throw Error('PSE_CONTACT_SOURCE_QA=FAIL '+contactError+
   '; homepage QA completed independently; inspect PSE_CONTACT_RENDER_DIAGNOSTIC');
 console.log('PSE_ESC_BUILDER_LIVE=PASS text_click=PASS image_click=PASS banner_dot_click='+bannerDotResult+' distinct_editors=PASS PUBLIC_FOOTER_1440_768_390=PASS READ_ONLY=PASS NO_BUILD=PASS');
} finally { await browser.close(); }
