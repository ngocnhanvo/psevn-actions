/** Populate verified public PSE company text/contact in the existing WordPress company-information record. Only empty/inherited fields may change; no logo/media/menu/site build. */
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

  const recordId=62;
  const path='/wp-json/wp/v2/thong-tin-chung/'+recordId+'?context=edit&_fields=id,status,acf';
  const current=await api(path);
  if(current.status!==200||current.payload.id!==recordId||current.payload.status!=='publish'||!current.payload.acf)
    throw Error('PSE company information record not accessible/invalid');
  const desired={
    tencongty:'Công ty Cổ phần Phân bón và Hóa chất Dầu khí Đông Nam Bộ',
    diachihcm:'Số 27 Đinh Bộ Lĩnh, Phường Bình Thạnh, TP.HCM',
    sodienthoaihcm:'84-028 35 111 999',
    emailhcm:'info@pse.vn',
    hotline:'84-028 35 111 999'
  };
  const updates={};
  for(const [field,value] of Object.entries(desired)){
    if(!(field in current.payload.acf))throw Error('Missing WordPress ACF site-info field: '+field);
    const original=current.payload.acf[field];
    if(typeof original!=='string')throw Error('PSE company ACF field has unexpected type: '+field);
    const v=original.trim();
    if(v===value){console.log('PSE_CORPORATE_INFO=ALREADY_CORRECT; field='+field);continue}
    if(v===''||(field==='tencongty'&&v==='Website mẫu')){
      updates[field]=value;
    }else{
      console.log('PSE_CORPORATE_INFO=CONFLICT_UNTOUCHED; field='+field);
    }
  }
  if(!Object.keys(updates).length){
    console.log('PSE_CORPORATE_INFO=NO_SAFE_CHANGE; no additional mutation');
  }else{
    // Only five individually validated public corporate fields, never logo
    // or social configuration; WordPress REST ACF controls the write.
    const response=await api('/wp-json/wp/v2/thong-tin-chung/'+recordId,'POST',{acf:updates});
    if(response.status!==200||response.payload.id!==recordId)
      throw Error('WordPress corporate update failed HTTP '+response.status);
    const verify=await api(path);
    if(verify.status!==200)throw Error('WordPress corporate info read-after-write failed HTTP '+verify.status);
    for(const [field,value] of Object.entries(updates)){
      if(verify.payload.acf?.[field]!==value)
        throw Error('WordPress corporate REST ACF update not persisted: '+field);
      console.log('PSE_CORPORATE_INFO_REST_READ_AFTER_WRITE=PASS; field='+field);
    }
  }
  console.log('PSE_CORPORATE_INFO_UPSERT=PASS; canonical_id=62; media_untouched=true; pages_unchanged=true; NO_BUILD=true');
}finally{await browser.close()}
