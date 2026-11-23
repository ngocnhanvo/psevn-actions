/** Scope: only ACF cssmore of published WP Page 83572. Preview and readback first. */
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const commitEvent=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
const allowedMessage='cms(pse): style Kali variants via cssmore';
const apply=commitEvent.head_commit?.message===allowedMessage && process.env.PSE_KALI_CSSMORE_PREVIEW_ONLY!=='true';
const liveVerification=process.env.PSE_KALI_VERIFY_PUBLISHED==='true';
const originValue=(key)=>{
  const matches=String(process.env.ENV_FILE||'').split(/\r?\n/)
    .map(s=>s.trim().replace(/^export\s+/,'')).filter(x=>x.startsWith(key+'='));
  if(matches.length!==1)throw Error('Missing unique '+key);
  const url=new URL(matches[0].slice(key.length+1).replace(/^['"]|['"]$/g,''));
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
     !['','/'].includes(url.pathname))throw Error('Invalid origin '+key);
  return url.origin;
};
const wp=originValue('WC_URL'),front=originValue('WC_URL_CLIENT');
if(wp!=='https://admin-pse.webnvn.com'||front!=='https://pse.webnvn.com')
  throw Error('PSE origin mismatch');
if(process.env.GITHUB_REPOSITORY!=='ngocnhanvo/psevn-actions'||
   process.env.GITHUB_REF!=='refs/heads/main')throw Error('Wrong repository or branch');
if(apply&&process.env.PSE_KALI_FRESH_DB_BACKUP!=='true')
  throw Error('Fresh verified WordPress DB backup required');
const css=(await readFile('scripts/pse-kali-1426-cssmore.css','utf8')).trim();
const previousCss=(await readFile('scripts/pse-kali-1426-cssmore.before-spacing.css','utf8')).trim();
if(!css.startsWith('/* Page 83572')||!css.includes('.pse-historical-kali-1426')||
   css.length<700||css.length>5000||/<script|@import|url\s*\(/i.test(css))
  throw Error('Unapproved CSS candidate');
const sha=s=>createHash('sha256').update(String(s||'')).digest('hex');
const out='artifacts/pse-kali-1426-cssmore';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1240,height:900},deviceScaleFactor:1});
const page=await ctx.newPage();
try{
  // Auth and source readback (this does not create/edit any content).
  if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)
    throw Error('Missing WordPress credentials');
  await page.goto(wp+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
  if(await page.locator('#user_login').count()){
    await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
    await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
    const body=await page.locator('body').innerText();
    const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)
      || body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if(m){
      const a=+m[1],b=+m[3],v=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
      const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if(!await field.count())throw Error('Login challenge unavailable');
      await field.fill(String(v));
    }
    await page.locator('#wp-submit').click();
  }
  if(page.url().includes('wp-login'))throw Error('WordPress admin login failed');
  const nonce=await page.evaluate(async()=>{
    if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
    const response=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});
    if(!response.ok)throw Error('WordPress REST nonce unavailable');
    return (await response.text()).trim();
  });
  if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('Invalid REST nonce');
  const get=async()=>page.evaluate(async nonce=>{
    const response=await fetch('/wp-json/wp/v2/pages/83572?context=edit&_fields=id,slug,status,acf,content,title,modified',{
      credentials:'same-origin',cache:'no-store',headers:{'X-WP-Nonce':nonce}});
    return {http:response.status,payload:await response.json().catch(()=>null)};
  },nonce);
  const before=await get();
  const d=before.payload||{};
  const raw=String(d.content?.raw||'');
  if(before.http!==200||d.id!==83572||d.slug!=='kali-phu-my-mo-ta-cac-bien-the'||
    d.status!=='publish'||d.acf?.action!=='PublicPage'||d.acf?.key!=='pse-historical-kali-1426'||
    !raw.includes('pse-historical-kali-1426')||
    (raw.match(/<tr(?:\s|>)/gi)||[]).length!==3||
    (raw.match(/<img(?:\s|>)/gi)||[]).length!==3)
      throw Error('WordPress Page shape/identity changed');
  const priorCss=String(d.acf?.cssmore||'');
  if(priorCss&&priorCss.trim()!==css&&priorCss.trim()!==previousCss)
    throw Error('Existing cssmore differs from approved baseline; refuse overwrite');
  if(liveVerification&&priorCss.trim()!==css)throw Error('Published CSS verification requires saved WordPress CSS');
  const rawHash=sha(raw);
  const backup={id:d.id,slug:d.slug,action:d.acf.action,key:d.acf.key,
    modified:d.modified,originalCssmore:priorCss,originalContentSha256:rawHash,
    targetCssHash:sha(css),content:raw};
  await writeFile(out+'/backup.json',JSON.stringify(backup,null,2)+'\n');
  console.log('PSE_KALI_CSSMORE_PREFLIGHT='+JSON.stringify({
    id:d.id,priorCssChars:priorCss.length,sourceSha:rawHash.slice(0,16),
    cssSha:sha(css).slice(0,16),cssChars:css.length,writeRequested:apply}));

  // Simulate the identical ACF CSS in the public browser before any CMS save.
  const publicPage=await ctx.newPage();
  try{
    await publicPage.goto(front+'/kali-phu-my-mo-ta-cac-bien-the',
      {waitUntil:'domcontentloaded',timeout:60000});
    if(!await publicPage.locator('.pse-public-page .pse-historical-kali-1426 table tr').count())
      throw Error('Public Kali Page wrapper missing');
    if(!liveVerification){
      // WordPress already rendered OLD cssmore in a <style> inside <main>.
      // Adding to <head> can be overridden by that later style: replace the
      // exact existing style in this in-memory Playwright page instead.
      const replaced=await publicPage.evaluate(candidate=>{
        const node=[...document.querySelectorAll('main style')].find(el=>
          el.textContent.includes('/* Page 83572 / original Joomla 1426'));
        if(!node)return false;
        node.textContent=candidate;
        return true;
      },css);
      if(!replaced)throw Error('Cannot simulate WordPress cssmore replacement');
    }
    else if(!await publicPage.locator('main style').evaluateAll(nodes=>nodes.some(n=>n.textContent.includes('.pse-historical-kali-1426'))))
      throw Error('WordPress cssmore not published in Astro HTML yet');
    for(const width of [1440,1240,768,390]){
      await publicPage.setViewportSize({width,height:900});
      await publicPage.locator('.pse-historical-kali-1426 img').evaluateAll(nodes=>
        nodes.forEach(img=>{img.loading='eager';}));
      await publicPage.waitForFunction(()=>[...document.querySelectorAll('.pse-historical-kali-1426 img')]
        .every(img=>img.complete&&img.naturalWidth>0),null,{timeout:45000});
      const result=await publicPage.evaluate(()=>{
        const wrapper=document.querySelector('.pse-historical-kali-1426');
        const table=wrapper.querySelector('table');
        const r=el=>{const b=el.getBoundingClientRect();return {width:Math.round(b.width),height:Math.round(b.height),x:Math.round(b.x),right:Math.round(b.right)}};
        const header=document.querySelector('.pse-public-page header');
        const headingBottom=header?.getBoundingClientRect().bottom||0;
        return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,
          gapAfterHeader:Math.round(table.getBoundingClientRect().top-headingBottom),
          table:r(table),rows:[...table.rows].map(r),
          cells:[...table.rows].map(row=>[...row.cells].map(r)),
          images:[...wrapper.querySelectorAll('img')].map(r),
          firstCellPadding:getComputedStyle(table.rows[0].cells[0]).paddingTop,
          imageCSSMaxHeight:getComputedStyle(table.rows[0].cells[0].querySelector('img')).maxHeight,
          label:document.querySelector('main h1')?.textContent.trim(),
          cssTableDisplay:getComputedStyle(table).display,
          imageCount:wrapper.querySelectorAll('img').length};
      });
      console.log('PSE_KALI_CSSMORE_PREVIEW='+JSON.stringify(result));
      if(result.gapAfterHeader>25||result.gapAfterHeader<0||
         result.firstCellPadding!==(width<=640?'12px':'10px')||
         result.imageCSSMaxHeight!==(width<=640?'210px':'240px')||
         result.imageCount!==3||result.documentWidth>width+3||
         result.images.some(i=>i.height>(width<=640?242:282)||i.width<=0)||
         result.table.height>(width<=640?2400:1500)||
         result.cells.some(cells=>cells.some(c=>c.right>width+4))||
         result.label!=='Kali Phú Mỹ')
        throw Error('CSS preview layout mismatch at '+width);
      await publicPage.screenshot({path:out+'/preview-'+width+'.png',fullPage:true});
    }
  }finally{await publicPage.close();}

  if(apply&&priorCss!==css){
    // Optimistic concurrency: only this one ACF field can be written.
    const current=await get();
    if(current.http!==200||current.payload?.modified!==d.modified||
       sha(current.payload?.content?.raw)!==rawHash||
       String(current.payload?.acf?.cssmore||'')!==priorCss)
      throw Error('Concurrent WordPress edit; refusing CSS update');
    const saved=await page.evaluate(async({nonce,css})=>{
      const response=await fetch('/wp-json/wp/v2/pages/83572',{
        method:'POST',credentials:'same-origin',
        headers:{'X-WP-Nonce':nonce,'Content-Type':'application/json'},
        body:JSON.stringify({acf:{cssmore:css}})});
      const json=await response.json().catch(()=>null);
      return {http:response.status,id:json?.id||null,errorCode:json?.code||null};
    },{nonce,css});
    if(saved.http!==200||saved.id!==83572)
      throw Error('WordPress rejected cssmore write: HTTP '+saved.http+' '+saved.errorCode);
  }
  if(apply){
    const after=await get();
    if(after.http!==200||after.payload?.id!==83572||
       after.payload?.acf?.cssmore?.trim()!==css||
       sha(after.payload?.content?.raw)!==rawHash||
       after.payload?.acf?.action!==d.acf.action||
       after.payload?.acf?.key!==d.acf.key)
       throw Error('WordPress CSS save/readback mismatch');
    console.log('PSE_KALI_CSSMORE_SAVED=PASS id=83572 content_unchanged=true no_extra_records=true');
  }
  console.log('PSE_KALI_CSSMORE_PREVIEW_PASS write='+apply+' published='+liveVerification+' three_images=true three_rows=true');
}finally{await browser.close();}
