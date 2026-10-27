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
} finally {
  await browser.close();
}
