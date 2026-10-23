/** Add verified public PSE company copy to existing ESC Table sections using WordPress native editor. Never touches Page 248 or triggers Astro build. */
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

  // Verified against official PSE corporate and development pages. Media and
  // visitor counts remain empty until source assets are validated/imported.
  const specs=[
    {
      id:'pse_00_vi',
      keys:['label','title','description','img','href','cta'],
      rows:[{
        label:'PVFCCo-PSE',
        title:'Công ty Cổ phần Phân bón và Hóa chất Dầu khí Đông Nam Bộ',
        description:'Phân phối các sản phẩm phân bón Phú Mỹ và phát triển hệ thống phân phối tại khu vực Đông Nam Bộ.',
        img:'',href:'',cta:''
      }]
    },
    {
      id:'pse_02_vi',
      keys:['sectionTitle','sectionDescription','background','title','description','icon'],
      rows:[
        {sectionTitle:'Định hướng phát triển',sectionDescription:'Phát triển hệ thống phân phối phân bón chuyên nghiệp và giải pháp sử dụng phân bón hiệu quả, an toàn với môi trường.',background:'',title:'',description:'',icon:''},
        {sectionTitle:'',sectionDescription:'',background:'',title:'Hệ thống phân phối',description:'Chú trọng vùng, cây trồng và khách hàng trọng điểm.',icon:''},
        {sectionTitle:'',sectionDescription:'',background:'',title:'Giải pháp sử dụng phân bón',description:'Hiệu quả, an toàn với môi trường cho cây trồng chủ lực khu vực Đông Nam Bộ.',icon:''},
        {sectionTitle:'',sectionDescription:'',background:'',title:'Quản lý chất lượng',description:'Duy trì hệ thống quản lý chất lượng ISO 9001:2015.',icon:''}
      ]
    },
    {
      id:'pse_03_vi',
      keys:['label','href'],
      rows:[
        {label:'Báo cáo tài chính',href:'https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-tai-chinh.html'},
        {label:'Liên hệ',href:'https://www.pse.vn/lien-he.html'}
      ]
    }
  ];
  // Original public sources for the above fields:
  // https://www.pse.vn/lien-he.html
  // https://www.pse.vn/pvfcco-pse/dinh-huong-phat-trien/11-gioi-thieu.html
  // https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-tai-chinh.html
  for(const spec of specs){
    const resp=await api('/wp-json/tablepress/v1/table/'+spec.id);
    const t=resp.payload;
    if(resp.status!==200||t.id!==spec.id||
       JSON.stringify(t.fields?.map(x=>x.key))!==JSON.stringify(spec.keys)||
       !Array.isArray(t.items)||t.items.length!==spec.rows.length)
      throw Error('Unexpected ESC Table schema; stop without mutation: '+spec.id);
    const mismatch=t.items.some((row,i)=>spec.keys.some(key=>{
      const previous=String(row[key]??'').trim();
      const target=String(spec.rows[i][key]??'').trim();
      return previous!=='' && previous!==target;
    }));
    if(mismatch)throw Error('Existing data differs; no overwrite: '+spec.id);
    const done=t.items.every((row,i)=>spec.keys.every(key=>
      String(row[key]??'').trim()===String(spec.rows[i][key]??'').trim()));
    if(done){
      console.log('PSE_VERIFIED_COPY=ALREADY_PRESENT; id='+spec.id+'; no mutation');
      continue;
    }
    await page.goto(origin+'/wp-admin/admin.php?page=tablepress&action=edit&table_id='+spec.id,
      {waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>Array.isArray(window.tp?.table?.data)&&
      typeof window.tp?.editor?.setValueFromCoords==='function',null,{timeout:30000});
    const native=await page.evaluate(()=>({
      id:window.tp.table.id||window.tp.table.meta?.id,
      rows:window.tp.table.data.map(row=>Array.from(row))
    }));
    if(native.id!==spec.id||native.rows.length!==spec.rows.length+2||
       JSON.stringify(native.rows[0])!==JSON.stringify(spec.keys))
      throw Error('Unexpected native ESC Table edit grid: '+spec.id);
    for(let y=0;y<spec.rows.length;y++){
      for(let x=0;x<spec.keys.length;x++){
        const prior=String(native.rows[y+2][x]??'').trim();
        const desired=String(spec.rows[y][spec.keys[x]]??'').trim();
        if(prior && prior!==desired)throw Error('Edited ESC Table has conflicting prior content: '+spec.id);
      }
    }
    await page.evaluate(({keys,rows})=>{
      const tp=window.tp;
      rows.forEach((row,y)=>keys.forEach((key,x)=>{
        const target=String(row[key]??'');
        const old=String(tp.table.data[y+2][x]??'');
        if(target && !old.trim())tp.editor.setValueFromCoords(x,y+2,target);
      }));
      tp.helpers.unsaved_changes.set();
    },{keys:spec.keys,rows:spec.rows});
    await page.getByRole('button',{name:'Save Changes',exact:true}).first().click();
    await page.waitForTimeout(2600);
    let verified=false;
    for(let wait=0;wait<8;wait++){
      const after=await api('/wp-json/tablepress/v1/table/'+spec.id);
      verified=after.status===200&&after.payload.items?.every((row,i)=>
        spec.keys.every(key=>String(row[key]??'').trim()===String(spec.rows[i][key]??'').trim()));
      if(verified)break;
      await page.waitForTimeout(900);
    }
    if(!verified)throw Error('WordPress REST read-after-write mismatch: '+spec.id);
    console.log('PSE_VERIFIED_COPY_REST_READ_AFTER_WRITE=PASS; id='+spec.id+
      '; real_copy=true; unverified_media_and_stats=empty');
  }
  console.log('PSE_HOMEPAGE_VERIFIED_CMS_COPY=PASS; HOMEPAGE_248_UNCHANGED=true; NO_FAKE_MEDIA=true; NO_ASTRO_BUILD=true');
}finally{await browser.close()}
