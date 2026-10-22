import { chromium } from 'playwright';

function getEnv(name) {
  const matches=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,'')).filter(s=>s.startsWith(name+'='));
  if(matches.length!==1) throw new Error('Missing/duplicate '+name);
  const value=matches[0].slice(name.length+1).trim().replace(/^['"]|['"]$/g,'');
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||!['/',''].includes(url.pathname)||url.search||url.hash)throw new Error('Invalid WordPress HTTPS origin');
  return url.origin;
}
const origin=getEnv('WC_URL');
const username=process.env.WP_ADMIN_USERNAME;
const password=process.env.WP_ADMIN_PASSWORD;
if(!username||!password)throw new Error('Missing WP admin secrets');
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();
function mathAnswer(text){
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(!m)return null;
  const a=Number(m[1]),b=Number(m[3]);
  return ({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
}
try{
  await page.goto(origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
  if(await page.locator('#user_login').count()){
    await page.locator('#user_login').fill(username);
    await page.locator('#user_pass').fill(password);
    const answer=mathAnswer(await page.locator('body').innerText());
    if(answer!==null){
      const captcha=page.locator('#loginform input[name*="captcha" i], #loginform input[name*="math" i], #loginform input[name*="arith" i], #loginform input[type="number"]').first();
      if(!(await captcha.count()))throw new Error('Arithmetic challenge input unavailable');
      await captcha.fill(String(answer));
    }
    await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
  }
  if(page.url().includes('wp-login.php'))throw new Error('WordPress login unsuccessful');
  console.log('PSE_EDITOR_ADMIN_LOGIN=PASS');
  const wpData=await page.evaluate(async()=>{
    const get=async p=>{
      const r=await fetch(p,{credentials:'same-origin',headers:{Accept:'application/json'}});
      if(!r.ok)throw new Error('WordPress REST returned HTTP '+r.status);
      return r.json();
    };
    const [pages,infos]=await Promise.all([
      get('/wp-json/wp/v2/pages?status=publish&per_page=100&_fields=id,slug,acf'),
      get('/wp-json/wp/v2/thong-tin-chung?status=publish&per_page=100&_fields=id,acf')
    ]);
    return {home:pages.find(p=>p.acf?.key==='home'&&p.acf?.action==='HomePage'),infoId:infos[0]?.id};
  });
  if(!wpData.home||!wpData.infoId)throw new Error('Missing canonical home/site info');
  console.log('PSE_EDITOR_HOME_ID='+wpData.home.id);
  console.log('PSE_EDITOR_INFO_ID='+wpData.infoId);
  for(const [kind,id] of [['home',wpData.home.id],['information',wpData.infoId]]){
    await page.goto(origin+'/wp-admin/post.php?post='+id+'&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
    if(page.url().includes('wp-login.php'))throw new Error('WP editor redirected to login');
    const audit=await page.evaluate(()=>{
      const labels=Array.from(document.querySelectorAll('label')).map(n=>n.textContent?.replace(/\s+/g,' ').trim()).filter(t=>t&&t.length<75).slice(0,100);
      return {
        classicTitle:Boolean(document.querySelector('input#title')),
        blockTitle:Boolean(document.querySelector('.editor-post-title__input')),
        tinyMCE:Boolean(document.querySelector('#content_ifr')),
        blockEditor:Boolean(document.querySelector('.edit-post-visual-editor, .interface-interface-skeleton')),
        insertCodeControl:Array.from(document.querySelectorAll('button')).some(b=>/insert code|chèn mã/i.test(b.innerText||b.title||'')),
        labels,
        acfFields:Array.from(document.querySelectorAll('.acf-field[data-name]')).map(f=>({
          name:f.getAttribute('data-name'),
          type:f.getAttribute('data-type'),
          hasInput:Boolean(f.querySelector('input:not([type=hidden]), textarea'))
        })).slice(0,120)
      };
    });
    console.log('PSE_EDITOR_'+kind.toUpperCase()+'='+JSON.stringify(audit));
  }
  // ESC Table editor and Visual Builder are separate screens from the Page editor.
  // Inspect them without submitting forms, changing fields, or logging preview tickets.
  await page.goto(origin+'/wp-admin/admin.php?page=tablepress',{waitUntil:'domcontentloaded',timeout:60000});
  const tableAudit=await page.evaluate(()=>({
    screenTitle:(document.querySelector('#wpbody-content h1, .wrap h1')?.textContent||'').trim().slice(0,100),
    editorAvailable:Boolean(document.querySelector('#tablepress-page, #tablepress, .tablepress, [id*="tablepress"]')),
    linkLabels:Array.from(document.querySelectorAll('#wpbody-content a')).map(n=>(n.textContent||'').trim()).filter(x=>x.length&&x.length<65).slice(0,25),
    adminError:Boolean(document.querySelector('.wp-die-message, #error-page')),
  }));
  console.log('PSE_ESC_TABLE_ADMIN='+JSON.stringify(tableAudit));
  await page.goto(origin+'/wp-admin/edit.php?post_type=page&page=esc-visual-builder&esc_vb_page='+wpData.home.id,{waitUntil:'domcontentloaded',timeout:60000});
  const builderAudit=await page.evaluate(()=>({
    workspace:Boolean(document.querySelector('#esc-vb-app')),
    frame:Boolean(document.querySelector('#esc-vb-frame')),
    sectionControls:Boolean(document.querySelector('#esc-vb-refresh-section')),
    editorControls:Boolean(document.querySelector('#esc-vb-text-editor')),
    wpError:Boolean(document.querySelector('.wp-die-message, #error-page')),
  }));
  console.log('PSE_VISUAL_BUILDER_ADMIN='+JSON.stringify(builderAudit));

  console.log('PSE_EDITOR_AUDIT=PASS read_only=true no_content_saved=true');
}finally{await browser.close()}
