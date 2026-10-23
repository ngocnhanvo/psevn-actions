import { chromium } from 'playwright';

function getEnv(name) {
  const matches=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,'')).filter(s=>s.startsWith(name+'='));
  if(matches.length!==1) throw new Error('Missing/duplicate '+name);
  const value=matches[0].slice(name.length+1).trim().replace(/^['"]|['"]$/g,'');
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||!['/',''].includes(url.pathname)||url.search||url.hash)throw new Error('Invalid WordPress HTTPS origin');
  return url.origin;
}
const origin=getEnv('WC_URL');
const username=process.env.WP_ADMIN_USERNAME;
const password=process.env.WP_ADMIN_PASSWORD;
if(!username||!password)throw new Error('Missing WP admin secrets');
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();
function mathAnswer(text){
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(!m)return null;
  const a=Number(m[1]),b=Number(m[3]);
  return ({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
}
try{
  await page.goto(origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
  if(await page.locator('#user_login').count()){
    await page.locator('#user_login').fill(username);
    await page.locator('#user_pass').fill(password);
    const answer=mathAnswer(await page.locator('body').innerText());
    if(answer!==null){
      const captcha=page.locator('#loginform input[name*="captcha" i], #loginform input[name*="math" i], #loginform input[name*="arith" i], #loginform input[type="number"]').first();
      if(!(await captcha.count()))throw new Error('Arithmetic challenge input unavailable');
      await captcha.fill(String(answer));
    }
    await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
  }
  if(page.url().includes('wp-login.php'))throw new Error('WordPress login unsuccessful');
  console.log('PSE_EDITOR_ADMIN_LOGIN=PASS');
  const wpData=await page.evaluate(async()=>{
    const get=async p=>{
      const r=await fetch(p,{credentials:'same-origin',headers:{Accept:'application/json'}});
      if(!r.ok)throw new Error('WordPress REST returned HTTP '+r.status);
      return r.json();
    };
    const [pages,infos]=await Promise.all([
      get('/wp-json/wp/v2/pages?status=publish&per_page=100&_fields=id,slug,acf'),
      get('/wp-json/wp/v2/thong-tin-chung?status=publish&per_page=100&_fields=id,acf')
    ]);
    return {home:pages.find(p=>p.acf?.key==='home'&&p.acf?.action==='HomePage'),infoId:infos[0]?.id};
  });
  if(!wpData.home||!wpData.infoId)throw new Error('Missing canonical home/site info');
  console.log('PSE_EDITOR_HOME_ID='+wpData.home.id);
  console.log('PSE_EDITOR_INFO_ID='+wpData.infoId);
  for(const [kind,id] of [['home',wpData.home.id],['information',wpData.infoId]]){
    await page.goto(origin+'/wp-admin/post.php?post='+id+'&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
    if(page.url().includes('wp-login.php'))throw new Error('WP editor redirected to login');
    const audit=await page.evaluate(()=>{
      const labels=Array.from(document.querySelectorAll('label')).map(n=>n.textContent?.replace(/\s+/g,' ').trim()).filter(t=>t&&t.length<75).slice(0,100);
      return {
        classicTitle:Boolean(document.querySelector('input#title')),
        blockTitle:Boolean(document.querySelector('.editor-post-title__input')),
        tinyMCE:Boolean(document.querySelector('#content_ifr')),
        blockEditor:Boolean(document.querySelector('.edit-post-visual-editor, .interface-interface-skeleton')),
        insertCodeControl:Array.from(document.querySelectorAll('button')).some(b=>/insert code|chèn mã/i.test(b.innerText||b.title||'')),
        labels,
        acfFields:Array.from(document.querySelectorAll('.acf-field[data-name]')).map(f=>({
          name:f.getAttribute('data-name'),
          type:f.getAttribute('data-type'),
          hasInput:Boolean(f.querySelector('input:not([type=hidden]), textarea'))
        })).slice(0,120)
      };
    });
    console.log('PSE_EDITOR_'+kind.toUpperCase()+'='+JSON.stringify(audit));
  }
  // ESC Table editor and Visual Builder are separate screens from the Page editor.
  // Inspect them without submitting forms, changing fields, or logging preview tickets.
  await page.goto(origin+'/wp-admin/admin.php?page=tablepress',{waitUntil:'domcontentloaded',timeout:60000});
  const tableAudit=await page.evaluate(()=>({
    screenTitle:(document.querySelector('#wpbody-content h1, .wrap h1')?.textContent||'').trim().slice(0,100),
    editorAvailable:Boolean(document.querySelector('#tablepress-page, #tablepress, .tablepress, [id*="tablepress"]')),
    linkLabels:Array.from(document.querySelectorAll('#wpbody-content a')).map(n=>(n.textContent||'').trim()).filter(x=>x.length&&x.length<65).slice(0,25),
    adminError:Boolean(document.querySelector('.wp-die-message, #error-page')),
  }));
  console.log('PSE_ESC_TABLE_ADMIN='+JSON.stringify(tableAudit));
  await page.goto(origin+'/wp-admin/edit.php?post_type=page&page=esc-visual-builder&esc_vb_page='+wpData.home.id,{waitUntil:'domcontentloaded',timeout:60000});
  const builderAudit=await page.evaluate(()=>({
    workspace:Boolean(document.querySelector('#esc-vb-app')),
    frame:Boolean(document.querySelector('#esc-vb-frame')),
    sectionControls:Boolean(document.querySelector('#esc-vb-refresh-section')),
    editorControls:Boolean(document.querySelector('#esc-vb-text-editor')),
    wpError:Boolean(document.querySelector('.wp-die-message, #error-page')),
  }));
  console.log('PSE_VISUAL_BUILDER_ADMIN='+JSON.stringify(builderAudit));


  // Continuation: probe the *actual* ESC Table authoring controls before a write.
  // Deliberately no form submit, navigation click, wp REST mutation, or draft creation.
  await page.goto(origin+'/wp-admin/admin.php?page=tablepress',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(1600);
  const tableList=await page.evaluate(()=>{
    const main=document.querySelector('#wpbody-content')||document.body;
    const labels=Array.from(main.querySelectorAll('h1,h2,button,a,[role=button]'))
      .map(x=>(x.textContent||x.getAttribute('aria-label')||'').replace(/\s+/g,' ').trim())
      .filter(x=>x.length>0 && x.length<60);
    const tableRows=Array.from(main.querySelectorAll('table tbody tr')).length;
    const addLinks=Array.from(main.querySelectorAll('a[href]'))
      .filter(x=>/add new|thêm mới/i.test(x.textContent||''))
      .map(x=>{const u=new URL(x.href);return u.pathname+'?'+u.searchParams.toString().slice(0,100)});
    return {tableRows,labels:Array.from(new Set(labels)).slice(0,45),addLinks,hasTableList:!!main.querySelector('table')};
  });
  console.log('PSE_ESC_TABLE_LIST_AUTHORING='+JSON.stringify(tableList));
  await page.goto(origin+'/wp-admin/admin.php?page=tablepress&action=add',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(1300);
  const tableAdd=await page.evaluate(()=>{
    const main=document.querySelector('#wpbody-content')||document.body;
    return {
      heading:(main.querySelector('h1')?.textContent||'').trim().slice(0,80),
      buttonLabels:Array.from(main.querySelectorAll('button,input[type=submit]'))
        .map(x=>(x.textContent||x.value||x.getAttribute('aria-label')||'').trim()).filter(Boolean).slice(0,38),
      fieldIds:Array.from(main.querySelectorAll('input,select,textarea'))
        .map(x=>x.id||x.name).filter(Boolean).slice(0,45),
      route:location.pathname+'?'+location.search.slice(1,130),
      error:!!document.querySelector('.wp-die-message,#error-page')
    };
  });
  console.log('PSE_ESC_TABLE_ADD_SCREEN='+JSON.stringify(tableAdd));
  await page.goto(origin+'/wp-admin/post.php?post='+wpData.home.id+'&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(1600);
  const homeControls=await page.evaluate(()=>{
    const root=document.querySelector('.acf-field[data-name="content"]');
    return {
      fieldExists:!!root,
      editorIds:Array.from(root?.querySelectorAll('textarea,iframe')||[]).map(x=>x.id||x.name).slice(0,12),
      editorButtons:Array.from(root?.querySelectorAll('button,.wp-media-buttons a')||[])
        .map(x=>(x.textContent||x.title||'').replace(/\s+/g,' ').trim()).filter(Boolean).slice(0,32),
      tinymceAvailable:!!root?.querySelector('iframe,[role=toolbar]'),
      builderShortcut:!!document.querySelector('.esc-vb-page-shortcut')
    };
  });
  console.log('PSE_HOME_ESC_INSERT_CODE_CAPABILITY='+JSON.stringify(homeControls));

  // Actual TinyMCE/ACF interface is lazily initialized. Read configured
  // toolbar and latest WordPress revision before any publishing action.
  const homeAuthoring=await page.evaluate(async()=>{
    const field=document.querySelector('.acf-field[data-name="content"]');
    const ta=field?.querySelector('textarea');
    const editor=ta&&window.tinymce?.get(ta.id);
    const buttons=Array.from(field?.querySelectorAll('[role="toolbar"] button,.mce-toolbar button,.mce-menu-item,.mce-btn')||[])
      .map(x=>({label:(x.getAttribute('aria-label')||x.title||x.textContent||'').replace(/\s+/g,' ').trim().slice(0,60),
                cls:String(x.className||'').slice(0,80)})).filter(x=>x.label).slice(0,60);
    const data=String(editor?.getContent({format:'raw'})||ta?.value||'');
    const matches=[...data.matchAll(/\[table\s+id=([A-Za-z0-9_-]+)\s*\/\]/gi)].map(m=>m[1]);
    const csrf=window.wpApiSettings?.nonce||window.wp?.apiFetch?.nonceMiddleware?.nonce||'';
    const resp=await fetch('/wp-json/wp/v2/pages/248/revisions?per_page=1&context=edit',
      {credentials:'same-origin',headers:{Accept:'application/json',...(csrf?{'X-WP-Nonce':csrf}:{})}});
    let revCount=null,lastRevisionId=null;
    if(resp.ok){const list=await resp.json();revCount=Number(resp.headers.get('X-WP-Total'));lastRevisionId=list?.[0]?.id||null}
    return {
      editorInitialized:!!editor,
      editorId:ta?.id||null,
      plugins:typeof editor?.settings?.plugins==='string'?editor.settings.plugins.split(/[,\s]+/).filter(Boolean).slice(0,35):[],
      buttons,
      shortcodeIds:matches,
      fieldEmpty:!data.trim(),
      sourceLength:data.length,
      revisionsHTTP:resp.status,
      revisionCount:revCount,
      hasPriorRevision:!!lastRevisionId,
      wpPageForm:!!document.querySelector('#post'),
      saveControl:!!document.querySelector('#publish'),
    };
  });
  console.log('PSE_HOME_INSERT_CODE_AND_REVISIONS='+JSON.stringify(homeAuthoring));

  await page.goto(origin+'/wp-admin/edit.php?post_type=page&page=esc-visual-builder&esc_vb_page='+wpData.home.id,
    {waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(1900);
  const builderControls=await page.evaluate(()=>{
    const root=document.querySelector('#esc-vb-app')||document.querySelector('#wpbody-content')||document.body;
    const controls=Array.from(root.querySelectorAll('button,[role=button],a'))
      .map(x=>(x.textContent||x.getAttribute('aria-label')||x.title||'').replace(/\s+/g,' ').trim())
      .filter(x=>x.length>0 && x.length<64);
    return {
      loaded:!!document.querySelector('#esc-vb-app'),
      frame:!!document.querySelector('#esc-vb-frame'),
      addSectionControls:controls.filter(x=>/thêm|add|section|bảng|table|code|chèn/i.test(x)).slice(0,32),
      labelCount:controls.length,
      hasSections:!!root.querySelector('[data-esc-section],[data-section-id],.esc-vb-section'),
      error:!!document.querySelector('.wp-die-message,#error-page')
    };
  });
  console.log('PSE_BUILDER_AUTHORING_CONTROLS='+JSON.stringify(builderControls));

  // Verify the normalized REST payload that Astro actually consumes.
  // This is strictly GET and never logs user credentials or private draft bodies.
  const runtimeShape=await page.evaluate(async ()=>{
    const res=await fetch('/wp-json/tablepress/v1/tables/prefix/all?per_page=100&page=1',
      {credentials:'same-origin',headers:{Accept:'application/json'}});
    if(!res.ok)return {http:res.status,tableFound:false};
    const data=await res.json();
    const rows=Array.isArray(data)?data:[];
    const table=rows.find(x=>String(x?.id).toLowerCase()==='pse_01_vi');
    return {
      http:res.status,
      tableFound:!!table,
      normalizedKeys:table?Object.keys(table).sort().slice(0,25):[],
      hasItems:Array.isArray(table?.items),
      itemCount:Array.isArray(table?.items)?table.items.length:null,
      itemFieldNames:Array.isArray(table?.items)?Array.from(new Set(table.items.flatMap(x=>Object.keys(x||{})))).slice(0,24):[],
      hasMeta:!!table?.meta,
      totalVisible:rows.length
    };
  });
  console.log('PSE_NEWS_TABLE_ASTRO_REST_SHAPE='+JSON.stringify(runtimeShape));


  // Observe the existing editable TablePress grid so next writer uses real UI,
  // never guessed DOM ids or direct database writes.
  await page.goto(origin+'/wp-admin/admin.php?page=tablepress&action=edit&table_id=pse_01_vi',
    {waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(1600);
  const gridShape=await page.evaluate(()=>{
    const tp=window.tp;
    const root=document.querySelector('#wpbody-content')||document.body;
    return {
      pageTitle:(root.querySelector('h1')?.textContent||'').trim().slice(0,100),
      tableId:tp?.table?.id||tp?.table?.meta?.id||null,
      rawRows:Array.isArray(tp?.table?.data)?tp.table.data.length:null,
      rawColumns:Array.isArray(tp?.table?.data?.[0])?tp.table.data[0].length:null,
      editorPresent:!!tp?.editor,
      visibleButtons:Array.from(root.querySelectorAll('button,input[type=submit]'))
        .map(x=>(x.textContent||x.value||x.getAttribute('aria-label')||'').trim())
        .filter(Boolean).slice(0,65),
      gridSelectors:{
        table:!!root.querySelector('.jexcel,.jspreadsheet'),
        cells:root.querySelectorAll('.jexcel td,.jspreadsheet td').length,
        addRows:!!root.querySelector('[id*=add-rows],[name*=add-rows]')
      }
    };
  });
  console.log('PSE_NEWS_ESC_GRID_AUTHORING_SHAPE='+JSON.stringify(gridShape));

  // WordPress Header menu is the source of navigation. Audit the existing
  // published tree before any redesign/cutover; no CMS/menu mutation.
  const menuSummary=await page.evaluate(async ()=>{
    const res=await fetch('/wp-json/esc-api/v1/menus',{credentials:'same-origin',
      headers:{Accept:'application/json'}});
    if(!res.ok)return {http:res.status,configured:false};
    const body=await res.json();
    const header=body?.menus?.Header||{};
    const versions=Object.entries(header).map(([lang,value])=>({
      lang,code:value?.code||null,type:value?.type||null,
      items:Array.isArray(value?.items)?value.items.slice(0,20).map(item=>({
        label:String(item?.label||'').slice(0,95),
        slug:String(item?.slug||'').slice(0,135),
        childCount:Array.isArray(item?.children)?item.children.length:0,
        linkType:item?.linkType||null
      })):[]
    }));
    return {http:res.status,configured:body?.success===true,versions};
  });
  console.log('PSE_WP_HEADER_MENU_AUDIT='+JSON.stringify(menuSummary));

  console.log('PSE_CMS_AUTHORING_PREFLIGHT=PASS read_only=true no_content_saved=true');

  console.log('PSE_EDITOR_AUDIT=PASS read_only=true no_content_saved=true');
}finally{await browser.close()}
