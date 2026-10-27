/** Read-only discovery of native Yoast term/Page SEO fields. No content writes. */
import {chromium} from 'playwright';
const line=String(process.env.ENV_FILE||'').split(/\r?\n/).find(x=>x.trim().startsWith('WC_URL='));
if(!line)throw Error('No WP origin');
const v=line.trim().slice(7).replace(/^['"]|['"]$/g,'');
const u=new URL(v);
if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port||!['','/'].includes(u.pathname))throw Error('Invalid origin');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1400,height:900}});
try{
 await page.goto(u.origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const txt=await page.locator('body').innerText();
  const m=txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=Number(m[1]),b=Number(m[3]);const answer=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error('Arithmetic input missing');await f.fill(String(answer));
  }
  await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
 }
 if(page.url().includes('wp-login'))throw Error('Login failed');
 for(const p of [
  '/wp-admin/term.php?taxonomy=product_cat&tag_ID=1763&post_type=product',
  '/wp-admin/post.php?post=79300&action=edit'
 ]){
  const response=await page.goto(u.origin+p,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(2200);
  const found=await page.evaluate(()=>{
   const nodes=[...document.querySelectorAll('textarea,input:not([type=hidden]),[contenteditable=true],button')];
   const fields=nodes.filter(e=>/yoast|wpseo|seo|meta.description|google.preview|snippet/i.test(
    [e.id,e.name,e.getAttribute('aria-label'),e.getAttribute('placeholder'),e.closest('[id]')?.id,e.closest('[class]')?.className].join(' ').slice(0,450)
   )).map(e=>({tag:e.tagName,id:e.id,name:e.name,role:e.getAttribute('role'),
    aria:e.getAttribute('aria-label'),placeholder:e.getAttribute('placeholder'),
    value:String(e.value||e.textContent||'').slice(0,150),
    outer:e.outerHTML.slice(0,300)}));
   const form=document.getElementById('edittag')||document.getElementById('post');
   return {title:document.title.slice(0,120),form:!!form,fields:fields.slice(0,50),
    yoastEditor:document.querySelector('#wpseo_meta,[id*="wpseo"],.yoast')?.outerHTML.slice(0,2000),
    buttons:[...document.querySelectorAll('button')].filter(e=>/snippet|description|seo/i.test(e.textContent||'')).slice(0,9).map(x=>({text:x.textContent.trim().slice(0,80),html:x.outerHTML.slice(0,280)}))};
  });
  console.log('PSE_YOAST_EDITOR_READONLY='+JSON.stringify({path:p,http:response?.status(),found}).slice(0,12000));
 }
}finally{await browser.close()}
