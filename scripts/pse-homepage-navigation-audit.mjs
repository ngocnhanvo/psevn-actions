// Subpage rollout gate (2026-10-24): verify current CMS menu and Page action/key before mapping; READ ONLY.
/** Inspect PSE WordPress Pages and Header nav menu identities without writing. */
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

  const json=async(path)=>{
    const r=await api(path);
    return {status:r.status,payload:r.payload};
  };
  const rest=await json('/wp-json/wp/v2/pages?context=edit&status=publish,draft,private&per_page=100&_fields=id,status,slug,title,acf,link');
  if(rest.status!==200||!Array.isArray(rest.payload))throw Error('Cannot inspect WordPress CMS pages');
  console.log('PSE_NAVIGATION_WORDPRESS_PAGES='+JSON.stringify(rest.payload.map(item=>({
    id:item.id,status:item.status,slug:item.slug,
    title:String(item.title?.raw||item.title?.rendered||'').slice(0,110),
    key:String(item.acf?.key||''),action:String(item.acf?.action||''),
    lang:String(item.acf?.product_lang?.value||item.acf?.product_lang||''),
    path:(()=>{try{return new URL(item.link).pathname}catch{return ''}})()
  })).slice(0,110)));
  // G3 archive taxonomy inventory: use WordPress native Categories, preserve
  // parent IDs and existing post assignments before writing any category/menu.
  const categories=await json('/wp-json/wp/v2/categories?context=edit&per_page=100&hide_empty=false&_fields=id,slug,name,parent,count,description');
  if(categories.status!==200||!Array.isArray(categories.payload))
    throw Error('Cannot inspect live WordPress category taxonomy');
  console.log('PSE_SUBPAGE_CATEGORY_INVENTORY='+JSON.stringify(categories.payload.map(c=>({
    id:c.id,slug:c.slug,name:c.name,parent:c.parent,count:c.count,
    description:String(c.description||'').slice(0,100)
  }))));
  const archive=await json('/wp-json/wp/v2/pages/77030?context=edit&_fields=id,status,slug,title,acf,content');
  if(archive.status!==200)throw Error('Cannot inspect WordPress news archive Page #77030');
  console.log('PSE_NEWS_ARCHIVE_PAGE_PREFLIGHT='+JSON.stringify({
    id:archive.payload.id,slug:archive.payload.slug,status:archive.payload.status,
    action:archive.payload.acf?.action,key:archive.payload.acf?.key,
    contentLength:String(archive.payload.content?.raw||'').trim().length
  }));
  const redirects=await json('/wp-json/wp/v2/chuyen-huong-link?status=any&context=edit&per_page=100&_fields=id,status,acf,title');
  if(redirects.status!==200||!Array.isArray(redirects.payload))
    throw Error('Cannot inspect existing WordPress native URL routing records');
  console.log('PSE_NEWS_ARCHIVE_REDIRECT_PREFLIGHT='+JSON.stringify({
    total:redirects.payload.length,
    matching:redirects.payload.filter(x=>/tin-tuc-su-kien|ssr\/posts/i.test(
      String(x.acf?.from_link||'')+' '+String(x.acf?.to_link||'')
    )).map(x=>({id:x.id,status:x.status,from:x.acf?.from_link,to:x.acf?.to_link,
      type:x.acf?.type,match_type:x.acf?.match_type,enable:x.acf?.enable}))
  }));
  // Read-only discrepancy audit: native published URL rules versus queued
  // redirect logs consumed by Astro; never manipulate the log option.
  const redirectLog=await json('/wp-json/astro/v1/get-redirect-logs');
  if(redirectLog.status!==200||!Array.isArray(redirectLog.payload))
    throw Error('PSE redirect log endpoint unavailable for read-only audit');
  const activeRules=redirects.payload.filter(r=>r.status==='publish'&&r.acf?.enable);
  console.log('PSE_G3_REDIRECT_LOG_PARITY='+JSON.stringify({
    published:activeRules.length,
    publishedIds:activeRules.map(x=>x.id).sort((a,b)=>a-b),
    logCount:redirectLog.payload.length,
    logIds:redirectLog.payload.map(x=>x.id).sort((a,b)=>a-b),
    logActions:redirectLog.payload.map(x=>x.action),
    wpWrites:false,
  }));
  const news=await json('/wp-json/wp/v2/posts?status=publish&per_page=5&orderby=date&order=desc&_fields=id,slug,date,categories');
  if(news.status!==200||!Array.isArray(news.payload))throw Error('Cannot inspect published WordPress news sample');
  console.log('PSE_SUBPAGE_PUBLISHED_POST_SAMPLE='+JSON.stringify(news.payload));
  for(const route of ['/wp-json/wp/v2/menus?context=edit&per_page=100','/wp-json/wp/v2/menu-items?context=edit&per_page=100']){
    const r=await json(route);
    console.log('PSE_NAVIGATION_CORE_REST_AUDIT='+JSON.stringify({
      type:route.includes('menu-items')?'menu-items':'menus',http:r.status,
      entries:Array.isArray(r.payload)?r.payload.slice(0,45).map(x=>({
        id:x.id,slug:x.slug,name:x.name,title:x.title?.raw||x.title?.rendered||null,
        status:x.status,menus:x.menus,parent:x.parent,url:x.url,meta:x.meta,
        locations:x.locations,description:x.description
      })):[]
    }));
  }
  const esc=await json('/wp-json/esc-api/v1/menus');
  if(esc.status!==200||esc.payload?.success!==true)throw Error('Cannot verify current Header menu');
  const root=esc.payload.menus?.Header?.vi;
  if(!root||!Array.isArray(root.items))throw Error('Current Header/vi menu missing');
  console.log('PSE_NAVIGATION_HEADER_CURRENT='+JSON.stringify({
    code:root.code,name:root.name,lang:root.lang,type:root.type,
    items:root.items.map(i=>({label:i.label,slug:i.slug,key:i.key,linkType:i.linkType,children:i.children?.length||0}))
  }));
  console.log('PSE_NAVIGATION_READ_ONLY_AUDIT=PASS; wp_mutation=false; build=false');
}finally{await browser.close()}
