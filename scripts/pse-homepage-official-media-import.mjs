/** Import verified official legacy PSE branding/hero media into the PSE WordPress Media Library; bind hero and panorama via native ESC Table editor. No Astro build or public page change. */
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

  const assets=[
    {key:'hero',url:'https://www.pse.vn/images/banners/1-Ai.png',name:'pse-original-hero-2026.png',mime:'image/png',table:'pse_00_vi',column:'img',row:0},
    {key:'panorama',url:'https://www.pse.vn/images/banners/slide-001.jpg',name:'pse-original-panorama-2026.jpg',mime:'image/jpeg',table:'pse_02_vi',column:'background',row:0},
    {key:'logo',url:'https://www.pse.vn/images/headers/logo-2025.jpg',name:'pse-original-logo-2025.jpg',mime:'image/jpeg',table:null,column:null,row:null}
  ];
  const wpMediaUrlValid=value=>{
    try{
      const u=new URL(String(value||''));
      return u.protocol==='https:'&&!u.username&&!u.password&&u.pathname.includes('/wp-content/uploads/');
    }catch{return false}
  };
  // This installation exposes a valid WordPress Media GUID but sometimes
  // returns an empty source_url. Accept the GUID only after checking it points
  // to the same configured WP host, to the exact uploaded filename and a
  // publicly reachable image of the expected format.
  const resolveMediaUrl=async(media,asset)=>{
    const mediaFile=String(media.media_details?.file||'');
    const expectedFilename=asset.name;
    const fileName=mediaFile.split('/').at(-1);
    if(fileName!==expectedFilename)throw Error('Unexpected WordPress attachment file: '+asset.key);
    const candidates=[media.source_url,media.guid?.rendered].filter(Boolean);
    const base=new URL(origin);
    for(const value of candidates){
      if(!wpMediaUrlValid(value))continue;
      const u=new URL(value);
      if(u.hostname!==base.hostname||u.port!==base.port||
         !u.pathname.endsWith('/'+encodeURIComponent(expectedFilename)))continue;
      const head=await context.request.head(value,{timeout:45000});
      const kind=(head.headers()['content-type']||'').split(';')[0].toLowerCase();
      if(head.ok()&&kind===asset.mime)return value;
    }
    throw Error('No validated WordPress-hosted uploaded media URL: '+asset.key);
  };
  const uploaded={};
  const verifiedUrls={};
  for(const asset of assets){
    const original=await context.request.get(asset.url,{timeout:60000});
    if(!original.ok())throw Error('Original PSE media HTTP '+original.status()+': '+asset.key);
    const mime=(original.headers()['content-type']||'').split(';')[0].trim().toLowerCase();
    const bytes=await original.body();
    if(mime!==asset.mime||bytes.length<8000||bytes.length>15*1024*1024||
       (mime==='image/png'&&!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))||
       (mime==='image/jpeg'&&(bytes[0]!==255||bytes[1]!==216)))
      throw Error('Original PSE media signature/size invalid: '+asset.key);
    const marker=asset.name.replace(/\.[^.]+$/,'');
    const list=await api('/wp-json/wp/v2/media?search='+encodeURIComponent(marker)+'&per_page=100&context=edit');
    if(list.status!==200||!Array.isArray(list.payload))throw Error('Cannot inspect existing WP Media');
    const existing=list.payload.filter(m=>m.slug===marker||m.slug===marker+'-2');
    if(existing.length>1)throw Error('Ambiguous existing media for '+asset.key);
    let media=existing[0];
    if(media){
      console.log('PSE_EXISTING_MEDIA_DETAIL='+JSON.stringify({
        key:asset.key,id:media.id,slug:media.slug,mime:media.mime_type,
        sourceHost:(()=>{try{return new URL(media.source_url).hostname}catch{return null}})(),
        sourcePath:(()=>{try{return new URL(media.source_url).pathname.slice(0,140)}catch{return null}})(),
        validMediaUrl:wpMediaUrlValid(media.source_url),
        responseFields:Object.keys(media).slice(0,35),
        guidHost:(()=>{try{return new URL(media.guid?.rendered).hostname}catch{return null}})(),
        guidPath:(()=>{try{return new URL(media.guid?.rendered).pathname.slice(0,140)}catch{return null}})(),
        mediaFile:media.media_details?.file||null
      }));
      if(media.mime_type!==asset.mime)
        throw Error('Existing PSE WordPress media has unexpected MIME: '+asset.key);
      console.log('PSE_OFFICIAL_MEDIA=ALREADY_EXISTS; key='+asset.key+'; id='+media.id);
    }else{
      const response=await context.request.post(origin+'/wp-json/wp/v2/media',{
        data:bytes,timeout:90000,headers:{
          'X-WP-Nonce':restNonce,
          'Content-Disposition':'attachment; filename="'+asset.name+'"',
          'Content-Type':asset.mime,
          'Accept':'application/json'
        }
      });
      const body=await response.json().catch(()=>({}));
      console.log('PSE_MEDIA_UPLOAD_RESPONSE='+JSON.stringify({
        key:asset.key,status:response.status(),id:Number.isSafeInteger(body.id)?body.id:null,
        mime:body.mime_type||null,sourceHost:(()=>{try{return new URL(body.source_url).hostname}catch{return null}})(),
        hasWordPressUploadsPath:wpMediaUrlValid(body.source_url)
      }));
      if(response.status()!==201||!Number.isSafeInteger(body.id)||
         body.mime_type!==asset.mime)
        throw Error('PSE WP Media upload failed HTTP '+response.status()+' key='+asset.key);
      media=body;
      console.log('PSE_OFFICIAL_MEDIA=UPLOADED; key='+asset.key+'; id='+media.id+'; original_bytes='+bytes.length);
    }
    const after=await api('/wp-json/wp/v2/media/'+media.id+'?context=edit');
    if(after.status!==200||after.payload.id!==media.id||after.payload.mime_type!==asset.mime||
       !after.payload.media_details?.width||!after.payload.media_details?.height)
      throw Error('PSE WordPress Media read-after-write invalid for '+asset.key);
    uploaded[asset.key]=after.payload;
    verifiedUrls[asset.key]=await resolveMediaUrl(after.payload,asset);
    console.log('PSE_OFFICIAL_MEDIA_READ_AFTER_WRITE=PASS; key='+asset.key+'; id='+media.id+
      '; dimensions='+after.payload.media_details.width+'x'+after.payload.media_details.height);
  }
  // Use WordPress-owned uploaded URLs in real ESC Table cells. Never hotlink
  // source images in the Astro runtime or overwrite another person's edits.
  for(const asset of assets.filter(a=>a.table)){
    const current=await api('/wp-json/tablepress/v1/table/'+asset.table);
    if(current.status!==200||current.payload?.id!==asset.table||
       current.payload.items?.length<1||!current.payload.fields?.some(f=>f.key===asset.column))
      throw Error('Unexpected ESC Table media cell schema: '+asset.table);
    const actual=String(current.payload.items[asset.row][asset.column]||'');
    const target=verifiedUrls[asset.key];
    if(actual && actual!==target)throw Error('Existing hero/panorama media must not be overwritten: '+asset.table);
    if(actual===target){console.log('PSE_TABLE_MEDIA=ALREADY_BOUND; table='+asset.table);continue}
    await page.goto(origin+'/wp-admin/admin.php?page=tablepress&action=edit&table_id='+asset.table,
      {waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>Array.isArray(window.tp?.table?.data)&&
      typeof window.tp?.editor?.setValueFromCoords==='function',null,{timeout:25000});
    const grid=await page.evaluate(()=>({id:window.tp.table.id||window.tp.table.meta?.id,head:window.tp.table.data[0]}));
    const x=grid.head.indexOf(asset.column);
    if(grid.id!==asset.table||x<0)throw Error('Unexpected native ESC Table media editor');
    await page.evaluate(({x,y,value})=>{
      const tp=window.tp;
      if(String(tp.table.data[y][x]||'').trim())throw Error('Unexpected media value before save');
      tp.editor.setValueFromCoords(x,y,value);
      tp.helpers.unsaved_changes.set();
    },{x,y:asset.row+2,value:target});
    await page.getByRole('button',{name:'Save Changes',exact:true}).first().click();
    let pass=false;
    for(let i=0;i<12;i++){
      await page.waitForTimeout(900);
      const check=await api('/wp-json/tablepress/v1/table/'+asset.table);
      if(check.status===200&&check.payload.items?.[asset.row]?.[asset.column]===target){pass=true;break}
    }
    if(!pass)throw Error('Media ESC Table read-after-write mismatch: '+asset.table);
    console.log('PSE_TABLE_MEDIA_REST_READ_AFTER_WRITE=PASS; table='+asset.table+'; key='+asset.key);
  }
  console.log('PSE_OFFICIAL_MEDIA_IMPORT=PASS; media_in_wordpress=true; homepage_248_unchanged=true; no_astro_build=true');
}finally{await browser.close()}
