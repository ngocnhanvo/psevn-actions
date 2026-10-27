/** Exact one-cell PSE panorama repair using WordPress TablePress native Insert Image.
 * Ordinary push is read-only. Apply only on authorized commit. No Astro build.
 */
import {chromium} from 'playwright';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
const keys=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,'')).filter(x=>x.startsWith('WC_URL='));
if(keys.length!==1)throw Error('PSE WordPress origin missing/ambiguous');
const u=new URL(keys[0].slice(7).replace(/^['"]|['"]$/g,''));
if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))throw Error('Wrong CMS origin');
const wp=u.origin,table='pse_02_vi',name='pse-original-panorama-2026.jpg';
const event=process.env.GITHUB_EVENT_PATH?JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8')):{};
const apply=event.head_commit?.message==='cms(pse): replace homepage panorama bare URL via native Insert Image';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1500,height:940}});
const page=await context.newPage();
page.on('dialog',async d=>{if(d.type()==='confirm')await d.accept();else await d.dismiss()});
let report={mode:apply?'apply':'audit'};
try{
 const login=await page.goto(wp+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(login?.status()>=500)throw Error('WP admin '+login.status());
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const text=await page.locator('body').innerText();
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3],v=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
   const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error('WordPress challenge input missing');
   await field.fill(String(v));
  }
  await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
 }
 if(page.url().includes('wp-login'))throw Error('WordPress login failed');
 await page.goto(wp+'/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});
  if(!r.ok)throw Error('WP nonce response '+r.status);return(await r.text()).trim()
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('WordPress rest nonce invalid');
 const get=(path)=>page.evaluate(async({path,nonce})=>{
  const r=await fetch(path,{credentials:'same-origin',headers:{'X-WP-Nonce':nonce,Accept:'application/json','Cache-Control':'no-cache'}});
  return {status:r.status,data:await r.json().catch(()=>null)}
 },{path,nonce});
 const original=await get('/wp-json/tablepress/v1/table/'+table);
 const cells=original.data?.items;
 const fields=original.data?.fields?.map(f=>f.key);
 if(original.status!==200||original.data?.id!==table||cells?.length!==4||
  JSON.stringify(fields)!==JSON.stringify(['sectionTitle','sectionDescription','background','title','description','icon']))
  throw Error('PSE promise table schema/row count changed');
 const previous=String(cells[0].background||'');
 const filePath='/wp-content/uploads/2026/10/'+name;
 const existingStructured=/^\s*<img\b/i.test(previous)&&previous.includes(filePath)&&/\balt\s*=\s*["'][^"']+["']/i.test(previous);
 if(!existingStructured && previous!==wp+filePath)throw Error('PSE promise source panorama changed; refuse mutation');
 if(cells.slice(1).some(item=>item.background||item.img)||cells[0].img)throw Error('Unexpected second panorama field');
 const medias=await get('/wp-json/wp/v2/media?context=edit&search='+encodeURIComponent('pse-original-panorama-2026')+'&per_page=100');
 if(medias.status!==200||!Array.isArray(medias.data))throw Error('Cannot resolve PSE official image');
 const matches=medias.data.filter(x=>x.media_details?.file?.split('/').at(-1)===name&&x.mime_type==='image/jpeg');
 if(matches.length!==1)throw Error('Missing or duplicated verified PSE panorama media attachment');
 const media=matches[0],altText=String(media.alt_text||'').trim()||'Toàn cảnh nhà máy và hệ thống bồn chứa';
 const imageUrl=String(media.source_url||media.guid?.rendered||'');
 if(new URL(imageUrl).origin!==wp||new URL(imageUrl).pathname!==filePath)throw Error('PSE panorama WordPress attachment URL mismatch');
 report={...report,table,attachment_id:media.id,before:existingStructured?'structured':'bare_admin_url',rows:cells.length,backgroundOnly:true};
 console.log('PSE_PANORAMA_NATIVE_PREFLIGHT='+JSON.stringify(report));
 if(existingStructured){console.log('PSE_PANORAMA_NATIVE_IMAGE=ALREADY_STRUCTURED; cms_write=false');process.exit(0)}
 if(!apply){console.log('PSE_PANORAMA_NATIVE_IMAGE=READY_TO_REPAIR; cms_write=false');process.exit(0)}
 // Persist alt in Media Library if missing; do not change image binary.
 if(!String(media.alt_text||'').trim()){
  const saved=await page.evaluate(async({id,alt,nonce})=>{
   const r=await fetch('/wp-json/wp/v2/media/'+id,{method:'POST',credentials:'same-origin',
    headers:{'X-WP-Nonce':nonce,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({alt_text:alt})});
   const m=await r.json().catch(()=>({}));return {http:r.status,id:m.id,alt:m.alt_text}
  },{id:media.id,alt:altText,nonce});
  if(saved.http!==200||saved.id!==media.id||saved.alt!==altText)throw Error('Media alt update failed');
 }
 await page.goto(wp+'/wp-admin/admin.php?page=tablepress&action=edit&table_id='+table,
  {waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>Array.isArray(window.tp?.table?.data)&&
   typeof window.tp?.callbacks?.insert_image?.open_dialog==='function'&&
   typeof window.wp?.media?.editor?.open==='function',null,{timeout:25000});
 const grid=await page.evaluate(()=>({id:window.tp.table.id||window.tp.table.meta?.id,
   head:[...window.tp.table.data[0]],rows:window.tp.table.data.length,
   original:String(window.tp.table.data[2]?.[2]||'')}));
 const col=grid.head.indexOf('background'),row=2;
 if(grid.id!==table||col!==2||grid.rows!==6||grid.original!==previous)
  throw Error('ESC native editor has stale/changed panorama content');
 await page.evaluate(({col,row})=>{
  const tp=window.tp;
  tp.editor.updateSelectionFromCoords(col,row,col,row);
  tp.editor.setValueFromCoords(col,row,'');
  tp.callbacks.insert_image.open_dialog(null);
 },{col,row});
 await page.locator('.media-modal').waitFor({state:'visible',timeout:20000});
 await page.evaluate(async({id,alt})=>{
  const frame=window.wp.media.editor.get('textarea-insert-helper');
  if(!frame?.state?.()||typeof frame.state().get!=='function')throw Error('WP media modal not ready');
  const item=window.wp.media.attachment(id);
  await item.fetch();
  if(!item.get('url'))throw Error('WordPress attachment lacks URL');
  item.set('alt',alt);
  frame.state().get('selection').reset([item]);
 },{id:media.id,alt:altText});
 const button=page.locator('.media-modal .media-toolbar-primary button.media-button').last();
 await button.waitFor({state:'visible',timeout:20000});
 if(await button.isDisabled())throw Error('WP Insert Image disabled');
 await button.click();
 await page.locator('.media-modal').waitFor({state:'hidden',timeout:15000});
 await page.waitForFunction(()=>String(document.querySelector('#textarea-insert-helper')?.value||'').includes('<img'),null,{timeout:10000}).catch(()=>{});
 const result=await page.evaluate(({col,row})=>{
  const tp=window.tp,helper=document.querySelector('#textarea-insert-helper'),html=String(helper?.value||'');
  if(/^\s*<img\b/i.test(html)&&typeof tp.helpers.editor.insert_from_helper_textarea==='function'&&!String(tp.table.data[row][col]||'').includes('<img')){
   tp.helpers.selection={rows:[row],columns:[col]};
   tp.helpers.editor.insert_from_helper_textarea.call(helper);
  }
  return String(tp.table.data[row][col]||'');
 },{col,row});
 if(!/^\s*<img\b/i.test(result)||!result.includes(filePath)||
   !/\balt\s*=\s*["'][^"']+["']/i.test(result)||
   (result.match(/<img\b/gi)||[]).length!==1)
  throw Error('Native WordPress Insert Image produced unexpected data');
 await page.getByRole('button',{name:'Save Changes',exact:true}).first().click();
 let saved=false;
 for(let i=0;i<15;i++){
  await page.waitForTimeout(800);
  const q=await get('/wp-json/tablepress/v1/table/'+table);
  if(q.status===200&&q.data?.items?.[0]?.background===result&&
    q.data.items.length===cells.length&&
    JSON.stringify(q.data.items.slice(1))===JSON.stringify(cells.slice(1))&&
    Object.keys(cells[0]).every(k=>k==='background'||q.data.items[0][k]===cells[0][k])){
    saved=true;break
  }
 }
 if(!saved)throw Error('Native ESC Table save/readback mismatch or another row changed');
 report={...report,result:'PASS',after:'native_wp_image_with_alt',rest_readback:true,no_astro_code_change:true};
 await mkdir('artifacts/pse-panorama-native-repair',{recursive:true});
 await writeFile('artifacts/pse-panorama-native-repair/result.json',JSON.stringify(report,null,2)+'\n');
 console.log('PSE_PANORAMA_NATIVE_IMAGE='+JSON.stringify(report));
}finally{await browser.close()}
