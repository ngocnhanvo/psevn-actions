/**
 * Native Contact Editor typography parity and staged ESC CSS ownership transfer.
 * intro: restyle only the WordPress-owned hero through native TinyMCE; preserve all
 * ESC image blocks/shortcodes. finalize: remove only the verified old Table CSS
 * tail in ACF cssmore AFTER Astro stylesheet is deployed via WordPress Build Website.
 * Neither phase creates tables, fake previews, or invokes Astro build.
 */
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const phase=process.env.PSE_CONTACT_PARITY_PHASE||'dry';
if(!['dry','intro','finalize'].includes(phase))throw Error('Unsupported phase');
const marker='/* PSE_CONTACT_ESC_OWNED_SECTIONS_V2 */';
const legacy=await readFile(new URL('./pse-contact-structured-sections.css',import.meta.url),'utf8');
const normalize=s=>String(s).replace(/\r\n/g,'\n').replace(/\s+/g,' ').trim();
const ids=['pse_contact_office_vi','contact_00_vi','pse_contact_warehouses_vi'];
const expectedStyles={
 intro:'max-width:960px;margin:0 auto 8px;text-align:center;font-family:Quicksand,Arial,sans-serif',
 eyebrow:'display:block;color:#298753;text-transform:uppercase;letter-spacing:.15em;font-weight:800;font-size:12px',
 heading:'font-size:clamp(28px,3.4vw,43px);line-height:1.25;margin:10px 0;color:#175238;font-weight:800',
 description:'max-width:730px;margin:0 auto;line-height:1.75;color:#5c7767;font-size:18px'
};
const variables=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,''));
const found=variables.filter(x=>x.startsWith('WC_URL='));
if(found.length!==1)throw Error('WordPress site configuration not unique');
const url=new URL(found[0].slice(7).replace(/^['"]|['"]$/g,''));
if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search||!['','/'].includes(url.pathname))throw Error('Invalid configured WP origin');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:950}});
page.on('dialog',async d=>{if(d.type()==='confirm')await d.accept();else await d.dismiss()});
try{
 await page.goto(url.origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await page.locator('#user_login').count()){
  if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error('WP credentials absent');
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
  const txt=await page.locator('body').innerText();
  const m=txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({'+':a+b,'-':a-b,'x':a*b,'×':a*b,'*':a*b})[m[2]];const c=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!(await c.count()))throw Error('Login challenge unavailable');await c.fill(String(v))}
  await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
 }
 if(page.url().includes('wp-login'))throw Error('WP login failed');
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});
  if(!r.ok)throw Error('REST nonce unavailable');return(await r.text()).trim();
 });
 const get=async()=>page.evaluate(async nonce=>{const r=await fetch('/wp-json/wp/v2/pages/47222?context=edit&_fields=id,slug,status,acf,content',{credentials:'same-origin',headers:{'X-WP-Nonce':nonce,Accept:'application/json','Cache-Control':'no-cache'}});return {status:r.status,page:await r.json().catch(()=>null)}},nonce);
 const current=await get();
 const content=String(current.page?.content?.raw||''),css=String(current.page?.acf?.cssmore||'');
 if(current.status!==200||current.page?.id!==47222||current.page?.slug!=='lien-he'||current.page?.status!=='publish'||current.page?.acf?.action!=='PrivatePage'||current.page?.acf?.key!=='contact')throw Error('Unexpected PSE Contact identity');
 const idList=s=>[...String(s).matchAll(/\[table\s+id=([a-z0-9_-]+)\s*\/\]/gi)].map(x=>x[1]);
 const wraps=s=>(String(s).match(/tablepress-preview-wrap/g)||[]).length;
 if(JSON.stringify(idList(content))!==JSON.stringify(ids)||wraps(content)!==3||!content.includes('class="pse-contact-hero"')||content.includes('pse-location-card'))throw Error('Native ESC editor structure has changed');
 const oldAt=css.lastIndexOf(marker);
 if(phase==='finalize' && (oldAt<0||css.indexOf(marker)!==oldAt||normalize(css.slice(oldAt))!==normalize(legacy)||!content.includes('font-size:clamp(28px,3.4vw,43px)')))throw Error('CSS tail or native heading unexpected; do not cleanup');
 await mkdir('artifacts/pse-contact-editor-parity',{recursive:true});
 await writeFile('artifacts/pse-contact-editor-parity/backup.json',JSON.stringify({id:47222,phase,content,cssmore:css},null,2));
 await page.goto(url.origin+'/wp-admin/post.php?post=47222&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
 if(await page.locator('#pse-contact-editor-preview').count())throw Error('Unexpected custom admin preview');
 await page.locator('#content-tmce').click();
 await page.waitForFunction(()=>Boolean(window.tinymce?.get('content')?.getBody()),null,{timeout:25000});
 const before=await page.evaluate(()=>{
   const ed=window.tinymce.get('content'),h=ed.getBody().querySelector('.pse-contact-hero .pse-contact-locations__intro');
   const elements={intro:h,eyebrow:h?.querySelector('span'),heading:h?.querySelector('h2'),description:h?.querySelector('p')};
   if(Object.values(elements).some(v=>!v))throw Error('Contact native hero not present');
   return {elements:Object.fromEntries(Object.entries(elements).map(([k,e])=>[k,{text:e.textContent.trim(),style:e.getAttribute('style')}])),images:ed.getBody().querySelectorAll('.tablepress-preview-wrap img').length,
   wrappers:ed.getBody().querySelectorAll('.tablepress-preview-wrap').length};
 });
 if(before.images!==3||before.wrappers!==3||before.elements.heading.text!=='Thông tin liên hệ'||before.elements.eyebrow.text.toLowerCase()!=='pvfcco-pse')throw Error('WordPress native editor content mismatch');
 console.log('PSE_CONTACT_PARITY_PREFLIGHT='+JSON.stringify({phase,ids,images:before.images,heading:before.elements.heading,cssMarker:oldAt>=0,cssLength:css.length}));
 if(phase==='dry'){console.log('PSE_CONTACT_PARITY_DRY=PASS; no_cms_write=true');process.exit(0)}
 if(phase==='intro'){
  const applied=await page.evaluate(styles=>{
   const ed=window.tinymce.get('content'),h=ed.getBody().querySelector('.pse-contact-hero .pse-contact-locations__intro');
   const elements={intro:h,eyebrow:h?.querySelector('span'),heading:h?.querySelector('h2'),description:h?.querySelector('p')};
   Object.entries(elements).forEach(([k,e])=>e.setAttribute('style',styles[k]));
   ed.nodeChanged();ed.save();
   return {shortcodes:[...ed.getContent().matchAll(/\[table\s+id=([a-z0-9_-]+)\s*\/\]/gi)].map(x=>x[1]),wrapperCount:ed.getBody().querySelectorAll('.tablepress-preview-wrap').length,htmlLength:ed.getContent().length};
  },expectedStyles);
  if(JSON.stringify(applied.shortcodes)!==JSON.stringify(ids)||applied.wrapperCount!==3)throw Error('Native ESC refs changed when styling WP heading');
 }else{
  const field=page.locator('.acf-field[data-name="cssmore"] textarea').first();
  if(!await field.count())throw Error('WordPress ACF cssmore textarea unavailable');
  await field.fill(css.slice(0,oldAt).trimEnd());
 }
 await page.locator('#title').click();
 await page.locator('#publish').click();
 await page.waitForTimeout(2300);
 let result;
 for(let i=0;i<9;i++){try{await page.waitForLoadState('domcontentloaded',{timeout:15000});result=await get();if(result.status===200)break;}catch(e){if(!/Execution context was destroyed|navigation/i.test(String(e)))throw e;}await page.waitForTimeout(800)}
 if(!result||result.status!==200)throw Error('CMS readback unavailable; inspect persisted state before retrying');
 const after=String(result.page?.content?.raw||''),nextCSS=String(result.page?.acf?.cssmore||'');
 if(JSON.stringify(idList(after))!==JSON.stringify(ids)||wraps(after)!==3||after.includes('pse-location-card'))throw Error('Readback lost native ESC blocks');
 const styled=after.includes('font-size:clamp(28px,3.4vw,43px)')&&after.includes('color:#175238')&&after.includes('font-family:Quicksand');
 if(!styled)throw Error('Native WordPress heading inline styles not persisted');
 if(phase==='intro'&&nextCSS!==css)throw Error('Intro phase unexpectedly changed cssmore');
 if(phase==='finalize'&&(nextCSS.includes(marker)||normalize(nextCSS)!==normalize(css.slice(0,oldAt))))throw Error('CSS cleanup changed non-ESC authored rules');
 console.log('PSE_CONTACT_PARITY_SAVED='+JSON.stringify({phase,headingStyled:styled,tableIds:idList(after),nativeImages:wraps(after),cssmoreLength:nextCSS.length,oldTableCssRemoved:!nextCSS.includes(marker),contentLength:after.length}));
 await page.goto(url.origin+'/wp-admin/post.php?post=47222&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
 await page.locator('#content-tmce').click();
 await page.waitForFunction(()=>Boolean(window.tinymce?.get('content')?.getBody()),null,{timeout:20000});
 const visual=await page.evaluate(()=>{
  const ed=window.tinymce.get('content'),h=ed.getBody().querySelector('.pse-contact-hero h2');
  const imgs=[...ed.getBody().querySelectorAll('.tablepress-preview-wrap img')];
  return{heading:h?.textContent?.trim(),color:h?getComputedStyle(h).color:null,fontSize:h?getComputedStyle(h).fontSize:null,
    previewCount:imgs.length,loadedImages:imgs.filter(x=>x.complete&&x.naturalWidth>0).length};
 });
 if(visual.color!=='rgb(23, 82, 56)'||visual.previewCount!==3)throw Error('Native visual editor parity after reload failed');
 console.log('PSE_CONTACT_PARITY_NATIVE_EDITOR=PASS '+JSON.stringify(visual));
 console.log('PSE_CONTACT_PARITY_PHASE='+phase+' PASS; no_astro_build=true');
}finally{await browser.close()}
