import { chromium } from 'playwright';

const origin = 'https://admin-pse.webnvn.com';
const u = process.env.WP_ADMIN_USERNAME || '';
const p = process.env.WP_ADMIN_PASSWORD || '';
if (!u || !p) throw Error('PSE WordPress login secrets not available');
const config = process.env.ENV_FILE || '';
function parseEnv(key) {
 const xs=config.split(/\r?\n/).map(v=>v.trim().replace(/^export\s+/,''))
   .filter(v=>v.startsWith(key+'='));
 if(xs.length!==1) throw Error('Expected one '+key+' value');
 return xs[0].split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g,'');
}
const expected=new URL(parseEnv('WC_URL_CLIENT')).hostname;
const browser=await chromium.launch();
try{
 const page=await browser.newPage();
 await page.goto(origin+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
 await page.locator('#user_login').fill(u);
 await page.locator('#user_pass').fill(p);
 const body=await page.locator('body').innerText();
 const math=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
 if(math){
  const a=Number(math[1]),b=Number(math[3]);
  const answer=math[2]=='+'?a+b:math[2]=='-'?a-b:a*b;
  const cap=page.locator('#loginform input[name*="captcha" i], #loginform input[name*="math" i], #loginform input[type="number"]').first();
  if(await cap.count())await cap.fill(String(answer));
 }
 await page.locator('#wp-submit').click();
 await page.goto(origin+'/wp-admin/admin.php?page=vcs-production-site',{waitUntil:'domcontentloaded',timeout:45000});
 if(!page.url().startsWith(origin+'/wp-admin/admin.php?'))throw Error('WP admin session unavailable');
 const frm=page.locator('.wrap iframe[src]').first();
 if(!(await frm.count())){
   console.log('PSE_WORDPRESS_PUBLISHED_DOMAIN=MISSING');
   console.log('PSE_ENV_FRONTEND_DOMAIN='+expected);
   throw Error('WordPress production iframe missing; field domain may be empty or page inaccessible');
 }
 const src=await frm.getAttribute('src');
 const actual=new URL(src).hostname;
 console.log('PSE_WORDPRESS_PUBLISHED_DOMAIN='+actual);
 console.log('PSE_ENV_FRONTEND_DOMAIN='+expected);
 console.log('PSE_FRONTEND_DOMAIN_MATCH='+ (actual===expected?'PASS':'MISMATCH'));
 if(actual!==expected)throw Error('PSE WordPress general-info domain differs from Actions ENV_FILE WC_URL_CLIENT');
 console.log('PSE_WORDPRESS_FRONTEND_CONFIG=PASS');
}finally{await browser.close();}
