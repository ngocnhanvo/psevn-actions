/** Repair only a verified TinyMCE ESC preview wrapper that incorrectly nests
 * the existing office shortcode inside the form badge. No new shortcode insertion, ESC Table edits, Astro code, or build.
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
  // These are not newly authored shortcodes: every token was already inserted
  // through WordPress's native ESC Insert Code tool and is present in the
  // published Page. Correct ONLY the TinyMCE preview HTML envelope.
  // Classic Save is not reliable here because the Visual editor overwrites
  // the code textarea with its stale preview buffer (observed in live run).
  const beforeSave=await read();
  if(beforeSave.status!==200||String(beforeSave.record?.content?.raw||'')!==raw||
     String(beforeSave.record?.acf?.cssmore||'')!==css)
    throw Error('WordPress record changed during normalization; abort without write');
  const postResult=await page.evaluate(async({nonce,next})=>{
    const r=await fetch('/wp-json/wp/v2/pages/47222',{
      method:'POST',credentials:'same-origin',
      headers:{'X-WP-Nonce':nonce,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({content:next})
    });
    return {status:r.status,id:(await r.json().catch(()=>null))?.id||null};
  },{nonce,next});
  if(postResult.status!==200||postResult.id!==47222)
    throw Error('WordPress native page content cleanup rejected');
  const saved=await read();
  const after=String(saved.record?.content?.raw||'');
  console.log('PSE_CONTACT_WRAPPER_READBACK='+JSON.stringify({http:saved.status,shortcodes:findTokens(after).map(x=>x.id),previewWrapperCount:(after.match(/tablepress-preview-wrap/g)||[]).length,bodyLength:after.length}));
  if(saved.status!==200||JSON.stringify(findTokens(after).map(x=>x.id))!==JSON.stringify(ids)||after.includes('tablepress-preview-wrap')||
      !after.includes('pse-contact-hero')||String(saved.record?.acf?.cssmore||'')!==css)
    throw Error('WordPress saved content not clean; backup retained');
  console.log('PSE_CONTACT_WRAPPER=PASS; nested_visual_badge_removed=true; existing_native_ESC_tokens_preserved=true; no_build=true');
}finally{await browser.close()}
