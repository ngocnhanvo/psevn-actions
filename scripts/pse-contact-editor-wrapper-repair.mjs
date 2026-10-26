/**
 * WordPress native ESC Table editor recovery for PSE Contact Page #47222.
 * NO separate iframe/preview tool and NO ASTRO BUILD.
 * Existing ESC Tables are reinserted ONLY using ESC "Insert Code" in TinyMCE.
 * Dry-run builds an UNSAVED visual-editor version and checks each image preview.
 * Apply requires the workflow's exact owner-approved commit marker.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const apply = process.env.PSE_CONTACT_WRAPPER_APPLY === 'true';
const ids = ['pse_contact_office_vi','contact_00_vi','pse_contact_warehouses_vi'];
const vars = String(process.env.ENV_FILE || '').split(/\r?\n/).map(x => x.trim().replace(/^export\s+/, ''));
const entries = vars.filter(x => x.startsWith('WC_URL='));
if (entries.length !== 1) throw Error('Unique configured WordPress origin missing');
const u = new URL(entries[0].slice(7).replace(/^['"]|['"]$/g, ''));
if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || !['','/'].includes(u.pathname)) throw Error('Invalid WordPress origin');
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1500,height:1060}});
page.on('dialog', async d => { if (d.type()==='confirm') await d.accept(); else await d.dismiss(); });
const tokens = text => [...String(text).matchAll(/\[table\s+id=([a-z0-9_-]+)\s*\/\]/gi)].map(m=>({id:m[1],token:m[0],index:m.index}));
await mkdir('artifacts/pse-contact-native-editor',{recursive:true});
try {
 await page.goto(u.origin+'/wp-admin/', {waitUntil:'domcontentloaded',timeout:60000});
 if (await page.locator('#user_login').count()) {
   if (!process.env.WP_ADMIN_USERNAME || !process.env.WP_ADMIN_PASSWORD) throw Error('WordPress credential secret absent');
   await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
   await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
   const txt=await page.locator('body').innerText();
   const m=txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
   if (m) {
      const a=+m[1],b=+m[3],n=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
      const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if (!(await field.count())) throw Error('Login security question unavailable');
      await field.fill(String(n));
   }
   await Promise.all([page.waitForLoadState('domcontentloaded'), page.locator('#wp-submit').click()]);
 }
 if (page.url().includes('wp-login')) throw Error('WordPress authentication refused');
 const nonce=await page.evaluate(async()=>{
    if(window.wpApiSettings?.nonce) return window.wpApiSettings.nonce;
    const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});
    if(!r.ok)throw Error('WordPress nonce unavailable');return (await r.text()).trim();
 });
 const read=async(route)=>page.evaluate(async ({route,nonce})=>{
    const r=await fetch(route,{credentials:'same-origin',headers:{'X-WP-Nonce':nonce,Accept:'application/json','Cache-Control':'no-cache'}});
    return {http:r.status,data:await r.json().catch(()=>null)};
 },{route,nonce});
 const endpoint='/wp-json/wp/v2/pages/47222?context=edit&_fields=id,slug,status,acf,content';
 const before=await read(endpoint);
 if(before.http!==200||before.data?.id!==47222||before.data?.slug!=='lien-he'||before.data?.status!=='publish'||
    before.data?.acf?.action!=='PrivatePage'||before.data?.acf?.key!=='contact')
    throw Error('PSE Contact Page identity mismatch');
 const raw=String(before.data.content?.raw||'');
 const css=String(before.data.acf?.cssmore||'');
 const existing=tokens(raw);
 if(JSON.stringify(existing.map(x=>x.id))!==JSON.stringify(ids)||!raw.includes('pse-contact-hero')||
   !css.includes('PSE_CONTACT_ESC_OWNED_SECTIONS_V2')||raw.includes('pse-location-card'))
   throw Error('Unexpected WordPress/ESC content; refuse rewrite');
 const tables=await Promise.all(ids.map(id=>read('/wp-json/tablepress/v1/table/'+id)));
 if(tables.some(t=>t.http!==200)||JSON.stringify(tables.map(t=>t.data?.items?.length))!=='[1,6,5]')
   throw Error('Original ESC Table records altered/missing');
 const persistedWrappers=[...raw.matchAll(/<div\b(?=[^>]*class=["'][^"']*tablepress-preview-wrap[^"']*["'])[^>]*>[\s\S]*?<\/div>/gi)];
 if(persistedWrappers.length){
   // Previous apply may have SUCCEEDED in WordPress before Playwright lost its
   // execution context during the Save redirect. Read first; NEVER rewrite twice.
   const wrapperIds=persistedWrappers.map(w=>(w[0].match(/data-table-id=["']([^"']+)["']/i)||[])[1]);
   if(JSON.stringify(wrapperIds)!==JSON.stringify(ids)||
      persistedWrappers.some((w,i)=>tokens(w[0]).length!==1||tokens(w[0])[0].id!==ids[i]||
        (w[0].match(/<img\b/gi)||[]).length!==1))
     throw Error('Saved ESC preview blocks malformed; stop, no additional CMS writes');
   await writeFile('artifacts/pse-contact-native-editor/verified.json',JSON.stringify({
     page:47222,ids,wrapperCount:persistedWrappers.length,cssmoreUnchanged:true,tableItemCounts:tables.map(t=>t.data.items.length)
   },null,2));
   await page.goto(u.origin+'/wp-admin/post.php?post=47222&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
   if(await page.locator('#pse-contact-editor-preview').count())throw Error('Unrequested separate Admin preview remains active');
   await page.locator('#content-tmce').click();
   await page.waitForFunction(()=>Boolean(window.tinymce?.get('content')?.getBody()),null,{timeout:20000});
   await page.locator('#title').click();
   await page.waitForFunction(()=>{
     const ed=window.tinymce?.get('content');
     const images=ed?[...ed.getBody().querySelectorAll('.tablepress-preview-wrap img')]:[];
     return images.length===3 && images.every(img=>img.complete && img.naturalWidth>0);
   },null,{timeout:30000});
   const live=await page.evaluate(()=>{
     const editor=window.tinymce.get('content');
     return {
       ids:[...editor.getBody().querySelectorAll('.tablepress-preview-wrap')].map(x=>x.getAttribute('data-table-id')),
       images:[...editor.getBody().querySelectorAll('.tablepress-preview-wrap img')].map(x=>({
          id:x.getAttribute('data-table-id'),naturalWidth:x.naturalWidth,
          hasSource:!!x.getAttribute('src')
       }))
     };
   });
   if(JSON.stringify(live.ids)!==JSON.stringify(ids)||
     JSON.stringify(live.images.map(x=>x.id))!==JSON.stringify(ids)||
     live.images.some(x=>!x.hasSource||x.naturalWidth<=0))
     throw Error('Editor reload native image badges do not match saved ESC Table structure');
   await page.locator('#wp-content-wrap').screenshot({path:'artifacts/pse-contact-native-editor/verified-editor.png'});
   console.log('PSE_CONTACT_NATIVE_EDITOR=ALREADY_DONE; saved_image_blocks=3; native_insert_code=verified; no_cms_write=true; no_build=true');
   console.log('PSE_CONTACT_NATIVE_RELOADED_IMAGES='+JSON.stringify(live.images));
   process.exit(0);
 }
 const intro=raw.slice(0,existing[0].index).trim();
 const suffix=raw.slice(existing[0].index).replace(/\[table\s+id=[a-z0-9_-]+\s*\/\]/gi,'');
 if(suffix.replace(/[\s\u00a0]/g,'')!=='')
   throw Error('Unexpected non-shortcode content after Contact intro; refuse unsafe editor rewrite');
 if(!intro.includes('pse-contact-hero')||!intro.includes('pse-contact-locations__intro'))
   throw Error('WordPress intro content missing');
 const original={
   id:47222,raw,cssmore:css,
   tableIds:ids,tableItemCounts:tables.map(t=>t.data.items.length)
 };
 await writeFile('artifacts/pse-contact-native-editor/backup.json',JSON.stringify(original,null,2));
 await page.goto(u.origin+'/wp-admin/post.php?post=47222&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
 if(await page.locator('#pse-contact-editor-preview').count())throw Error('Unrequested custom preview panel still active');
 await page.locator('#content-tmce').click();
 await page.waitForFunction(()=>Boolean(window.tinymce?.get('content')?.getBody()),null,{timeout:20000});
 const inserted=[];
 const staged=await page.evaluate(({intro,ids})=>{
   const editor=window.tinymce.get('content');
   if(!editor||editor.isHidden())throw Error('Native WordPress Visual editor not active');
   const placeholders=ids.map((id,i)=>'<p data-pse-esc-native-insert="'+i+'">PSE_NATIVE_SLOT_'+i+'</p>').join('');
   editor.setContent(intro+'\n'+placeholders);
   return {nativeVisible:!editor.isHidden(),slotCount:editor.getBody().querySelectorAll('[data-pse-esc-native-insert]').length,
     shortcodeCount:(editor.getContent().match(/\[table\s+id=/g)||[]).length};
 },{intro,ids});
 if(staged.slotCount!==3||staged.shortcodeCount!==0)throw Error('Cannot stage independent WordPress editor section slots');
 for(let i=0;i<ids.length;i++){
   const id=ids[i],expected='[table id='+id+' /]';
   const focus=await page.evaluate(index=>{
     const editor=window.tinymce.get('content');
     const slot=editor.getBody().querySelector('[data-pse-esc-native-insert="'+index+'"]');
     if(!slot)throw Error('Native ESC section slot lost');
     editor.focus();
     const range=editor.dom.createRng();
     range.selectNodeContents(slot);
     editor.selection.setRng(range);
     return {selected:editor.selection.getContent({format:'text'}),html:slot.outerHTML};
   },i);
   if(focus.selected.trim()!=='PSE_NATIVE_SLOT_'+i)throw Error('Native WordPress visual selection incorrect '+i);
   await page.evaluate(()=>{
      if(typeof window.tablepress_open_shortcode_thickbox!=='function')throw Error('ESC Table Insert Code tool unavailable');
      window.tablepress_open_shortcode_thickbox();
   });
   const button=page.frameLocator('#TB_iframeContent').locator('.insert-shortcode[title*="'+id+'"]');
   await button.waitFor({state:'visible',timeout:16000});
   if((await button.getAttribute('title'))?.trim()!==expected)throw Error('Native ESC Table choice mismatch '+id);
   await button.click(); // actual ESC Insert Code, never paste/assign raw shortcode text
   await page.locator('#TB_window').waitFor({state:'hidden',timeout:12000});
   const current=await page.evaluate(()=>{
      const editor=window.tinymce.get('content');
      const html=editor.getContent();
      return {html,htmlLength:html.length,
        imageCount:editor.getBody().querySelectorAll('.tablepress-preview-wrap img').length,
        wrapperIds:[...editor.getBody().querySelectorAll('.tablepress-preview-wrap')].map(el=>el.getAttribute('data-table-id')),
        remainingSlots:[...editor.getBody().querySelectorAll('[data-pse-esc-native-insert]')].map(el=>el.textContent.slice(0,40))};
   });
   inserted.push({id,shortcodes:tokens(current.html).map(t=>t.id),imageCount:current.imageCount,wrapperIds:current.wrapperIds,
     remainingSlots:current.remainingSlots,htmlLength:current.htmlLength});
   if(JSON.stringify(tokens(current.html).map(t=>t.id))!==JSON.stringify(ids.slice(0,i+1))||
      current.html.includes('PSE_NATIVE_SLOT_'+i))
      throw Error('Native Insert Code failed or corrupted other ESC section at '+id);
 }
 await page.locator('#title').click(); // commit the last native TinyMCE image insertion before inspecting serialized HTML
 await page.waitForTimeout(1800);
 const state=await page.evaluate(()=>{
   const editor=window.tinymce.get('content');
   return {html:editor.getContent(),previewImages:[...editor.getBody().querySelectorAll('.tablepress-preview-wrap img')].map(img=>({
     srcPresent:!!img.getAttribute('src'),naturalWidth:img.naturalWidth,complete:img.complete
   }))};
 });
 console.log('PSE_CONTACT_NATIVE_EDITOR_DIAGNOSTIC='+JSON.stringify({staged,inserted,
    previewImages:state.previewImages,wrappers:(state.html.match(/tablepress-preview-wrap/g)||[]).length,
    savedPreviouslyHasWrappers:raw.includes('tablepress-preview-wrap')}));
 const ordered=tokens(state.html).map(t=>t.id);
 if(JSON.stringify(ordered)!==JSON.stringify(ids))throw Error('Native visual ESC insertion order mismatch');
 const wrappers=[...state.html.matchAll(/<div\b(?=[^>]*class=["'][^"']*tablepress-preview-wrap[^"']*["'])[^>]*>[\s\S]*?<\/div>/gi)];
 console.log('PSE_CONTACT_NATIVE_SERIALIZED_HTML='+JSON.stringify(state.html.slice(-3000)));
 const wrapperIds=wrappers.map(w=>(w[0].match(/data-table-id=["']([^"']+)["']/i)||[])[1]);
 if(JSON.stringify(wrapperIds)!==JSON.stringify(ids)||wrappers.length!==3||
    wrappers.some(w=>(w[0].match(/<img\b/gi)||[]).length!==1))
   throw Error('Native editor did not generate three separate ESC image preview blocks; do not publish plain shortcode text');
 for(let i=0;i<3;i++)if(tokens(wrappers[i][0]).length!==1||tokens(wrappers[i][0])[0].id!==ids[i])
   throw Error('More than one shortcode inside a native image preview block');
 if(state.html.includes('PSE_NATIVE_SLOT_'))throw Error('Temporary authoring marker would leak into saved content');
 // Frontend strips official TinyMCE previews to their original tokens. The
 // remainder MUST be only the existing CMS intro + 3 standalone tokens.
 const stripped=state.html.replace(/<div\b(?=[^>]*class=["'][^"']*tablepress-preview-wrap[^"']*["'])[^>]*>[\s\S]*?<\/div>/gi,
   block=>(tokens(block)[0]||{}).token||block);
 const afterFirst=stripped.indexOf('[table id='+ids[0]+' /]');
 if(afterFirst<0||stripped.slice(afterFirst).replace(/\[table\s+id=[a-z0-9_-]+\s*\/\]/gi,'')
     .replace(/[\s\u00a0]/g,'')!=='')
   throw Error('Editor visual blocks are nested in paragraph/other HTML; refuse invalid Astro DOM');
 await page.locator('#wp-content-wrap').screenshot({path:'artifacts/pse-contact-native-editor/native-editor.png'});
 if(!apply){console.log('PSE_CONTACT_NATIVE_EDITOR=DRY_PASS; three_separate_image_previews=true; no_save=true; no_build=true');process.exit(0)}
 const latest=await read(endpoint);
 if(latest.http!==200||String(latest.data?.content?.raw||'')!==raw||
   String(latest.data?.acf?.cssmore||'')!==css)
   throw Error('Concurrent WordPress edit detected before save');
 // WordPress-owned TinyMCE publishes exactly what the native ESC visual editor
 // generated. No REST content write and no shortcode added as pasted text.
 await page.locator('#publish').click();
 let saved=null;
 for(let attempt=0;attempt<8;attempt++){
   try{
     await page.waitForLoadState('domcontentloaded',{timeout:12000});
     saved=await read(endpoint);
     break;
   }catch(e){
     if(!/execution context was destroyed|navigation/i.test(String(e)))throw e;
     await page.waitForTimeout(650);
   }
 }
 if(!saved)throw Error('WordPress Save redirect remained unstable; re-run read-only verification before another edit');
 const body=String(saved.data?.content?.raw||'');
 const savedIds=tokens(body).map(t=>t.id);
 const savedWrappers=[...body.matchAll(/<div\b(?=[^>]*class=["'][^"']*tablepress-preview-wrap[^"']*["'])[^>]*>[\s\S]*?<\/div>/gi)];
 if(saved.http!==200||JSON.stringify(savedIds)!==JSON.stringify(ids)||
    !body.includes('pse-contact-hero')||String(saved.data?.acf?.cssmore||'')!==css||
    savedWrappers.length!==3||savedWrappers.some((w,i)=>tokens(w[0]).length!==1||tokens(w[0])[0].id!==ids[i]))
   throw Error('WordPress Visual editor save readback failed; backup artifact available');
 await page.goto(u.origin+'/wp-admin/post.php?post=47222&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
 await page.locator('#content-tmce').click();
 await page.waitForFunction(()=>[...document.querySelectorAll('#content_ifr')].length>0,null,{timeout:15000});
 const reloaded=await page.evaluate(()=>{
   const ed=window.tinymce?.get('content');
   return {images:[...ed.getBody().querySelectorAll('.tablepress-preview-wrap img')].map(x=>({
     tableId:x.getAttribute('data-table-id'),src:x.getAttribute('src'),naturalWidth:x.naturalWidth
   })),wrappers:ed.getBody().querySelectorAll('.tablepress-preview-wrap').length,
     hasUnrequestedPanel:!!document.querySelector('#pse-contact-editor-preview')};
 });
 if(reloaded.hasUnrequestedPanel||reloaded.wrappers!==3||
    JSON.stringify(reloaded.images.map(x=>x.tableId))!==JSON.stringify(ids))
   throw Error('WordPress Editor reload visual section parity failed; see backup');
 await page.locator('#wp-content-wrap').screenshot({path:'artifacts/pse-contact-native-editor/after-save.png'});
 console.log('PSE_CONTACT_NATIVE_RELOAD='+JSON.stringify({
   wrappers:reloaded.wrappers,imageCount:reloaded.images.length,
   imagesWithUrl:reloaded.images.filter(x=>x.src).length,unrequestedPanel:false
 }));
 console.log('PSE_CONTACT_NATIVE_EDITOR=PASS; separate_ESC_visual_blocks=3; cms_owned=true; no_astro_build=true');
}finally { await browser.close(); }
