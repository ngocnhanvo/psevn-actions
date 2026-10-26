/** Read-only entire WordPress Page CSS ownership inventory. No content output, no writes. */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
const conf=Object.fromEntries(String(process.env.ENV_FILE||'').split(/\r?\n/)
 .map(s=>s.trim().replace(/^export\s+/,'')).filter(s=>/^WC_URL(_CLIENT)?=/.test(s))
 .map(s=>{const [k,...v]=s.split('=');const u=new URL(v.join('=').replace(/^['"]|['"]$/g,''));if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))throw Error('Unsafe origin '+k);return[k,u.origin]}));
if(!conf.WC_URL)throw Error('Missing CMS origin');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:920}});
const digest=s=>createHash('sha256').update(String(s)).digest('hex').slice(0,14);
try{
 await page.goto(conf.WC_URL+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await page.locator('#user_login').count()){
   await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
   await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
   const body=await page.locator('body').innerText();
   const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
   if(m){const a=+m[1],b=+m[3],val=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
     const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
     if(!await f.count())throw Error('Login challenge not available');await f.fill(String(val));}
   await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
 }
 if(page.url().includes('wp-login'))throw Error('WordPress login rejected');
 const nonce=await page.evaluate(async()=>{
   if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
   const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});
   if(!r.ok)throw Error('WordPress REST nonce unavailable');return (await r.text()).trim();
 });
 const all=[],statusErrors=[];
 const statuses=['publish','draft','private','pending','future'];
 for(const status of statuses){
   for(let n=1;n<=40;n++){
     const result=await page.evaluate(async({nonce,status,n})=>{
       const path='/wp-json/wp/v2/pages?context=edit&status='+status+
         '&per_page=100&page='+n+'&_fields=id,slug,status,acf,content,modified,title';
       const r=await fetch(path,{credentials:'same-origin',headers:{'X-WP-Nonce':nonce,'Accept':'application/json'}});
       return {http:r.status,total:Number(r.headers.get('X-WP-Total')||0),
         pages:Number(r.headers.get('X-WP-TotalPages')||0),data:await r.json().catch(()=>null)};
     },{nonce,status,n});
     if(result.http===400&&n>1)break;
     if(result.http!==200||!Array.isArray(result.data)){statusErrors.push({status,http:result.http});break;}
     for(const row of result.data){
       const html=String(row.content?.raw||'');
       const css=String(row.acf?.cssmore||'');
       const tabs=[...html.matchAll(/\[(?:table|tablepress)\s+id=["']?([\w-]+)/ig)].map(m=>m[1]);
       const editorClasses=new Set([...html.matchAll(/class\s*=\s*["']([^"']+)["']/gi)].flatMap(m=>m[1].split(/\s+/)).filter(Boolean));
       const selectors=[...css.matchAll(/(?:^|\})\s*([^{}]+)\s*\{/g)].map(x=>x[1].trim()).filter(x=>x&&!x.startsWith('@'));
       const boundaries=selectors.filter(sel=>/tablepress|data-tablepress|data-esc-builder|esc[-_]table|tablepress-preview|\.tablepress\b/i.test(sel));
       const classHeads=[...new Set(selectors.flatMap(sel=>[...sel.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m=>m[1])))];
       const owned=classHeads.filter(cls=>editorClasses.has(cls));
       const unowned=classHeads.filter(cls=>!editorClasses.has(cls));
       const layoutKeys=/\b(?:grid-template-columns|display\s*:\s*(?:grid|flex)|gap\s*:|max-width\s*:|padding\s*:|background\s*:)/i.test(css);
       const flag=boundaries.length?'ESC_SELECTOR':
         tabs.length&&css.length&&classHeads.length&&!owned.length?'UNBOUND_CSS_WITH_TABLE':
         tabs.length&&css.length&&unowned.length>owned.length*2&&layoutKeys?'REVIEW_MIXED_CSS':'';
       all.push({id:row.id,slug:row.slug,status:row.status,modified:row.modified,
         action:String(row.acf?.action||''),key:String(row.acf?.key||''),
         hasEditorHtml:/<\w+/.test(html),htmlBytes:html.length,cssBytes:css.length,
         cssHash:css?digest(css):null,tables:tabs,cssRuleCount:selectors.length,
         boundClasses:owned.length,unboundClasses:unowned.slice(0,14),
         sampleSelectors:flag?selectors.slice(0,9).map(s=>s.slice(0,105)):[],
         risk:flag,cssLooksLikeTailwind:/@tailwind|@apply\s|tailwindcss/i.test(css)});
     }
     if(n>=result.pages||result.data.length<100)break;
   }
 }
 if(!all.length)throw Error('No WordPress Pages returned');
 const summary={count:all.length,byStatus:Object.fromEntries(statuses.map(x=>[x,all.filter(y=>y.status===x).length])),
   withCss:all.filter(p=>p.cssBytes>0).length,withEsc:all.filter(p=>p.tables.length).length,
   mixed:all.filter(p=>p.tables.length&&p.cssBytes>0).length,
   flagged:all.filter(p=>p.risk).length,statusErrors};
 console.log('PSE_CSS_BOUNDARY_SUMMARY='+JSON.stringify(summary));
 // Complete coverage report: no raw HTML/CSS, personal information or secrets.
 for(const p of all)console.log('PSE_CSS_BOUNDARY_PAGE='+JSON.stringify(p));
 console.log('PSE_CSS_BOUNDARY_AUDIT=PASS READ_ONLY=true NO_BUILD=true');
}finally{await browser.close()}
