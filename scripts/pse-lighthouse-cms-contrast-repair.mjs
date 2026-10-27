/**
 * Narrow native WordPress Page a11y repair. Only CSS colors inside WordPress
 * Editor/PHP HTML and a semantic Turnstile group role. No ESC Table CSS,
 * no Astro code edits and no website build.
 */
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const h=s=>createHash('sha256').update(String(s||'')).digest('hex').slice(0,16);
const values=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,''));
const settings=values.filter(x=>x.startsWith('WC_URL='));
if(settings.length!==1)throw Error('Missing verified WP URL');
const wp=new URL(settings[0].slice(7).replace(/^['"]|['"]$/g,''));
if(wp.protocol!=='https:'||wp.username||wp.password||wp.search||wp.hash||
 wp.port||!['','/'].includes(wp.pathname))throw Error('Invalid WP origin');
if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error('Missing WP auth');
const common='.pse-public-page .pse-public-body .article-content ';
const defs=[
 {slug:'ban-giam-doc',action:'PublicPage',key:'pse-company-ban-giam-doc',family:'corporate'},
 {slug:'ban-kiem-soat',action:'PublicPage',key:'pse-company-ban-kiem-soat',family:'corporate'},
 {slug:'hoi-dong-quan-tri',action:'PublicPage',key:'pse-company-hoi-dong-quan-tri',family:'corporate'},
 {slug:'dinh-huong-phat-trien',action:'PublicPage',key:'pse-company-dinh-huong-phat-trien',family:'strategy'},
 {slug:'lien-he',action:'PrivatePage',key:'contact',family:'contact'},
 {slug:'xu-ly-khieu-nai-y-kien-khach-hang',action:'PseComplaintPage',key:'pse-complaint',family:'complaint'}
];
const snippets={
 corporate:[
  common+'[style*="#339966"]{color:#16643d!important}',
  common+'[style*="#ff6600"]{color:#9a3e00!important}'
 ].join('\n'),
 strategy:[
  '.pse-public-page .pse-strategy-document [style*="#ff6600"]{color:#9a3e00!important}',
  '.pse-public-page .pse-strategy-document [style*="#99cc00"]{color:#476400!important}'
 ].join('\n'),
 contact:'main#main-content .pse-contact-hero .pse-contact-locations__intro > span{color:#216d41!important}',
 complaint:[
  '.pse-complaint .pse-complaint__section-heading p{color:#53685a!important}',
  '.pse-complaint .pse-complaint__security{color:#4f6656!important}',
  '.pse-complaint .pse-complaint__submit-row p{color:#53685a!important}'
 ].join('\n')
};
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1365,height:900}});
mkdirSync('artifacts/pse-lighthouse-cms-contrast',{recursive:true});
let records=[],written=[];
try{
 await page.goto(wp.origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
  const txt=await page.locator('body').innerText();
  const m=txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||
          txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=Number(m[1]),b=Number(m[3]);
   const number=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error('Cannot solve supported arithmetic login field');
   await f.fill(String(number));
  }
  await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
 }
 if(page.url().includes('wp-login'))throw Error('WP Admin auth failed');
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const x=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});
  if(!x.ok)throw Error('No valid WP REST nonce');return (await x.text()).trim();
 });
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error('Malformed REST nonce');
 const api=(path,method='GET',body)=>page.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:'same-origin',headers:{
   Accept:'application/json','X-WP-Nonce':nonce,
   ...(body?{'Content-Type':'application/json'}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  return {http:r.status,data:await r.json().catch(()=>null)};
 },{path,method,body,nonce});
 // FULL PREFLIGHT before first mutation; verify each exact WP Page/action.
 for(const def of defs){
  const r=await api('/wp-json/wp/v2/pages?context=edit&status=publish&slug='+encodeURIComponent(def.slug)+
   '&_fields=id,slug,status,acf,content,modified&per_page=10');
  if(r.http!==200||!Array.isArray(r.data)||r.data.length!==1)
   throw Error('WordPress Page not uniquely identified '+def.slug+' http='+r.http);
  const d=r.data[0];
  if(d.slug!==def.slug||d.status!=='publish'||d.acf?.action!==def.action||
   d.acf?.key!==def.key||!Number.isInteger(d.id))
   throw Error('Wrong WP source identity for '+def.slug+' id='+d.id+
     ' key='+d.acf?.key+' action='+d.acf?.action);
  const content=String(d.content?.raw||''),css=String(d.acf?.cssmore||'');
  if(!content.trim())throw Error('Empty source content '+def.slug);
  const patch=snippets[def.family];
  const already=css.includes(patch);
  if(def.family==='corporate'&&!/339966|ff6600/i.test(content))
   throw Error('Expected legacy palette not present in '+def.slug);
  if(def.family==='strategy'&&!/99cc00|ff6600/i.test(content))
   throw Error('Expected legacy strategy palette absent');
  if(def.family==='contact'&&!/pse-contact-hero/.test(content))
   throw Error('WordPress-owned Contact hero absent');
  if(def.family==='complaint'&&!content.includes('id="pse-complaint-turnstile"'))
   throw Error('Native Turnstile div absent');
  const expectedCss=already?css:(css.trim()?(css.trimEnd()+'\n'): '')+patch+'\n';
  let expectedHtml=content;
  if(def.family==='complaint'&&!/id="pse-complaint-turnstile"[^>]*role="group"/.test(content)){
    const start=content.match(/<div\b[^>]*\bid="pse-complaint-turnstile"[^>]*>/i);
    if(!start||!/aria-label="[^"]+"/.test(start[0])||/\brole=/.test(start[0]))
     throw Error('Unexpected Turnstile markup; refuse blind patch');
    expectedHtml=content.replace(start[0],start[0].replace(/>$/,' role="group">'));
  }
  records.push({def,id:d.id,beforeCss:css,beforeHtml:content,modified:d.modified,
   expectedCss,expectedHtml,cssChanged:css!==expectedCss,htmlChanged:content!==expectedHtml});
 }
 // Keep enough to rollback without leaking passwords, nonce or private data.
 writeFileSync('artifacts/pse-lighthouse-cms-contrast/backup.json',JSON.stringify({
  source:wp.origin,scope:'WordPress Editor-only CSS and semantic ARIA',pages:records.map(x=>({
   id:x.id,slug:x.def.slug,key:x.def.key,modified:x.modified,
   previousCssmore:x.beforeCss,previousContent:x.htmlChanged?x.beforeHtml:null,
   cssHash:h(x.beforeCss),contentHash:h(x.beforeHtml)
  }))},null,2)+'\n');
 console.log('PSE_A11Y_CMS_PREFLIGHT='+JSON.stringify(records.map(x=>({
  id:x.id,slug:x.def.slug,cssChange:x.cssChanged,htmlChange:x.htmlChanged,
  sourceHtmlHash:h(x.beforeHtml),sourceCssHash:h(x.beforeCss)}))));
 for(const rec of records){
  const {def,id}=rec;
  if(!rec.cssChanged&&!rec.htmlChanged){written.push({slug:def.slug,id,unchanged:true});continue}
  const fresh=await api('/wp-json/wp/v2/pages/'+id+'?context=edit&_fields=id,slug,status,acf,content,modified');
  if(fresh.http!==200||fresh.data?.id!==id||
   String(fresh.data.content?.raw||'')!==rec.beforeHtml||
   String(fresh.data.acf?.cssmore||'')!==rec.beforeCss||
   fresh.data.modified!==rec.modified)throw Error('Concurrent WP edit; abort '+def.slug);
  const update={acf:{cssmore:rec.expectedCss}};
  if(rec.htmlChanged)update.content=rec.expectedHtml;
  const save=await api('/wp-json/wp/v2/pages/'+id,'POST',update);
  if(save.http!==200||save.data?.id!==id)throw Error('WP save error '+def.slug+' HTTP '+save.http);
  const check=await api('/wp-json/wp/v2/pages/'+id+'?context=edit&_fields=id,slug,status,acf,content');
  if(check.http!==200||check.data?.status!=='publish'||check.data.slug!==def.slug||
   check.data.acf?.key!==def.key||check.data.acf?.action!==def.action||
   String(check.data.acf?.cssmore||'')!==rec.expectedCss||
   String(check.data.content?.raw||'')!==rec.expectedHtml)
   throw Error('Save readback mismatch '+def.slug);
  const result={id,slug:def.slug,cssChanged:rec.cssChanged,htmlChanged:rec.htmlChanged,
   contentUnchangedExceptARIA:!rec.htmlChanged||rec.expectedHtml.replace(' role="group"','')===rec.beforeHtml};
  written.push(result);
  console.log('PSE_A11Y_CMS_REPAIRED='+JSON.stringify(result));
 }
 writeFileSync('artifacts/pse-lighthouse-cms-contrast/result.json',JSON.stringify(written,null,2)+'\n');
 console.log('PSE_A11Y_CMS_CONTRAST_PASS='+JSON.stringify({pages:records.length,changed:written.filter(x=>!x.unchanged).length,noBuild:true,noEscTableCss:true}));
}finally{await browser.close()}
