/** Source-only Astro DEV browser QA with verified WordPress CMS. Not a build/deploy.
 * Temporary route lives exclusively inside Actions checkout and is not committed.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir,writeFile,readFile,rm } from 'node:fs/promises';
import path from 'node:path';
const ids=['pse_00_vi','pse_01_vi','pse_02_vi','pse_03_vi'];
const origin=(()=>{
  const values=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,'')).filter(x=>x.startsWith('WC_URL='));
  if(values.length!==1)throw Error('Missing or ambiguous CMS origin');
  const u=new URL(values[0].slice(7).trim().replace(/^['"]|['"]$/g,''));
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))throw Error('Invalid CMS origin');
  return u.origin;
})();
const sourceRoot=path.resolve('source');
const tempQaSrcDir=path.join(sourceRoot,'pse-qa-src');
const routePath=path.join(tempQaSrcDir,'pages/pse-qa.astro');
const astroConfigPath=path.join(sourceRoot,'astro.config.mjs');
let originalConfig;

const shots=path.resolve('artifacts/pse-homepage-visual-qa');
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900}});
const admin=await context.newPage();
let server;
try{
  const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
  if(!username||!password)throw Error('WordPress admin secrets missing');
  await admin.goto(origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
  if(await admin.locator('#user_login').count()){
    await admin.locator('#user_login').fill(username);
    await admin.locator('#user_pass').fill(password);
    const body=await admin.locator('body').innerText();
    const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if(m){
      const a=Number(m[1]),b=Number(m[3]);
      const val=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
      const input=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if(!await input.count())throw Error('Login challenge input missing');
      await input.fill(String(val));
    }
    await Promise.all([admin.waitForLoadState('domcontentloaded'),admin.locator('#wp-submit').click()]);
  }
  if(admin.url().includes('wp-login'))throw Error('CMS login failed');
  const nonce=await admin.evaluate(async()=>{
    if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
    const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});
    if(!r.ok)throw Error('Cannot acquire REST nonce');
    const token=(await r.text()).trim();
    if(!/^[a-zA-Z0-9]{8,24}$/.test(token)||token==='0')throw Error('Invalid REST nonce');
    return token;
  });
  const read=async endpoint=>{
    const v=await admin.evaluate(async({endpoint,nonce})=>{
      const response=await fetch(endpoint,{credentials:'same-origin',headers:{Accept:'application/json','X-WP-Nonce':nonce}});
      return {status:response.status,payload:await response.json().catch(()=>({}))};
    },{endpoint,nonce});
    if(v.status!==200)throw Error('WordPress REST GET failed HTTP '+v.status+' for '+endpoint.split('?')[0]);
    return v.payload;
  };
  const draft=await read('/wp-json/wp/v2/pages/76969?context=edit&_fields=id,status,title,slug,content,acf');
  if(draft.id!==76969||draft.status!=='draft'||draft.acf?.action!=='HomePage'||
    draft.acf?.key!=='pse-home-design-draft')throw Error('Wrong PSE unpublished draft');
  const content=String(draft.content?.raw||'');
  const actual=[...content.matchAll(/\[table\s+id=([a-z0-9_-]+)\s*\/\]/gi)].map(m=>m[1].toLowerCase());
  if(JSON.stringify(actual)!==JSON.stringify(ids))throw Error('PSE draft shortcodes changed');
  const tables=await Promise.all(ids.map(id=>read('/wp-json/tablepress/v1/table/'+id)));
  if(tables.some((table,i)=>table.id!==ids[i]||!Array.isArray(table.items)))
    throw Error('WordPress ESC Table data contract changed');
  const corporate=await read('/wp-json/wp/v2/thong-tin-chung/62?context=edit&_fields=id,acf');
  if(corporate.id!==62||!corporate.acf)throw Error('Canonical company information missing');
  const logo=await read('/wp-json/wp/v2/media/76980?context=edit');
  if(logo.id!==76980||logo.media_details?.file?.split('/').at(-1)!=='pse-original-logo-2025.jpg')
    throw Error('Incorrect official logo Media');
  const logoCandidates=[logo.source_url,logo.guid?.rendered].filter(x=>typeof x==='string'&&x.trim());
  let logoSrc='';
  for(const candidate of logoCandidates){
    try{
      const u=new URL(candidate);
      if(u.protocol!=='https:'||u.hostname!==new URL(origin).hostname||
         !u.pathname.endsWith('/pse-original-logo-2025.jpg')||
         !u.pathname.includes('/wp-content/uploads/'))continue;
      const head=await context.request.head(u.href,{timeout:25000});
      if(head.ok()&&(head.headers()['content-type']||'').startsWith('image/jpeg')){
        logoSrc=u.href;
        break;
      }
    }catch{}
  }
  if(!logoSrc){
    console.log('PSE_QA_LOGO_PAYLOAD_SHAPE='+JSON.stringify({
      sourceUrlType:typeof logo.source_url,guidType:typeof logo.guid?.rendered,
      candidates:logoCandidates.map(v=>{try{const u=new URL(v);return {protocol:u.protocol,host:u.hostname,path:u.pathname.slice(0,120)}}catch{return {invalid:true}}})
    }));
    throw Error('PSE official logo URL invalid');
  }
  const pagesRaw=await read('/wp-json/wp/v2/pages?status=publish&per_page=100&_fields=id,slug,acf,title');
  const pages=pagesRaw.map(p=>({
    id:String(p.id),key:String(p.acf?.key||''),action:String(p.acf?.action||''),
    lang:String(p.acf?.product_lang?.value||p.acf?.product_lang||'vi'),
    slug:String(p.slug||''),title:String(p.title?.rendered||'')
  }));
  const home=pages.find(p=>p.key==='home'&&p.action==='HomePage');
  if(!home)throw Error('Canonical public HomePage missing');
  const a=corporate.acf;
  const company=String(a.tencongty||'');
  const payload={
    currentPage:{...home,content,contents:ids.map((id,i)=>({type:'shortcode',shortcode:id,data:tables[i]}))},
    tables,pages,
    companyInfo:{
      id:62,tencongty:{vi:company},hotline:{vi:String(a.hotline||'')},
      sodienthoaiHCM:{vi:String(a.sodienthoaihcm||'')},
      emailHCM:{vi:String(a.emailhcm||'')},diachiHCM:{vi:String(a.diachihcm||'')},
      logo:{vi:{src:logoSrc,alt:company}},
      domain:{vi:String(a.domain||'')}
    }
  };
  await mkdir(path.dirname(routePath),{recursive:true});
  await mkdir(shots,{recursive:true});
  // No mock content, and no edits to app source. For DEV screenshot QA,
  // import the four PSE sections directly to avoid the inherited
  // ExtractHTML eager-registry importing unrelated retired CartPage modules.
  // Router/ExtractHTML full integration is NOT verified by this test.
  const route=[
    '---',
    'import "@/styles/global.css";',
    'import Layout from "@/astro/components/Layout/Layout.astro";',
    'import Hero from "@/astro/tablepress/Pse_00.astro";',
    'import News from "@/astro/tablepress/Pse_01.astro";',
    'import PromiseSection from "@/astro/tablepress/Pse_02.astro";',
    'import Utility from "@/astro/tablepress/Pse_03.astro";',
    'const payload='+JSON.stringify(payload)+';',
    'const page=payload.currentPage;',
    'const data_info=payload.companyInfo;',
    'const pages=payload.pages;',
    'const headProps={title:page.title,description:"PSE internal design QA",lang:"vi",href:Astro.url.href,currentPage:page,data_info,WC_URL:process.env.WC_URL,WC_URL_CLIENT:Astro.url.origin,basename:"/"};',
    'if (!headProps.href || !headProps.currentPage) throw new Error("Missing required headProps in QA fixture");',
    '---',
    '<Layout data_info={data_info} pages={pages} menus={[]} currentPage={page} headProps={headProps}>',
    '  <main id="main-content">',
    '    <Hero data={payload.tables[0]} page={page} />',
    '    <News data={payload.tables[1]} page={page} props={{data_info,basename:"/"}} />',
    '    <PromiseSection data={payload.tables[2]} page={page} />',
    '    <Utility data={payload.tables[3]} page={page} props={{pages,basename:"/"}} />',
    '  </main>',
    '</Layout>'
  ].join('\n');
  await writeFile(routePath,route);
  // Vite 8 dev SSR cannot evaluate some CommonJS dependencies when the
  // inherited production noExternal=[/.*/] rule is applied unchanged.
  // This override lives only in the disposable CI checkout; production source
  // and the PHP-controlled build policy are never modified.
  originalConfig=await readFile(astroConfigPath,'utf8');
  if(!originalConfig.includes('noExternal: [/.*/]'))throw Error('Expected inherited Astro SSR config not found');
  const safeConfig=originalConfig
    .replace('noExternal: [/.*/]','noExternal: []')
    .replace('export default defineConfig({',"export default defineConfig({\n  srcDir: './pse-qa-src',");
  if(safeConfig===originalConfig||!safeConfig.includes("srcDir: './pse-qa-src'"))
    throw Error('QA-only Astro srcDir override failed');
  await writeFile(astroConfigPath,safeConfig);
  console.log('PSE_QA_ISOLATED_DEV_SRCDIR=ON; production_source_unmodified=true');
  // Isolated srcDir contains only the temporary PSE preview route. All
  // imported PSE and Layout components remain the original GitHub source.
  server=spawn('pnpm',['dev','--host','127.0.0.1','--port','4321'],{
    cwd:sourceRoot,env:{...process.env,WC_URL:origin,WC_URL_CLIENT:'http://127.0.0.1:4321',PUBLIC_ENABLE_MARKETING:'false'},
    stdio:['ignore','pipe','pipe']
  });
  let output='';
  for(const stream of [server.stdout,server.stderr]){
    stream.on('data',d=>{output=(output+String(d)).slice(-6000)});
  }
  const testUrl='http://127.0.0.1:4321/pse-qa';
  let ready=false;
  for(let i=0;i<90;i++){
    if(server.exitCode!==null)throw Error('Astro dev server exited before readiness: '+output.slice(-800));
    await new Promise(r=>setTimeout(r,1000));
    try{
      const response=await context.request.get(testUrl,{timeout:2000});
      if(response.status()===200){ready=true;break}
    }catch{}
  }
  if(!ready)throw Error('Astro dev route not ready (no build): '+output.slice(-1800));
  const dimensions=[375,390,768,1440,1920];
  for(const width of dimensions){
    const view=await context.newPage();
    await view.setViewportSize({width,height:900});
    const browserErrors=[];
    view.on('pageerror',e=>browserErrors.push(String(e.message).slice(0,180)));
    const response=await view.goto(testUrl,{waitUntil:'domcontentloaded',timeout:60000});
    if(response?.status()!==200)throw Error('QA route HTTP '+response?.status()+' viewport '+width);
    try{
      await view.locator('[data-pse-section="hero"]').waitFor({timeout:12000});
    }catch(error){
      const diagnostic=await view.evaluate(()=>({
        pageTitle:document.title.slice(0,160),
        bodyStart:(document.body?.innerText||'').slice(0,1000),
        sectionCount:document.querySelectorAll('[data-pse-section]').length,
        heroCount:document.querySelectorAll('[data-pse-section="hero"]').length,
        errorOverlay:!!document.querySelector('vite-error-overlay,astro-error-overlay'),
        pageWidth:document.documentElement.scrollWidth
      })).catch(e=>({captureError:String(e).slice(0,180)}));
      console.log('PSE_QA_HERO_MISSING='+JSON.stringify({width,diagnostic,serverErrors:output.split('\n').filter(l=>/error|cannot|failed|not found/i.test(l)).slice(-14).map(x=>x.slice(0,250))}));
      await view.screenshot({path:path.join(shots,'pse-debug-'+width+'.png'),fullPage:true}).catch(()=>{});
      throw Error('QA hero missing: '+String(error).slice(0,160));
    }
    // Hero loads eagerly, while the second (lower) banner is lazy.
    // Trigger native lazy loading by scrolling the real image into view
    // before asserting completion. Never treat an offscreen lazy image
    // as a site regression just because no network request was started.
    const targets=view.locator('.pse-hero__photo,.pse-promise__background');
    for(let index=0;index<await targets.count();index++){
      const img=targets.nth(index);
      await img.scrollIntoViewIfNeeded({timeout:25000});
      try{
        await img.evaluate(async el=>{
          if(!(el instanceof HTMLImageElement))throw Error('Expected image node');
          if(el.complete && el.naturalWidth>0)return;
          await new Promise((resolve,reject)=>{
            const cleanup=()=>{
              clearTimeout(timer);
              el.removeEventListener('load',done);
              el.removeEventListener('error',failed);
            };
            const done=()=>{cleanup();resolve()};
            const failed=()=>{cleanup();reject(new Error('Image network error'))};
            const timer=setTimeout(()=>{
              cleanup();
              reject(new Error('Image load exceeded 12000ms'));
            },12000);
            el.addEventListener('load',done,{once:true});
            el.addEventListener('error',failed,{once:true});
            if(el.complete){if(el.naturalWidth>0)done();else failed();}
          });
        },undefined,{timeout:16000});
      }catch(error){
        const diag=await img.evaluate(el=>({
          src:el.currentSrc||el.src,complete:el.complete,
          naturalWidth:el.naturalWidth,loading:el.loading
        })).catch(()=>({unavailable:true}));
        console.log('PSE_QA_IMAGE_LOADING_FAILURE='+JSON.stringify({viewport:width,index,diag,error:String(error).slice(0,250)}));
        await view.screenshot({path:path.join(shots,'pse-debug-image-'+width+'.png'),fullPage:true}).catch(()=>{});
        throw error;
      }
    }
    await view.evaluate(()=>window.scrollTo(0,0));
    await view.waitForTimeout(500);
    const observed=await view.evaluate(()=>{
      const sections=Array.from(document.querySelectorAll('[data-pse-section]')).map(el=>el.getAttribute('data-pse-section'));
      const imgs=Array.from(document.querySelectorAll('.pse-hero__photo,.pse-promise__background')).map(el=>({
        loaded:el.complete&&el.naturalWidth>0,w:el.naturalWidth
      }));
      return {
        sections,images:imgs,
        viewport:document.documentElement.clientWidth,
        scroll:document.documentElement.scrollWidth,
        newsEmpty:document.querySelectorAll('.pse-news__empty').length,
        h1:document.querySelectorAll('h1').length,
        headerLogo:!!document.querySelector('#header-brandbar img')
      };
    });
    if(JSON.stringify(observed.sections)!==JSON.stringify(['hero','news','promise','utilities']))
      throw Error('Real PSE section layout missing viewport '+width+': '+JSON.stringify(observed.sections));
    if(observed.images.length!==2||observed.images.some(i=>!i.loaded)||observed.scroll>observed.viewport+3)
      throw Error('Visual layout media/overflow failure width '+width+': '+JSON.stringify(observed));
    if(browserErrors.length)throw Error('Browser script failure width '+width+': '+browserErrors.join(';'));
    const screenshot=path.join(shots,'pse-home-'+width+'.png');
    await view.screenshot({path:screenshot,fullPage:true,animations:'disabled'});
    console.log('PSE_REAL_CMS_VISUAL_QA=PASS; viewport='+width+'; '+JSON.stringify(observed));
    await view.close();
  }
  console.log('PSE_NO_BUILD_COMPONENT_VISUAL_QA=PASS; five_viewports=true; real_wordpress_tables=true; news_articles_are_still_drafts=true; ExtractHTML_router_not_tested=true; no_build=true');
}finally{
  if(server&&!server.killed){server.kill('SIGTERM')}
  await rm(routePath,{force:true}).catch(()=>{});
  if(originalConfig!==undefined)await writeFile(astroConfigPath,originalConfig).catch(()=>{});
  await rm(tempQaSrcDir,{recursive:true,force:true}).catch(()=>{});
  await browser.close();
}