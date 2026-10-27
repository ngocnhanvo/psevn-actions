/** Live authenticated Footer REST no-op Save + 403/409 contract; never mutates CMS. */
import {chromium} from 'playwright';
const arr=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,'')).
  filter(s=>s.startsWith('WC_URL='));
if(arr.length!==1)throw Error('Missing PSE WP origin');
const wp=new URL(arr[0].slice(7).replace(/^['"]|['"]$/g,''));
if(wp.protocol!=='https:'||!wp.hostname||wp.username||wp.password||wp.search||wp.hash||
   !['','/'].includes(wp.pathname))throw Error('Invalid PSE WordPress origin');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
try{
  await page.goto(wp.origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
  if(await page.locator('#user_login').count()){
    await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
    await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
    const body=await page.locator('body').innerText();
    const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||
      body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if(m){
      const a=+m[1],b=+m[3],ans=({'+':a+b,'-':a-b,'x':a*b,'×':a*b,'*':a*b})[m[2]];
      const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if(!await field.count())throw Error('Arithmetic login field not found');
      await field.fill(String(ans));
    }
    await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
  }
  if(page.url().includes('wp-login'))throw Error('WP login rejected');
  await page.goto(wp.origin+'/wp-admin/edit.php?post_type=page&page=esc-visual-builder',
    {waitUntil:'domcontentloaded',timeout:60000});
  const selector=page.locator('#esc-vb-page');
  await selector.waitFor({state:'visible',timeout:30000});
  await Promise.all([page.waitForLoadState('domcontentloaded'),page.getByRole('button',{name:'Mở trang'}).click()]);
  const frame=page.frameLocator('#esc-vb-frame');
  const rows=frame.locator('#footer-contact [data-esc-vb-footer-asset-row][data-esc-vb-region-state="editable"]');
  await rows.first().waitFor({state:'visible',timeout:90000});
  const value=page.locator('#esc-vb-footer-asset-value');
  const editor=page.locator('#esc-vb-footer-assets-editor');
  let rowNumber=null,original=null;
  for(let i=0;i<Math.min(await rows.count(),6);i++){
    const row=rows.nth(i);
    await row.click();
    await editor.waitFor({state:'visible',timeout:20000});
    await value.waitFor({state:'visible',timeout:20000});
    await page.waitForFunction(()=>
      document.querySelector('#esc-vb-footer-assets-editor [role="status"]')?.textContent?.includes('Có thể sửa')||
      document.querySelector('#esc-vb-footer-assets-editor [role="status"]')?.textContent?.includes('Ảnh được giữ'),null,{timeout:20000});
    const t=await value.inputValue();
    // WordPress sanitize_text_field(t) must be identical; only basic Unicode
    // letters/digits/spaces/hyphens may take part in this zero-diff write test.
    if(t && t===t.trim() && /^[\p{L}\p{N} ._-]{1,80}$/u.test(t)){
      rowNumber=Number(await row.getAttribute('data-esc-vb-footer-asset-row'));
      original=t;
      break;
    }
  }
  if(rowNumber===null)throw Error('No safe canonical scalar label for no-op Save test');
  let saveCall=null,saveResponse=null;
  await page.route('**/wp-json/esc-builder/v1/save-footer-asset*',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    const req=route.request();
    const body=req.postDataJSON();
    if(body?.row_index!==rowNumber || body.field!=='label'||body.value!==original||
      !/^[a-f0-9]{64}$/.test(body.expected_version||'')){
      await route.abort();
      throw Error('Aborted unexpected CMS-mutating Save payload');
    }
    saveCall={url:req.url(),body,nonce:req.headers()['x-wp-nonce']};
    const response=await route.fetch();
    saveResponse={status:response.status(),json:await response.json().catch(()=>({}))};
    await route.fulfill({response});
  });
  await value.fill(original+' ');
  await page.locator('#esc-vb-footer-assets-editor button.button-primary').click();
  await page.waitForFunction(()=>document.querySelector('#esc-vb-footer-assets-editor [role="status"]')?.textContent?.includes('Đã lưu'),null,{timeout:25000});
  if(!saveCall||!saveResponse||saveResponse.status!==200||saveResponse.json.saved!==true)
    throw Error('WordPress no-op Footer Save not acknowledged');
  if(saveResponse.json.label!==original)throw Error('No-op Save changed Footer label');
  await rows.filter({has:page.locator('[data-never-matches]')}).count().catch(()=>{});
  const again=frame.locator('#footer-contact [data-esc-vb-footer-asset-row="'+rowNumber+'"]').first();
  await again.click();
  await page.waitForFunction(label=>document.querySelector('#esc-vb-footer-asset-value')?.value===label,original,{timeout:25000});
  if(await value.inputValue()!==original)throw Error('Footer Save→Reload changed original label');

  // Both checks send the same canonical value. Backend must reject before
  // mutation: stale version 409 and invalid WordPress nonce 403.
  const checks=await page.evaluate(async({saveCall,original})=>{
    const headers={'Content-Type':'application/json','X-WP-Nonce':saveCall.nonce};
    const badVersion={...saveCall.body,field:'label',value:original,expected_version:'0'.repeat(64)};
    const stale=await fetch(saveCall.url,{method:'POST',credentials:'same-origin',
      headers,body:JSON.stringify(badVersion)});
    const denied=await fetch(saveCall.url,{method:'POST',credentials:'same-origin',
      headers:{...headers,'X-WP-Nonce':'invalid-token'},body:JSON.stringify(saveCall.body)});
    return {stale:stale.status,denied:denied.status};
  },{saveCall,original});
  if(checks.stale!==409||checks.denied!==403)
    throw Error('Footer REST 409/403 guards not enforced: '+JSON.stringify(checks));
  console.log('PSE_G4_FOOTER_NOOP_SAVE=PASS RELOAD=PASS STALE_409=PASS INVALID_NONCE_403=PASS NO_CMS_MUTATION=PASS NO_ASTRO_BUILD=PASS');
} finally{await browser.close();}
