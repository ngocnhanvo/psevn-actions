/** Read-only audit of ESC Table image cell and WordPress native Insert Image controls. */
import {chromium} from 'playwright';
const env=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,''));
const wc=env.filter(x=>x.startsWith('WC_URL='));
if(wc.length!==1)throw Error('Missing WP origin');
const url=new URL(wc[0].slice(7).replace(/^['"]|['"]$/g,''));
if(url.protocol!=='https:'||url.username||url.password)throw Error('Invalid WP origin');
const origin=url.origin;
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:980}});
const page=await context.newPage();
try{
 await page.goto(origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const txt=await page.locator('body').innerText();
  const m=txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error('Captcha field absent');await f.fill(String(v))}
  await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
 }
 if(page.url().includes('wp-login'))throw Error('WP login unsuccessful');
 const result=await page.evaluate(async()=>{
  const r=await fetch('/wp-json/tablepress/v1/table/pse_00_vi',{credentials:'same-origin',headers:{'Cache-Control':'no-cache'}});
  if(!r.ok)throw Error('REST table '+r.status);
  const t=await r.json();
  return {id:t.id,fields:t.fields?.map(f=>f.key),items:t.items?.map((it,i)=>({
   i,type:typeof it.img,len:String(it.img||'').length,
   rawUrl:/^https?:\/\/[^<]*$/.test(String(it.img||'')),
   htmlTags:(String(it.img||'').match(/<img\b/gi)||[]).length,
   beginsHtml:/^\s*<img\b/i.test(String(it.img||'')),
   hasAlt:/\balt\s*=\s*["'][^"']+["']/i.test(String(it.img||'')),
   imgPreview:String(it.img||'').slice(0,250)
  }))};
 });
 console.log('PSE_HERO_CELL_REST_AUDIT='+JSON.stringify(result));
 await page.goto(origin+'/wp-admin/admin.php?page=tablepress&action=edit&table_id=pse_00_vi',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>Boolean(window.tp?.editor?.setValueFromCoords)&&Array.isArray(window.tp?.table?.data),null,{timeout:25000});
 const controls=await page.evaluate(()=>{
  const t=window.tp;
  return {id:t.table.id||t.table.meta?.id,rows:t.table.data.length,imageColumn:t.table.data[0]?.indexOf('img'),
   hasCallback:typeof t.callbacks.insert_image?.open_dialog==='function',
   helper:!!document.querySelector('#textarea-insert-helper'),
   hasWordPressMedia:typeof window.wp?.media?.editor?.open==='function',
   firstCellPreview:String(t.table.data[2]?.[3]||'').slice(0,250),
   lastCellPreview:String(t.table.data.at(-1)?.[3]||'').slice(0,250)};
 });
 console.log('PSE_HERO_INSERT_IMAGE_NATIVE_AUDIT='+JSON.stringify(controls));
 if(result.id!=='pse_00_vi'||result.items?.length!==11||!controls.hasCallback||!controls.hasWordPressMedia)throw Error('Invalid hero native editor');
 console.log('PSE_HERO_IMAGE_CELL_AUDIT=PASS; READ_ONLY=true');
}finally{await browser.close()}
