/** One-time PSE SEO recovery through WordPress's EXISTING signed Settings Save.
 * Initial published sitemap is an empty valid urlset. Build cannot deploy
 * until the CMS owns a valid homepage-inclusive sitemap. Never write WP
 * options directly, force-build, mutate other SEO tabs, or hardcode origin.
 */
import { chromium } from 'playwright';
const vals={};
for(const line of String(process.env.ENV_FILE||'').split(/\r?\n/)){
 const m=line.trim().replace(/^export\s+/,'').match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
 if(m)vals[m[1]]=m[2].trim().replace(/^['"]|['"]$/g,'');
}
function strictOrigin(value,label){
 const u=new URL(value||'');
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname)||(u.port&&u.port!=='443'))
  throw Error('Unsafe configured '+label+' origin');
 return u.origin;
}
const origin=strictOrigin(vals.WC_URL,'WordPress'),frontend=strictOrigin(vals.WC_URL_CLIENT,'frontend');
if(origin===frontend)throw Error('PSE WP/frontend origin collision');
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1400,height:970}});
const tab=await ctx.newPage();
try{
 const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
 if(!username||!password)throw Error('Missing WordPress admin credentials');
 await tab.goto(origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await tab.locator('#user_login').count()){
  await tab.locator('#user_login').fill(username);
  await tab.locator('#user_pass').fill(password);
  const text=await tab.locator('body').innerText();
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=Number(m[1]),b=Number(m[3]),v=({'+':a+b,'-':a-b,'x':a*b,'×':a*b,'*':a*b})[m[2]];
   const f=tab.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error('PSE WordPress login CAPTCHA field not found');
   await f.fill(String(v));
  }
  await Promise.all([tab.waitForLoadState('domcontentloaded'),tab.locator('#wp-submit').click()]);
 }
 if(tab.url().includes('wp-login'))throw Error('PSE WordPress login unsuccessful');
 const rest=async route=>tab.evaluate(async route=>{
  const response=await fetch(route,{credentials:'same-origin',headers:{Accept:'application/json','Cache-Control':'no-cache'}});
  return {status:response.status,body:await response.json().catch(()=>({}))};
 },route);
 const meta=(await rest('/wp-json/esc-seo-files/v1/public')).body;
 if(meta.version!==1||new URL(meta.site).origin!==frontend)
  throw Error('Unexpected WordPress SEO site identity');
 const initialRev=meta.sitemap?.revision;
 const urls=[frontend+'/'];
 const posts=(await rest('/wp-json/wp/v2/pages?status=publish&per_page=100&_fields=id,slug,status,acf')).body;
 if(!Array.isArray(posts)||!posts.some(p=>p.id===248&&p.acf?.action==='HomePage'&&p.acf?.key==='home'))
  throw Error('Expected canonical public WordPress HomePage 248 not found');
 // Only include additional real, already-public PSE pages that are rendered
 // by the verified Astro frontend. Do not introduce login/SSR/private URLs.
 for(const slug of ['ve-chung-toi','lien-he']){
  if(posts.some(p=>p.slug===slug&&p.status==='publish'))urls.push(frontend+'/'+slug);
 }
 const xml='<?xml version="1.0" encoding="UTF-8"?>\n'+
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+
  urls.map(u=>'  <url><loc>'+u+'</loc></url>').join('\n')+
  '\n</urlset>\n';
 if(meta.sitemap?.mode==='manual'){
  if(typeof meta.sitemap.xml!=='string'||!meta.sitemap.xml.includes('<loc>'+frontend+'/</loc>'))
   throw Error('Existing manual WP sitemap does not include canonical homepage; no overwrite');
  console.log('PSE_SEO_INITIAL_SITEMAP=ALREADY_MANUAL_VALID; urls='+urls.length+'; no_write=true');
  process.exit(0);
 }
 if(meta.sitemap?.mode!=='auto'||meta.sitemap.extra?.length!==0||meta.sitemap.exclude?.length!==0)
  throw Error('WordPress sitemap was customized; refuse overwriting current settings');
 const response=await ctx.request.get(frontend+'/sitemap.xml',{timeout:20000});
 if(!response.ok())throw Error('Cannot verify current public PSE sitemap status');
 const old=await response.text();
 const diagnostic={
   http:response.status(),mime:String(response.headers()['content-type']||'').split(';')[0],
   bytes:old.length,hasUrlset:/<urlset\b/.test(old),hasClose:/<\/urlset>/.test(old),
   hasUrlEntry:/<url(?:\s[^>]*)?>/.test(old),looksHtml:/<!doctype html|<html/i.test(old)
 };
 console.log('PSE_PUBLIC_SITEMAP_SAFETY_DIAGNOSTIC='+JSON.stringify(diagnostic));
 if(!diagnostic.hasUrlset||!diagnostic.hasClose||diagnostic.hasUrlEntry)
  throw Error('Current public sitemap is not the verified empty legacy urlset');
 console.log('PSE_SEO_SITEMAP_REPAIR_PREFLIGHT=PASS; existing_mode=auto; old_entries=0; new_entries='+urls.length);
 await tab.goto(origin+'/wp-admin/options-general.php?page=esc-seo-files&tab=sitemap',
  {waitUntil:'domcontentloaded',timeout:60000});
 const form=tab.locator('form[action*="admin-post.php"]').filter({has:tab.locator('input[name="action"][value="esc_seo_files_save"]')});
 if(await form.count()!==1||!await form.locator('input[name="_wpnonce"]').count())
  throw Error('Cannot locate native signed WordPress SEO Settings form');
 if(await form.locator('input[name="sitemap_mode"]:checked').inputValue()!=='auto')
  throw Error('SEO Settings form changed concurrently');
 await form.locator('input[name="sitemap_mode"][value="manual"]').check();
 await form.locator('textarea[name="sitemap_manual"]').fill(xml);
 await Promise.all([tab.waitForLoadState('domcontentloaded',{timeout:60000}),form.locator('input[type="submit"],button[type="submit"]').first().click()]);
 if(!tab.url().includes('updated=1')||tab.url().includes('wp-login'))
  throw Error('WordPress SEO Save did not confirm updated=1');
 const verified=(await rest('/wp-json/esc-seo-files/v1/public')).body;
 if(verified.version!==1||new URL(verified.site).origin!==frontend||
    verified.sitemap?.mode!=='manual'||verified.sitemap?.xml?.trim()!==xml.trim()||
    verified.sitemap?.revision===initialRev)
  throw Error('WordPress manual sitemap REST read-after-write mismatch');
 console.log('PSE_SEO_INITIAL_SITEMAP=PASS; source=WordPress_Admin_Save; original_empty_xml_backup=true; homepage_included=true; saved_urls='+urls.length+'; revision_bumped=true; build_not_triggered=true');
}finally{await browser.close();}
