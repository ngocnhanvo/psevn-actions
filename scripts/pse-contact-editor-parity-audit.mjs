import {chromium} from 'playwright';
const lines=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,''));
const loc=lines.filter(x=>x.startsWith('WC_URL='));
if(loc.length!==1)throw Error('WordPress origin configuration missing');
const origin=new URL(loc[0].slice(7).replace(/^['"]|['"]$/g,''));
if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||!['','/'].includes(origin.pathname))throw Error('Invalid WP origin');
const b=await chromium.launch({headless:true});
const p=await b.newPage({viewport:{width:1440,height:900}});
try{
 await p.goto(origin.origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await p.locator('#user_login').count()){
  await p.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await p.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const body=await p.locator('body').innerText();
  const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],d=+m[3],v=({'+':a+d,'-':a-d,'x':a*d,'×':a*d,'*':a*d})[m[2]];const c=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await c.count())throw Error('Missing login challenge');await c.fill(String(v))}
  await Promise.all([p.waitForLoadState('domcontentloaded'),p.locator('#wp-submit').click()]);
 }
 if(p.url().includes('wp-login'))throw Error('WP login failed');
 const details=await p.evaluate(async()=>{
  const nr=window.wpApiSettings?.nonce || await(await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'})).text();
  const rd=async endpoint=>{const r=await fetch(endpoint,{credentials:'same-origin',headers:{'X-WP-Nonce':nr,Accept:'application/json','Cache-Control':'no-cache'}});return {status:r.status,data:await r.json().catch(()=>null)}};
  const q=await rd('/wp-json/wp/v2/pages/47222?context=edit&_fields=id,status,slug,acf,content');
  if(q.status!==200||q.data?.id!==47222||q.data?.acf?.key!=='contact')throw Error('Contact identity mismatch');
  const raw=String(q.data.content?.raw||'');
  const el=document.createElement('div');el.innerHTML=raw;
  const hero=el.querySelector('section.pse-contact-hero');
  const info=hero?.querySelector('.pse-contact-locations__intro');
  const css=String(q.data.acf?.cssmore||'');
  const ids=[...raw.matchAll(/\[table\s+id=([a-z0-9_-]+)\s*\/\]/gi)].map(m=>m[1]);
  const tables=await Promise.all(ids.map(id=>rd('/wp-json/tablepress/v1/table/'+id)));
  return{pageId:q.data.id,rawLength:raw.length,heroHtml:hero?.outerHTML.slice(0,2400)||null,hasIntro:!!info,heroHeadings:[...hero?.querySelectorAll('h1,h2,h3,p,span')||[]].slice(0,9).map(x=>({tag:x.tagName,cls:x.className,text:x.textContent?.trim().slice(0,160),style:x.getAttribute('style')})),tableIds:ids,nativeWrappers:(raw.match(/tablepress-preview-wrap/g)||[]).length,cssMarker:css.includes('PSE_CONTACT_ESC_OWNED_SECTIONS_V2'),cssLength:css.length,cssTail:css.slice(-300),tableItems:tables.map((t,i)=>({id:ids[i],http:t.status,items:t.data?.items?.length,title:t.data?.title}))};
 });
 await p.goto(origin.origin+'/wp-admin/post.php?post=47222&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
 await p.locator('#content-tmce').click();
 await p.waitForFunction(()=>Boolean(window.tinymce?.get('content')?.getBody()),null,{timeout:20000});
 const admin=await p.evaluate(()=>{
  const ed=window.tinymce.get('content'),h=ed.getBody().querySelector('.pse-contact-locations__intro');
  const heading=h?.querySelector('h2,h1');
  return{headingText:heading?.textContent?.trim(),headingStyle:heading?getComputedStyle(heading).cssText:null,headingColor:heading?getComputedStyle(heading).color:null,headingFontSize:heading?getComputedStyle(heading).fontSize:null,heroStyle:h?.getAttribute('style'),imagePreviews:ed.getBody().querySelectorAll('.tablepress-preview-wrap img').length,customPreview:!!document.querySelector('#pse-contact-editor-preview')};
 });
 console.log('PSE_CONTACT_EDITOR_PARITY_PREFLIGHT='+JSON.stringify({details,admin}));
 console.log('PSE_CONTACT_EDITOR_PARITY_READ_ONLY=PASS');
}finally{await b.close()}
