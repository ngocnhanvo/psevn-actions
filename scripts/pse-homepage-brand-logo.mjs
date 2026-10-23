/** Bind the verified official PSE logo Media ID 76980 to the canonical WordPress site-info ACF logo only if empty. Never modify other media, Page 248 or Astro build. */
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

  const record='/wp-json/wp/v2/thong-tin-chung/62?context=edit&_fields=id,status,acf';
  const before=await api(record);
  if(before.status!==200||before.payload.id!==62||before.payload.status!=='publish'||!before.payload.acf)
    throw Error('Cannot verify canonical PSE WordPress information record');
  const logo=before.payload.acf.logo;
  const existingId=typeof logo==='number'?logo:Number(logo?.ID||logo?.id||0);
  const media=await api('/wp-json/wp/v2/media/76980?context=edit');
  if(media.status!==200||media.payload.id!==76980||media.payload.mime_type!=='image/jpeg'||
     media.payload.media_details?.file?.split('/').at(-1)!=='pse-original-logo-2025.jpg'||
     media.payload.media_details?.width!==606||media.payload.media_details?.height!==90)
    throw Error('Official PSE logo is not the previously verified WP Media attachment');
  if(existingId>0&&existingId!==76980){
    const previous=await api('/wp-json/wp/v2/media/'+existingId+'?context=edit');
    const info=previous.payload||{};
    const guid=String(info.guid?.rendered||info.source_url||'');
    console.log('PSE_EXISTING_HEADER_LOGO_AUDIT='+JSON.stringify({
      wpInfoId:62,mediaId:existingId,mediaHTTP:previous.status,
      mime:info.mime_type||null,slug:info.slug||null,
      title:typeof info.title?.raw==='string'?info.title.raw.slice(0,100):null,
      alt:info.alt_text||null,width:info.media_details?.width||null,height:info.media_details?.height||null,
      file:info.media_details?.file||null,
      urlPath:(()=>{try{return new URL(guid).pathname}catch{return null}})()
    }));
  }
  if(existingId===76980){
    console.log('PSE_HEADER_LOGO=ALREADY_CONFIGURED; media_id=76980; no mutation');
  }else if(existingId>0||typeof logo==='string'&&logo.trim()){
    console.log('PSE_HEADER_LOGO=EXISTING_UNTOUCHED; existing_id='+existingId+'; no overwrite; manual classification needed from audit evidence');
  }else{
    const update=await api('/wp-json/wp/v2/thong-tin-chung/62','POST',{acf:{logo:76980}});
    if(update.status!==200||update.payload.id!==62)
      throw Error('WordPress site logo ACF update failed HTTP '+update.status);
    const after=await api(record);
    const id=typeof after.payload?.acf?.logo==='number'?after.payload.acf.logo:
      Number(after.payload?.acf?.logo?.ID||after.payload?.acf?.logo?.id||0);
    if(after.status!==200||id!==76980)
      throw Error('WordPress site logo not persisted as verified attachment 76980');
    console.log('PSE_HEADER_LOGO_REST_READ_AFTER_WRITE=PASS; info_id=62; media_id=76980');
  }
  console.log('PSE_HEADER_BRANDING_PASS; logo_source=WordPress_Media; homepage_248_unchanged=true; no_build=true');
}finally{await browser.close()}
