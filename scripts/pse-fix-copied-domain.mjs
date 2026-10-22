import { chromium } from 'playwright';

const user = process.env.WP_ADMIN_USERNAME || '';
const password = process.env.WP_ADMIN_PASSWORD || '';
const config = process.env.ENV_FILE || '';
function envUrl(key) {
 const matches=config.split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/, ''))
   .filter(s=>s.startsWith(key+'='));
 if(matches.length!==1)throw Error('Exactly one '+key+' origin required');
 const value=matches[0].split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g,'');
 const url=new URL(value);
 if(url.protocol!=='https:' || !url.hostname || url.username || url.password ||
    !['','/'].includes(url.pathname) || url.search || url.hash || url.port)
   throw Error('Invalid HTTPS origin for '+key);
 return url;
}
const origin=envUrl('WC_URL').origin;
const target=envUrl('WC_URL_CLIENT').hostname;
// A migration is potentially destructive. Require its OLD hostname explicitly;
// if unset, the script can verify the current domain but cannot edit it.
const oldHost=(process.env.PSE_PREVIOUS_FRONTEND_HOST || '').trim().toLowerCase();
if(oldHost && (!/^[a-z0-9.-]+$/.test(oldHost) || oldHost.startsWith('.') ||
               oldHost.endsWith('.') || oldHost.includes('..') || oldHost===target))
  throw Error('Invalid previous frontend host');
if(!user||!password)throw Error('PSE WordPress credentials are missing');
const browser=await chromium.launch();
try {
 const page=await browser.newPage();
 await page.goto(origin+'/wp-login.php',{waitUntil:'domcontentloaded',timeout:45000});
 await page.locator('#user_login').fill(user);
 await page.locator('#user_pass').fill(password);
 const body=await page.locator('body').innerText();
 const arithmetic=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
 if(arithmetic){
    const x=+arithmetic[1], y=+arithmetic[3];
    const sum=arithmetic[2]==='+'?x+y:arithmetic[2]==='-'?x-y:x*y;
    const f=page.locator('#loginform input[name*="captcha" i], #loginform input[name*="math" i], #loginform input[type="number"]').first();
    if(await f.count())await f.fill(String(sum));
 }
 await page.locator('#wp-submit').click();
 await page.goto(origin+'/wp-admin/admin.php?page=vcs-production-site',{waitUntil:'domcontentloaded',timeout:45000});
 const frame=page.locator('.wrap iframe[src]').first();
 if(!(await frame.count()))throw Error('Production domain info missing in WordPress PSE');
 const current=new URL(await frame.getAttribute('src')).hostname;
 console.log('PSE_WP_DOMAIN_CURRENT='+current+' PSE_WP_DOMAIN_EXPECTED='+target);
 if(current===target){console.log('PSE_WP_DOMAIN=ALREADY_CORRECT');process.exitCode=0;}
 else {
   if(!oldHost || current!==oldHost)throw Error('Previous frontend host not verified; refusing to modify WordPress settings');
   await page.goto(origin+'/wp-admin/edit.php?post_type=thong-tin-chung',{
     waitUntil:'domcontentloaded',timeout:45000
   });
   const candidates=page.locator('#the-list tr.type-thong-tin-chung a.row-title');
   const n=await candidates.count();
   if(n!==1)throw Error('Expected exactly one PSE general information record, found '+n);
   const href=await candidates.first().getAttribute('href');
   if(!href)throw Error('Missing WordPress General Info edit link');
   const absolute=new URL(href,origin);
   if(absolute.origin!==origin || absolute.pathname!=='/wp-admin/post.php')
     throw Error('Refusing off-origin or unexpected WordPress edit URL');
   await page.goto(absolute.href,{waitUntil:'domcontentloaded',timeout:45000});
   const field=page.locator('.acf-field[data-name="domain"] input[type="text"]').first();
   if(!(await field.count()))throw Error('Cannot find ACF domain field on PSE general info');
   const oldValue=(await field.inputValue()).trim().replace(/^https?:\/\//,'').replace(/\/$/,'');
   if(oldValue!==oldHost)throw Error('ACF field changed during check; refusing write');
   await field.fill(target);
   const save=page.locator('#publish').first();
   if(!(await save.count()))throw Error('No WordPress Publish/Update button');
   await Promise.all([
     page.waitForNavigation({waitUntil:'domcontentloaded',timeout:45000}),
     save.click(),
   ]);
   // WordPress classic-editor Save is a full POST navigation; verify its
   // persisted ACF field before opening any other page.
   await page.goto(absolute.href,{waitUntil:'domcontentloaded',timeout:45000});
   const stored=page.locator('.acf-field[data-name="domain"] input[type="text"]').first();
   if(!(await stored.count()) || (await stored.inputValue()).trim()!==target)
      throw Error('Saved WordPress ACF domain failed immediate readback');
   console.log('PSE_WP_ACF_DOMAIN_SAVED=PASS');
   await page.goto(origin+'/wp-admin/admin.php?page=vcs-production-site',{
     waitUntil:'domcontentloaded',timeout:45000
   });
   const checked=page.locator('.wrap iframe[src]').first();
   if(!(await checked.count()) ||
      new URL(await checked.getAttribute('src')).hostname!==target)
      throw Error('WordPress General Info frontend domain did not persist');
   console.log('PSE_WP_DOMAIN_UPDATED=PASS old_source_domain_replaced');
 }
 console.log('PSE_WP_DOMAIN_MATCH=PASS');
}finally{await browser.close();}
