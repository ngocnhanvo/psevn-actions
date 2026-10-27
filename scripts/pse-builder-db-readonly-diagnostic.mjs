/** PSE WP DB / Builder menu REST lightweight diagnostic. Never Save/CMS-write. */
import {chromium} from 'playwright';

const parseOrigin=(key)=>{
  const lines=String(process.env.ENV_FILE||'').split(/\r?\n/)
    .map(s=>s.trim().replace(/^export\s+/,'')).
    filter(s=>s.startsWith(key+'='));
  if(lines.length!==1) throw Error(key+'_MISSING');
  const u=new URL(lines[0].slice(key.length+1).replace(/^['"]|['"]$/g,''));
  if(u.protocol!=='https:'||!u.hostname||u.username||u.password||u.search||u.hash||
     !['','/'].includes(u.pathname))throw Error(key+'_INVALID');
  return u.origin;
};
const origin=parseOrigin('WC_URL');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:850}});
const attempts={api:[],builder:[],menu:[],frontend:[],login:[]};
const classify=async(response)=>{
  const status=response.status();
  const headers=response.headers();
  const type=(headers['content-type']||'').split(';')[0];
  let body='';
  try {body=(await response.text()).slice(0,12000);}catch{}
  return {
    status,type,bytes:Number(headers['content-length']||body.length)||0,
    db_error:/Error establishing a database connection|Lỗi kết nối tới cơ sở dữ liệu|database connection error|mysqli_real_connect|too many connections|SQLSTATE\[HY000\]/i.test(body),
    php_error:/Fatal error|Uncaught Error|Allowed memory size of/i.test(body),
    wp_die:/wp-die-message|<h1[^>]*>.*(?:lỗi|error)/i.test(body)
  };
};
const get=async(url)=>{
  try{
    const resp=await page.request.get(url,{timeout:15000,maxRedirects:1,failOnStatusCode:false});
    return await classify(resp);
  }catch(e){return {exception:e.name||'NetworkError'};}
};
const print=()=>console.log('PSE_DB_DIAG_SUMMARY='+JSON.stringify(attempts));
try{
  for(let i=0;i<3;i++){
    attempts.api.push(await get(origin+'/wp-json/'));
    attempts.frontend.push(await get(origin+'/'));
    if(i!==2)await new Promise(r=>setTimeout(r,650));
  }
  await page.goto(origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:30000})
    .catch(e=>{attempts.login.push({exception:e.name});});
  if(await page.locator('#user_login').count()){
    await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
    await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
    const body=await page.locator('body').innerText();
    const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||
            body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if(m){
      const a=+m[1],b=+m[3];
      const n=({'+':a+b,'-':a-b,'x':a*b,'×':a*b,'*':a*b})[m[2]];
      const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if(await field.count())await field.fill(String(n));
    }
    await Promise.all([
      page.waitForLoadState('domcontentloaded',{timeout:25000}).catch(()=>{}),
      page.locator('#wp-submit').click({timeout:25000}).catch(e=>{attempts.login.push({click_exception:e.name});})
    ]);
  }
  if(page.url().includes('wp-login')) {attempts.login.push({status:'NOT_AUTHENTICATED'});print();process.exitCode=1;}
  else{
    const base=origin+'/wp-admin/edit.php?post_type=page&page=esc-visual-builder';
    const bresp=await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000}).catch(()=>null);
    if(bresp)attempts.builder.push(await classify(bresp));
    const selector=page.locator('#esc-vb-page');
    if(await selector.count()){
      await Promise.all([
        page.waitForLoadState('domcontentloaded',{timeout:25000}).catch(()=>{}),
        page.getByRole('button',{name:'Mở trang'}).click({timeout:25000})
      ]);
      const frame=page.frameLocator('#esc-vb-frame');
      const menu=frame.locator('#main-header [data-esc-vb-menu-item-id][data-esc-vb-region-state="editable"]');
      await menu.first().waitFor({state:'visible',timeout:30000}).catch(()=>{});
      const rowCount=await menu.count();
      if(rowCount){
        const itemId=await menu.first().getAttribute('data-esc-vb-menu-item-id');
        await menu.first().click({modifiers:['Alt'],timeout:20000}).catch(()=>{});
        const output=page.locator('#esc-vb-menu-editor [role="status"]').first();
        await output.waitFor({state:'attached',timeout:10000}).catch(()=>{});
        for(let i=0;i<3;i++){
          const txt=await output.textContent().catch(()=>'');
          attempts.menu.push({ui_db_error:/Lỗi kết nối tới cơ sở dữ liệu|Error establishing a database connection/i.test(txt||''),ui_raw_html:/<h1[\s>]/i.test(txt||''),ui_loading:/Đang tải/.test(txt||''),ui_missing:!txt});
          if(i!==2)await new Promise(r=>setTimeout(r,900));
        }
      }else attempts.menu.push({status:'NO_EDITABLE_ITEM'});
    }else attempts.builder.push({status:'NO_PAGE_SELECTOR'});
    print();
  }
}finally{
  await browser.close();
}
