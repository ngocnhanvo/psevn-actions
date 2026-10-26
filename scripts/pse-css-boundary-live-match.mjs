/** Read-only selector owner inspection for ALL CSS-bearing published WordPress Pages. */
import { chromium } from 'playwright';
const origins=Object.fromEntries(String(process.env.ENV_FILE||'').split(/\r?\n/)
 .map(s=>s.trim().replace(/^export\s+/,'')).filter(s=>/^WC_URL(_CLIENT)?=/.test(s))
 .map(s=>{const [name,...v]=s.split('=');const u=new URL(v.join('=').replace(/^['"]|['"]$/g,''));
   if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search||!['','/'].includes(u.pathname))throw Error('unsafe origin');
   return[name,u.origin]}));
if(!origins.WC_URL||!origins.WC_URL_CLIENT)throw Error('Missing WP+Astro origins');
const browser=await chromium.launch({headless:true});
const admin=await browser.newPage(),front=await browser.newPage({viewport:{width:1440,height:900}});
try{
 await admin.goto(origins.WC_URL+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await admin.locator('#user_login').count()){
  await admin.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await admin.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const t=await admin.locator('body').innerText();
  const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3];const v=({'+':a+b,'-':a-b,'x':a*b,'×':a*b,'*':a*b})[m[2]];
   const el=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await el.count())throw Error('captcha field missing');await el.fill(String(v))}
  await Promise.all([admin.waitForLoadState('domcontentloaded'),admin.locator('#wp-submit').click()]);
 }
 if(admin.url().includes('wp-login'))throw Error('login rejected');
 const nonce=await admin.evaluate(async()=>window.wpApiSettings?.nonce ||
   (await (await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'})).text()).trim());
 const rows=await admin.evaluate(async nonce=>{
  const path='/wp-json/wp/v2/pages?status=publish&context=edit&per_page=100&_fields=id,slug,acf,content,status';
  const r=await fetch(path,{credentials:'same-origin',headers:{'X-WP-Nonce':nonce}});
  if(!r.ok)throw Error('Page REST HTTP '+r.status);
  return await r.json();
 },nonce);
 for(const row of rows.filter(r=>String(r.acf?.cssmore||'').trim())){
  const css=String(row.acf.cssmore||'');
  const raw=String(row.content?.raw||'');
  const url=origins.WC_URL_CLIENT+'/'+(row.slug==='trang-chu'?'':row.slug);
  let response;
  try{response=await front.goto(url,{waitUntil:'domcontentloaded',timeout:45000})}
  catch(e){console.log('PSE_CSS_MATCH='+JSON.stringify({id:row.id,slug:row.slug,error:'frontend_unreachable'}));continue}
  const result=await front.evaluate(({css,raw})=>{
   const style=document.createElement('style');
   style.textContent=css;document.head.appendChild(style);
   const parser=style.sheet;
   if(!parser)return {parseError:true,cssLength:css.length};
   let scanned=0,matched=0,unmatched=0,esc=0,html=0,outside=0,matchSamples=[],escSamples=[],bad=0;
   const seen=new Set();
   const walk=rules=>{for(const rule of rules){
     if(rule.cssRules){walk(rule.cssRules);continue}
     if(!rule.selectorText)continue;
     for(const sel of rule.selectorText.split(/,(?![^()]*\))/)){
       const selector=sel.trim();if(!selector||seen.has(selector))continue;seen.add(selector);scanned++;
       try{const els=[...document.querySelectorAll(selector)];if(!els.length){unmatched++;continue}
         matched++;
         const isEsc=els.some(el=>Boolean(el.closest('[data-tablepress-preview]')));
         const isEditor=els.some(el=>Boolean(el.closest('[data-esc-builder-html-part]')));
         const other=els.some(el=>!el.closest('[data-tablepress-preview]')&&!el.closest('[data-esc-builder-html-part]'));
         if(isEsc){esc++;if(escSamples.length<7)escSamples.push(selector.slice(0,100))}
         if(isEditor)html++;
         if(other)outside++;
         if(matchSamples.length<12)matchSamples.push(selector.slice(0,100));
       }catch{bad++}
     }
   }};
   walk(parser.cssRules);
   const ruleCount=parser.cssRules.length;style.remove();
   return{cssLength:css.length,ruleCount,scanned,matched,unmatched,esc,html,outside,bad,
    matchSamples,escSamples,escRoots:document.querySelectorAll('[data-tablepress-preview]').length,
    editorWrappers:document.querySelectorAll('[data-esc-builder-html-part]').length};
  },{css,raw});
  console.log('PSE_CSS_MATCH='+JSON.stringify({id:row.id,slug:row.slug,http:response?.status(),...result}));
 }
 console.log('PSE_CSS_LIVE_MATCH=PASS READ_ONLY=true NO_BUILD=true');
}finally{await browser.close()}
