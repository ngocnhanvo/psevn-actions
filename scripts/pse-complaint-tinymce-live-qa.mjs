/** Read-only PSE Classic Editor TinyMCE mode-switch QA; never saves post content. */
import { chromium } from 'playwright';

const xs=String(process.env.ENV_FILE||'').split(/\r?\n/)
  .map(s=>s.trim().replace(/^export\s+/,'')).filter(s=>s.startsWith('WC_URL='));
if(xs.length!==1)throw Error('Expected exactly one configured WordPress origin');
const wp=new URL(xs[0].slice(7).replace(/^['"]|['"]$/g,''));
if(wp.protocol!=='https:'||!wp.hostname||wp.username||wp.password||wp.search||
   wp.hash||!['','/'].includes(wp.pathname))throw Error('Unexpected WordPress origin');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1480,height:950}});
const problems=[];
page.on('pageerror',error=>{
  const message=String(error.message||'').slice(0,160);
  if(/tinyMCEPreInit|mceInit|Invalid or unexpected token|Unexpected/i.test(message))
    problems.push({name:error.name,message});
});
try{
  await page.goto(wp.origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
  if(await page.locator('#user_login').count()){
    await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
    await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
    const t=await page.locator('body').innerText();
    const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if(m){
      const a=+m[1],b=+m[3],value=({'+':a+b,'-':a-b,'x':a*b,'×':a*b,'*':a*b})[m[2]];
      const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if(!await f.count())throw Error('CAPTCHA challenge unavailable to the QA');
      await f.fill(String(value));
    }
    await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
  }
  if(page.url().includes('wp-login'))throw Error('WordPress admin login rejected');
  await page.goto(wp.origin+'/wp-admin/post.php?post=81087&action=edit',
    {waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('#content-tmce').waitFor({state:'visible',timeout:25000});
  const preInit=await page.evaluate(()=>typeof window.tinyMCEPreInit!=='undefined'&&
    Boolean(window.tinyMCEPreInit?.mceInit?.content));
  if(!preInit)throw Error('TINYMCE_PREINIT_MISSING');
  await page.locator('#content-tmce').click();
  await page.locator('#content_ifr').waitFor({state:'visible',timeout:30000});
  await page.waitForFunction(()=>Boolean(window.tinymce?.get('content')?.initialized),{timeout:30000});
  const active=await page.evaluate(()=>{
    const editor=window.tinymce?.get('content');
    return Boolean(editor?.initialized&&editor?.getBody()?.isContentEditable);
  });
  if(!active)throw Error('VISUAL_EDITOR_NOT_INITIALIZED');
  await page.locator('#content-html').click();
  await page.locator('#content').waitFor({state:'visible',timeout:15000});
  if(problems.length)throw Error('TINYMCE_BROWSER_ERRORS='+JSON.stringify(problems));
  console.log('PSE_COMPLAINT_TINYMCE_LIVE=PASS page=81087 tinyMCEPreInit=PASS visual_switch=PASS html_switch=PASS read_only=true no_content_save=true');
} finally {
  await browser.close();
}
