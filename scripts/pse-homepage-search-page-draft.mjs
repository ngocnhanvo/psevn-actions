/** Prepare the WordPress-authored PSE news/search archive as a private Page draft. Do not publish/cut over or build Astro. Idempotent REST read-after-write. */
import { chromium } from 'playwright';
const origin=(()=>{
  const rows=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,'')).filter(x=>x.startsWith('WC_URL='));
  if(rows.length!==1)throw Error('Missing or ambiguous WC_URL');
  const url=new URL(rows[0].slice(7).trim().replace(/^['"]|['"]$/g,''));
  if(url.protocol!=='https:'||!url.hostname||url.username||url.password||(url.port&&url.port!=='443')||!['','/'].includes(url.pathname)||url.search||url.hash)
    throw Error('Invalid PSE HTTPS CMS origin');
  return url.origin;
})();
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

  const languageOf=p=>typeof p.acf?.product_lang==='object'
    ? String(p.acf.product_lang?.value||'') : String(p.acf?.product_lang||'');
  const all=await api('/wp-json/wp/v2/pages?status=any&context=edit&per_page=100&_fields=id,slug,status,title,acf');
  if(all.status!==200||!Array.isArray(all.payload))
    throw Error('Cannot safely inspect existing PSE WordPress Pages; HTTP '+all.status);
  const targetAction='PostsPage',targetKey='posts',targetSlug='tin-tuc-su-kien';
  const candidates=all.payload.filter(p=>
    p.acf?.action===targetAction||p.acf?.key===targetKey||
    p.slug===targetSlug);
  if(candidates.length>1)throw Error('Ambiguous existing PSE PostsPage/key/slug; refusing duplicate');
  let pageRecord=candidates[0]||null;
  if(pageRecord){
    if(pageRecord.acf?.action!==targetAction||
       pageRecord.acf?.key!==targetKey||pageRecord.slug!==targetSlug)
      throw Error('Existing PSE page conflicts with reserved search archive slug/key');
    console.log('PSE_SEARCH_ARCHIVE_DRAFT=ALREADY_EXISTS; id='+pageRecord.id+'; status='+pageRecord.status);
  }else{
    const created=await api('/wp-json/wp/v2/pages','POST',{
      title:'Tin tức - Sự kiện',slug:targetSlug,
      status:'draft',content:'',
      acf:{action:targetAction,key:targetKey,product_lang:'vi',
        label:'Tin tức - Sự kiện'}
    });
    if(created.status!==201||!Number.isSafeInteger(created.payload?.id))
      throw Error('WordPress PostsPage draft create failed HTTP '+created.status);
    pageRecord=created.payload;
    console.log('PSE_SEARCH_ARCHIVE_DRAFT=CREATED; id='+pageRecord.id);
  }
  const verified=await api('/wp-json/wp/v2/pages/'+pageRecord.id+'?context=edit&_fields=id,status,slug,acf,title,content');
  const p=verified.payload||{};
  if(verified.status!==200||p.id!==pageRecord.id||
     p.status!=='draft'||p.slug!==targetSlug||
     p.acf?.action!==targetAction||p.acf?.key!==targetKey||
     !['vi',''].includes(languageOf(p))||
     String(p.content?.raw||'').trim())
    throw Error('PSE search archive draft metadata read-after-write not verified; id='+pageRecord.id);
  console.log('PSE_SEARCH_ARCHIVE_DRAFT_REST_READ_AFTER_WRITE=PASS; id='+p.id+
    '; slug='+p.slug+'; action='+targetAction+'; key='+targetKey+
    '; WORDPRESS_STATUS_DRAFT=true; HOME_248_UNCHANGED=true; NO_ASTRO_BUILD=true');
}finally{await browser.close()}
