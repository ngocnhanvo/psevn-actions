/** Source-only Astro DEV browser QA with verified WordPress CMS. Not a build/deploy.
 * Temporary route lives exclusively inside Actions checkout and is not committed.
 * Reject source-editor placeholder images and visually invisible section geometry.
 * Validation target: real HomePage/ExtractHTML after preview-wrapper normalization.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir,writeFile,readFile,rm } from 'node:fs/promises';
import path from 'node:path';
const ids=['pse_00_vi','pse_01_vi','pse_02_vi','pse_03_vi'];
const archiveOnly=process.env.PSE_QA_ARCHIVE_ONLY==='1';
console.log('PSE_QA_IMAGE_WAIT_VERSION=bounded-polling-global-watchdog-v3');
console.log('PSE_QA_ROUTER_CONTRACT=HomePage+ExtractHTML; source_compile_fix=Contact_00');
console.log('PSE_QA_SEARCH_ARCHIVE_PREVIEW=real_WP_draft_77030; never_published');
console.log('PSE_QA_ARCHIVE_ONLY_REQUESTED='+(archiveOnly?'yes':'no'));
console.log('PSE_QA_ARCHIVE_QUERY_DIAGNOSTIC_VERSION=3_ssr_postspage');
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
const archiveRoutePath=path.join(tempQaSrcDir,'pages/tin-tuc-su-kien.astro');
const astroConfigPath=path.join(sourceRoot,'astro.config.mjs');
let originalConfig;

const shots=path.resolve('artifacts/pse-homepage-visual-qa');
const pageWait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let currentQaPhase='initial';
const qaOverallLimit=setTimeout(()=>{
  console.error('PSE_QA_GLOBAL_WATCHDOG=FAIL; phase='+currentQaPhase);
  process.exit(124);
},240000);
qaOverallLimit.unref();
const phase=p=>{currentQaPhase=p;console.log('PSE_QA_PHASE='+p)};
phase('launch-browser');
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900}});
const admin=await context.newPage();
let server;
try{
  const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
  if(!username||!password)throw Error('WordPress admin secrets missing');
  phase('wordpress-admin-login');
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
  phase('cms-read-draft');
  const draft=await read('/wp-json/wp/v2/pages/76969?context=edit&_fields=id,status,title,slug,content,acf');
  if(draft.id!==76969||draft.status!=='draft'||draft.acf?.action!=='HomePage'||
    draft.acf?.key!=='pse-home-design-draft')throw Error('Wrong PSE unpublished draft');
  const content=String(draft.content?.raw||'');
  const actual=[...content.matchAll(/\[table\s+id=([a-z0-9_-]+)\s*\/\]/gi)].map(m=>m[1].toLowerCase());
  if(JSON.stringify(actual)!==JSON.stringify(ids))throw Error('PSE draft shortcodes changed');
  phase('cms-read-tables');
  const tables=await Promise.all(ids.map(id=>read('/wp-json/tablepress/v1/table/'+id)));
  if(tables.some((table,i)=>table.id!==ids[i]||!Array.isArray(table.items)))
    throw Error('WordPress ESC Table data contract changed');
  phase('cms-read-corporate');
  const corporate=await read('/wp-json/wp/v2/thong-tin-chung/62?context=edit&_fields=id,acf');
  if(corporate.id!==62||!corporate.acf)throw Error('Canonical company information missing');
  phase('cms-read-logo');
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
  phase('cms-read-menu');
  const headerMenuResponse=await read('/wp-json/esc-api/v1/menus');
  const headerMenu=headerMenuResponse?.menus?.Header?.vi;
  const menuItems=headerMenu?.items||[];
  if(!headerMenuResponse?.success||menuItems.length!==6||
     menuItems.map(x=>x.label).join('|')!=='TRANG CHỦ|PVFCCo-PSE|TIN TỨC - SỰ KIỆN|HOẠT ĐỘNG KINH DOANH|QUAN HỆ NHÀ ĐẦU TƯ|LIÊN HỆ')
    throw Error('PSE actual WordPress Header menu is not the verified legacy tree');
  console.log('PSE_QA_WORDPRESS_MENU=PASS; roots=6; no_EduResearch_menu=true');
  phase('cms-read-pages');
  const pagesRaw=await read('/wp-json/wp/v2/pages?status=publish&per_page=100&_fields=id,slug,acf,title');
  const pages=pagesRaw.map(p=>({
    id:String(p.id),key:String(p.acf?.key||''),action:String(p.acf?.action||''),
    lang:String(p.acf?.product_lang?.value||p.acf?.product_lang||'vi'),
    slug:String(p.slug||''),title:String(p.title?.rendered||'')
  }));
  const home=pages.find(p=>p.key==='home'&&p.action==='HomePage');
  if(!home)throw Error('Canonical public HomePage missing');
  // The archive exists only as a private WordPress draft. Include its verified
  // metadata exclusively in this ephemeral browser preview: no publication.
  phase('cms-read-private-search-archive');
  const archive=await read('/wp-json/wp/v2/pages/77030?context=edit&_fields=id,status,slug,title,acf,content');
  if(archive.id!==77030||archive.status!=='draft'||archive.slug!=='tin-tuc-su-kien'||
     archive.acf?.action!=='PostsPage'||archive.acf?.key!=='ssr-posts')
    throw Error('Existing private PSE search archive changed; no fake route');
  const archivePage={
    id:String(archive.id),key:'ssr-posts',action:'PostsPage',lang:'vi',
    slug:archive.slug,title:String(archive.title?.raw||archive.title?.rendered||'Tin tức - Sự kiện'),
    label:String(archive.acf?.label||'Tin tức - Sự kiện'),content:String(archive.content?.raw||'')
  };
  const categoryData=await read('/wp-json/wp/v2/categories?include=1742,1743,1744&per_page=10&_fields=id,slug,name');
  if(!Array.isArray(categoryData)||categoryData.length!==3||
     [1742,1743,1744].some(id=>!categoryData.some(c=>c.id===id)))
    throw Error('Three real PSE WordPress categories missing');
  pages.push(archivePage);
  console.log('PSE_PRIVATE_ARCHIVE_PREVIEW=PASS; wp_id=77030; status=draft; not_published=true');
  const a=corporate.acf;
  const company=String(a.tencongty||'');
  const payload={
    currentPage:{...home,content,contents:ids.map((id,i)=>({type:'shortcode',shortcode:id,data:tables[i]}))},
    tables,pages,menuItems,archivePage,categoryData,
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
  // Use the actual PSE homepage CMS shortcode pipeline, not a manually
  // assembled reproduction: HomePage -> ExtractHTML -> Pse_00..03. We only
  // isolate unrelated site routes in a disposable Astro DEV srcDir. No build.
  const route=[
    '---',
    'import "@/styles/global.css";',
    'import Layout from "@/astro/components/Layout/Layout.astro";',
    'import HomePage from "@/astro/pages/HomePage.astro";',
    'const payload='+JSON.stringify(payload)+';',
    'const page=payload.currentPage;',
    'const data_info=payload.companyInfo;',
    'const pages=payload.pages;',
    'const headProps={title:page.title,description:"PSE internal design QA",lang:"vi",href:Astro.url.href,currentPage:page,data_info,WC_URL:process.env.WC_URL,WC_URL_CLIENT:Astro.url.origin,basename:"/"};',
    'if (!headProps.href || !headProps.currentPage) throw new Error("Missing required headProps in QA fixture");',
    '---',
    '<Layout data_info={data_info} pages={pages} menus={payload.menuItems} currentPage={page} headProps={headProps}>',
    '  <HomePage currentPage={page} pages={pages} data_info={data_info} basename="/" />',
    '</Layout>'
  ].join('\n');
  await writeFile(routePath,route);
  // Render the actual shared PostsPage with the verified private draft record,
  // empty public post result set, and real category filters. The route is
  // transient in the Actions checkout and cannot publish WordPress content.
  const archiveRoute=[
    '---',
    'export const prerender=false;',
    'import "@/styles/global.css";',
    'import Layout from "@/astro/components/Layout/Layout.astro";',
    'import PostsPage from "@/astro/pages/PostsPage.astro";',
    'const payload='+JSON.stringify(payload)+';',
    'const page=payload.archivePage;',
    'const pages=payload.pages;',
    'const data_info=payload.companyInfo;',
    'const searchQuery=Astro.url.searchParams.get("q")||"";',
    'const categoryQuery=Astro.url.searchParams.get("cat")||"";',
    'const headProps={title:page.title,description:"PSE private archive QA",lang:"vi",href:Astro.url.href,currentPage:page,data_info,WC_URL:process.env.WC_URL,WC_URL_CLIENT:Astro.url.origin,basename:"/"};',
    '---',
    '<Layout data_info={data_info} pages={pages} menus={payload.menuItems} currentPage={page} headProps={headProps}>',
    '  <PostsPage page={page} pages={pages} data_info={data_info} basename="/" searchQuery={searchQuery} categoryQuery={categoryQuery} cates={payload.categoryData} props={{items:[],perPage:12,page:1,total:0}} />',
    '</Layout>'
  ].join('\n');
  await writeFile(archiveRoutePath,archiveRoute);
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
  phase('start-isolated-Astro-server');
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
  // Kill a stalled Playwright/Vite process rather than consume the entire
  // runner timeout: the browser QA must report the last real phase.
  let qaPhase='initializing';
  const hardDeadline=setTimeout(()=>{
    console.error('PSE_VISUAL_QA_HARD_DEADLINE=FAIL; phase='+qaPhase);
    process.exit(124);
  },220000);
  hardDeadline.unref();
  phase('start-five-viewports');
  const dimensions=archiveOnly?[]:[375,390,768,1440,1920];
  if(archiveOnly)console.log('PSE_FIVE_HOME_VIEWPORTS=SKIPPED_ALREADY_VERIFIED; archive_only=true');
  for(const width of dimensions){
    qaPhase='viewport_'+width+'_opening';
    console.log('PSE_QA_VIEWPORT_START='+width);
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
    const imageCount=await targets.count();
    if(imageCount!==2)throw Error('Missing actual PSE banner images: '+imageCount);
    for(let index=0;index<imageCount;index++){
      qaPhase='viewport_'+width+'_image_'+index;
      console.log('PSE_QA_IMAGE_BEGIN='+JSON.stringify({width,index}));
      const img=targets.nth(index);
      await img.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
      let loaded=false;
      for(let attempt=0;attempt<25;attempt++){
        const state=await img.evaluate(el=>({
          naturalWidth:el.naturalWidth||0,
          complete:el.complete,
          currentSrc:el.currentSrc||el.src||'',
          loading:el.loading
        }));
        if(state.naturalWidth>0){loaded=true;break}
        if(state.complete&&state.naturalWidth===0){
          console.log('PSE_QA_IMAGE_BROKEN='+JSON.stringify({width,index,sourcePath:(()=>{try{return new URL(state.currentSrc).pathname}catch{return ''}})()}));
          break;
        }
        await pageWait(400);
      }
      if(!loaded){
        const last=await img.evaluate(el=>({naturalWidth:el.naturalWidth,
          complete:el.complete,
          loading:el.loading,
          srcPath:(()=>{try{return new URL(el.currentSrc||el.src).pathname}catch{return ''}})()
        })).catch(()=>({unavailable:true}));
        console.log('PSE_QA_IMAGE_NOT_READY='+JSON.stringify({width,index,last}));
        await view.screenshot({path:path.join(shots,'pse-debug-image-'+width+'.png'),fullPage:false,timeout:8000}).catch(()=>{});
        throw Error('PSE image still failed after bounded 10s polling width='+width+' image='+index);
      }
      console.log('PSE_QA_IMAGE_OK='+JSON.stringify({width,index}));
    }
    await view.evaluate(()=>window.scrollTo(0,0));
    await view.waitForTimeout(500);
    qaPhase='viewport_'+width+'_inspecting';
    const observed=await view.evaluate(()=>{
      const sections=Array.from(document.querySelectorAll('[data-pse-section]')).map(el=>el.getAttribute('data-pse-section'));
      const imgs=Array.from(document.querySelectorAll('.pse-hero__photo,.pse-promise__background')).map(el=>({
        loaded:el.naturalWidth>0,w:el.naturalWidth,complete:el.complete
      }));
      return {
        sections,images:imgs,
        shortcodeWrappers:document.querySelectorAll('[data-tablepress-preview]').length,
        viewport:document.documentElement.clientWidth,
        scroll:document.documentElement.scrollWidth,
        newsEmpty:document.querySelectorAll('.pse-news__empty').length,
        h1:document.querySelectorAll('h1').length,
        headerLogo:!!document.querySelector('#header-brandbar img'),
        headerMenuRoots:document.querySelectorAll('#desktop-menu > ul > li').length,
        heroCopy:!!document.querySelector('.pse-hero__copy'),
        legacyAiWidget:!!document.querySelector('#ai-agent-btn'),
        legacyStickySales:!!document.querySelector('#bottom-contact-bar')
      };
    });
    // Explicit pixel/visibility diagnostics: a DOM PASS must never conceal
    // empty scroll-reveal regions or TinyMCE ESC Table preview placeholders.
    const visualDiag=await view.evaluate(()=>{
      const sections=[...document.querySelectorAll('[data-pse-section]')].map(el=>{
        const rect=el.getBoundingClientRect(), css=getComputedStyle(el);
        return {section:el.getAttribute('data-pse-section'),y:Math.round(rect.top+scrollY),
          h:Math.round(rect.height),opacity:css.opacity,visibility:css.visibility,
          display:css.display,contentVisibility:css.contentVisibility,offsetText:(el.innerText||'').trim().slice(0,90)};
      });
      const previewImages=[...document.querySelectorAll('img')].filter(img=>
        /Hình ảnh cho table|Image for table|pse_0[0-3]_vi/i.test(img.alt||'')).map(img=>{
        const r=img.getBoundingClientRect();
        return {alt:img.alt.slice(0,90),srcPresent:!!img.getAttribute('src'),
          y:Math.round(r.top+scrollY),height:Math.round(r.height),
          parentTag:img.parentElement?.tagName||'',parentHtml:img.parentElement?.outerHTML.slice(0,250)||''};
      });
      const htmlGaps=[...document.querySelectorAll('main#main-content > span,main#main-content > div')]
        .filter(el=>!el.hasAttribute('data-tablepress-preview')).slice(0,12).map(el=>({
          tag:el.tagName,text:(el.innerText||'').trim().slice(0,50),
          html:el.outerHTML.slice(0,220),
          height:Math.round(el.getBoundingClientRect().height)
        }));
      return {sections,previewImages,htmlGaps,pageHeight:document.documentElement.scrollHeight};
    });
    console.log('PSE_REAL_CMS_VISUAL_LAYOUT_DIAGNOSTIC='+JSON.stringify({width,...visualDiag}));
    if(visualDiag.previewImages.length)
      throw Error('Native WP ESC Table editor preview images leaked into public render: '+JSON.stringify(visualDiag.previewImages));
    if(visualDiag.sections.some(x=>x.h<48||x.visibility!=='visible'||x.opacity==='0'))
      throw Error('PSE section exists in DOM but not visually rendered: '+JSON.stringify(visualDiag.sections));
    if(JSON.stringify(observed.sections)!==JSON.stringify(['hero','news','promise','utilities']))
      throw Error('Real PSE section layout missing viewport '+width+': '+JSON.stringify(observed.sections));
    if(observed.shortcodeWrappers!==4)
      throw Error('Astro ExtractHTML did not recognize four native ESC Table shortcodes width='+width);
    if(observed.images.length!==2||observed.images.some(i=>!i.loaded)||observed.scroll>observed.viewport+3)
      throw Error('Visual layout media/overflow failure width '+width+': '+JSON.stringify(observed));
    if(observed.headerMenuRoots!==6)
      throw Error('WordPress Header menu not rendered on PSE homepage, viewport '+width);
    if(!observed.heroCopy||observed.legacyAiWidget||observed.legacyStickySales)
      throw Error('PSE homepage still contains unreadable hero or inherited template widgets width='+width+': '+JSON.stringify(observed));
    if(width>=900){
      const trigger=view.locator('#desktop-menu button[data-menu-trigger]').first();
      await trigger.click({timeout:5000});
      if(await trigger.getAttribute('aria-expanded')!=='true')
        throw Error('PSE desktop dropdown click did not open');
      await view.keyboard.press('Escape');
      if(await trigger.getAttribute('aria-expanded')!=='false')
        throw Error('PSE desktop dropdown Escape did not close');
      console.log('PSE_HEADER_DESKTOP_CLICK_ESCAPE=PASS; viewport='+width);
    }else if(width<=390){
      const mobileToggle=view.locator('#hamburger-btn');
      await mobileToggle.click({timeout:5000});
      if(await mobileToggle.getAttribute('aria-expanded')!=='true')
        throw Error('PSE mobile menu did not open');
      await mobileToggle.click({timeout:5000});
      if(await mobileToggle.getAttribute('aria-expanded')!=='false')
        throw Error('PSE mobile menu did not close');
      console.log('PSE_HEADER_MOBILE_CLICK_TOGGLE=PASS; viewport='+width);
    }
    if(browserErrors.length)throw Error('Browser script failure width '+width+': '+browserErrors.join(';'));
    const screenshot=path.join(shots,'pse-home-'+width+'.png');
    qaPhase='viewport_'+width+'_screenshot';
    console.log('PSE_QA_SCREENSHOT_START='+width);
    await view.screenshot({path:screenshot,fullPage:true,animations:'disabled',timeout:12000});
    console.log('PSE_REAL_CMS_VISUAL_QA=PASS; viewport='+width+'; '+JSON.stringify(observed));
    await view.close();
  }
  // End-to-end preview of the WordPress-owned PostsPage draft, not a
  // synthetic search results page. No articles are fabricated or published.
  qaPhase='archive-private-preview';
  phase('archive-private-preview');
  const searchBrowser=await context.newPage();
  await searchBrowser.setViewportSize({width:390,height:900});
  const archiveUrl='http://127.0.0.1:4321/tin-tuc-su-kien';
  const archiveResponse=await searchBrowser.goto(archiveUrl,{waitUntil:'domcontentloaded',timeout:30000});
  if(archiveResponse?.status()!==200)throw Error('PSE private archive QA returned HTTP '+archiveResponse?.status());
  const archiveForm=searchBrowser.locator('form#search-form');
  await archiveForm.waitFor({timeout:10000});
  if(await searchBrowser.locator('h1').count()!==1 ||
     await searchBrowser.locator('#category-dropdown-container .dropdown-option').count()!==4 ||
     await searchBrowser.locator('#posts-grid').count()!==1)
    throw Error('PSE PostsPage private archive UI missing search/filter/results');
  await searchBrowser.locator('#search-input').fill('phân bón');
  await searchBrowser.locator('#search-input').press('Enter');
  await searchBrowser.waitForURL(/\/tin-tuc-su-kien\?q=/,{timeout:20000});
  const afterSearch=new URL(searchBrowser.url());
  await searchBrowser.locator('#search-input').waitFor({state:'visible',timeout:10000});
  const queryValues=afterSearch.searchParams.getAll('q');
  const inputValue=await searchBrowser.locator('#search-input').inputValue();
  console.log('PSE_PRIVATE_SEARCH_ROUNDTRIP_DIAG='+JSON.stringify({
    path:afterSearch.pathname,queryValues,inputValue,
    paramNames:[...afterSearch.searchParams.keys()]
  }));
  if(queryValues.length!==1||queryValues[0]!=='phân bón'||inputValue!=='phân bón')
    throw Error('WordPress PostsPage search GET query did not round-trip');
  const archiveOverflow=await searchBrowser.evaluate(()=>
    document.documentElement.scrollWidth>document.documentElement.clientWidth+3);
  if(archiveOverflow)throw Error('PSE PostsPage search preview has horizontal overflow at 390px');
  await searchBrowser.screenshot({path:path.join(shots,'pse-private-archive-390.png'),fullPage:true,animations:'disabled',timeout:12000});
  console.log('PSE_PRIVATE_POSTSPAGE_SEARCH_QA=PASS; draft_id=77030; action=PostsPage; q_roundtrip=true; categories=3; published_post_count=0; no_overflow=true; no_publication=true');
  await searchBrowser.close();
  clearTimeout(hardDeadline);
  if(!archiveOnly)console.log('PSE_NO_BUILD_COMPONENT_VISUAL_QA=PASS; five_viewports=true; real_wordpress_tables=true; news_articles_are_still_drafts=true; HomePage_ExtractHTML_component_contract_tested=true; real_public_route_not_tested=true; no_build=true');
  else console.log('PSE_ARCHIVE_ONLY_QA=PASS; prior_home_visual_run=39914740583; no_source_build=true');
  // GitHub Actions destroys this disposable container after artifact upload.
  // After all five screenshots and assertions are complete, exit explicitly:
  // Vite/Chromium can retain handles indefinitely even after browser.close().
  // Never use this exit path before the verified PASS marker above.
  try{server?.kill('SIGKILL')}catch{}
  console.log('PSE_QA_VERIFIED_COMPLETE_EXIT=0');
  process.exit(0);
}finally{
  clearTimeout(qaOverallLimit);
  // CI must never hang after all five screenshots completed: Vite and the
  // Chromium transport may leave open handles even after successful QA.
  if(server?.pid){
    try{server.kill('SIGKILL')}catch{}
  }
  await rm(routePath,{force:true}).catch(()=>{});
  await rm(archiveRoutePath,{force:true}).catch(()=>{});
  if(originalConfig!==undefined)await writeFile(astroConfigPath,originalConfig).catch(()=>{});
  await rm(tempQaSrcDir,{recursive:true,force:true}).catch(()=>{});
  const closed=await Promise.race([
    browser.close().then(()=>true).catch(()=>false),
    pageWait(4000).then(()=>false)
  ]);
  if(!closed){
    console.error('PSE_QA_BROWSER_CLOSE_TIMEOUT=forced_cleanup');
    try{browser.process()?.kill('SIGKILL')}catch{}
  }
}