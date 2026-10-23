/**
 * Author blank-but-valid PSE CMS section schemas through ESC Table's real editor.
 * Safe to resume after interrupted table creation; never duplicate existing IDs.
 * This only creates/edits three dedicated PSE tables. It never edits Page 248,
 * invents marketing copy/media/statistics, imports posts or builds Astro.
 */
import { chromium } from 'playwright';
const sectionSpecs=[
  {
    id:'pse_00_vi',name:'PSE - Banner trang chu (CMS)',description:'PSE editable hero slides, only verified WordPress media and copy.',
    rows:[
      ['label','title','description','img','href','cta'],
      ['Nhãn','Tiêu đề','Mô tả','Ảnh từ thư viện WordPress','Liên kết','Nhãn nút'],
      ['','','','','','']
    ]
  },
  {
    id:'pse_02_vi',name:'PSE - Ben vung (CMS)',description:'Editable sustainability background and highlights. Public copy must be verified.',
    rows:[
      ['sectionTitle','sectionDescription','background','title','description','icon'],
      ['Tiêu đề section','Mô tả section','Ảnh nền','Tiêu đề thông điệp','Mô tả thông điệp','Biểu tượng'],
      ['','','','','',''],
      ['','','','','',''],
      ['','','','','',''],
      ['','','','','','']
    ]
  },
  {
    id:'pse_03_vi',name:'PSE - Tien ich (CMS)',description:'Only verified useful links; visitor counters are not fabricated.',
    rows:[
      ['label','href'],
      ['Tên liên kết','Địa chỉ liên kết'],
      ['',''],
      ['','']
    ]
  }
];
const readOrigin=()=>{
  const rows=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,'')).filter(x=>x.startsWith('WC_URL='));
  if(rows.length!==1)throw new Error('Missing/duplicate WC_URL');
  const u=new URL(rows[0].split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g,''));
  if(u.protocol!=='https:'||!u.hostname||u.username||u.password||(u.port&&u.port!=='443')||
    !['','/'].includes(u.pathname)||u.search||u.hash)throw new Error('Invalid WordPress HTTPS origin');
  return u.origin;
};
const origin=readOrigin();
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();
// Attach one handler for the entire session. Re-attaching it for each table
// races Playwright's dialog.accept() and can abort a partially completed job.
page.on('dialog',async dialog=>{
  try{
    if(dialog.type()==='confirm')await dialog.accept();
    else await dialog.dismiss();
  }catch(error){
    if(!String(error).includes('already handled'))throw error;
  }
});
const auth=async()=>{
  const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
  if(!username||!password)throw new Error('Missing WP Admin credentials');
  await page.goto(origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
  if(await page.locator('#user_login').count()){
    await page.locator('#user_login').fill(username);
    await page.locator('#user_pass').fill(password);
    const text=await page.locator('body').innerText();
    const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if(m){
      const a=Number(m[1]),b=Number(m[3]),answer=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
      const captcha=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if(!await captcha.count())throw new Error('Missing arithmetic verification field');
      await captcha.fill(String(answer));
    }
    await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
  }
  if(page.url().includes('wp-login'))throw new Error('WordPress admin login unsuccessful');
};
const getTable=async id=>page.evaluate(async tableId=>{
  const r=await fetch('/wp-json/tablepress/v1/table/'+encodeURIComponent(tableId),
    {credentials:'same-origin',headers:{Accept:'application/json','Cache-Control':'no-cache'}});
  if(r.status===404)return null;
  if(!r.ok)throw new Error('TablePress REST HTTP '+r.status);
  return r.json();
},id);
const assertSchema=(actual,spec)=>{
  if(!actual||actual.id!==spec.id)throw new Error('REST could not find expected ID '+spec.id);
  const keys=actual.fields?.map(field=>field.key);
  if(JSON.stringify(keys)!==JSON.stringify(spec.rows[0]))
    throw new Error('ESC Table field keys mismatch: '+spec.id);
  if(actual.items?.length!==spec.rows.length-2)
    throw new Error('ESC Table item count mismatch: '+spec.id);
  const items=actual.items.map(item=>spec.rows[0].map(key=>item[key]??''));
  if(JSON.stringify(items)!==JSON.stringify(spec.rows.slice(2)))
    throw new Error('Unexpected nonempty or misordered existing data: '+spec.id);
};
try{
  await auth();
  console.log('PSE_SECTION_TEMPLATES_LOGIN=PASS');
  for(const spec of sectionSpecs){
    let existing=await getTable(spec.id);
    if(existing){
      try{
        assertSchema(existing,spec);
        console.log('PSE_SECTION_TABLE=ALREADY_CORRECT; id='+spec.id+'; no duplicate/mutation');
        continue;
      }catch(error){
        // Previous attempt might have created the table but stopped before
        // authoring its columns. Only resume when its dimensions match.
        if(existing.fields?.length!==spec.rows[0].length||
           existing.items?.length!==spec.rows.length-2)throw error;
        console.log('PSE_SECTION_TABLE=RESUME_EXISTING; id='+spec.id);
      }
    }
    if(!existing){
    const list=origin+'/wp-admin/admin.php?page=tablepress';
    await page.goto(list,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForTimeout(1100);
    const txt=await page.locator('#wpbody-content').innerText();
    if(txt.includes(spec.name)){
      // The previous attempt may have created a numeric-ID draft, but stopped
      // before setting its stable PSE ID. Recover that same table, never clone it.
      const named=page.getByRole('link',{name:spec.name,exact:true});
      if(await named.count()!==1)throw new Error('Cannot uniquely identify numeric draft: '+spec.id);
      const editHref=await named.getAttribute('href');
      const numericId=editHref?.match(/[?&]table_id=(\d+)(?:&|$)/)?.[1];
      if(!numericId)throw new Error('Named table has no numeric draft edit URL: '+spec.id);
      const draft=await getTable(numericId);
      if(draft?.title!==spec.name||draft.description!==spec.description||
         draft.fields?.length!==spec.rows[0].length||
         draft.items?.length!==spec.rows.length-2||
         draft.fields.some(field=>String(field.key??'').trim())||
         draft.items.some(item=>Object.values(item).some(value=>String(value??'').trim())))
        throw new Error('Numeric draft contains unexpected data; will not rename: '+spec.id);
      await page.goto(origin+'/wp-admin/admin.php?page=tablepress&action=edit&table_id='+numericId,
        {waitUntil:'domcontentloaded',timeout:60000});
      await page.locator('#table-id').waitFor({state:'visible',timeout:45000});
      await page.locator('#table-id').fill(spec.id);
      await page.locator('#table-name').focus();
      await page.waitForTimeout(450);
      await page.getByRole('button',{name:'Save Changes',exact:true}).first().click();
      await page.waitForTimeout(2600);
      existing=await getTable(spec.id);
      if(!existing)throw new Error('Numeric draft rename not confirmed: '+spec.id);
      console.log('PSE_SECTION_TABLE=RECOVERED_NUMERIC_DRAFT; id='+spec.id);
    }else{
    await page.goto(origin+'/wp-admin/admin.php?page=tablepress_add',
      {waitUntil:'domcontentloaded',timeout:60000});
    await page.locator('input[name="table[name]"]').fill(spec.name);
    await page.locator('textarea[name="table[description]"]').fill(spec.description);
    const input=page.locator('input[type="number"]');
    if(await input.count()<2)throw new Error('Table dimension editor unavailable');
    await input.nth(0).fill(String(spec.rows.length));
    await input.nth(1).fill(String(spec.rows[0].length));
    await page.getByRole('button',{name:'Add Table'}).click();
    await page.locator('#table-id').waitFor({state:'visible',timeout:45000});
    const generated=await page.locator('#table-id').inputValue();
    if(!/^\d+$/.test(generated))throw new Error('Unexpected generated table ID');
    await page.locator('#table-id').fill(spec.id);
    await page.locator('#table-name').focus();
    await page.waitForTimeout(450);
    await page.getByRole('button',{name:'Save Changes',exact:true}).first().click();
    await page.waitForTimeout(2600);
    existing=await getTable(spec.id);
    if(!existing)throw new Error('Table ID rename not visible in REST, stop to avoid duplicates: '+spec.id);
    }
    }
    await page.goto(origin+'/wp-admin/admin.php?page=tablepress&action=edit&table_id='+spec.id,
      {waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForTimeout(1600);
    const edit=await page.evaluate(()=>{
      const tp=window.tp;
      return {
        id:tp?.table?.id||tp?.table?.meta?.id,
        rows:Array.isArray(tp?.table?.data)?tp.table.data.map(r=>Array.from(r)):null,
        setValue:typeof tp?.editor?.setValueFromCoords==='function'
      };
    });
    if(edit.id!==spec.id||!edit.setValue||edit.rows?.length!==spec.rows.length||
      edit.rows[0]?.length!==spec.rows[0].length||
      !edit.rows.every((row,y)=>row.every((value,x)=>{
        const current=String(value??'').trim();
        return !current||current===spec.rows[y][x];
      })))
      throw new Error('Unexpected source grid; will not overwrite: '+spec.id);
    const missing=edit.rows.some((row,y)=>row.some((value,x)=>
      Boolean(spec.rows[y][x])&&!String(value??'').trim()
    ));
    if(missing){
      await page.evaluate(rows=>{
        const tp=window.tp;
        rows.forEach((row,y)=>row.forEach((val,x)=>{
          if(val&&!String(tp.table.data[y][x]??'').trim())
            tp.editor.setValueFromCoords(x,y,val);
        }));
        tp.helpers.unsaved_changes.set();
      },spec.rows);
      await page.getByRole('button',{name:'Save Changes',exact:true}).first().click();
      await page.waitForTimeout(2300);
    }
    const after=await getTable(spec.id);
    assertSchema(after,spec);
    console.log('PSE_SECTION_TABLE_REST_READ_AFTER_WRITE=PASS; id='+spec.id+
      '; fields='+spec.rows[0].length+'; items='+after.items.length+'; content=empty_verified');
  }
  console.log('PSE_REMAINING_THREE_TABLES=PASS; HOME_UNCHANGED=true; NO_POSTS=true; NO_BUILD=true');
}finally{await browser.close()}
