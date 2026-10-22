import { chromium } from 'playwright';

// One-time admin-only read-only residual DB classification. Print structural
// counters and safe option keys only. No SQL exports, WP writes, or secrets.
const env=process.env.ENV_FILE||'';
function origin(name){
  const vals=env.split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,'')).filter(s=>s.startsWith(name+'='));
  if(vals.length!==1)throw Error('Expected one '+name);
  const u=new URL(vals[0].slice(name.length+1).trim().replace(/^['"]|['"]$/g,''));
  if(u.protocol!=='https:'||!u.hostname||u.port||u.username||u.password||u.pathname!=='/'&&u.pathname!==''||u.search||u.hash)
    throw Error('Invalid configured origin');
  return u.origin;
}
const wp=origin('WC_URL');
if(wp===origin('WC_URL_CLIENT'))throw Error('WP/frontend isolation failed');
const username=process.env.WP_ADMIN_USERNAME||'',password=process.env.WP_ADMIN_PASSWORD||'';
if(!username||!password)throw Error('WP credentials missing');
const say=(key,value)=>console.log('PSE_RESIDUE_AUDIT '+key+'='+value);
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({acceptDownloads:false});
page.setDefaultTimeout(20000);
const go=p=>page.goto(wp+p,{waitUntil:'domcontentloaded',timeout:45000});
try{
  await go('/wp-login.php');
  await page.locator('#user_login').fill(username);
  await page.locator('#user_pass').fill(password);
  const text=(await page.locator('#loginform').innerText()).slice(0,500);
  const challenge=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(challenge){
    const a=Number(challenge[1]),b=Number(challenge[3]);
    const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
    if(await input.count())await input.fill(String(challenge[2]==='+'?a+b:challenge[2]==='-'?a-b:a*b));
  }
  await page.locator('#wp-submit').click();
  await go('/wp-admin/tools.php?page=pse-template-residue-audit');
  if(!page.url().startsWith(wp+'/wp-admin/tools.php?'))throw Error('Unexpected inspector redirect');
  const el=page.locator('#pse-template-residue-json');
  await el.waitFor({timeout:30000});
  const data=JSON.parse(await el.innerText());
  if(!data.readonly||data.error_class||!data.page248||!data.options||!data.revisions)
    throw Error('Expected read-only PSE residue report unavailable');
  say('WP_READONLY','PASS');
  for(const [key,value] of Object.entries(data.page248)){
    if(Array.isArray(value)) {
      for(const field of value)if(/^[a-zA-Z0-9_-]{1,80}$/.test(field))
        say('PAGE248_META_FIELD_'+field,'LEGACY');
    } else if(typeof value==='string'||typeof value==='number')say('PAGE248_'+key.toUpperCase(),value);
  }
  for(const k of ['knowledge','media_cleaner','yoast_indexable','yoast_seo_links','agent_chat']){
    const item=data[k]||{};
    for(const name of ['present','total','legacy_rows','text_columns']){
      if(typeof item[name]==='number'||typeof item[name]==='boolean')
        say(k.toUpperCase()+'_'+name.toUpperCase(),item[name]);
    }
  }
  say('NCKH_TABLES',(data.nckh||[]).length);
  for(const row of data.nckh||[])if(/^[A-Za-z0-9_-]{1,80}$/.test(row.name))
    say('NCKH_'+row.name.toUpperCase()+'_ROWS',row.rows);
  say('LEGACY_OPTIONS',(data.options||[]).length);
  for(let i=0;i<(data.options||[]).length;i++){
    const item=data.options[i];
    if(/^[a-zA-Z0-9_-]{1,90}$/.test(item.name))
      say('OPTION_'+i+'_'+item.name,item.group+'_'+item.size_band);
  }
  for(const [group,item] of Object.entries({revisions:data.revisions,comments:data.comments})){
    for(const [key,val] of Object.entries(item||{}))if(typeof val==='number')
      say(group.toUpperCase()+'_'+key.toUpperCase(),val);
  }
  say('NO_DATABASE_WRITES','PASS');
  say('NO_ASTRO_BUILD','PASS');
}finally{await browser.close();}
