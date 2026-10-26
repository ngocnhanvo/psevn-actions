/** Create the shared footer's native ESC Table without inventing certification/legal claims. */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const rows=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const entry=rows.filter(s=>s.startsWith("WC_URL="));
if(entry.length!==1)throw Error("WordPress origin missing");
const u=new URL(entry[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid WP origin");
if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("WP login secrets absent");
const origin=u.origin, tableId="pub_footer_assets_vi";
const keys=["group","label","image","value","href","visible"];
const beforePath="artifacts/pse-footer/esc-before.json";
const browser=await chromium.launch({headless:true});
const p=await browser.newPage({viewport:{width:1440,height:980}});
p.on("dialog",async d=>d.type()==="confirm"?d.accept():d.dismiss());
try {
 await p.goto(origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await p.locator("#user_login").count()){
  await p.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await p.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const text=await p.locator("body").innerText();
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3];
   const n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const captcha=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await captcha.count())throw Error("WP arithmetic challenge control absent");
   await captcha.fill(String(n));
  }
  await p.locator("#wp-submit").click({noWaitAfter:true,timeout:25000});
  await p.waitForFunction(()=>location.pathname.startsWith("/wp-admin") && !document.querySelector("#loginform"),null,{timeout:45000});
 }
 if(p.url().includes("wp-login"))throw Error("WP login failed");
 const nonce=await p.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("WP REST nonce failed");
  return (await r.text()).trim();
 });
 const get=route=>p.evaluate(async({route,nonce})=>{
  const r=await fetch(route,{credentials:"same-origin",cache:"no-store",headers:{"X-WP-Nonce":nonce,"Cache-Control":"no-cache"}});
  return {http:r.status,data:await r.json().catch(()=>({}))};
 },{route,nonce});

 const expected=['group','label','image','value','href','visible'];
 const original=await get('/wp-json/tablepress/v1/table/'+tableId);
 if(original.http!==200||JSON.stringify(original.data?.fields?.map(f=>f.key))!==JSON.stringify(expected))throw Error('Global footer table not ready');
 await mkdir('artifacts/pse-footer',{recursive:true});
 await writeFile('artifacts/pse-footer/esc-before-population.json',JSON.stringify(original.data,null,2)+'\n');
 const media=[];
 for(const [slug,alt] of [
   ['pse-footer-gcerti-original','Logo G-CERTI System Service – theo footer PSE gốc'],
   ['pse-footer-ias-original','Logo IAS Accredited – theo footer PSE gốc'],
   ['pse-footer-iaf-original','Logo IAF – theo footer PSE gốc']
 ]){
   const response=await get('/wp-json/wp/v2/media?context=edit&search='+encodeURIComponent(slug)+'&per_page=40');
   if(response.http!==200||!Array.isArray(response.data))throw Error('Cannot inspect media '+slug);
   const matching=response.data.filter(x=>x.slug===slug);
   if(matching.length!==1||matching[0]?.alt_text!==alt)throw Error('Missing verified original media '+slug);
   media.push(matching[0]);
 }
 const planned=[
   ['certification','G-CERTI','','','','1'],
   ['certification','IAS','','','','1'],
   ['certification','IAF','','','','1'],
   ['responsible','Chịu trách nhiệm chính','','Đoàn Văn Trường','','1'],
   ['responsible','Email phụ trách','','dvtruong@pvfcco.com.vn','mailto:dvtruong@pvfcco.com.vn','1']
 ];
 const haveRows=original.data.items||[];
 const prepared=haveRows.length===planned.length+1&&planned.every((row,index)=>{
   const existing=haveRows[index+1]||{};
   return existing.group===row[0]&&existing.label===row[1]&&existing.value===row[3]&&existing.visible==='1';
 });
 if(prepared&&haveRows.slice(1,4).every(row=>String(row.image||'').includes('<img'))) {
   console.log('PSE_FOOTER_NATIVE_MEDIA=ALREADY_DONE; no_write=true');
   process.exit(0);
 }
 if(haveRows.length!==1||haveRows[0].group!=='credit'||haveRows[0].value!=='Designed by ESC')throw Error('Existing footer content changed; refusing overwrite');
 await p.goto(origin+'/wp-admin/admin.php?page=tablepress&action=edit&table_id='+encodeURIComponent(tableId),{waitUntil:'domcontentloaded',timeout:65000});
 await p.waitForFunction(()=>Array.isArray(window.tp?.table?.data)&&typeof window.tp?.editor?.insertRow==='function'&&typeof window.tp?.callbacks?.insert_image?.open_dialog==='function',null,{timeout:30000});
 const written=await p.evaluate(rows=>{
   const t=window.tp;
   if(t.table.id!=='pub_footer_assets_vi'||t.table.data.length!==3||t.table.data[2][0]!=='credit')throw Error('Unexpected native editor table');
   t.editor.insertRow(rows.length,2,false);
   if(t.editor.options.data.length!==3+rows.length)throw Error('Native insertRow did not add rows');
   rows.forEach((row,index)=>row.forEach((v,col)=>t.editor.setValueFromCoords(col,3+index,v)));
   t.helpers.unsaved_changes.set();
   return {rows:t.editor.options.data.length,first:t.editor.options.data[3],last:t.editor.options.data[7]};
 },planned);
 console.log('PSE_FOOTER_NATIVE_ROWS_PREPARED='+JSON.stringify(written));
 for(let i=0;i<media.length;i++){
   const selected=await p.evaluate(index=>{
     const t=window.tp;
     const row=3+index;
     t.editor.updateSelectionFromCoords(2,row);
     if(t.helpers.selection?.rows?.[0]!==row||t.helpers.selection?.columns?.[0]!==2)throw Error('Native TablePress selected image cell mismatch');
     t.callbacks.insert_image.open_dialog();
     return {row,cellName:'C'+(row+1)};
   },i);
   await p.locator('.media-modal').waitFor({state:'visible',timeout:20000});
   // wp.media('post', state 'insert') uses the native library gallery.
   const libraryTab=p.locator('.media-frame-router button, .media-frame-router a').filter({hasText:/Media Library|Thư viện/i}).first();
   if(await libraryTab.count())await libraryTab.evaluate(el=>el.click());
   const item=p.locator('.media-modal .attachment[data-id="'+media[i].id+'"]').first();
   try{await item.waitFor({state:'visible',timeout:22000});}catch(e){
    const d=await p.locator('.media-modal').evaluate(el=>({text:(el.innerText||'').slice(0,1200),buttons:[...el.querySelectorAll('button')].map(b=>(b.textContent||'').trim()).filter(Boolean).slice(0,30)}));
    throw Error('Native Media cannot locate '+media[i].id+' '+JSON.stringify(d));
   }
   await item.click({timeout:16000});
   const insert=p.locator('.media-modal button.media-button-insert').first();
   if(!await insert.count())throw Error('Native WordPress Insert Image button missing');
   await insert.click({timeout:20000});
   await p.locator('.media-modal').waitFor({state:'hidden',timeout:20000});
   const cell=await p.evaluate(index=>window.tp.editor.options.data[3+index][2],i);
   if(typeof cell!=='string'||!cell.includes('<img')||!cell.includes('alt=')||!cell.includes(media[i].source_url.split('/').pop()?.split('.')[0]||'pse-footer')) {
     // Original src may be transformed by WordPress insertion. Require just an image tag and ALT.
     if(typeof cell!=='string'||!cell.includes('<img')||!cell.includes('alt='))throw Error('Native Insert Image did not produce an SEO img tag in '+selected.cellName);
   }
   console.log('PSE_FOOTER_NATIVE_IMAGE=READY; table='+tableId+'; mediaId='+media[i].id+'; cell='+selected.cellName);
 }
 await p.getByRole('button',{name:'Save Changes',exact:true}).first().click({noWaitAfter:true,timeout:26000});
 let saved;
 for(let n=0;n<22;n++){
   await p.waitForTimeout(1000);
   saved=await get('/wp-json/tablepress/v1/table/'+tableId);
   if(saved.http===200&&saved.data?.items?.length===6&&
     saved.data.items.slice(1,4).every(row=>/<img\\b/i.test(row.image||'')&&/alt=/i.test(row.image||''))&&
     saved.data.items[4]?.value==='Đoàn Văn Trường')break;
 }
 if(!saved||saved.data?.items?.length!==6||!saved.data.items.slice(1,4).every(row=>/<img\\b/i.test(row.image||'')&&/alt=/i.test(row.image||'')))throw Error('Native footer Insert Image Save/REST readback failed');
 console.log('PSE_FOOTER_ESC_POPULATED=PASS; id='+tableId+'; rows=6; certification=3; responsible=2; credit=1; native_media_insert=true; no_astro_build=true');
}finally{await browser.close()}
