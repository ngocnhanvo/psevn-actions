import { chromium } from 'playwright';

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
const wpAddress = new URL(parseEnv('WC_URL'));
if (wpAddress.protocol !== 'https:' || !wpAddress.hostname ||
    wpAddress.username || wpAddress.password || !['', '/'].includes(wpAddress.pathname) ||
    wpAddress.search || wpAddress.hash || wpAddress.port) {
  throw Error('Invalid HTTPS WordPress origin in ENV_FILE');
}
const origin = wpAddress.origin;
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
 await page.goto(origin+'/wp-admin/edit.php?post_type=thong-tin-chung',{
   waitUntil:'domcontentloaded',timeout:45000
 });
 const links=page.locator('#the-list tr.type-thong-tin-chung a.row-title');
 console.log('PSE_GENERAL_INFO_RECORD_COUNT='+await links.count());
 if(await links.count()===1){
   const href=await links.first().getAttribute('href');
   if(href){
     const u=new URL(href,origin);
     if(u.origin===origin && u.pathname==='/wp-admin/post.php'){
       await page.goto(u.href,{waitUntil:'domcontentloaded',timeout:45000});
       const field=page.locator('.acf-field[data-name="domain"] input[type="text"]').first();
       if(await field.count()){
         const editor=(await field.inputValue()).trim().replace(/^https?:\/\//,'').replace(/\/$/,'');
         console.log('PSE_GENERAL_INFO_EDITOR_DOMAIN='+editor);
         console.log('PSE_EDITOR_MATCH_ENV='+String(editor===expected).toUpperCase());
       }else{console.log('PSE_GENERAL_INFO_EDITOR_DOMAIN=NOT_FOUND');}
     }
   }
 }
 if(actual!==expected)throw Error('PSE WordPress general-info domain differs from Actions ENV_FILE WC_URL_CLIENT');
 console.log('PSE_WORDPRESS_FRONTEND_CONFIG=PASS');
}finally{await browser.close();}
