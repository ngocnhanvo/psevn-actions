/** Replace PSE hero bare URL cells via ESC Table's actual Insert Image -> WP Media flow. */
import {chromium} from 'playwright';
import {writeFile,mkdir} from 'node:fs/promises';
const lines=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,''));
const matches=lines.filter(x=>x.startsWith('WC_URL='));
if(matches.length!==1)throw Error('WP CMS origin missing/ambiguous');
const u=new URL(matches[0].slice('WC_URL='.length).trim().replace(/^['"]|['"]$/g,''));
if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))throw Error('Invalid CMS origin');
const origin=u.origin;
const tableId='pse_00_vi';
const names=['pse-original-hero-2026.png',...Array.from({length:10},(_,i)=>'pse-legacy-home-slider-'+String(i+2).padStart(2,'0')+'.webp')];
const description=(i)=>i===0
  ? 'Các sản phẩm phân bón Phú Mỹ được PVFCCo-PSE phân phối tại Đông Nam Bộ'
  : 'Hình ảnh giới thiệu hoạt động và sản phẩm phân bón PVFCCo-PSE trên banner trang chủ '+(i+1);
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1500,height:950}});
const page=await context.newPage();
page.on('dialog',async d=>{try{if(d.type()==='confirm')await d.accept();else await d.dismiss()}catch(e){if(!String(e).includes('already handled'))throw e}});
try{
 await page.goto(origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const body=await page.locator('body').innerText();
  const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3],ans=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error('Math challenge unavailable');await f.fill(String(ans))
  }
  await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
 }
 if(page.url().includes('wp-login'))throw Error('WordPress authentication rejected');
 await page.goto(origin+'/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
 const nonce=await page.evaluate(()=>window.wpApiSettings?.nonce||'');
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('WP nonce unavailable');
 const getTable=()=>page.evaluate(async({id,nonce})=>{
  const r=await fetch('/wp-json/tablepress/v1/table/'+id,{credentials:'same-origin',headers:{'X-WP-Nonce':nonce,'Cache-Control':'no-cache'}});
  return {status:r.status,data:await r.json().catch(()=>({}))};
 },{id:tableId,nonce});
 const before=await getTable();
 if(before.status!==200||before.data.id!==tableId||before.data.items?.length!==11||
 JSON.stringify(before.data.fields?.map(x=>x.key))!==JSON.stringify(['label','title','description','img','href','cta']))
  throw Error('PSE hero source table schema drift');
 const raw=before.data.items.map(x=>String(x.img||''));
 const list=await page.evaluate(async({nonce})=>{
  const q=await fetch('/wp-json/wp/v2/media?search=pse-&per_page=100&context=edit',{
    credentials:'same-origin',headers:{'X-WP-Nonce':nonce,'Cache-Control':'no-cache'}});
  return {status:q.status,data:await q.json().catch(()=>[])};
 },{nonce});
 if(list.status!==200||!Array.isArray(list.data))throw Error('WP image inventory unavailable');
 const identities=names.map(name=>{
  const found=list.data.filter(x=>x.media_details?.file?.split('/').at(-1)===name);
  if(found.length!==1)throw Error('Missing or duplicate WordPress image '+name);
  return {name,id:found[0].id,alt:description(names.indexOf(name))};
 });
 // Confirm each source image is exactly one WordPress-hosted media URL or already a single correct image HTML.
 for(let i=0;i<11;i++){
  const v=raw[i],m=v.match(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)||[];
  const expected='/'+names[i];
  const good=(v.startsWith(origin+'/wp-content/uploads/')&&v.endsWith(expected))||
    (m.length===1&&!v.replace(m[0],'').trim()&&m[0].includes(expected)&&/\balt=["'][^"']+["']/i.test(m[0]));
  if(!good)throw Error('Unexpected manually edited PSE slider cell '+(i+1)+'; no mutation allowed');
 }
 await mkdir('artifacts/pse-hero-image-migration',{recursive:true});
 await writeFile('artifacts/pse-hero-image-migration/pse_00_vi_before.json',JSON.stringify({
  table:tableId,changedAt:new Date().toISOString(),cells:before.data.items
 },null,2));
 const complete=raw.every(x=>/^\s*<img\b/i.test(x)&&/\balt=["'][^"']+["']/i.test(x));
 if(complete){console.log('PSE_NATIVE_IMAGE_CELLS=ALREADY_COMPLIANT; no_cms_save=true');process.exit(0)}
 await page.goto(origin+'/wp-admin/admin.php?page=tablepress&action=edit&table_id='+tableId,{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>Array.isArray(window.tp?.table?.data)&&typeof window.tp?.callbacks?.insert_image?.open_dialog==='function'&&typeof window.wp?.media?.editor?.open==='function',null,{timeout:30000});
 const original=await page.evaluate(()=>window.tp.table.data.map(r=>[...r]));
 if(original.length!==13||original[0]?.[3]!=='img'||raw.some((x,i)=>String(original[i+2]?.[3]||'')!==x))
  throw Error('ESC Table editor does not match REST snapshot; refuse overwrite');
 for(let i=0;i<11;i++){
  const val=raw[i];
  if(/^\s*<img\b/i.test(val)){console.log('PSE_IMAGE_CELL_ALREADY_STRUCTURED='+i);continue}
  const item=identities[i],row=i+2;
  await page.evaluate(({row})=>{
   const tp=window.tp;
   if(typeof tp.editor.updateSelectionFromCoords!=='function')throw Error('Native spreadsheet selection missing');
   tp.editor.updateSelectionFromCoords(3,row,3,row);
   tp.editor.setValueFromCoords(3,row,'');
   tp.callbacks.insert_image.open_dialog(null);
  },{row});
  await page.locator('.media-modal').waitFor({state:'visible',timeout:20000});
  const selection=await page.evaluate(async({id,alt})=>{
   const frame=window.wp.media.editor.get('textarea-insert-helper');
   if(!frame?.state?.()||typeof frame.state().get!=='function')throw Error('WP media insertion state unavailable');
   const attachment=window.wp.media.attachment(id);
   await attachment.fetch();
   if(!attachment.get('url'))throw Error('WP image attachment URL missing');
   attachment.set('alt',alt);
   frame.state().get('selection').reset([attachment]);
   return {id:attachment.id,src:attachment.get('url'),alt:attachment.get('alt'),state:frame.state().id};
  },{id:item.id,alt:item.alt});
  if(selection.id!==item.id||selection.alt!==item.alt)throw Error('Selected wrong WP attachment');
  const button=page.locator('.media-modal .media-toolbar-primary button.media-button').last();
  await button.waitFor({state:'visible',timeout:20000});
  if(await button.isDisabled())throw Error('WordPress Insert Image button disabled for '+item.id);
  await button.click();
  await page.locator('.media-modal').waitFor({state:'hidden',timeout:15000});
  // WordPress built the HTML in its editor's helper textarea; TablePress change event stores it into the selected cell.
  const stored=await page.evaluate(({row})=>String(window.tp.table.data[row][3]||''),{row});
  if(!/^\s*<img\b/i.test(stored)||!(stored.includes('/'+item.name))||!/\balt=["'][^"']+["']/i.test(stored))
   throw Error('ESC Insert Image generated invalid code in row '+(row+1)+': '+stored.slice(0,180));
  console.log('PSE_INSERT_IMAGE_NATIVE_CELL=PASS; row='+(row+1)+'; attachment_id='+item.id+'; has_alt=true');
 }
 const cells=await page.evaluate(()=>window.tp.table.data.slice(2).map(r=>String(r[3]||'')));
 if(cells.length!==11||cells.some(x=>!/^\s*<img\b/i.test(x)||!/\balt=["'][^"']+["']/i.test(x)))
  throw Error('Pre-save ESC image cells invalid');
 await page.getByRole('button',{name:'Save Changes',exact:true}).first().click();
 let ok=false;for(let i=0;i<18;i++){
  await page.waitForTimeout(1000);
  const q=await getTable();
  if(q.status===200&&JSON.stringify(q.data.items.map(x=>x.img))===JSON.stringify(cells)){ok=true;break}
 }
 if(!ok)throw Error('PSE native TablePress image cells not persisted');
 console.log('PSE_NATIVE_IMAGE_CELLS_SAVE=PASS; slides=11; alt_count=11; native_insert_image=true; rest_readback=true');
}finally{await browser.close()}
