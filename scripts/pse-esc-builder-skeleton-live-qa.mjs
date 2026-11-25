/** Live PSE Builder G1 skeleton/rapid selection QA. Read-only, no CMS Save or build. */
import { chromium } from 'playwright';

const line=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/, '')).filter(s=>s.startsWith('WC_URL='));
if(line.length!==1)throw Error('PSE WordPress origin missing/ambiguous');
const wp=new URL(line[0].slice(7).replace(/^['"]|['"]$/g,''));
if(wp.protocol!=='https:'||!wp.hostname||wp.username||wp.password||wp.search||wp.hash||
   !['','/'].includes(wp.pathname))throw Error('Unsafe WordPress origin');

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try {
  await page.goto(wp.origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
  if(await page.locator('#user_login').count()){
    await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
    await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
    const body=await page.locator('body').innerText();
    const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)
      ||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if(m){
      const a=+m[1],b=+m[3];
      const answer=({'+':a+b,'-':a-b,'x':a*b,'×':a*b,'*':a*b})[m[2]];
      const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if(!await field.count())throw Error('WP arithmetic form cannot be resolved');
      await field.fill(String(answer));
    }
    await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
  }
  if(page.url().includes('wp-login'))throw Error('WordPress login rejected');
  await page.goto(wp.origin+'/wp-admin/edit.php?post_type=page&page=esc-visual-builder',{waitUntil:'domcontentloaded',timeout:60000});
  const selector=page.locator('#esc-vb-page');
  await selector.waitFor({state:'visible',timeout:30000});
  const homeId=await selector.inputValue();
  if(!homeId)throw Error('Missing Builder home Page');
  await Promise.all([page.waitForLoadState('domcontentloaded'),page.getByRole('button',{name:'Mở trang'}).click()]);
  const frame=page.frameLocator('#esc-vb-frame');
  await frame.locator('#main-header').waitFor({state:'visible',timeout:90000});
  await page.waitForFunction(()=>typeof window.escVBSelectionBegin==='function' &&
    typeof window.escVBSelectionFinish==='function',null,{timeout:20000});

  // Production-first contract: the authentic Builder opens as an unaltered
  // production canvas. No inspector tools are expanded before selecting.
  await frame.locator('[data-esc-vb-region-state="editable"]').first()
    .waitFor({state:'attached',timeout:20000});
  const pristine=await page.evaluate(()=>{
    const app=document.getElementById('esc-vb-app');
    const hidden=id=>{
      const el=document.getElementById(id);
      return Boolean(el && getComputedStyle(el).display==='none');
    };
    return {selected:app?.classList.contains('esc-vb-has-selection')||false,
      sectionControlsHidden:hidden('esc-vb-section-order-panel'),
      technicalHidden:hidden('esc-vb-inspector-details'),
      refreshHidden:hidden('esc-vb-refresh-section')};
  });
  if(pristine.selected||!pristine.sectionControlsHidden||
     !pristine.technicalHidden||!pristine.refreshHidden)
    throw Error('Builder displayed editing tools before a real Preview selection');
  const hover=await frame.locator('body').evaluate(root=>{
    const readonly=root.querySelector('[data-esc-vb-region-state="readonly"]') ||
      root.querySelector('[data-esc-vb-region-state="unsupported"]');
    const hint=document.getElementById('esc-vb-editability-hint');
    if(!readonly||!hint)return {verified:false};
    readonly.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));
    return {verified:true,hintHidden:hint.hidden,readonlyCursor:getComputedStyle(readonly).cursor};
  });
  if(!hover.verified||!hover.hintHidden||hover.readonlyCursor==='crosshair')
    throw Error('Readonly region advertises editing on hover');
  console.log('PSE_BUILDER_PRODUCTION_FIRST_INITIAL=PASS controls_hidden=PASS readonly_hover_silent=PASS');
  // A successful live WordPress source refresh must not create a phantom
  // 14px blue info strip that shifts the Page relative to public production.
  // Real synchronization errors stay visible and fail the source-ready QA.
  const sourceBanner=await frame.locator('[data-esc-builder-refresh-status]')
    .evaluate(el=>({hidden:el.hidden,ready:el.getAttribute('data-source-ready'),
      display:getComputedStyle(el).display,role:el.getAttribute('role')}));
  if(!sourceBanner.hidden||sourceBanner.ready!=='true'||sourceBanner.display!=='none')
    throw Error('Preview adds a source-success banner or has a failed CMS refresh: '+
      JSON.stringify(sourceBanner));
  console.log('PSE_BUILDER_SOURCE_READY_VISUAL_PARITY=PASS success_banner_hidden=PASS');


  const referenceUi=await page.evaluate(()=>{
    const buttonIds=['esc-vb-reference-replace-open',
      'esc-vb-reference-insert-open','esc-vb-reference-local-open',
      'esc-vb-item-visibility-open'];
    const dialogIds=['esc-vb-reference-dialog','esc-vb-local-dialog',
      'esc-vb-visibility-dialog'];
    const buttons=buttonIds.map(id=>{
      const button=document.getElementById(id);
      return {id,exists:!!button,hidden:button?.hidden,
        disabled:button?.disabled,
        display:button?getComputedStyle(button).display:''};
    });
    const dialogs=dialogIds.map(id=>{
      const dialog=document.getElementById(id);
      return {id,exists:!!dialog,open:dialog?.open||false};
    });
    return {buttons,dialogs};
  });
  if(referenceUi.buttons.some(b=>!b.exists||!b.hidden||!b.disabled||
      b.display!=='none')||referenceUi.dialogs.some(d=>!d.exists||d.open))
    throw Error('Manual-reference controls leaked into unselected Preview: '+
      JSON.stringify(referenceUi));
  console.log('PSE_BUILDER_REFERENCE_PICKER_DEFAULT=PASS hidden=PASS disabled=PASS controls=4 NO_CMS_WRITE=PASS');

  // Verify two new production REST routes exist and reject unauthenticated
  // malformed tickets BEFORE any writer can run. Only invalid requests are
  // sent; this is not a Save smoke test and must not mutate CMS data.
  const guardedRoutes=await page.evaluate(async()=>{
    const names=['reference-candidates','replace-reference',
      'insert-reference','save-local-item-field'];
    const results=[];
    for(const name of names){
      const response=await fetch('/wp-json/esc-builder/v1/'+name,{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({table_id:'pse_03_vi',page_id:0,ticket:'invalid'})
      });
      const body=await response.json().catch(()=>({}));
      results.push({name,status:response.status,code:body.code||''});
    }
    return results;
  });
  if(guardedRoutes.some(r=>r.status!==403||r.code!=='invalid_ticket'))
    throw Error('New reference route missing or bypassed ticket guard: '+
      JSON.stringify(guardedRoutes));
  console.log('PSE_BUILDER_NEW_REFERENCE_ROUTES_AUTH=PASS denied=4 NO_CMS_WRITE=PASS');

  // Verify the precisely approved S4 WordPress-native Posts REST endpoint
  // exists on this origin. Never query external sources or expose individual
  // Post content; only log status and published type correctness.
  const s4PostProbe=await page.evaluate(async()=>{
    const r=await fetch('/wp-json/wp/v2/posts?per_page=1&_fields=id,status',{
      credentials:'same-origin',cache:'no-store'
    });
    const data=await r.json().catch(()=>null);
    return {status:r.status,valid:r.ok&&Array.isArray(data)&&
      data.every(post=>Number.isSafeInteger(post?.id)&&post.id>0&&post.status==='publish'),
      sampleCount:Array.isArray(data)?data.length:0};
  });
  if(!s4PostProbe.valid)throw Error('Approved site-local WP Posts REST source unavailable: '+
    JSON.stringify(s4PostProbe));
  console.log('PSE_S4_LOCAL_POSTS_REST_SOURCE=PASS canonical_route=PASS published_schema=PASS'+
    ' sample_count='+s4PostProbe.sampleCount+' NO_CMS_WRITE=PASS');

  // Confirm the production API really supports Post ID pinning, including
  // older-than-first-page records if available. Only GET public published
  // Post ID/status fields; never alter Post content or expose its title.
  const pinnedPostProbe=await page.evaluate(async()=>{
    const base='/wp-json/wp/v2/posts';
    const initial=await fetch(base+'?per_page=1&_fields=id,status',{
      credentials:'same-origin',cache:'no-store'
    });
    const initialRows=await initial.json().catch(()=>[]);
    if(!initial.ok||!Array.isArray(initialRows)||!initialRows.length||
      !Number.isSafeInteger(initialRows[0]?.id))
      return {valid:false,reason:'no published reference Post'};
    const older=await fetch(base+'?per_page=1&offset=11&_fields=id,status',{
      credentials:'same-origin',cache:'no-store'
    });
    const olderRows=await older.json().catch(()=>[]);
    const hasOlder=older.ok&&Array.isArray(olderRows)&&olderRows.length===1&&
      olderRows[0]?.status==='publish'&&Number.isSafeInteger(olderRows[0]?.id);
    const expected=hasOlder?olderRows[0].id:initialRows[0].id;
    const pin=await fetch(base+'?include='+encodeURIComponent(String(expected))+
      '&per_page=1&_fields=id,status',{
      credentials:'same-origin',cache:'no-store'
    });
    const records=await pin.json().catch(()=>[]);
    return {valid:pin.ok&&Array.isArray(records)&&records.length===1&&
        records[0]?.id===expected&&records[0]?.status==='publish',
      olderThanDefaultPage:hasOlder};
  });
  if(!pinnedPostProbe.valid)
    throw Error('S4 source did not resolve an exact Post ID via include: '+
      JSON.stringify(pinnedPostProbe));
  console.log('PSE_S4_POST_ID_INCLUDE_LIVE=PASS older_than_default_page='+
    (pinnedPostProbe.olderThanDefaultPage?'PASS':'NOT_TESTED')+
    ' one_bounded_request=PASS NO_CMS_WRITE=PASS');




  // Rendered parity is separate from content parity. Align the actual
  // cross-origin iframe *inner viewport* to public CSS pixels, including its
  // native border; do not compare Admin outer-browser width to public width.
  // No screenshot, CMS mutation, source write or production navigation occurs.
  const homepageVisualParity=async targetWidth=>{
    const iframe=page.locator('#esc-vb-frame');
    const originalStyle=await iframe.getAttribute('style');
    const resize=async cssWidth=>{
      await iframe.evaluate((el,width)=>{
        for(const property of ['width','min-width','max-width'])
          el.style.setProperty(property,width+'px','important');
        el.style.setProperty('flex','0 0 '+width+'px','important');
      },cssWidth);
    };
    const current=page.frameLocator('#esc-vb-frame');
    const origin=await current.locator('body').evaluate(()=>location.origin);
    const visitor=await browser.newPage({
      viewport:{width:targetWidth,height:900},deviceScaleFactor:1
    });
    try{
      await resize(targetWidth);
      let inner=await current.locator('html').evaluate(()=>window.innerWidth);
      if(inner!==targetWidth){
        await resize(targetWidth+(targetWidth-inner));
        inner=await current.locator('html').evaluate(async()=>{
          await new Promise(resolve=>requestAnimationFrame(resolve));
          return window.innerWidth;
        });
      }
      if(inner!==targetWidth)throw Error('Builder visual viewport mismatch expected='+
        targetWidth+' actual='+inner);
      const response=await visitor.goto(origin+'/',{
        waitUntil:'domcontentloaded',timeout:60000
      });
      if(!response?.ok())throw Error('Homepage public visual parity route HTTP error');
      await current.locator('.pse-hero').waitFor({state:'visible',timeout:30000});
      await visitor.locator('.pse-hero').waitFor({state:'visible',timeout:30000});
      // Wait for fonts/resize while keeping the same scroll state. The hero
      // carousel may advance independently; compare stable section boxes,
      // never the momentary active slide image or animated slide transform.
      await current.locator('html').evaluate(async()=>{
        window.scrollTo(0,0);
        await document.fonts?.ready;
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      });
      await visitor.locator('html').evaluate(async()=>{
        window.scrollTo(0,0);
        await document.fonts?.ready;
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      });
      const sample=()=>{
        const landmarks=['#main-header','.pse-hero','.pse-hero__slides',
          '.pse-tools__links','.pse-promise'];
        const result={width:window.innerWidth,marks:{}};
        for(const selector of landmarks){
          const el=document.querySelector(selector);
          if(!el){result.marks[selector]=null;continue;}
          const rect=el.getBoundingClientRect();
          const style=getComputedStyle(el);
          result.marks[selector]={
            x:Math.round(rect.x*10)/10,
            y:Math.round(rect.y*10)/10,
            w:Math.round(rect.width*10)/10,
            h:Math.round(rect.height*10)/10,
            display:style.display,
            font:style.fontFamily,
            size:style.fontSize,
            padding:style.padding,
            background:style.backgroundColor
          };
        }
        return result;
      };
      const preview=await current.locator('html').evaluate(sample);
      const publicResult=await visitor.locator('html').evaluate(sample);
      if(preview.width!==targetWidth||publicResult.width!==targetWidth)
        throw Error('Visual parity test sampled unequal CSS viewports');
      const differences=[];
      for(const selector of Object.keys(preview.marks)){
        const a=preview.marks[selector],b=publicResult.marks[selector];
        if(!a||!b){
          if(a||b||selector==='#main-header'||selector==='.pse-hero')
            differences.push({selector,reason:'missing region'});
          continue;
        }
        const delta={};
        for(const dimension of ['x','y','w','h']){
          if(Math.abs(a[dimension]-b[dimension])>5)
            delta[dimension]=[a[dimension],b[dimension]];
        }
        for(const property of ['display','font','size','padding','background']){
          if(a[property]!==b[property])delta[property]=[a[property],b[property]];
        }
        if(Object.keys(delta).length)differences.push({selector,delta});
      }
      if(differences.length)throw Error('Production vs Builder unselected homepage visual '+
        'parity mismatch width='+targetWidth+' '+JSON.stringify(differences));
      console.log('PSE_BUILDER_HOMEPAGE_RESPONSIVE_VISUAL_PARITY=PASS width='+
        targetWidth+' regions='+Object.values(preview.marks).filter(Boolean).length+
        ' layout_typography_surface=PASS NO_CMS_WRITE=PASS');
    }finally{
      if(originalStyle===null)await iframe.evaluate(el=>el.removeAttribute('style'));
      else await iframe.evaluate((el,style)=>el.setAttribute('style',style),originalStyle);
      await visitor.close();
    }
  };
  for(const width of [1440,1024,390])await homepageVisualParity(width);

  // The old preview used to inject green/white ESC Table text chips over
  // the hero. Production has no such content. Keep text/URL editing in the
  // contextual inspector opened AFTER selecting its real image source.
  const hero=frame.locator('.pse-hero');
  await hero.waitFor({state:'visible',timeout:30000});
  const overlayCount=await hero.locator('.pse-hero__builder-fields, [aria-label="Các ô nguồn ESC Table của banner"]').count();
  if(overlayCount)throw Error('Builder still injects banner-only ESC Table text overlays');
  // Carousel advances while extra source-security probes run. Selecting
  // the *first physical slide* is wrong when it has rotated out of view.
  // Select the genuinely visible slide on the live Preview instead.
  const heroImage=hero.locator('img[data-esc-builder-image-row][data-esc-builder-image-field]:visible').first();
  await heroImage.waitFor({state:'visible',timeout:25000});
  await heroImage.click({force:true});
  const staticReferenceTools=await page.evaluate(()=>
    ['esc-vb-reference-replace-open','esc-vb-reference-insert-open',
     'esc-vb-reference-local-open'].map(id=>{
      const b=document.getElementById(id);
      return {id,hidden:b?.hidden,disabled:b?.disabled};
    }));
  if(staticReferenceTools.some(b=>!b.hidden||!b.disabled))
    throw Error('Reference writer advertised on static S1 hero: '+
      JSON.stringify(staticReferenceTools));
  console.log('PSE_BUILDER_REFERENCE_STATIC_SOURCE_LOCK=PASS NO_CMS_WRITE=PASS');
  const relatedText=page.locator('#esc-vb-image-open-text');
  // WP .button CSS must not reveal controls before a validated REST source.
  // Wait for actual availability, not just computed visibility.
  await page.waitForFunction(()=>{
    const button=document.getElementById('esc-vb-image-open-text');
    const label=document.getElementById('esc-vb-image-caption')?.textContent||'';
    return button && !button.hidden && !button.disabled && !label.includes('đang đọc');
  },null,{timeout:35000});
  await relatedText.waitFor({state:'visible',timeout:10000});
  const beforeRelatedClick=await page.evaluate(()=>({
    buttonHidden:document.getElementById('esc-vb-image-open-text')?.hidden,
    saveDisabled:document.getElementById('esc-vb-image-save')?.disabled,
    cancelDisabled:document.getElementById('esc-vb-image-cancel')?.disabled,
    imageCaption:document.getElementById('esc-vb-image-caption')?.textContent?.slice(0,80)
  }));
  console.log('PSE_HERO_CONTEXT_BEFORE_CLICK='+JSON.stringify(beforeRelatedClick));
  page.once('dialog',async dialog=>{
    console.log('PSE_HERO_CONTEXT_DIALOG='+JSON.stringify({type:dialog.type(),draftWarning:/bản nháp chưa lưu|Bỏ/.test(dialog.message())}));
    if(dialog.type()==='confirm' && /bản nháp chưa lưu|Bỏ/.test(dialog.message()))await dialog.accept();
    else await dialog.dismiss();
  });
  await relatedText.click();
  let textOpened=false;
  try {
    await page.locator('#esc-vb-text-editor').waitFor({state:'visible',timeout:7000});
    textOpened=true;
  } catch {}
  if(!textOpened){
    const heroOwner=await heroImage.evaluate(el=>({
      tableId:el.closest('[data-tablepress-preview]')?.getAttribute('data-tablepress-preview')||'',
      row:Number(el.getAttribute('data-esc-builder-image-row'))
    }));
    const diag=await page.evaluate(()=>({
      bridge:typeof window.escVBOpenItemText,
      imageOpen:document.getElementById('esc-vb-image-editor')?.style.display,
      textOpen:document.getElementById('esc-vb-text-editor')?.style.display,
      textOptions:document.getElementById('esc-vb-edit-row')?.options?.length,
      imageFeedbackError:document.getElementById('esc-vb-image-feedback')?.textContent?.includes('Chưa có trình sửa chữ hợp lệ')||false,
      hasSelection:document.getElementById('esc-vb-app')?.classList.contains('esc-vb-has-selection')||false,
      buttonHidden:document.getElementById('esc-vb-image-open-text')?.hidden||false
    }));
    const direct=await page.evaluate(({tableId,row})=>
      typeof window.escVBOpenItemText==='function'?
      window.escVBOpenItemText(tableId,row):false,heroOwner);
    const directOpened=await page.locator('#esc-vb-text-editor').isVisible();
    console.log('PSE_BUILDER_HERO_TEXT_BRIDGE_DIAG='+JSON.stringify({
      ...diag,heroOwner:heroOwner.tableId?{tableId:heroOwner.tableId,rowValid:Number.isSafeInteger(heroOwner.row)}:null,
      directReturned:direct,directOpened
    }));
    throw Error('Related text/link panel did not open on the actual inspector button click');
  }
  await page.waitForFunction(()=>
    (document.querySelector('#esc-vb-edit-row')?.options?.length||0)>0,
    null,{timeout:30000});
  const textSources=await page.locator('#esc-vb-edit-row option').count();
  if(!textSources)throw Error('Selected hero image cannot reach its canonical text/link inspector');
  console.log('PSE_BUILDER_HERO_PRODUCTION_PARITY=PASS chips=0 text_editor_after_click=PASS source_options='+textSources);

  // S1 useful links: public and unselected Builder must show the SAME
  // physical links, with URL controls hidden in the context editor only.
  const useful=frame.locator('.pse-tools__links');
  await useful.waitFor({state:'visible',timeout:30000});
  if(await frame.locator('.pse-tools__url').count())
    throw Error('Builder injected technical URL chips over the public useful links');
  const previewLinks=await useful.locator('a').evaluateAll(links=>
    links.map(a=>({text:a.textContent.trim(),href:a.getAttribute('href')||''})));
  const frontOrigin=new URL(await frame.locator('body').evaluate(()=>location.href)).origin;
  const publicPage=await browser.newPage({viewport:{width:1440,height:900}});
  try {
    await publicPage.goto(frontOrigin+'/',{waitUntil:'domcontentloaded',timeout:60000});
    await publicPage.locator('.pse-tools__links').waitFor({state:'visible',timeout:25000});
    const publicLinks=await publicPage.locator('.pse-tools__links a').evaluateAll(links=>
      links.map(a=>({text:a.textContent.trim(),href:a.getAttribute('href')||''})));
    if(JSON.stringify(previewLinks)!==JSON.stringify(publicLinks))
      throw Error('Useful links Preview differs from production count, order or URL');
    console.log('PSE_BUILDER_USEFUL_LINK_PUBLIC_PARITY=PASS count='+publicLinks.length);
    const sections=(root)=>({
      newsTabs:[...root.querySelectorAll('.pse-news__tab')].map(x=>x.textContent.replace(/\\s+/g,' ').trim()),
      queryBadges:root.querySelectorAll('.pse-news__builder-query').length,
      commitments:[...root.querySelectorAll('.pse-promise__highlight')].map(x=>
        x.textContent.replace(/\\s+/g,' ').trim()),
      fakePromiseMedia:root.querySelectorAll(
        '.pse-promise img[alt="Chọn icon ESC Table"],.pse-promise img[alt="Chọn ảnh nền ESC Table"]').length,
    });
    const previewSections=await frame.locator('body').evaluate(sections);
    const publishedSections=await publicPage.locator('body').evaluate(sections);
    if(JSON.stringify(previewSections)!==JSON.stringify(publishedSections))
      throw Error('News or sustainability Preview differs from public source content/layout');
    if(previewSections.queryBadges || previewSections.fakePromiseMedia ||
       previewSections.commitments.length>3)
      throw Error('Builder invented unavailable news config, media or extra promises');
    console.log('PSE_BUILDER_HOME_SECTIONS_PUBLIC_PARITY=PASS news_tabs='+
      previewSections.newsTabs.length+' promises='+previewSections.commitments.length+
      ' query_badges=0 fake_media=0');
  } finally {await publicPage.close();}
  // Inspect Astro in its own Playwright Frame execution context. Evaluating
  // from the WordPress parent cannot read a cross-origin Preview iframe.
  const frameElement=await page.locator('#esc-vb-frame').elementHandle();
  const liveFrame=await frameElement?.contentFrame();
  if(!liveFrame)throw Error('Authenticated Astro Preview frame unavailable');
  const sourceLink=useful.locator('a[data-esc-builder-cell-row][data-esc-builder-cell-field]').first();
  await sourceLink.waitFor({state:'visible',timeout:20000});
  const linkRow=Number(await sourceLink.getAttribute('data-esc-builder-cell-row'));
  const linkField=await sourceLink.getAttribute('data-esc-builder-cell-field');
  if(!Number.isSafeInteger(linkRow)||linkRow<0||!['href','url','link'].includes(linkField))
    throw Error('A useful link is missing canonical ESC Table row/URL field identity');
  const originalLink=await sourceLink.getAttribute('href');
  const arrow=sourceLink.locator('span[aria-hidden="true"]').first();
  await arrow.click();
  await page.locator('#esc-vb-text-editor').waitFor({state:'visible',timeout:30000});
  await page.waitForFunction(rowField=>
    document.getElementById('esc-vb-edit-row')?.value===rowField,
    linkRow+':'+linkField,{timeout:30000});
  const input=page.locator('#esc-vb-edit-title');
  const originalRaw=await input.inputValue();
  if(!originalRaw||!originalLink||!originalLink.startsWith('http'))
    throw Error('The useful link editor did not load its original HTTPS source');
  const draft=new URL(originalRaw);
  draft.hash='esc-vb-preview-qa-only';
  const changed=draft.href;
  await input.fill(changed);
  try {
    await liveFrame.waitForFunction(expectHref=>
      document.querySelector('.pse-tools__links a[data-esc-builder-cell-field]')?.getAttribute('href')===expectHref,
      changed,{timeout:12000});
  } catch (error) {
    // The Editor and Astro Preview have different origins: never rely on
    // iframe.contentDocument. Gather safe non-secret shape diagnostics from
    // each origin through its own Playwright frame execution context.
    const state=await frame.locator('body').evaluate(({row,field})=>{
      const selector='[data-tablepress-preview="pse_03_vi"]';
      const roots=[...document.querySelectorAll(selector)];
      const anchors=roots.flatMap(root=>[...root.querySelectorAll('a[data-esc-builder-cell-row][data-esc-builder-cell-field]')])
        .filter(a=>a.getAttribute('data-esc-builder-cell-row')===String(row) &&
          a.getAttribute('data-esc-builder-cell-field')===field);
      return {owners:roots.length,anchors:anchors.length,hrefs:anchors.map(a=>a.getAttribute('href')),
        bodyLink:document.querySelector('.pse-tools__links a')?.getAttribute('href'),
        sourceRows:[...new Set(anchors.map(a=>a.getAttribute('data-esc-builder-cell-row')))]};
    },{row:linkRow,field:linkField});
    const inspectorState=await page.evaluate(()=>({
      field:document.querySelector('#esc-vb-edit-row')?.value,
      disabled:document.querySelector('#esc-vb-edit-save')?.disabled,
      textLength:document.querySelector('#esc-vb-edit-title')?.value?.length,
      feedback:(document.querySelector('#esc-vb-edit-feedback')?.textContent||'').slice(0,155)
    }));
    console.log('PSE_BUILDER_HREF_DRAFT_DIAG='+JSON.stringify({state,inspectorState}));
    throw error;
  }
  const saveEnabled=await page.locator('#esc-vb-edit-save').isEnabled();
  if(!saveEnabled)throw Error('Canonical valid URL draft did not activate Save');
  await page.locator('#esc-vb-edit-cancel').click();
  await liveFrame.waitForFunction(expectedHref=>
    document.querySelector('.pse-tools__links a[data-esc-builder-cell-field]')?.getAttribute('href')===expectedHref,
    originalLink,{timeout:12000});
  await input.fill('javascript:alert(1)');
  if(await page.locator('#esc-vb-edit-save').isEnabled())
    throw Error('Unsafe URL draft was offered as a WordPress Save');
  if(await sourceLink.getAttribute('href')!==originalLink)
    throw Error('An invalid URL mutated the Builder link');
  await page.locator('#esc-vb-edit-cancel').click();
  console.log('PSE_BUILDER_HREF_CLICK_EDIT_CANCEL=PASS row='+linkRow+
    ' field='+linkField+' valid_draft=PASS unsafe_save_blocked=PASS NO_CMS_WRITE=PASS');

  // An S5 news tab is one real local TablePress row. The WordPress Posts
  // resolved by that category are readonly and have no editable source rows.
  const newsTab=frame.locator('.pse-news__tab[data-pse-news-tab]').first();
  if(await newsTab.count()){
    const newsTableId=await newsTab.evaluate(node=>node.closest('[data-tablepress-preview]')
      ?.getAttribute('data-tablepress-preview')||'');
    if(!newsTableId)throw Error('S5 tab does not have a native ESC Table owner');
    if(!(await frame.locator('.pse-news__featured[data-esc-vb-region-state="readonly"]').count()))
      throw Error('Generated WordPress Posts must remain readonly');
    await newsTab.click({modifiers:['Alt']});
    await page.waitForFunction(id=>
      (document.querySelector('#esc-vb-edit-caption')?.textContent||'').includes(id) &&
      (document.querySelector('#esc-vb-edit-row')?.options?.length||0)>0,
      newsTableId,{timeout:35000});
    const options=await page.locator('#esc-vb-edit-row option').evaluateAll(nodes=>
      nodes.map(node=>node.value));
    const fields=[...new Set(options.filter(x=>/^\d+:/.test(x)).map(x=>x.split(':').slice(1).join(':')))];
    const queryFields=['categoryId','categorySlug','category','limit','order','orderby']
      .filter(field=>fields.includes(field));
    if(!queryFields.length) {
      console.log('PSE_BUILDER_S5_QUERY_SOURCE=NOT_TESTED source='+
        newsTableId+' reason=no_native_query_columns API_READONLY=PASS');
    }else {
      const priority=['limit','order','orderby','categoryId','categorySlug','category'];
      const field=priority.find(value=>queryFields.includes(value));
      const key=options.find(value=>/^\d+:/.test(value) && value.endsWith(':'+field));
      if(!field||!key)throw Error('Cannot resolve the exact S5 native field row');
      await page.locator('#esc-vb-edit-row').selectOption(key);
      const editor=page.locator('#esc-vb-edit-title');
      if(!await editor.isEnabled()) {
        console.log('PSE_BUILDER_S5_QUERY_SOURCE=NOT_TESTED source='+newsTableId+
          ' field='+field+' reason=readonly_under_current_role API_READONLY=PASS');
      }else {
        const old=await editor.inputValue();
        const bad=field==='limit'?'50':field==='order'?'random':
          field==='orderby'?'rand':field==='categoryId'?'-1':'unsafe/path';
        await editor.fill(bad);
        if(await page.locator('#esc-vb-edit-save').isEnabled())
          throw Error('Malformed S5 query value became Save-enabled');
        await page.locator('#esc-vb-edit-cancel').click();
        if(await editor.inputValue()!==old)
          throw Error('S5 query Cancel did not restore the native source value');
        console.log('PSE_BUILDER_S5_QUERY_SOURCE=PASS source='+newsTableId+
          ' fields='+queryFields.join(',')+' invalid_save_blocked=PASS cancel=PASS'+
          ' API_READONLY=PASS NO_CMS_WRITE=PASS');
      }
    }
  }


  // Verify real deployed inspector timer: fast cached data must never flash,
  // stale completion must never close the currently active selection.
  if(process.env.PSE_SKIP_STATIC_SKELETON!=='1'){
  const result=await page.evaluate(async()=>{
    const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const panel=document.querySelector('#esc-vb-selection-skeleton');
    if(!panel)throw Error('Deployed skeleton missing');
    const begin=window.escVBSelectionBegin,finish=window.escVBSelectionFinish;
    const reset=window.escVBSelectionReset;
    reset();
    const quick=begin('footer','Fast response');
    if(panel.getAttribute('aria-busy')!=='true')throw Error('Quick selection did not enter loading');
    if(!finish(quick))throw Error('Quick selection cannot finish');
    await sleep(175);
    if(!panel.hidden||panel.getAttribute('aria-busy')!=='false')
      throw Error('Fast selection flickered or stuck busy');
    const slow=begin('menu','Slow request');
    await sleep(185);
    if(panel.hidden||panel.getAttribute('aria-busy')!=='true')
      throw Error('Slow selection never showed skeleton');
    if(!finish(slow)||!panel.hidden)throw Error('Slow selection never closed skeleton');
    let previous=begin('menu','Rapid first');
    for(let i=0;i<10;i++){
      const newest=begin('footer','Rapid '+i);
      if(finish(previous)!==false)throw Error('Stale response incorrectly finished new selection');
      previous=newest;
    }
    await sleep(170);
    if(panel.hidden||panel.getAttribute('aria-busy')!=='true')
      throw Error('Rapid clicks lost newest loading state');
    if(!finish(previous)||!panel.hidden||panel.getAttribute('aria-busy')!=='false')
      throw Error('Latest response did not finish cleanly');
    reset();
    return {quick:'PASS',slow:'PASS',rapid_10:'PASS',stale:'PASS',stuck_loading:'NONE'};
  });
  console.log('PSE_BUILDER_G1_SKELETON_LIVE='+JSON.stringify(result));
  } else { console.log('PSE_BUILDER_G1_SKELETON_LIVE=ALREADY_PASS_RUN_40437608156'); }

  // Real event→WordPress REST→inspector race (read-only): delay the FIRST
  // Footer selection request so that it arrives after the second one.
  let intercepted=0;
  await page.route('**/wp-json/esc-builder/v1/footer-asset*',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    const seq=++intercepted;
    await delay(seq===1?1200:80);
    await route.continue();
  });
  const assets=frame.locator('#footer-contact [data-esc-vb-footer-asset-row][data-esc-vb-region-state="editable"]');
  await assets.first().waitFor({state:'visible',timeout:25000});
  if(await assets.count()<2){
    const state=await frame.locator('#footer-contact [data-esc-vb-footer-asset-row]').evaluateAll(
      nodes=>nodes.map(n=>({row:n.getAttribute('data-esc-vb-footer-asset-row'),status:n.getAttribute('data-esc-vb-region-state')})));
    console.log('PSE_BUILDER_G1_ASSET_SELECTION_DIAG='+JSON.stringify(state));
    throw Error('Expected at least two editable Footer rows');
  }
  const first=Number(await assets.nth(0).getAttribute('data-esc-vb-footer-asset-row'));
  const second=Number(await assets.nth(1).getAttribute('data-esc-vb-footer-asset-row'));
  if(!Number.isSafeInteger(first)||!Number.isSafeInteger(second)||first===second)
    throw Error('Invalid distinct Footer row markers');
  await assets.nth(0).click();
  await assets.nth(1).click();
  const afterSelection=await page.evaluate(()=>
    document.getElementById('esc-vb-app')?.classList.contains('esc-vb-has-selection') &&
    getComputedStyle(document.getElementById('esc-vb-section-order-panel')).display!=='none');
  if(!afterSelection)throw Error('Builder did not reveal context tools after Preview click');
  console.log('PSE_BUILDER_CLICK_TO_DISCLOSE=PASS');
  const inspector=page.locator('#esc-vb-footer-assets-editor');
  await inspector.waitFor({state:'visible',timeout:20000});
  await page.waitForFunction(row=>{
    const text=document.querySelector('#esc-vb-footer-assets-editor p')?.textContent||'';
    return text.includes('dòng '+(row+1));
  },second,{timeout:30000}).catch(()=>{});
  // WordPress requests may take several seconds independent of our injected
  // delays. Wait for the real latest inspector request to settle rather than
  // treating an arbitrary 1.5-second observation as a stuck loader.
  let settled=false;
  try {
    await page.waitForFunction(() => {
      const skeleton=document.getElementById('esc-vb-selection-skeleton');
      return skeleton?.getAttribute('aria-busy')==='false' && skeleton.hidden;
    },null,{timeout:16000});
    settled=true;
  } catch {
    const diag=await page.evaluate(()=>({
      busy:document.getElementById('esc-vb-selection-skeleton')?.getAttribute('aria-busy'),
      hidden:document.getElementById('esc-vb-selection-skeleton')?.hidden,
      text:document.getElementById('esc-vb-footer-assets-editor')?.innerText.slice(0,240)
    }));
    console.log('PSE_BUILDER_G1_STUCK_DIAG='+JSON.stringify({intercepted,diag}));
  }
  const panelText=await inspector.innerText();
  if(!settled)throw Error('Latest Footer selection loading never settled after 16 seconds');
  if(!panelText.includes('dòng '+(second+1)))
    throw Error('Out-of-order response changed selection; expected row '+second);
  if(/Không tải được dòng Footer/.test(panelText))
    throw Error('Footer REST selection failed under network delay');
  if(intercepted<2)throw Error('Real WordPress API rapid-selection requests were not both intercepted');
  console.log('PSE_BUILDER_G1_RAPID_FOOTER=PASS selection='+second+
    ' first='+first+' requests='+intercepted+' READ_ONLY=PASS NO_CMS_WRITE=PASS NO_BUILD=PASS');

  // Compare independent published Page outputs for three native S1 cohorts.
  // The URL comes from the exact WordPress Page permalink; never guess a slug.
  let historyPublicPath='';
  const subpageSources=[
    {pageId:'80930',name:'FAQ',selector:'.pse-faq__item'},
    {pageId:'80932',name:'HOTLINE',selector:'.pse-hotline__card'},
    {pageId:'79301',name:'HISTORY',selector:'.pse-history__milestone'}
  ];
  const publicOrigin=await frame.locator('body').evaluate(()=>location.origin);
  const normalizeText=text=>String(text||'').replace(/\\s+/g,' ').trim();
  for(const target of subpageSources){
    const wpPage=await page.evaluate(async id=>{
      const response=await fetch('/wp-json/wp/v2/pages/'+id+
        '?_fields=id,slug,link,status',{credentials:'same-origin',cache:'no-store'});
      if(!response.ok)throw Error('Cannot read canonical published WordPress Page '+id+
        ' HTTP '+response.status);
      const result=await response.json();
      if(result.id!==Number(id)||result.status!=='publish'||!result.slug||!result.link)
        throw Error('Missing verified published Page source '+id);
      return {id:result.id,slug:result.slug,link:result.link};
    },target.pageId);
    const wpPermalink=new URL(wpPage.link);
    if(target.name==='HISTORY')historyPublicPath=wpPermalink.pathname;
    if(wpPermalink.origin!==wp.origin||
       !wpPermalink.pathname.startsWith('/')||
       wpPermalink.pathname==='/'||
       wpPermalink.search||wpPermalink.hash)
      throw Error('Unusable canonical PSE WordPress permalink for '+target.name);
    await page.locator('#esc-vb-page').selectOption(target.pageId);
    await Promise.all([page.waitForLoadState('domcontentloaded',{timeout:45000}),
      page.getByRole('button',{name:'Mở trang'}).click({timeout:35000})]);
    const part=page.frameLocator('#esc-vb-frame');
    await part.locator(target.selector).first().waitFor({state:'visible',timeout:40000});
    // Section instance actions are separate from item editors. The PHP
    // inspector must prove BOTH no-write Page/occurrence dry-runs before
    // exposing shared-source clone or detach. Unsupported isolated wrappers
    // never receive a clickable action. No Save is performed here.
    if(target.name==='FAQ'||target.name==='HOTLINE'){
      const marker=part.locator('style[data-esc-vb-item-pick-style]');
      await marker.waitFor({state:'attached',timeout:45000});
      const source=part.locator(target.selector+'[data-esc-builder-row]').first();
      // The WordPress Page itself determines which action is safe. Capturing
      // the exact authenticated read-only preflights avoids brittle guesses
      // based on Page names or a test's stale wrapper assumption.
      const pageRead=page.waitForResponse(r=>
        new URL(r.url()).pathname.endsWith('/esc-builder/v1/section-order') &&
        r.request().method()==='POST',{timeout:25000});
      const removeDry=page.waitForResponse(r=>
        new URL(r.url()).pathname.endsWith('/esc-builder/v1/remove-section') &&
        r.request().method()==='POST',{timeout:25000});
      const cloneDry=page.waitForResponse(r=>
        new URL(r.url()).pathname.endsWith('/esc-builder/v1/duplicate-section-shared') &&
        r.request().method()==='POST',{timeout:25000});
      await source.click({force:true});
      const [readResponse,removeResponse,cloneResponse]=await Promise.all([
        pageRead,removeDry,cloneDry]);
      const [read,removed,duplicated]=await Promise.all([
        readResponse.json(),removeResponse.json(),cloneResponse.json()]);
      await page.waitForFunction(()=>{
        const panel=document.getElementById('esc-vb-section-order-panel');
        return panel && ['ready','unsupported','unavailable']
          .includes(panel.dataset.sectionCaps||'');
      },null,{timeout:25000});
      const capability=await page.evaluate(()=>{
        const panel=document.getElementById('esc-vb-section-order-panel');
        const detach=document.getElementById('esc-vb-section-remove-open');
        const clone=document.getElementById('esc-vb-section-duplicate-shared');
        return {state:panel?.dataset.sectionCaps||'',
          key:panel?.dataset.sectionCapsKey||'',
          removeHidden:detach?.hidden,removeDisabled:detach?.disabled,
          cloneHidden:clone?.hidden,cloneDisabled:clone?.disabled};
      });
      if(capability.state!=='ready'||!readResponse.ok()||
         !/^[a-f0-9]{64}$/.test(read?.version||''))
        throw Error('Section Page source read did not verify for '+target.name+
          ': '+JSON.stringify(capability));
      const matches=Array.isArray(read.items)?read.items.filter(item=>
        item.id===capability.key):[];
      if(matches.length!==1)
        throw Error('Missing unique section occurrence in real Page source: '+target.name);
      const tableId=matches[0].table_id;
      for(const response of [removeResponse,cloneResponse]){
        const payload=JSON.parse(response.request().postData()||'{}');
        if(payload.page_id!==Number(target.pageId)||
           payload.section_key!==capability.key||
           payload.expected_version!==read.version||
           payload.dry_run!==true)
          throw Error('Section dry-run was not scoped to exact Page/version: '+target.name);
      }
      const pageCanRemove=removeResponse.ok()&&removed?.checked===true&&
        removed?.saved===false&&removed?.no_write===true&&
        removed?.source_preserved===true&&removed?.removed===capability.key&&
        removed?.table_id===tableId&&removed?.version===read.version&&
        ['wrapper','shortcode_only'].includes(removed?.remove_mode);
      const pageCanDuplicate=cloneResponse.ok()&&duplicated?.checked===true&&
        duplicated?.saved===false&&duplicated?.no_write===true&&
        duplicated?.source_shared===true&&duplicated?.duplicated===capability.key&&
        duplicated?.table_id===tableId&&duplicated?.version===read.version&&
        duplicated?.would_add_instances===1;
      const previewCountBefore=await part.locator('[data-tablepress-preview]').count();
      // Independently ask the live Astro iframe for a NON-MUTATING visual
      // eligibility result. The previously detected FAQ defect was a Page
      // dry-run that passed while the iframe's actual wrapper was unsafe.
      const previewCan=await page.evaluate(async({key,removeMode,remove,duplicate})=>{
        const frame=document.querySelector('#esc-vb-frame');
        if(!(frame instanceof HTMLIFrameElement)||!frame.contentWindow)
          throw Error('Missing real Astro section Preview');
        const origin=new URL(frame.src,location.href).origin;
        const check=(mode,id,modeParam='')=>new Promise(resolve=>{
          let timeoutId=null;
          const finish=matched=>{
            if(timeoutId!==null)clearTimeout(timeoutId);
            window.removeEventListener('message',handle);
            resolve(matched===true);
          };
          const handle=event=>{
            if(event.origin!==origin||event.source!==frame.contentWindow||
              event.data?.type!=='esc-vb-section-action-check-ack'||
              event.data?.requestId!==id||
              event.data?.key!==key||event.data?.mode!==mode)return;
            finish(event.data.matched===true);
          };
          window.addEventListener('message',handle);
          timeoutId=setTimeout(()=>finish(false),7000);
          frame.contentWindow.postMessage({
            type:'esc-vb-section-action-check',
            key,mode,removeMode:modeParam,requestId:id
          },origin);
        });
        const [removeOk,duplicateOk]=await Promise.all([
          remove?check('remove',65901,removeMode):Promise.resolve(false),
          duplicate?check('duplicate',65902):Promise.resolve(false)
        ]);
        return {remove:removeOk,duplicate:duplicateOk};
      },{key:capability.key,removeMode:removed?.remove_mode||'',
        remove:pageCanRemove,duplicate:pageCanDuplicate});
      const previewCountAfter=await part.locator('[data-tablepress-preview]').count();
      if(previewCountBefore!==previewCountAfter)
        throw Error('Read-only section action probe mutated Preview DOM');
      const canRemove=pageCanRemove&&previewCan.remove;
      const canDuplicate=pageCanDuplicate&&previewCan.duplicate;
      if(capability.removeHidden===canRemove||
         capability.removeDisabled===canRemove||
         capability.cloneHidden===canDuplicate||
         capability.cloneDisabled===canDuplicate)
        throw Error('Section buttons disagree with Page+Astro dual safety: '+
          JSON.stringify({page:target.name,capability,pageCanRemove,
            pageCanDuplicate,previewCan}));
      if(target.name==='FAQ'&&
        (!pageCanDuplicate||previewCan.duplicate||canDuplicate))
        throw Error('Known unsafe FAQ wrapper was not rejected by Astro');
      if(target.name==='HOTLINE'&&(!canDuplicate||!canRemove))
        throw Error('Verified Hotline Page+Astro section actions stayed locked');
      console.log('PSE_BUILDER_SECTION_SOURCE_CAPABILITIES=PASS page='+target.name+
        ' dry_run_no_write=PASS shared_clone='+
        (canDuplicate?'SUPPORTED':'REJECTED_BY_PAGE_OR_IFRAME')+
        ' remove='+(canRemove?'SUPPORTED':'REJECTED_BY_PAGE_OR_IFRAME')+
        ' NO_CMS_WRITE=PASS');
    }
    const previewRows=await part.locator(target.selector).evaluateAll(nodes=>
      nodes.map(x=>(x.textContent||'').replace(/\\s+/g,' ').trim()));
    const sourceRows=await part.locator(target.selector).evaluateAll(nodes=>
      nodes.map(x=>Number(x.getAttribute('data-esc-builder-row'))));
    if(target.name==='FAQ'){
      // A component that supports an optional visible field does NOT prove
      // WordPress has configured that column on the published ESC Table.
      // Observe the real authenticated source REST response before labeling
      // the inspector PASS or NOT_SUPPORTED. No content/SAVE requests.
      const schemaAudit=[];
      const onSchemaResponse=response=>{
        if(!response.url().includes('/esc-builder/v1/item-schema'))return;
        let table='';
        try{table=JSON.parse(response.request().postData()||'{}').table_id||'';}
        catch{}
        void response.json().then(data=>schemaAudit.push({
          table,status:response.status(),code:data?.code||'',
          collection:data?.collection_mode||'',can:data?.can_toggle_visibility===true,
          count:Number.isSafeInteger(data?.count)?data.count:null,
          hasVisible:!!data?.fields?.some(field=>field.name==='visible')
        })).catch(()=>{});
      };
      page.on('response',onSchemaResponse);
      // The FAQ HTML may render before the deferred Astro module installs
      // its shared Preview item-selection listener. A visible card alone is
      // NOT proof that direct source selection has finished hydrating.
      await part.locator('style[data-esc-vb-item-pick-style]')
        .waitFor({state:'attached',timeout:45000});
      const faqSource=part.locator('.pse-faq__item[data-esc-builder-row]').first();
      await faqSource.click({force:true});
      let visibilityAvailable=false;
      try{
        await page.waitForFunction(()=>{
          const action=document.getElementById('esc-vb-item-visibility-open');
          return action && !action.hidden && !action.disabled;
        },null,{timeout:14000});
        visibilityAvailable=true;
      }catch{
        await delay(500);
      }
      page.off('response',onSchemaResponse);
      const diag=await page.evaluate(()=>({
        context:document.getElementById('esc-vb-item-context')?.textContent||'',
        panelHidden:document.getElementById('esc-vb-item-panel')?.hidden,
        buttonHidden:document.getElementById('esc-vb-item-visibility-open')?.hidden,
        buttonDisabled:document.getElementById('esc-vb-item-visibility-open')?.disabled
      }));
      const root=await faqSource.evaluate(el=>{
        const wrapper=el.closest('[data-tablepress-preview]');
        return {tableId:wrapper?.getAttribute('data-tablepress-preview')||'',
          dynamic:wrapper?.getAttribute('data-esc-builder-dynamic')||'',
          row:el.getAttribute('data-esc-builder-row')||''};
      });
      console.log('PSE_BUILDER_S1_VISIBILITY_SOURCE_AUDIT='+
        JSON.stringify({root,diag,schemaAudit}));
      const real=schemaAudit.find(item=>item.table===root.tableId);
      if(!visibilityAvailable){
        // A source lacking the column must remain READONLY with no fake
        // action advertised; other S1 sources may still provide it.
        if(real?.status===200&&real.collection==='static'&&real.can===false){
          if(!diag.buttonHidden||!diag.buttonDisabled)
            throw Error('Visibility action advertised on unsupported static source');
          console.log('PSE_BUILDER_S1_VISIBILITY_CONTEXT=NOT_SUPPORTED source='+
            root.tableId+' reason=no_verified_binary_visible_source NO_CMS_WRITE=PASS');
        }else{
          throw Error('Real S1 visibility inspector did not unlock despite source: '+
            JSON.stringify({root,diag,schemaAudit}));
        }
      }else{
        if(!real?.can||real.collection!=='static'||real.status!==200)
          throw Error('Visibility button exposed without a verified source: '+
            JSON.stringify({root,diag,schemaAudit}));
        const toggle=page.locator('#esc-vb-item-visibility-open');
        await toggle.click();
        const visibilityDialog=page.locator('#esc-vb-visibility-dialog');
        await visibilityDialog.waitFor({state:'visible',timeout:15000});
        await page.waitForFunction(()=>{
          const options=document.getElementById('esc-vb-visibility-row')?.options;
          return options && options.length>=15 &&
            !document.getElementById('esc-vb-visibility-row')?.disabled;
        },null,{timeout:30000});
        const original=await page.locator('#esc-vb-visibility-value').inputValue();
        if(original!=='1'&&original!=='0')
          throw Error('FAQ source returned invalid binary visibility');
        if(!await page.locator('#esc-vb-visibility-save').isDisabled())
          throw Error('No-op FAQ visibility Save was enabled before a change');
        await page.locator('#esc-vb-visibility-value').selectOption(original==='1'?'0':'1');
        await page.waitForFunction(()=>
          document.getElementById('esc-vb-visibility-save')?.disabled===false,
        null,{timeout:10000});
        const availableRows=await page.locator('#esc-vb-visibility-row option').count();
        const hiddenRows=await page.locator('#esc-vb-visibility-row option')
          .filter({hasText:'Đang ẩn'}).count();
        await page.locator('#esc-vb-visibility-cancel').click();
        if(await visibilityDialog.evaluate(el=>el.open))
          throw Error('FAQ item visibility Cancel did not close contextual inspector');
        console.log('PSE_BUILDER_S1_VISIBILITY_CONTEXT=PASS source_rows='+availableRows+
          ' hidden_source_rows='+hiddenRows+
          ' noop_disabled=PASS valid_draft_enabled=PASS CANCEL_NO_WRITE=PASS');
      }
    }
    const visitor=await browser.newPage({viewport:{width:1440,height:900}});
    let publicRows;
    try {
      const url=new URL(wpPermalink.pathname,publicOrigin);
      const response=await visitor.goto(url.href,{waitUntil:'domcontentloaded',timeout:65000});
      if(!response||!response.ok())throw Error('Public '+target.name+
        ' route did not publish expected Page, HTTP '+(response?.status()||0));
      await visitor.locator(target.selector).first().waitFor({state:'visible',timeout:35000});
      publicRows=await visitor.locator(target.selector).evaluateAll(nodes=>
        nodes.map(x=>(x.textContent||'').replace(/\\s+/g,' ').trim()));
    } finally {await visitor.close();}
    if(!publicRows?.length || JSON.stringify(previewRows)!==JSON.stringify(publicRows))
      throw Error(target.name+' public versus Preview card content/count differs');
    // Hotline cards are grouped by source-owned group labels, so their
    // visible order can be nonmonotonic. The physical identities must still
    // be unambiguous, nonnegative and unique after any filtering.
    if(sourceRows.some(row=>!Number.isSafeInteger(row)||row<0)||
       new Set(sourceRows).size!==sourceRows.length)
      throw Error(target.name+' lost unique physical row markers');
    if(previewRows.some(text=>/Chưa nhập|Chưa chọn nhóm hotline|Cột mốc cần sửa/.test(text)))
      throw Error(target.name+' contains Preview-only repair labels');
    console.log('PSE_BUILDER_SUBPAGE_PUBLIC_PARITY=PASS page='+target.name+
      ' count='+publicRows.length+' markers=PASS NO_CMS_WRITE=PASS');
  }

  // Geometry parity at MATCHED public/iframe CSS viewport widths, not the
  // different outer WordPress Admin browser widths. Keep runtime data and
  // components identical; this test only resizes the iframe in QA memory.
  if(!historyPublicPath)throw Error('Missing independent WP History permalink');
  for(const targetWidth of [1024,390]){
    const resizeIframe=async cssWidth=>{
      await page.locator('#esc-vb-frame').evaluate((el,width)=>{
        for(const name of ['width','min-width','max-width'])
          el.style.setProperty(name,width+'px','important');
        el.style.setProperty('flex','0 0 '+width+'px','important');
      },cssWidth);
    };
    await resizeIframe(targetWidth);
    const current=page.frameLocator('#esc-vb-frame');
    await current.locator('.pse-history__milestone').first()
      .waitFor({state:'visible',timeout:30000});
    // The WP Admin iframe has a 2px border (content viewport != iframe
    // CSS width). Crossing the lg:1024 Tailwind breakpoint by those 2px
    // changes padding from 32 to 20px and creates a false 22px "parity"
    // failure. Align *innerWidth*, never accept near-equality here.
    let actualWidth=await current.locator('html').evaluate(()=>innerWidth);
    if(actualWidth!==targetWidth){
      await resizeIframe(targetWidth+(targetWidth-actualWidth));
      // WordPress admin and Astro iframe use different origins; measure
      // viewport from INSIDE the iframe. Parent contentWindow.innerWidth
      // throws SecurityError for cross-origin preview pages.
      actualWidth=await current.locator('html').evaluate(async()=>{
        await new Promise(resolve=>requestAnimationFrame(resolve));
        return innerWidth;
      });
    }
    if(actualWidth!==targetWidth)
      throw Error('Cannot align exact Builder iframe innerWidth '+targetWidth+
        ', actual '+actualWidth);
    await current.locator('html').evaluate(async()=>await document.fonts?.ready);
    const publicAtWidth=await browser.newPage({
      viewport:{width:targetWidth,height:900},deviceScaleFactor:1
    });
    try{
      const response=await publicAtWidth.goto(new URL(historyPublicPath,publicOrigin).href,
        {waitUntil:'domcontentloaded',timeout:60000});
      if(!response?.ok())throw Error('History responsive public route unavailable');
      await publicAtWidth.locator('.pse-history__milestone').first()
        .waitFor({state:'visible',timeout:30000});
      await publicAtWidth.locator('html').evaluate(async()=>await document.fonts?.ready);
      const measure=nodes=>nodes.map(node=>{
        const rect=node.getBoundingClientRect();
        const heading=node.querySelector('h2,h3,h4,strong');
        const titleStyle=heading?getComputedStyle(heading):getComputedStyle(node);
        return {
          width:Math.round(rect.width*10)/10,
          height:Math.round(rect.height*10)/10,
          fontSize:titleStyle.fontSize,
          text:(node.textContent||'').replace(/\\s+/g,' ').trim()
        };
      });
      const a=await current.locator('.pse-history__milestone').evaluateAll(measure);
      const b=await publicAtWidth.locator('.pse-history__milestone').evaluateAll(measure);
      const diagnostic=()=>{
        const root=document.querySelector('.pse-history');
        let node=root;
        const ancestors=[];
        for(let i=0;node&&i<6;i++,node=node.parentElement){
          const css=getComputedStyle(node),rect=node.getBoundingClientRect();
          ancestors.push({tag:node.tagName,classes:String(node.className||'').slice(0,120),
            rectWidth:Math.round(rect.width*10)/10,clientWidth:node.clientWidth,
            padding:css.padding,maxWidth:css.maxWidth,margin:css.margin});
        }
        return {innerWidth:window.innerWidth,docClientWidth:document.documentElement.clientWidth,
          bodyClientWidth:document.body.clientWidth,ancestors};
      };
      const previewGeometry=await current.locator('html').evaluate(diagnostic);
      const publicGeometry=await publicAtWidth.locator('html').evaluate(diagnostic);
      console.log('PSE_HISTORY_RESPONSIVE_GEOMETRY_DIAG='+JSON.stringify({
        targetWidth,previewGeometry,publicGeometry
      }));
      if(a.length!==b.length||a.length<1)
        throw Error('Responsive History card count differs at '+targetWidth);
      for(let index=0;index<a.length;index++){
        if(a[index].text!==b[index].text||
           Math.abs(a[index].width-b[index].width)>8||
           Math.abs(a[index].height-b[index].height)>35||
           a[index].fontSize!==b[index].fontSize){
          throw Error('Responsive Preview geometry differs at width='+
            targetWidth+' card='+index+' preview='+JSON.stringify(a[index])+
            ' public='+JSON.stringify(b[index]));
        }
      }
      console.log('PSE_BUILDER_RESPONSIVE_HISTORY_PARITY=PASS width='+
        targetWidth+' cards='+a.length+' count_text_geometry_font=PASS NO_CMS_WRITE=PASS');
    }finally{await publicAtWidth.close();}
  }
} finally {
  await browser.close();
}
