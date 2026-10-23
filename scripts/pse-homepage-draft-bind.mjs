/** Safely author the four PSE section shortcodes on a NEW, unpublished WP Page.
 *  Shortcodes MUST be inserted through ESC Table's real TinyMCE button/Thickbox.
 *  Never modify Page 248 (the published homepage) or invoke Astro build.
 */
import { chromium } from 'playwright';
const origin=(()=>{
  const lines=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,''));
  const values=lines.filter(s=>s.startsWith('WC_URL='));
  if(values.length!==1)throw Error('Missing/ambiguous WC_URL');
  const u=new URL(values[0].slice(7).trim().replace(/^['"]|['"]$/g,''));
  if(u.protocol!=='https:'||!u.hostname||u.username||u.password||(u.port&&u.port!=='443')
    ||!['','/'].includes(u.pathname)||u.search||u.hash)throw Error('Invalid PSE WP origin');
  return u.origin;
})();
const ids=['pse_00_vi','pse_01_vi','pse_02_vi','pse_03_vi'];
const draftTitle='PSE - Trang chủ thiết kế 2026 (Bản nháp nội bộ)';
const draftKey='pse-home-design-draft';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:960}});
const page=await context.newPage();
const safeClick=async locator=>{await locator.waitFor({state:'visible',timeout:25000});await locator.click()};
try{
  await page.goto(origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
  if(await page.locator('#user_login').count()){
    const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
    if(!username||!password)throw Error('PSE WP credentials not configured');
    await page.locator('#user_login').fill(username);
    await page.locator('#user_pass').fill(password);
    const t=await page.locator('body').innerText();
    const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)
       ||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if(m){
      const a=Number(m[1]),b=Number(m[3]);
      const answer=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
      const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if(!await f.count())throw Error('Missing arithmetic challenge input');
      await f.fill(String(answer));
    }
    await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
  }
  if(page.url().includes('wp-login'))throw Error('WP login unsuccessful');

  const wpGet=async path=>page.evaluate(async path=>{
    const nonce=window.wpApiSettings?.nonce||'';
    const res=await fetch(path,{credentials:'same-origin',
      headers:{Accept:'application/json',...(nonce?{'X-WP-Nonce':nonce}:{})}});
    if(!res.ok)throw Error('WordPress GET HTTP '+res.status);
    return res.json();
  },path);

  const expectedTableKeys={
    pse_00_vi:['label','title','description','img','href','cta'],
    pse_01_vi:['label','categoryId','href'],
    pse_02_vi:['sectionTitle','sectionDescription','background','title','description','icon'],
    pse_03_vi:['label','href']
  };
  for(const id of ids){
    const table=await wpGet('/wp-json/tablepress/v1/table/'+id);
    if(table.id!==id||JSON.stringify(table.fields?.map(x=>x.key))!==JSON.stringify(expectedTableKeys[id]))
      throw Error('Not using verified real ESC Table: '+id);
  }

  const existing=await wpGet('/wp-json/wp/v2/pages?status=draft&per_page=100&context=edit&_fields=id,status,title,acf');
  const candidates=existing.filter(x=>x.title?.raw===draftTitle||x.acf?.key===draftKey);
  if(candidates.length>1)throw Error('Ambiguous PSE draft: stop before creating anything');
  if(candidates.length===1){
    const d=candidates[0];
    if(d.id===248||d.status!=='draft'||d.acf?.action!=='HomePage'||d.acf?.key!==draftKey)
      throw Error('Existing draft has unexpected page ownership/action/key');
    const content=String(d.acf?.content||'');
    const actual=[...content.matchAll(/\[table\s+id=([A-Za-z0-9_-]+)\s*\/\]/g)].map(x=>x[1]);
    if(JSON.stringify(actual)!==JSON.stringify(ids))throw Error('Existing draft differs from expected ESC Table sequence');
    console.log('PSE_HOME_DRAFT_BINDING=ALREADY_CORRECT; draft_id='+d.id+'; NO_DUPLICATE=true; HOME_248_UNCHANGED=true; NO_BUILD=true');
  }else{
    await page.goto(origin+'/wp-admin/post-new.php?post_type=page',{waitUntil:'domcontentloaded',timeout:60000});
    await page.locator('#title').fill(draftTitle);
    const fillAcfField=async (name,value,required)=>{
      const root=page.locator('.acf-field[data-name="'+name+'"]').first();
      await root.waitFor({state:'attached',timeout:30000});
      // ACF field visibility is controlled by the site's existing rules.
      // Optional labels/SEO text must not be forced into hidden controls.
      if(!await root.isVisible()){
        if(required)throw Error('Required ACF field is hidden: '+name);
        console.log('PSE_HOME_DRAFT_OPTIONAL_ACF=HIDDEN; field='+name);
        return;
      }
      const input=root.locator('input[type="text"],textarea').first();
      await input.fill(value);
    };
    await fillAcfField('action','HomePage',true);
    await fillAcfField('key',draftKey,true);
    await fillAcfField('label','Trang chủ PSE - bản nháp thiết kế',false);
    await fillAcfField('title','PSE - Trang chủ thiết kế 2026',false);
    const contentField=page.locator('.acf-field[data-name="content"]');
    const textarea=contentField.locator('textarea').first();
    await textarea.waitFor({state:'attached',timeout:30000});
    const editorId=await textarea.getAttribute('id');
    if(!editorId)throw Error('Missing TinyMCE editor ID');
    const visualTab=page.locator('#'+editorId+'-tmce');
    const fieldVisible=await contentField.isVisible();
    console.log('PSE_HOME_DRAFT_EDITOR_VISIBILITY='+JSON.stringify({
      acfContentVisible:fieldVisible,visualTabAvailable:await visualTab.count(),
      visualTabVisible:await visualTab.isVisible().catch(()=>false)
    }));
    if(!fieldVisible)throw Error('Homepage ACF content field remains hidden after action=HomePage');
    if(await visualTab.isVisible())await visualTab.click();
    try{
      await page.waitForFunction(id=>Boolean(window.tinymce?.get(id)?.initialized),editorId,{timeout:18000});
    }catch(err){
      const detail=await page.evaluate(id=>({
        id,textareaExists:!!document.getElementById(id),
        editorPresent:!!window.tinymce?.get(id),
        initialized:!!window.tinymce?.get(id)?.initialized,
        editorIds:(window.tinymce?.editors||[]).map(x=>x.id).slice(0,12),
        tabs:Array.from(document.querySelectorAll('.acf-field[data-name="content"] .wp-switch-editor'))
          .map(x=>({id:x.id,visible:x.getClientRects().length>0}))
      }),editorId);
      console.log('PSE_HOME_DRAFT_EDITOR_NOT_READY='+JSON.stringify(detail));
      throw err;
    }
    const initial=await page.evaluate(id=>window.tinymce.get(id).getContent({format:'raw'}),editorId);
    if(initial.trim())throw Error('New draft editor unexpectedly prepopulated; no overwrite');

    for(const id of ids){
      await page.evaluate(id=>{
        const ed=window.tinymce.get(id);
        ed.focus();
        ed.selection.select(ed.getBody(),true);
        ed.selection.collapse(false);
      },editorId);
      // This is the actual TinyMCE ESC Table action, not a typed shortcode.
      await safeClick(contentField.locator('.mce-btn[title="Insert a ESC Table"],button[title="Insert a ESC Table"]').first());
      const iframe=page.locator('#TB_iframeContent');
      await iframe.waitFor({state:'visible',timeout:30000});
      const insert=page.frameLocator('#TB_iframeContent')
        .locator('input.insert-shortcode[title="[table id='+id+' /]"]');
      await safeClick(insert);
      await iframe.waitFor({state:'hidden',timeout:30000});
      const all=await page.evaluate(id=>window.tinymce.get(id).getContent({format:'raw'}),editorId);
      if(!all.includes('[table id='+id+' /]'))
        throw Error('ESC Table native UI did not insert '+id+'; no draft save');
      console.log('PSE_HOME_DRAFT_NATIVE_ESC_INSERT=PASS; table='+id);
    }
    const beforeSave=await page.evaluate(id=>window.tinymce.get(id).getContent({format:'raw'}),editorId);
    const actual=[...beforeSave.matchAll(/\[table\s+id=([A-Za-z0-9_-]+)\s*\/\]/g)].map(x=>x[1]);
    if(JSON.stringify(actual)!==JSON.stringify(ids))
      throw Error('Native editor output has unexpected shortcode order');
    await safeClick(page.locator('#save-post'));
    await page.waitForLoadState('domcontentloaded');
    const u=new URL(page.url());
    const fromUrl=Number(u.searchParams.get('post')||0);
    const fromField=await page.locator('#post_ID').inputValue().catch(()=>'0');
    const id=Number(fromField)||fromUrl;
    if(!Number.isSafeInteger(id)||id<=0||id===248)
      throw Error('Unexpected saved draft post ID');
    const saved=await wpGet('/wp-json/wp/v2/pages/'+id+'?context=edit&_fields=id,status,acf,title');
    const savedContent=String(saved.acf?.content||'');
    const stored=[...savedContent.matchAll(/\[table\s+id=([A-Za-z0-9_-]+)\s*\/\]/g)].map(m=>m[1]);
    if(saved.status!=='draft'||saved.acf?.action!=='HomePage'||saved.acf?.key!==draftKey||
       JSON.stringify(stored)!==JSON.stringify(ids))
      throw Error('Draft saved but CMS read-after-write failed. Inspect ID '+id+' before retry.');
    console.log('PSE_HOME_DRAFT_NATIVE_ESC_INSERT_READ_AFTER_WRITE=PASS; draft_id='+id+
      '; sections='+ids.length+'; HOME_248_UNCHANGED=true; NO_BUILD=true; NO_PUBLICATION=true');
  }
}finally{
  await browser.close();
}
