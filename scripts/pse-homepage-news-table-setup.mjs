/**
 * One-time, idempotent PSE ESC Table setup through the actual WordPress Admin UI.
 * Creates the CMS-owned news-lane section definition only; DOES NOT publish,
 * edit the homepage, build Astro, migrate articles or create fake content.
 */
import { chromium } from 'playwright';

function configuredOrigin(name) {
  const lines=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,''));
  const matches=lines.filter(x=>x.startsWith(name+'='));
  if(matches.length!==1) throw new Error('Missing or ambiguous '+name);
  const u=new URL(matches[0].slice(name.length+1).trim().replace(/^['"]|['"]$/g,''));
  if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||
     !['','/'].includes(u.pathname)||u.search||u.hash) throw new Error('Invalid WordPress origin');
  return u.origin;
}
const origin=configuredOrigin('WC_URL');
const username=process.env.WP_ADMIN_USERNAME;
const password=process.env.WP_ADMIN_PASSWORD;
if(!username||!password)throw new Error('WordPress admin secrets missing');
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:false});
const page=await context.newPage();
const tableId='pse_01_vi';
const tableName='PSE - Tin tuc 3 chuyen muc';
const arithmetic=s=>{
  const m=s.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||s.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(!m)return null;
  const a=Number(m[1]),b=Number(m[3]);return ({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
};
try{
  await page.goto(origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
  if(await page.locator('#user_login').count()){
    await page.locator('#user_login').fill(username);
    await page.locator('#user_pass').fill(password);
    const answer=arithmetic(await page.locator('body').innerText());
    if(answer!==null){
      const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if(!await input.count()) throw new Error('Login arithmetic field missing');
      await input.fill(String(answer));
    }
    await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
  }
  if(page.url().includes('wp-login'))throw new Error('Admin authentication failed');
  console.log('PSE_CMS_NEWS_TABLE_LOGIN=PASS');
  const list=origin+'/wp-admin/admin.php?page=tablepress';
  await page.goto(list,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(1700);
  const listText=await page.locator('#wpbody-content').innerText();
  if(listText.includes(tableId)){
    console.log('PSE_CMS_NEWS_TABLE=ALREADY_EXISTS; ID='+tableId+'; no duplicate created');
  }else if(listText.includes(tableName)){
    // May be a previously created numeric-ID draft after interrupted rename.
    throw new Error('PSE news table draft exists with another ID; inspect it before retry');
  }else{
    await page.goto(origin+'/wp-admin/admin.php?page=tablepress_add',
      {waitUntil:'domcontentloaded',timeout:60000});
    await page.locator('input[name="table[name]"]').fill(tableName);
    await page.locator('textarea[name="table[description]"]').fill(
      'PSE homepage 3 news columns: company, agriculture market and shareholder. WordPress posts and category IDs to be linked after verified migration. Not yet published.');
    const numeric=page.locator('input[type="number"]');
    if(await numeric.count()<2)throw new Error('Table row/column inputs unavailable');
    await numeric.nth(0).fill('5');
    await numeric.nth(1).fill('3');
    console.log('PSE_CMS_NEWS_TABLE_CREATE_ATTEMPT=START; rows=5 columns=3');
    await page.getByRole('button',{name:'Add Table'}).click();
    await page.waitForTimeout(1900);
    const idField=page.locator('#table-id');
    await idField.waitFor({state:'visible',timeout:40000});
    const generatedId=await idField.inputValue();
    console.log('PSE_CMS_NEWS_TABLE_CREATED=PASS; numeric_id='+/^[0-9]+$/.test(generatedId));
    const readonly=await idField.getAttribute('readonly');
    if(readonly!==null)throw new Error('Table created but ID rename is readonly; do not duplicate');
    page.on('dialog',async dialog=>{if(dialog.type()==='confirm')await dialog.accept();else await dialog.dismiss()});
    await idField.fill(tableId);
    await page.locator('#table-name').focus();
    await page.waitForTimeout(500);
    const save=page.getByRole('button',{name:/Save Changes|Lưu thay đổi/i}).first();
    if(!await save.count())throw new Error('Table created but Save Changes not available');
    await save.click();
    await page.waitForTimeout(1800);
    console.log('PSE_CMS_NEWS_TABLE_SAVE_ATTEMPT=PASS');
  }
  // Save Changes can initiate its own navigation. Do not race the browser's redirect.
  await page.waitForTimeout(2300);
  try {
    await page.goto(list,{waitUntil:'domcontentloaded',timeout:60000});
  } catch(error) {
    if(!String(error).includes('ERR_ABORTED')) throw error;
    await page.waitForTimeout(1700);
    await page.goto(list,{waitUntil:'domcontentloaded',timeout:60000});
  }
  await page.waitForTimeout(1800);
  const verified=await page.locator('#wpbody-content').innerText();
  if(!verified.includes(tableId))throw new Error('Read-after-write did not confirm requested ESC Table ID');
  console.log('PSE_CMS_NEWS_TABLE_READ_AFTER_WRITE=PASS; id='+tableId);
  // PHP's existing REST endpoint uses row 0 for keys, row 1 for labels,
  // and rows 2.. for component items. Keep three genuinely editable news lanes.
  const expected=[
    ['label','categoryId','href'],
    ['Tên nhóm','ID chuyên mục WordPress','Liên kết chuyên mục'],
    ['Tin PVFCCo-PSE','',''],
    ['Tin mùa vụ thị trường','',''],
    ['Thông tin cổ đông','',''],
  ];
  await page.goto(origin+'/wp-admin/admin.php?page=tablepress&action=edit&table_id='+tableId,
    {waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(1800);
  const before=await page.evaluate(()=>{
    const table=window.tp?.table;
    return {
      id:table?.id||table?.meta?.id,
      data:Array.isArray(table?.data)?table.data.map(row=>Array.from(row)):null,
      hasEditorSetValue:typeof window.tp?.editor?.setValueFromCoords==='function',
      hasRowsAppend:!!document.querySelector('#rows-append-number'),
    };
  });
  if(before.id!==tableId||!before.data||before.data[0]?.length!==3)throw new Error('Wrong ESC Table or column count');
  if(!before.hasEditorSetValue||!before.hasRowsAppend)throw new Error('Required ESC Table GUI editing capability missing');
  const exact=JSON.stringify(before.data)===JSON.stringify(expected);
  if(exact){
    console.log('PSE_CMS_NEWS_FIELDS=ALREADY_CONFIGURED; no extra edit');
  }else{
    // A human-edited or partially filled table must not be overwritten.
    const blank=before.data.every(row=>row.every(cell=>String(cell??'').trim()===''));
    if(!blank||![4,5].includes(before.data.length)){
      throw new Error('ESC Table existing grid is not the expected blank draft; manual review before mutation');
    }
    if(before.data.length===4){
      // Same native TablePress callback as the React "Add row(s)" button,
      // avoids relying on whether its responsive panel is currently expanded.
      await page.evaluate(()=>{
        const tp=window.tp;
        if(typeof tp?.callbacks?.append!=='function')throw new Error('Native TablePress row add action missing');
        tp.callbacks.append('rows',1);
      });
      await page.waitForTimeout(350);
    }
    const configured=await page.evaluate(rows=>{
      const tp=window.tp;
      const editor=tp?.editor;
      if(!editor?.setValueFromCoords)throw new Error('Editor change API unavailable');
      if(editor.options.data.length!==5)throw new Error('Expected exactly five rows after native Add button');
      rows.forEach((row,y)=>row.forEach((value,x)=>{
        if(value)editor.setValueFromCoords(x,y,value);
      }));
      tp.helpers.unsaved_changes.set();
      return editor.options.data.length;
    },expected);
    if(configured!==5)throw new Error('Table row authoring did not reach five rows');
    console.log('PSE_CMS_NEWS_FIELDS_GUI_EDIT=PASS; five_rows=true');
    await page.getByRole('button',{name:'Save Changes',exact:true}).first().click();
    await page.waitForTimeout(2500);
  }
  // WordPress-owned REST data is the actual renderer contract; verify it, not only UI toast.
  const check=await page.evaluate(async()=>{
    const response=await fetch('/wp-json/tablepress/v1/table/pse_01_vi',
      {credentials:'same-origin',headers:{Accept:'application/json','Cache-Control':'no-cache'}});
    if(!response.ok)throw new Error('ESC Table read-after-write REST HTTP '+response.status);
    const data=await response.json();
    return {id:data?.id,fields:data?.fields,items:data?.items};
  });
  if(check.id!==tableId||
    JSON.stringify(check.fields?.map(x=>x.key))!==JSON.stringify(expected[0])||
    JSON.stringify(check.items?.map(x=>[x.label,x.categoryId,x.href]))!==JSON.stringify(expected.slice(2))){
    throw new Error('REST read-after-write rows mismatch; do not attach shortcode yet');
  }
  console.log('PSE_CMS_NEWS_THREE_LANES_READ_AFTER_WRITE=PASS; items=3; categories=unconfigured; no fabricated posts');
  console.log('PSE_CMS_NEWS_TABLE_SCOPE=TABLE_STRUCTURE_ONLY; HOME_UNCHANGED=true; ARTICLES_UNCHANGED=true; NO_BUILD=true');
}finally{await browser.close()}
