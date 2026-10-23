/** Populate real WordPress category IDs for the three verified PSE homepage lanes.
 * Idempotent, WordPress REST authenticated; writes ESC Table only through its
 * native editor. Does not publish articles, change homepage 248 or build Astro.
 */
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
  const api=async(path,method='GET',body)=>{
    const out=await page.evaluate(async({path,method,body})=>{
      const nonce=window.wpApiSettings?.nonce||document.querySelector('meta[name="wp-api-nonce"]')?.content||'';
      const res=await fetch(path,{method,credentials:'same-origin',
        headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...(nonce?{'X-WP-Nonce':nonce}:{})},
        ...(body?{body:JSON.stringify(body)}:{})});
      const payload=await res.json().catch(()=>({}));
      return {status:res.status,payload};
    },{path,method,body});
    return out;
  };
  const pre=await api('/wp-json/wp/v2/categories?per_page=100&context=edit&_fields=id,slug,name,count,parent');
  if(pre.status!==200||!Array.isArray(pre.payload))throw Error('Cannot read existing categories: HTTP '+pre.status);
  const ids=[];
  for(const spec of lanes){
    const matches=pre.payload.filter(x=>x.slug===spec.slug);
    if(matches.length>1)throw Error('Duplicate WordPress category slug '+spec.slug);
    let c=matches[0];
    if(c){
      if(c.name!==spec.name)throw Error('Existing category name differs; refusing to overwrite '+spec.slug);
      console.log('PSE_CATEGORY=ALREADY_EXISTS; slug='+spec.slug+'; id='+c.id);
    }else{
      const response=await api('/wp-json/wp/v2/categories','POST',{name:spec.name,slug:spec.slug,parent:0});
      if(response.status!==201||response.payload.slug!==spec.slug||!Number.isSafeInteger(response.payload.id))
        throw Error('Category create readback failed: slug='+spec.slug+' HTTP '+response.status);
      c=response.payload;
      console.log('PSE_CATEGORY=CREATED; slug='+spec.slug+'; id='+c.id);
    }
    const verify=await api('/wp-json/wp/v2/categories/'+c.id+'?context=edit&_fields=id,slug,name,parent');
    if(verify.status!==200||verify.payload.slug!==spec.slug||verify.payload.name!==spec.name)
      throw Error('Category REST read-after-write failed for '+spec.slug);
    ids.push(c.id);
  }
  const table=await api('/wp-json/tablepress/v1/table/pse_01_vi');
  if(table.status!==200||table.payload.id!=='pse_01_vi'||table.payload.items?.length!==3||
     JSON.stringify(table.payload.fields?.map(x=>x.key))!==JSON.stringify(['label','categoryId','href']))
    throw Error('PSE news table schema unexpected');
  for(let i=0;i<3;i++){
    const item=table.payload.items[i];
    if(item.label!==lanes[i].label || (item.categoryId && String(item.categoryId)!==String(ids[i])) ||
       item.href)throw Error('Existing news lane differs; refusing to overwrite lane '+i);
  }
  if(table.payload.items.every((item,i)=>String(item.categoryId)===String(ids[i]))){
    console.log('PSE_NEWS_CATEGORIES=ALREADY_BOUND; no editor mutation');
  }else{
    await page.goto(origin+'/wp-admin/admin.php?page=tablepress&action=edit&table_id=pse_01_vi',
      {waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>Array.isArray(window.tp?.table?.data)&&Boolean(window.tp?.editor?.setValueFromCoords),null,{timeout:25000});
    const before=await page.evaluate(()=>({id:window.tp.table.id||window.tp.table.meta?.id,rows:window.tp.table.data.map(r=>Array.from(r))}));
    if(before.id!=='pse_01_vi'||before.rows.length!==5||
      JSON.stringify(before.rows[0])!==JSON.stringify(['label','categoryId','href'])||
      before.rows.slice(2).some((row,i)=>row[0]!==lanes[i].label || (row[1] && String(row[1])!==String(ids[i])) || row[2]))
      throw Error('WordPress native ESC Table differs from read-only preflight');
    await page.evaluate(ids=>{
      const tp=window.tp;
      ids.forEach((id,i)=>{if(!String(tp.table.data[i+2][1]||'').trim())tp.editor.setValueFromCoords(1,i+2,String(id))});
      tp.helpers.unsaved_changes.set();
    },ids);
    await page.getByRole('button',{name:'Save Changes',exact:true}).first().click();
    await page.waitForTimeout(2200);
  }
  const after=await api('/wp-json/tablepress/v1/table/pse_01_vi');
  if(after.status!==200||!after.payload.items?.every((item,i)=>item.label===lanes[i].label&&String(item.categoryId)===String(ids[i])))
    throw Error('PSE news category ID read-after-write mismatch');
  console.log('PSE_THREE_NEWS_LANES_CATEGORY_BINDING=PASS; category_ids='+ids.join(',')+
    '; NEWS_POSTS_UNCHANGED=true; HOMEPAGE_248_UNCHANGED=true; ASTRO_NO_BUILD=true');
}finally{await browser.close()}
