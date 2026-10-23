/** PSE homepage live cutover: replace original public HomePage body with
 * four verified ESC Table sections USING native WordPress Insert Code UI.
 * Only WP page 248 is changed; preserve ID/key/action, draft 76969 and
 * original WordPress revision. No FTP or Astro build from this script.
 */
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
const origin=(()=>{
 const a=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,'')).filter(s=>s.startsWith('WC_URL='));
 if(a.length!==1)throw Error('PSE WP CMS origin ambiguous');
 const u=new URL(a[0].slice(7).trim().replace(/^['"]|['"]$/g,''));
 if(u.protocol!=='https:'||!u.hostname||u.username||u.password||u.search||u.hash||
    !['','/'].includes(u.pathname)||(u.port&&u.port!=='443'))throw Error('Invalid PSE CMS origin');
 return u.origin;
})();
const expected=['pse_00_vi','pse_01_vi','pse_02_vi','pse_03_vi'];
const hash=s=>createHash('sha256').update(s).digest('hex');
const parseCodes=s=>[...String(s||'').matchAll(/\[table\s+id=([A-Za-z0-9_-]+)\s*\/\]/g)].map(m=>m[1]);
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:960}});
const page=await context.newPage();
page.on('dialog',async d=>{if(d.type()==='beforeunload'||d.type()==='confirm')await d.accept();else await d.dismiss()});
const click=async control=>{await control.waitFor({state:'visible',timeout:28000});await control.click({timeout:28000})};
try{
 const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
 if(!username||!password)throw Error('WP PSE admin secrets missing');
 await page.goto(origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(username);
  await page.locator('#user_pass').fill(password);
  const t=await page.locator('body').innerText();
  const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3],v=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error('WP arithmetic login field not visible');
   await f.fill(String(v));
  }
  await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
 }
 if(page.url().includes('wp-login'))throw Error('WP PSE admin authentication failed');
 // WP REST nonces are not guaranteed on the Dashboard. Retrieve the standard
 // wpApiSettings token from the native page editor, not from an undeclared
 // custom admin-ajax action; never bypass WordPress cookie/nonce protection.
 let nonce=await page.evaluate(()=>window.wpApiSettings?.nonce||'');
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce)){
  await page.goto(origin+'/wp-admin/post.php?post=248&action=edit',
   {waitUntil:'domcontentloaded',timeout:60000});
  if(page.url().includes('wp-login'))throw Error('WP admin session expired');
  nonce=await page.evaluate(()=>window.wpApiSettings?.nonce||'');
 }
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error('Standard WordPress editor REST nonce unavailable');
 const get=async route=>{
  const out=await page.evaluate(async({route,nonce})=>{
   const r=await fetch(route,{credentials:'same-origin',headers:{'X-WP-Nonce':nonce,Accept:'application/json'}});
   return {status:r.status,data:await r.json().catch(()=>({})),total:r.headers.get('X-WP-Total')};
  },{route,nonce});
  if(out.status!==200)throw Error('WP read-only preflight HTTP '+out.status);
  return out;
 };
 const live=(await get('/wp-json/wp/v2/pages/248?context=edit&_fields=id,status,slug,title,acf,content')).data;
 const draft=(await get('/wp-json/wp/v2/pages/76969?context=edit&_fields=id,status,slug,acf,content')).data;
 if(live.id!==248||live.status!=='publish'||live.acf?.key!=='home'||live.acf?.action!=='HomePage')
  throw Error('Canonical existing published homepage identity changed');
 if(draft.id!==76969||draft.status!=='draft'||draft.acf?.key!=='pse-home-design-draft'||draft.acf?.action!=='HomePage')
  throw Error('Verified private 2026 homepage source draft changed');
 const sourceCodes=parseCodes(draft.content?.raw);
 if(JSON.stringify(sourceCodes)!==JSON.stringify(expected))throw Error('Private design source table IDs/order changed');
 for(const id of expected){
  const t=(await get('/wp-json/tablepress/v1/table/'+id)).data;
  if(t.id!==id||!Array.isArray(t.items)||t.items.length<1)throw Error('Required source-backed ESC Table unavailable: '+id);
 }
 const old=String(live.content?.raw||''),codes=parseCodes(old);
 const done=JSON.stringify(codes)===JSON.stringify(expected);
 if(done){
  console.log('PSE_PUBLIC_HOME_CUTOVER=ALREADY_PRESENT; page=248; no_mutation=true');
  console.log('PSE_PUBLIC_HOME_CUTOVER=PASS; existing_public_home=true; no_Astro_build=true');
  process.exit(0);
 }
 // The original canonical PSE Page 248 was authored as legacy HTML,
 // not necessarily as home_XX ESC tables. Preserve that content in the
 // revision+artifact before its intentional redesign. Only an incomplete
 // prior PSE migration is unsafe to overwrite automatically.
 if(codes.some(id=>/^pse_0[0-3]_vi$/i.test(id))||
    codes.length>30||old.length>800000)
  throw Error('Canonical PSE homepage has partial migration or oversized content; inspect before cutover');
 console.log('PSE_PUBLIC_HOME_OLD_CONTENT_PREFLIGHT='+JSON.stringify({
   previousHtmlBytes:old.length,previousTableShortcodes:codes.length,
   migrationTarget:'published_page_248',canonicalHomeVerified:true
 }));
 const revisions=await get('/wp-json/wp/v2/pages/248/revisions?per_page=1&context=edit&_fields=id,date');
 if(!Array.isArray(revisions.data)||revisions.data.length<1||!Number.isSafeInteger(revisions.data[0].id))
  throw Error('WordPress homepage revisions unavailable; refuse irreversible edit');
 // Private artifact allows restoring exact previously published source body.
 await mkdir('artifacts/pse-homepage-cutover',{recursive:true});
 await writeFile('artifacts/pse-homepage-cutover/page-248-before.json',JSON.stringify({
  id:248,slug:live.slug,title:live.title?.raw||'',status:'publish',
  sha256:hash(old),content:old,shortcodes:codes,previousRevisionId:revisions.data[0].id
 },null,2));
 console.log('PSE_PUBLIC_HOME_BACKUP=PASS; legacy_shortcodes='+codes.length+
  '; old_sha256='+hash(old)+'; revision_id='+revisions.data[0].id);
 await page.goto(origin+'/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
 if(page.url().includes('wp-login')||!await page.locator('#wp-content-wrap').count())
  throw Error('Cannot access canonical WP native homepage editor');
 const visualTab=page.locator('#content-tmce');
 if(await visualTab.isVisible().catch(()=>false))await visualTab.click();
 // Use the official ESC Table Insert Code control: TinyMCE when available,
 // otherwise the native Quicktags Insert Code control (as on the draft).
 let insertionMode='tinymce';
 const hasTiny=await page.evaluate(()=>Boolean(window.tinymce?.get('content')?.getBody()));
 if(!hasTiny){
  const textTab=page.locator('#content-html');
  if(!await textTab.isVisible().catch(()=>false))throw Error('Neither WP editor mode is available');
  await click(textTab);insertionMode='quicktags';
 }
 const readEditor=()=>page.evaluate(mode=>mode==='tinymce'
  ? window.tinymce.get('content').getContent({format:'raw'})
  : document.getElementById('content')?.value||'',insertionMode);
 const currentCodes=parseCodes(await readEditor());
 if(JSON.stringify(currentCodes)!==JSON.stringify(codes))
  throw Error('WordPress main editor disagrees with latest saved public homepage');
 if(insertionMode==='tinymce'){
  await page.evaluate(()=>{
   const ed=window.tinymce.get('content');
   ed.setContent('');ed.focus();ed.nodeChanged();
  });
 }else{
  await page.locator('textarea#content').fill('');
 }
 const tinymceButton=page.locator('#wp-content-wrap .mce-btn[title="Insert a ESC Table"],#wp-content-wrap button[title="Insert a ESC Table"]').first();
 const quickButton=page.locator('#qt_content_tablepress_quicktags_button');
 let input=insertionMode==='tinymce'?tinymceButton:quickButton;
 // The existing ESC Table editor sometimes loads TinyMCE without its plugin
 // toolbar icon. In that case use the official registered Quicktags button,
 // not literal shortcode insertion.
 if(insertionMode==='tinymce'&&!await input.isVisible().catch(()=>false)){
  const textTab=page.locator('#content-html');
  if(!await textTab.isVisible().catch(()=>false))
   throw Error('TinyMCE ESC button missing and native Quicktags tab unavailable');
  await click(textTab);
  insertionMode='quicktags';
  await page.locator('textarea#content').fill('');
  input=quickButton;
 }
 if(!await input.isVisible().catch(()=>false))
  throw Error('Native WordPress ESC Table Insert Code button unavailable in '+insertionMode+' mode');
 console.log('PSE_PUBLIC_HOME_NATIVE_INSERT_MODE='+insertionMode);
 for(const id of expected){
  if(insertionMode==='tinymce'){
   await page.evaluate(()=>{
    const ed=window.tinymce.get('content');
    ed.focus();ed.selection.select(ed.getBody(),true);ed.selection.collapse(false);
   });
  }else{
   await page.evaluate(()=>{
    const ta=document.querySelector('textarea#content');
    if(!ta)throw Error('WP content textarea missing');
    ta.focus();ta.setSelectionRange(ta.value.length,ta.value.length);
   });
  }
  await click(input);
  const popup=page.locator('#TB_iframeContent');
  await popup.waitFor({state:'visible',timeout:30000});
  const pick=page.frameLocator('#TB_iframeContent').locator('input.insert-shortcode[title="[table id='+id+' /]"]');
  await click(pick);
  await popup.waitFor({state:'hidden',timeout:30000});
  const current=await readEditor();
  if(!parseCodes(current).includes(id))throw Error('Native ESC Table Insert failed '+id);
  console.log('PSE_PUBLIC_HOME_NATIVE_INSERT=PASS; table='+id);
 }
 const before=await readEditor();
 if(JSON.stringify(parseCodes(before))!==JSON.stringify(expected))
  throw Error('Wrong public PSE four-section layout before native WordPress save');
 await click(page.locator('#publish'));
 await page.waitForLoadState('domcontentloaded',{timeout:60000});
 const after=(await get('/wp-json/wp/v2/pages/248?context=edit&_fields=id,status,slug,title,acf,content')).data;
 if(after.id!==248||after.status!=='publish'||after.acf?.key!=='home'||after.acf?.action!=='HomePage'||
    after.slug!==live.slug||JSON.stringify(parseCodes(after.content?.raw))!==JSON.stringify(expected))
  throw Error('WordPress homepage read-after-write mismatch after Update button; restore from artifact/revisions before repeat');
 console.log('PSE_PUBLIC_HOME_CUTOVER_READ_AFTER_WRITE=PASS; id=248; old_rev='+revisions.data[0].id+
  '; old_hash='+hash(old)+'; new_hash='+hash(String(after.content.raw||''))+'; status=publish; sections=4');
 console.log('PSE_PUBLIC_HOME_CUTOVER=PASS; native_ESC_Insert_Code=true; old_page_revision_preserved=true; NO_BUILD_IN_SCRIPT=true');
}finally{await browser.close()}
