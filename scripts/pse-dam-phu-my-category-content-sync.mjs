/**
 * Scoped PSE category content migration. Exact Joomla source -> existing WP term 1763.
 * No Astro data write, no product changes, no new records. DB backup is a required
 * preceding job step, not an optional failure-tolerant command.
 */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const SOURCE='https://pse.vn/hoat-dong-kinh-doanh/san-pham/dam-phu-my.html';
const WP='https://admin-pse.webnvn.com';
const CATEGORY_ID=1763;
const result={schema:'pse-dam-phu-my-category-migration-v1',source:SOURCE,
 categoryId:CATEGORY_ID,changed:false,status:'STARTED',checks:{},errors:[]};
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:860}});
try {
 const sourcePage=await context.newPage();
 const response=await sourcePage.goto(SOURCE,{waitUntil:'domcontentloaded',timeout:60000});
 if(response?.status()!==200)throw Error('Original Joomla article not HTTP 200');
 const source=await sourcePage.evaluate(()=>{
  const article=document.querySelector('.item-page [itemprop="articleBody"]');
  if(!article)throw Error('Joomla articleBody missing');
  const tables=Array.from(article.querySelectorAll('table'));
  if(tables.length!==12)throw Error('Source table count changed: '+tables.length);
  if(tables.slice(0,2).reduce((n,t)=>n+t.querySelectorAll('img').length,0)!==4)
    throw Error('Original first two product tables no longer contain exactly four images');
  let ancestor=tables[1];
  while(ancestor.parentElement && ancestor.parentElement!==article)ancestor=ancestor.parentElement;
  if(ancestor.parentElement!==article)throw Error('Source second product table not a descendant of articleBody');
  const children=Array.from(article.children), index=children.indexOf(ancestor);
  if(index<1)throw Error('Cannot locate second product table boundary');
  const rest=children.slice(index+1);
  const html=rest.map(node=>node.outerHTML).join('\n');
  const container=document.createElement('div');container.innerHTML=html;
  const text=(container.textContent||'').replace(/\s+/g,' ').trim();
  const marker=['QUY CÁCH','BÓN PHÂN','NITƠ'];
  const missing=marker.filter(word=>!text.toLocaleUpperCase('vi').includes(word));
  return {html,tableCount:container.querySelectorAll('table').length,
   imageCount:container.querySelectorAll('img').length,textLength:text.length,
   missingMarkers:missing,tail:text.slice(-140),childCount:rest.length};
 });
 if(source.tableCount!==10||source.imageCount!==0||source.textLength<2500||source.missingMarkers.length)
  throw Error('Original technical and usage information extraction failed: '+JSON.stringify({
   tableCount:source.tableCount,imageCount:source.imageCount,textLength:source.textLength,
   missingMarkers:source.missingMarkers,childCount:source.childCount}));
 result.sourceTableCount=source.tableCount;
 result.sourceTextLength=source.textLength;
 result.sourceHash=createHash('sha256').update(source.html).digest('hex');
 result.checks.sourceExtraction='PASS';
 await sourcePage.close();

 const page=await context.newPage();
 await page.goto(WP+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const loginText=await page.locator('#loginform').innerText();
  const match=loginText.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(match){
   const a=Number(match[1]),b=Number(match[3]);
   const v=match[2]==='+'?a+b:match[2]==='-'?a-b:a*b;
   const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error('WP authentication challenge field unavailable');
   await field.fill(String(v));
  }
  await page.locator('#wp-submit').click();
 }
 await page.goto(WP+'/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
 if(!await page.locator('#adminmenu').count())throw Error('Admin session unavailable');
 const nonce=await page.evaluate(async()=>window.wpApiSettings?.nonce||
  await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(r=>r.text()));
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('WP REST nonce unavailable');
 const api=(path,method='GET',body)=>page.evaluate(async({path,method,body,nonce})=>{
  const response=await fetch(path,{method,credentials:'same-origin',
   headers:{'X-WP-Nonce':nonce,'Accept':'application/json',
    ...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return {http:response.status,data:await response.json().catch(()=>null)};
 },{path,method,body,nonce});
 const uri='/wp-json/wp/v2/product_cat/'+CATEGORY_ID;
 const fields='?context=edit&_fields=id,slug,parent,count,name,description,meta';
 const key='_vcs_category_rich_description';
 const before=await api(uri+fields);
 if(before.http!==200||before.data?.id!==CATEGORY_ID||before.data.slug!=='dam-phu-my'||
  before.data.parent!==1760||before.data.count!==4)throw Error('Unexpected WordPress product_cat identity or count');
 if(!before.data.meta||typeof before.data.meta!=='object'||
  !Object.prototype.hasOwnProperty.call(before.data.meta,key))
  throw Error('Registered native WordPress rich category meta is not deployed');
 const current=String(before.data.description||'').trim();
 const existingMeta=String(before.data.meta[key]||'');
 result.checks.targetIdentity='PASS';
 const parse=(str)=>({tableCount:(str.match(/<table\b/gi)||[]).length,
  rawLength:str.length,normalizedText:str.replace(/<[^>]*>/g,' ').replace(/&[^;]+;/g,' ').replace(/\s+/g,' ').trim().length});
 // The previous WP taxonomy-description attempt was sanitized to plain text.
 // Never clear another editor's content; recognize only the exact observed record.
 const flattened=current&&parse(current).tableCount===0&&Math.abs(current.length-7685)<=10&&
   parse(current).normalizedText===5130&&current.includes('QUY CÁCH')&&current.includes('BÓN PHÂN');
 if(current&&!flattened)
  throw Error('Existing WordPress category description changed independently; refusing cleanup');
 if(existingMeta&&parse(existingMeta).tableCount!==10)
  throw Error('Existing rich category editor content changed independently');
 if(!existingMeta){
  const updated=await api(uri,'POST',{meta:{[key]:source.html}});
  if(updated.http!==200||updated.data?.id!==CATEGORY_ID)
   throw Error('WP rich category term-meta update failed HTTP '+updated.http+
    ' code '+String(updated.data?.code||'unknown'));
  result.changed=true;
 }
 const richReadback=await api(uri+fields);
 const rich=String(richReadback.data?.meta?.[key]||'');
 const stats=parse(rich);
 if(richReadback.http!==200||stats.tableCount!==10||stats.normalizedText<2500||
  !rich.includes('BÓN PHÂN')||!rich.includes('QUY CÁCH'))
  throw Error('WordPress rich editor HTML readback failed '+JSON.stringify(stats));
 result.checks.richHtmlTermMeta='PASS';
 if(flattened){
  const cleaned=await api(uri,'POST',{description:''});
  if(cleaned.http!==200||cleaned.data?.id!==CATEGORY_ID)
   throw Error('Could not clear only previously flattened taxonomy description');
  result.changed=true;
 }
 const final=await api(uri+fields);
 if(final.http!==200||final.data?.id!==CATEGORY_ID||final.data.slug!=='dam-phu-my'||
  final.data.parent!==1760||final.data.count!==4||
  String(final.data.description||'').trim()!==''||
  parse(String(final.data.meta?.[key]||'')).tableCount!==10)
  throw Error('Category final CMS readback not complete');
 const pub=await api('/wp-json/astro/v1/get-product-categories');
 const cat=Array.isArray(pub.data)?pub.data.find(x=>x?.id===CATEGORY_ID&&x.slug==='dam-phu-my'):null;
 if(pub.http!==200||!cat||parse(String(cat.description||'')).tableCount!==10)
  throw Error('Public WordPress category API does not expose all ten rich tables');
 result.saved=stats;
 result.checks.wordPressReadback='PASS';
 result.checks.publicApi='PASS';
 result.status='PASS';
 console.log('PSE_DAM_CATEGORY_SYNC='+JSON.stringify(result));
} catch(error){
 result.errors.push(String(error).slice(0,650));
 result.status='FAIL';
 process.exitCode=1;
 console.error('PSE_DAM_CATEGORY_SYNC='+JSON.stringify(result));
} finally {
 await mkdir('artifacts/pse-dam-phu-my-sync',{recursive:true});
 await writeFile('artifacts/pse-dam-phu-my-sync/report.json',JSON.stringify(result,null,2)+'\n');
 await browser.close();
}
