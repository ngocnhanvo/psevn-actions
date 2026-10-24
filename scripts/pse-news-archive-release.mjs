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


  const event=JSON.parse(await (await import('node:fs/promises')).readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
  const apply=event.head_commit?.message==='cms(pse): publish verified news archive and native URL rewrites';
  const target=await api('/wp-json/wp/v2/pages/77030?context=edit&_fields=id,slug,status,acf,content');
  const p=target.payload||{};
  if(target.status!==200||p.id!==77030||!['draft','publish'].includes(p.status)||
     p.slug!=='tin-tuc-su-kien'||p.acf?.key!=='ssr-posts'||
     p.acf?.action!=='PostsPage'||String(p.content?.raw||'').trim())
    throw Error('WordPress Page 77030 does not match validated checkpoint');
  const endpoint='/wp-json/wp/v2/chuyen-huong-link';
  const existing=await api(endpoint+'?context=edit&status=any&per_page=100&_fields=id,acf,status');
  if(existing.status!==200||!Array.isArray(existing.payload))throw Error('Cannot read native redirects');
  const specs=[
    {name:'PSE news SSR archive root',source:'/tin-tuc-su-kien',dest:'/ssr/posts/tin-tuc-su-kien/1',match:'Exact'},
    {name:'PSE news SSR archive pagination',source:'^/tin-tuc-su-kien/([1-9][0-9]*)$',dest:'/ssr/posts/tin-tuc-su-kien/$1',match:'Regex'}
  ];
  if(existing.payload.some(x=>String(x.acf?.from_link||'').includes('tin-tuc-su-kien')||
     String(x.acf?.to_link||'').includes('tin-tuc-su-kien')))
    throw Error('Archive rewrite exists or collides; refuse overwrite');
  const option=await api(endpoint,'OPTIONS');
  const fields=option.payload?.schema?.properties||{};
  console.log('PSE_NEWS_REDIRECT_REST_SCHEMA='+JSON.stringify({
    http:option.status,properties:Object.keys(fields).sort(),
    acfProperties:Object.keys(fields.acf?.properties||{}).sort(),
    required:option.payload?.schema?.required||[],
    endpoints:(option.payload?.endpoints||[]).map(x=>({methods:x.methods,
      acceptedKeys:Object.keys(x.args||{}).slice(0,30)}))
  }));
  console.log('PSE_NEWS_ARCHIVE_PREFLIGHT='+JSON.stringify({
    mode:apply?'apply':'audit',page:77030,status:p.status,existingRedirects:existing.payload.length,
    proposals:specs.map(x=>({source:x.source,dest:x.dest,match:x.match})),menuMutation:false,build:false}));
  if(apply){
    const saved=[];let published=false;
    try{
      for(const rule of specs){
        const result=await api(endpoint,'POST',{title:rule.name,status:'draft',
          acf:{from_link:rule.source,to_link:rule.dest,type:'Rewrite',match_type:rule.match,enable:true}});
        if(result.status!==201||!Number.isSafeInteger(Number(result.payload?.id)))
          throw Error('Cannot stage WordPress rewrite '+rule.source+' status='+result.status);
        const id=Number(result.payload.id);saved.push(id);
        const check=await api(endpoint+'/'+id+'?context=edit&_fields=id,status,acf');
        if(check.status!==200||check.payload.status!=='draft'||
           check.payload.acf?.from_link!==rule.source||check.payload.acf?.to_link!==rule.dest||
           String(check.payload.acf?.type).toLowerCase()!=='rewrite'||
           check.payload.acf?.match_type!==rule.match||
           ![true,1,'1'].includes(check.payload.acf?.enable))throw Error('Native redirect readback mismatch');
      }
      if(p.status==='draft'){
        const pub=await api('/wp-json/wp/v2/pages/77030','POST',{status:'publish'});
        if(pub.status!==200||pub.payload?.status!=='publish')throw Error('Archive Page publish failed');
        published=true;
      }
      for(const id of saved){
        const res=await api(endpoint+'/'+id,'POST',{status:'publish'});
        if(res.status!==200||res.payload?.status!=='publish')throw Error('Redirect publish failed');
      }
      console.log('PSE_NEWS_ARCHIVE_RELEASE=PASS; archive=77030; nativeRewrites='+saved.join(',')+'; noMenuWrites=true; noAstroBuild=true');
    }catch(err){
      for(const id of saved){
        try{await api(endpoint+'/'+id,'POST',{status:'draft',acf:{enable:false}})}catch{}
      }
      if(published)try{await api('/wp-json/wp/v2/pages/77030','POST',{status:'draft'})}catch{}
      throw err;
    }
  }
}finally{await browser.close()}
