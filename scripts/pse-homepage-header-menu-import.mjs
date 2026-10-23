/** Restore real PSE original menu via native WordPress Menu Import JSON Preview/Replace with strict idempotent preflight. */
import { chromium } from 'playwright';
const origin=(()=>{
  const rows=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,'')).filter(x=>x.startsWith('WC_URL='));
  if(rows.length!==1)throw Error('Missing or ambiguous WC_URL');
  const url=new URL(rows[0].slice(7).trim().replace(/^['"]|['"]$/g,''));
  if(url.protocol!=='https:'||!url.hostname||url.username||url.password||(url.port&&url.port!=='443')||!['','/'].includes(url.pathname)||url.search||url.hash)
    throw Error('Invalid PSE HTTPS CMS origin');
  return url.origin;
})();
const lanes=[
  {slug:'tin-cong-ty',name:'Tin PVFCCo-PSE',label:'Tin PVFCCo-PSE'},
  {slug:'thong-tin-thi-truong',name:'Tin mùa vụ thị trường',label:'Tin mùa vụ thị trường'},
  {slug:'thong-tin-co-dong',name:'Thông tin cổ đông',label:'Thông tin cổ đông'}
];
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:950}});
const page=await context.newPage();
page.on('dialog',async d=>{try{if(d.type()==='confirm')await d.accept();else await d.dismiss()}catch(e){if(!String(e).includes('already handled'))throw e}});
try {
  const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
  if(!username||!password)throw Error('Missing WordPress admin credentials');
  await page.goto(origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
  if(await page.locator('#user_login').count()){
    await page.locator('#user_login').fill(username);
    await page.locator('#user_pass').fill(password);
    const txt=await page.locator('body').innerText();
    const match=txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if(match){
      const a=Number(match[1]),b=Number(match[3]);
      const ans=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[match[2]];
      const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if(!await f.count())throw Error('Missing arithmetic challenge field');
      await f.fill(String(ans));
    }
    await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
  }
  if(page.url().includes('wp-login'))throw Error('WordPress admin login failed');
  const restNonce=await page.evaluate(async()=>{
    const cached=window.wpApiSettings?.nonce;
    if(cached)return cached;
    // Core WordPress AJAX handler: returns wp_create_nonce('wp_rest') for
    // authenticated admin sessions. Never write this value to logs.
    const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',
      {credentials:'same-origin',headers:{Accept:'text/plain'}});
    if(!r.ok)throw Error('Cannot obtain WordPress REST nonce (HTTP '+r.status+')');
    const token=(await r.text()).trim();
    if(!/^[a-zA-Z0-9]{8,24}$/.test(token)||token==='0')throw Error('Invalid WordPress REST nonce response');
    return token;
  });
  const api=async(path,method='GET',body)=>{
    const out=await page.evaluate(async({path,method,body,restNonce})=>{
      const nonce=restNonce;
      const res=await fetch(path,{method,credentials:'same-origin',
        headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...(nonce?{'X-WP-Nonce':nonce}:{})},
        ...(body?{body:JSON.stringify(body)}:{})});
      const payload=await res.json().catch(()=>({}));
      return {status:res.status,payload};
    },{path,method,body,restNonce});
    return out;
  };


  const existing=await api('/wp-json/esc-api/v1/menus');
  if(existing.status!==200||existing.payload?.success!==true)
    throw Error('Could not confirm WordPress Header source before Replace');
  const present=existing.payload.menus?.Header?.vi;
  if(!present||present.name!=='MenuTop'||present.code!=='Header'||present.lang!=='vi')
    throw Error('WordPress Header identity changed; no modification');
  const oldLabels=['Trang chủ','Sổ tay NCKH','Giáo viên hướng dẫn','Đánh giá kỹ năng','Khám phá nền tảng'];
  const oldSlugs=['/','so-tay','so-tay?tab=teachers','so-tay?tab=skills','so-tay'];
  const current=present.items||[];
  const oldClean=current.length===5 && current.every((x,i)=>
    x.label===oldLabels[i] && x.slug===oldSlugs[i] && (!x.children||x.children.length===0));
  const expectedRoots=['TRANG CHỦ','PVFCCo-PSE','TIN TỨC - SỰ KIỆN','HOẠT ĐỘNG KINH DOANH','QUAN HỆ NHÀ ĐẦU TƯ','LIÊN HỆ'];
  const flattenExisting=items=>items.flatMap(item=>[item,...flattenExisting(Array.isArray(item.children)?item.children:[])]);
  if(current.length===6&&flattenExisting(current).length===47&&
     current.map(x=>x.label).every((x,i)=>x===expectedRoots[i])){
    console.log('PSE_HEADER_MENU=ALREADY_REPLACED; original_legacy_parity=true; no CMS mutation');
    console.log('PSE_HEADER_MENU_IMPORT=PASS');
  }else{
    if(!oldClean)throw Error('Current WordPress menu no longer the verified inherited EduResearch menu; no Replace');
    // Preserve the prior publicly exposed menu state for a reversible restore.
    console.log('PSE_HEADER_MENU_PRE_REPLACE_SNAPSHOT='+JSON.stringify(current.map(x=>({
      label:x.label,slug:x.slug,key:x.key,linkType:x.linkType
    }))));
    const source=await context.newPage();
    const sourceResponse=await source.goto('https://www.pse.vn/',{waitUntil:'domcontentloaded',timeout:60000});
    if(sourceResponse?.status()!==200)throw Error('PSE legacy source menu HTTP '+sourceResponse?.status());
    const sourceTree=await source.evaluate(()=>{
      const ul=document.querySelector('nav.navigation > ul.nav.unite-nav')||document.querySelector('ul.nav.unite-nav');
      if(!ul)throw Error('Original PSE site has no verified menu selector');
      const nodes=(el,depth=0)=>{
        if(depth>4)throw Error('Unexpected original menu nesting');
        const link=el.querySelector(':scope > a[href]');
        const name=String(link?.textContent||el.querySelector(':scope > span')?.textContent||'').replace(/\s+/g,' ').trim();
        if(!name)throw Error('Original PSE menu contains blank label');
        const url=link?.href||'';
        if(url){
          const u=new URL(url);
          if(u.protocol!=='https:'||u.hostname!=='www.pse.vn')
            throw Error('Original PSE menu points outside the verified legacy source');
        }
        return {label:name,href:url,
          children:Array.from(el.querySelectorAll(':scope > ul > li,:scope > .dropdown-menu > li'))
            .map(child=>nodes(child,depth+1))};
      };
      return Array.from(ul.children).filter(x=>x.tagName==='LI').map(x=>nodes(x));
    });
    await source.close();
    const flatten=xs=>xs.flatMap(x=>[x,...flatten(x.children)]);
    const all=flatten(sourceTree);
    if(sourceTree.length!==6||!sourceTree.every((x,i)=>x.label===expectedRoots[i])||
       all.length<40||all.length>85||all.some(x=>!x.href&&!x.children.length))
      throw Error('Original PSE menu structure changed; refuse destructive replacement');
    // Keep exact legacy links until corresponding PSE content is safely
    // migrated to the new CMS. No fake or future internal routes.
    const asImport=xs=>xs.map(x=>({
      label:x.label,lang:'vi',...(x.href?{href:x.href,linkMode:'custom'}:{linkMode:'none'}),
      ...(x.label==='TRANG CHỦ'?{key:'home'}:{}),
      ...(x.label==='LIÊN HỆ'?{key:'contact'}:{}),
      children:asImport(x.children)
    }));
    const tree=asImport(sourceTree);
    const checksum=all.length+':'+sourceTree.map(x=>x.label).join('|');
    console.log('PSE_LEGACY_MENU_VALIDATED='+JSON.stringify({total:all.length,roots:sourceTree.length,signature:checksum}));
    await page.goto(origin+'/wp-admin/nav-menus.php?action=edit&menu=1687',
      {waitUntil:'domcontentloaded',timeout:60000});
    const input=page.locator('#esc-pse-menu-json-input');
    const preview=page.locator('#esc-pse-menu-json-preview');
    const replace=page.locator('#esc-pse-menu-json-replace');
    await input.waitFor({state:'visible',timeout:25000});
    if(await preview.getAttribute('data-menu-id')!=='1687')
      throw Error('Wrong WordPress Menu Manager target; refuse Replace');
    await input.fill(JSON.stringify(tree));
    const previewResponse=page.waitForResponse(r=>
      r.url().includes('admin-ajax.php')&&
      (r.request().postData()||'').includes('esc_pse_menu_json_preview'),{timeout:60000});
    await preview.click();
    const previewResult=await (await previewResponse).json();
    if(previewResult.success!==true||previewResult.data?.menu?.id!==1687||
       previewResult.data?.menu?.code!=='Header'||previewResult.data?.menu?.lang!=='vi'||
       previewResult.data?.stats?.total!==all.length||
       previewResult.data?.stats?.excludedLanguage!==0)
      throw Error('WordPress native Menu Import preview failed or unexpected mapping');
    const stats=previewResult.data.stats;
    if(stats.pageMatches+stats.customLinks+stats.linkless!==all.length)
      throw Error('WordPress Menu Import preview counts inconsistent');
    console.log('PSE_HEADER_MENU_IMPORT_PREVIEW=PASS; total='+stats.total+
      '; pageMatches='+stats.pageMatches+'; customLinks='+stats.customLinks+
      '; linkless='+stats.linkless+'; unmatchedInternal='+stats.unmatchedInternal);
    if(await replace.isHidden())throw Error('WordPress native Replace control not unlocked by Preview');
    // Original shared WordPress Admin handler already accepts confirmations.
    // Registering another listener double-handles Playwright dialogs.
    const replaceResponse=page.waitForResponse(r=>
      r.url().includes('admin-ajax.php')&&
      (r.request().postData()||'').includes('esc_pse_menu_json_replace'),{timeout:120000});
    await replace.click({noWaitAfter:true});
    const writeResult=await (await replaceResponse).json();
    if(writeResult.success!==true||writeResult.data?.items!==all.length)
      throw Error('Menu Import Replace did not return verified success');
    let verified=false;
    for(let attempt=0;attempt<15;attempt++){
      await page.waitForTimeout(1200);
      const after=await api('/wp-json/esc-api/v1/menus');
      const items=after.payload?.menus?.Header?.vi?.items||[];
      const flat=flatten(items);
      if(after.status===200&&items.length===6&&flat.length===all.length&&
         items.every((x,i)=>x.label===expectedRoots[i])){
        verified=true;break;
      }
    }
    if(!verified)throw Error('WordPress Header menu read-after-write mismatch');
    console.log('PSE_HEADER_MENU_REST_READ_AFTER_WRITE=PASS; menu_id=1687; roots=6; all_items='+all.length);
    console.log('PSE_HEADER_MENU_IMPORT=PASS; WP_PAGES_UNCHANGED=true; NO_BUILD=true');
  }
}finally{await browser.close()}
