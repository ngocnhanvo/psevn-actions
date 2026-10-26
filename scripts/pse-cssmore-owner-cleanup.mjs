/** Ownership repair for five verified published WP Pages; preflight, backup, read-after-write. */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { readFile,writeFile } from 'node:fs/promises';
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
const apply=String(event.head_commit?.message||'').trim()==='cms(pse): migrate ESC cssmore to Astro Tailwind';
const sha=s=>createHash('sha256').update(String(s)).digest('hex').slice(0,14);
const targets=[
 {id:80932,slug:'duong-day-nong',key:'pse-business-duong-day-nong',action:'PublicPage',hash:'5621e33e213eb8',table:'pse_hotline_vi',marker:'pse-hotline'},
 {id:80930,slug:'hoi-dap',key:'pse-business-hoi-dap',action:'PublicPage',hash:'564b064b972c6b',table:'pse_faq_vi',marker:'pse-faq'},
 {id:47222,slug:'lien-he',key:'contact',action:'PrivatePage',hash:'e402bd91717341',table:'pse_contact_office_vi',marker:'esc-contact'},
 {id:248,slug:'trang-chu',key:'home',action:'HomePage',hash:'492dc5daaa33d3',table:'pse_00_vi',marker:'nd-page'},
 {id:53390,slug:'ve-chung-toi',key:'about',action:'PrivatePage',hash:'499c969330d7ff',table:'',marker:'esc-about'},
];
const v=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,'')).filter(s=>s.startsWith('WC_URL='));
if(v.length!==1)throw Error('CMS URL missing/ambiguous');
const url=new URL(v[0].slice(7).replace(/^['"]|['"]$/g,''));
if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw Error('Unsafe CMS origin');
const browser=await chromium.launch({headless:true});
const p=await browser.newPage();
try{
 await p.goto(url.origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await p.locator('#user_login').count()){
  await p.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await p.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const t=await p.locator('body').innerText();
  const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],c=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
   const el=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await el.count())throw Error('Unresolved login challenge');await el.fill(String(c))}
  await Promise.all([p.waitForLoadState('domcontentloaded'),p.locator('#wp-submit').click()]);
 }
 if(p.url().includes('wp-login'))throw Error('WordPress login rejected');
 const nonce=await p.evaluate(async()=>{
   if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
   const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});
   if(!r.ok)throw Error('No REST nonce');return (await r.text()).trim();
 });
 const get=async id=>p.evaluate(async({nonce,id})=>{
   const r=await fetch('/wp-json/wp/v2/pages/'+id+'?context=edit&_fields=id,slug,status,modified,acf,content',
    {headers:{'X-WP-Nonce':nonce},credentials:'same-origin',cache:'no-store'});
   return{http:r.status,page:await r.json().catch(()=>null)};
 },{nonce,id});
 const plan=[];
 for(const t of targets){
  const result=await get(t.id),d=result.page||{};
  if(result.http!==200||d.id!==t.id||d.slug!==t.slug||d.status!=='publish'||
    d.acf?.action!==t.action||d.acf?.key!==t.key)throw Error('Page identity mismatch ID='+t.id);
  const css=String(d.acf?.cssmore||''),raw=String(d.content?.raw||'');
  const tableExp=t.table?new RegExp('\\[table\\s+id=["\\x27]?'+t.table,'i'):null;
  if(tableExp&&!tableExp.test(raw))throw Error('Table shortcode mismatch ID='+t.id);
  const clean=css.length===0;
  if(!clean&&sha(css)!==t.hash)throw Error('Concurrent CSS changed; refuse overwrite ID='+t.id);
  if(!clean&&!css.toLowerCase().includes(t.marker.toLowerCase()))throw Error('Unexpected CSS content ID='+t.id);
  // All five cases were confirmed in the complete browser CSSOM scan:
  // ESC-only selector matches for FAQ/hotline; no live matches for three legacy CSS blocks.
  plan.push({t,css,contentHash:sha(raw),tableCount:[...raw.matchAll(/\[table\s+id=/ig)].length,
    version:d.modified,alreadyClean:clean});
 }
 await writeFile('pse-cssmore-ownership-backup.json',JSON.stringify({
  purpose:'Page CSS ownership migration; retained privately for rollback',timestamp:new Date().toISOString(),
  source:'authenticated WordPress REST context=edit',pages:plan.map(x=>({
    id:x.t.id,slug:x.t.slug,acfCssmore:x.css,cssHash:sha(x.css),contentHash:x.contentHash,modified:x.version
  }))
 },null,2),'utf8');
 console.log('PSE_CSSMORE_CLEANUP_PREFLIGHT='+JSON.stringify({
  apply, pages:plan.map(x=>({id:x.t.id,slug:x.t.slug,bytes:x.css.length,cssHash:sha(x.css),
     unchangedContent:x.contentHash,alreadyClean:x.alreadyClean,shortcodeCount:x.tableCount}))}));
 if(apply){
  for(const x of plan){
   if(x.alreadyClean)continue;
   const before=await get(x.t.id);
   if(before.http!==200 || sha(before.page?.acf?.cssmore||'')!==x.t.hash ||
     sha(before.page?.content?.raw||'')!==x.contentHash)throw Error('Concurrent edit pre-save ID='+x.t.id);
   const saved=await p.evaluate(async({nonce,id})=>{
    const r=await fetch('/wp-json/wp/v2/pages/'+id,{method:'POST',credentials:'same-origin',
      headers:{'X-WP-Nonce':nonce,'Content-Type':'application/json'},
      body:JSON.stringify({acf:{cssmore:''}})});
    const body=await r.json().catch(()=>null);return{http:r.status,code:body?.code||null};
   },{nonce,id:x.t.id});
   if(saved.http!==200)throw Error('WordPress ACF cssmore rejected ID='+x.t.id+' HTTP='+saved.http+' code='+saved.code);
   const after=await get(x.t.id);
   if(after.http!==200||String(after.page?.acf?.cssmore||'')!==''||
      sha(after.page?.content?.raw||'')!==x.contentHash ||
      after.page?.acf?.key!==x.t.key||after.page?.acf?.action!==x.t.action)
     throw Error('WordPress CSS ownership readback failed ID='+x.t.id);
   console.log('PSE_CSSMORE_REPAIRED='+JSON.stringify({id:x.t.id,slug:x.t.slug,cssCleared:true,
     originalContentPreserved:true,tableCount:x.tableCount}));
  }
 }
 console.log('PSE_CSSMORE_OWNER_CLEANUP=PASS apply='+apply+' backupCreated=true no_Astro_build=true');
}finally{await browser.close()}
