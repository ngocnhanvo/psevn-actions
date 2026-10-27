import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
const varlist=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim()).filter(s=>s.startsWith('WC_URL='));
if(varlist.length!==1)throw Error('Missing WP url');
const site=new URL(varlist[0].slice(7).replace(/^['"]|['"]$/g,''));
if(site.protocol!=='https:'||site.username||site.password||site.search||site.hash||
 site.port||!['','/'].includes(site.pathname))throw Error('Bad WP origin');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
try{
 await page.goto(site.origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const t=await page.locator('body').innerText();
  const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3],v=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error('Arithmetic input missing');await f.fill(String(v));
  }
  await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
 }
 if(page.url().includes('wp-login'))throw Error('WP login failure');
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});
  if(!r.ok)throw Error('No nonce');return (await r.text()).trim();
 });
 const endpoints=[
  '/wp-json/astro/v1/get-product-categories',
  '/wp-json/wp/v2/product_cat?per_page=100&context=edit&_fields=id,slug,name,description,yoast_head_json,count',
  '/wp-json/wp/v2/pages?slug=so-do-to-chuc&context=edit&_fields=id,slug,title,content,acf,yoast_head_json,pse_seo_description'
 ];
 const data=[];
 for(const endpoint of endpoints){
  const result=await page.evaluate(async({endpoint,nonce})=>{
   const r=await fetch(endpoint,{headers:{'X-WP-Nonce':nonce},credentials:'same-origin'});
   return{http:r.status,data:await r.json().catch(()=>null)};
  },{endpoint,nonce});
  data.push({endpoint,http:result.http,
   result:Array.isArray(result.data)?result.data.map(x=>({
    id:x.id,slug:x.slug,name:x.name,description:String(x.description||'').slice(0,450),
    seoDescription:x.seoDescription,seoTitle:x.seoTitle,
    yoastMeta:String(x.yoast_head_json?.description||'').slice(0,200),
    pageSeo:x.pse_seo_description,acfKey:x.acf?.key
   })):result.data&&typeof result.data==='object'?{
    code:result.data.code,message:String(result.data.message||'').slice(0,150)
   }:null});
 }
 // Examine one real category editor to identify the native Yoast metadata field.
 const terms=data[0]?.result;
 const first=Array.isArray(terms)?terms.find(t=>t.slug==='dam-phu-my')||terms[0]:null;
 if(first?.id){
  const response=await page.goto(site.origin+'/wp-admin/term.php?taxonomy=product_cat&tag_ID='+
   Number(first.id)+'&post_type=product',{waitUntil:'domcontentloaded',timeout:60000});
  const form=await page.evaluate(()=>({
   path:location.pathname,httpMetaTitle:document.title.slice(0,100),
   fields:[...document.querySelectorAll('input,textarea')].filter(e=>
    /seo|yoast|description|meta|tag_ID|taxonomy/i.test(e.id+' '+e.name)
   ).slice(0,45).map(x=>({id:x.id,name:x.name,type:x.type,value:x.type==='hidden'?'hidden':String(x.value||'').slice(0,220)})),
   hasEditForm:!!document.getElementById('edittag'),
   hasYoastMetabox:!!document.querySelector('[id*="yoast"],[id*="wpseo"]'),
  }));
  data.push({editorFor:first.slug,http:response?.status(),form});
 }
 mkdirSync('artifacts/pse-yoast-term-seo',{recursive:true});
 writeFileSync('artifacts/pse-yoast-term-seo/snapshot.json',JSON.stringify(data,null,2)+'\n');
 console.log('PSE_TERM_SEO_READONLY='+JSON.stringify(data).slice(0,17000));
}finally{await browser.close()}
