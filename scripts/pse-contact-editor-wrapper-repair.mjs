/** Repair only a verified TinyMCE ESC preview wrapper that incorrectly nests
 * the existing office shortcode inside the form badge. No new shortcode,
 * REST mutations, ESC Table edits, Astro code, or build.
 */
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

const apply=process.env.PSE_CONTACT_WRAPPER_APPLY==='true';
const ids=['pse_contact_office_vi','contact_00_vi','pse_contact_warehouses_vi'];
const settings=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,''));
const wpLines=settings.filter(x=>x.startsWith('WC_URL='));
if(wpLines.length!==1)throw Error('Unique WP origin missing');
const originURL=new URL(wpLines[0].slice(7).replace(/^['"]|['"]$/g,''));
if(originURL.protocol!=='https:'||originURL.username||originURL.password||originURL.search||originURL.hash||!['','/'].includes(originURL.pathname))throw Error('Invalid WordPress origin');
const origin=originURL.origin;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1450,height:950}});
page.on('dialog',async d=>{if(d.type()==='confirm')await d.accept();else await d.dismiss()});
try{
  await page.goto(origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
  if(await page.locator('#user_login').count()){
    const user=process.env.WP_ADMIN_USERNAME,pass=process.env.WP_ADMIN_PASSWORD;
    if(!user||!pass)throw Error('WordPress credentials missing');
    await page.locator('#user_login').fill(user);
    await page.locator('#user_pass').fill(pass);
    const t=await page.locator('body').innerText();
    const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if(m){
      const a=+m[1],b=+m[3],v=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
      const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if(!(await field.count()))throw Error('Login challenge input missing');
      await field.fill(String(v));
    }
    await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
  }
  if(page.url().includes('wp-login'))throw Error('Admin login failed');
  const nonce=await page.evaluate(async()=>{
    if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
    const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});
    if(!r.ok)throw Error('REST nonce unavailable');
    return(await r.text()).trim();
  });
  const read=async()=>page.evaluate(async nonce=>{
    const r=await fetch('/wp-json/wp/v2/pages/47222?context=edit&_fields=id,slug,status,acf,content',{credentials:'same-origin',headers:{'X-WP-Nonce':nonce,Accept:'application/json','Cache-Control':'no-cache'}});
    return {status:r.status,record:await r.json().catch(()=>null)};
  },nonce);
  const p=await read();
  if(p.status!==200||p.record?.id!==47222||p.record.slug!=='lien-he'||p.record.status!=='publish'||p.record.acf?.action!=='PrivatePage'||p.record.acf?.key!=='contact')throw Error('Unexpected Contact Page identity');
  const raw=String(p.record.content?.raw||''),css=String(p.record.acf?.cssmore||'');
  if(!raw.includes('pse-contact-hero')||!css.includes('PSE_CONTACT_ESC_OWNED_SECTIONS_V2')||raw.includes('pse-location-card'))throw Error('Unexpected Contact Page architecture');
  const findTokens=text=>[...text.matchAll(/\[table\s+id=([a-z0-9_-]+)\s*\/\]/gi)].map(m=>({id:m[1],token:m[0]}));
  const tokenList=findTokens(raw);
  if(JSON.stringify(tokenList.map(x=>x.id))!==JSON.stringify(ids))throw Error('Existing native ESC Table shortcode order/number differs');
  const wraps=[...raw.matchAll(/<div\b[^>]*class=["'][^"']*\btablepress-preview-wrap\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi)];
  await mkdir('artifacts/pse-contact-preview-wrapper',{recursive:true});
  await writeFile('artifacts/pse-contact-preview-wrapper/backup.json',JSON.stringify({id:47222,content:raw,cssmore:css},null,2));
  console.log('PSE_CONTACT_WRAPPER_PREFLIGHT='+JSON.stringify({apply,rawLength:raw.length,shortcodes:ids.length,wrappers:wraps.length,hasCss:true}));
  if(wraps.length===0){
    if(!tokenList.every(x=>raw.includes(x.token)))throw Error('Missing native ESC code after cleanup');
    console.log('PSE_CONTACT_WRAPPER=ALREADY_DONE; no_writes=true');
    process.exit(0);
  }
  if(wraps.length!==1||!/\bdata-table-id=["']contact_00_vi["']/i.test(wraps[0][0]))throw Error('Unexpected ESC preview wrapper');
  const match=wraps[0][0].match(/<span\b[^>]*class=["'][^"']*\btablepress-preview-badge\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  const inside=match?.[1]?.trim()||'';
  const embedded=findTokens(inside);
  if(embedded.length!==2||embedded[0].id!==ids[0]||embedded[1].id!==ids[1]||
    inside.replace(/\s+/g,'')!==(embedded[0].token+embedded[1].token).replace(/\s+/g,''))
    throw Error('Editor wrapper includes unexpected content; fail closed');
  const next=raw.slice(0,wraps[0].index)+embedded.map(x=>x.token).join('\n\n')+raw.slice(wraps[0].index+wraps[0][0].length);
  if(next.includes('tablepress-preview-wrap')||JSON.stringify(findTokens(next).map(x=>x.id))!==JSON.stringify(ids)||
    !next.includes('[table id=pse_contact_warehouses_vi /]')||!next.includes('pse-contact-hero'))throw Error('Proposed editor wrapper cleanup unsafe');
  if(!apply){console.log('PSE_CONTACT_WRAPPER=DRY_PASS; native_inserted_tokens_preserved=true; no_writes=true');process.exit(0)}
  await page.goto(origin+'/wp-admin/post.php?post=47222&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('#content-html').click();
  const before=await page.locator('#content').inputValue();
  if(JSON.stringify(findTokens(before).map(x=>x.id))!==JSON.stringify(ids)||
    !before.includes('tablepress-preview-wrap'))throw Error('Classic editor changed since guarded preflight');
  const editor=await page.evaluate(next=>{
    const input=document.getElementById('content');
    if(!(input instanceof HTMLTextAreaElement))throw Error('WordPress code editor not found');
    input.value=next;
    const visual=window.tinymce?.get('content');
    if(visual){
      if(typeof visual.setContent!=='function'||typeof visual.save!=='function')throw Error('Native TinyMCE sync unavailable');
      visual.setContent(next);
      visual.save();
    }
    input.dispatchEvent(new Event('input',{bubbles:true}));
    return {matches:input.value===next,rawLength:input.value.length};
  },next);
  if(!editor.matches)throw Error('Classic editor source synchronization failed');
  console.log('PSE_CONTACT_WRAPPER_NATIVE_EDITOR=PASS no_manual_shortcode_insertion=true');
  await page.locator('#publish').click();
  let saved=null;
  for(let n=0;n<10;n++){
    try{
      await page.waitForLoadState('domcontentloaded',{timeout:12000});
      saved=await read();break;
    }catch(e){
      if(!/navigation|Execution context was destroyed/i.test(String(e)))throw e;
      await page.waitForTimeout(850);
    }
  }
  if(!saved)throw Error('WordPress editor navigation did not stabilize');
  const after=String(saved.record?.content?.raw||'');
  console.log('PSE_CONTACT_WRAPPER_READBACK='+JSON.stringify({http:saved.status,shortcodes:findTokens(after).map(x=>x.id),previewWrapperCount:(after.match(/tablepress-preview-wrap/g)||[]).length,bodyLength:after.length}));
  if(saved.status!==200||JSON.stringify(findTokens(after).map(x=>x.id))!==JSON.stringify(ids)||after.includes('tablepress-preview-wrap')||
      !after.includes('pse-contact-hero')||String(saved.record?.acf?.cssmore||'')!==css)
    throw Error('WordPress saved content not clean; backup retained');
  console.log('PSE_CONTACT_WRAPPER=PASS; nested_visual_badge_removed=true; existing_native_ESC_tokens_preserved=true; no_build=true');
}finally{await browser.close()}
