/** Read-only PSE postrelease check: shareholder parent is a real link
 * while desktop hover and mobile chevron still reveal the two remaining items.
 */
import { chromium } from 'playwright';
const rows=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,''));
const origin=k=>{
 const values=rows.filter(s=>s.startsWith(k+'='));
 if(values.length!==1)throw Error('Missing '+k);
 const u=new URL(values[0].slice(k.length+1).replace(/^['"]|['"]$/g,''));
 if(u.protocol!=='https:'||!u.hostname||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))
  throw Error('Invalid '+k);
 return u.origin;
};
const wp=origin('WC_URL'),site=origin('WC_URL_CLIENT');
const target='/tin-tuc-su-kien/thong-tin-co-dong';
const norm=s=>String(s||'').trim().normalize('NFC').replace(/\s+/g,' ').toLocaleLowerCase('vi');
const urlPath=s=>{const u=new URL(s,site+'/');if(u.origin!==site)throw Error('Off-site shareholder URL');return u.pathname.replace(/\/+$/,'');};
const flatten=(items,parent=0)=>items.flatMap(i=>[{...i,parentId:parent},...flatten(i.children||[],Number(i.id))]);
const browser=await chromium.launch({headless:true});
try{
 const api=await browser.newPage();
 const menuReq=await api.request.get(wp+'/wp-json/esc-api/v1/menus?_esc_preview='+Date.now(),{timeout:30000});
 if(!menuReq.ok())throw Error('WordPress Header API HTTP '+menuReq.status());
 const json=await menuReq.json();
 if(json?.success!==true||!Array.isArray(json?.menus?.Header?.vi?.items))throw Error('Missing WordPress Header/vi');
 const items=flatten(json.menus.Header.vi.items);
 const parent=items.filter(i=>Number(i.id)===77022&&norm(i.label)==='tin tức cổ đông');
 if(parent.length!==1||parent[0].linkMode!=='custom'||urlPath(parent[0].href)!==target)
  throw Error('WordPress shareholder parent is not a canonical link');
 const children=items.filter(i=>Number(i.parentId)===77022);
 if(children.length!==2||children.some(i=>norm(i.label)==='tất cả')||
  items.some(i=>Number(i.id)===82063))
  throw Error('WordPress shareholder submenu must contain exactly two retained children');
 const results=[];
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}});
  try{
   const response=await page.goto(site+'/',{waitUntil:'domcontentloaded',timeout:60000});
   if(response?.status()!==200)throw Error('Homepage failed at width '+width);
   const desktop=width>=900;
   if(!desktop){
    await page.locator('#hamburger-btn').click();
    const investor=page.locator('#mobile-menu-container button[data-menu-toggle]').filter({hasText:/QUAN HỆ NHÀ ĐẦU TƯ/i}).first();
    if(await investor.count()!==1)throw Error('Mobile investor branch missing');
    await investor.click();
   }else{
    const investor=page.locator('#desktop-menu button[data-menu-trigger]').filter({hasText:/QUAN HỆ NHÀ ĐẦU TƯ/i}).first();
    if(await investor.count()!==1)throw Error('Desktop investor root missing');
    await investor.hover();
   }
   const scope=desktop?'#desktop-menu':'#mobile-menu-container';
   const link=page.locator(scope+' a[href]').filter({hasText:/^Tin tức cổ đông$/i}).first();
   if(await link.count()!==1)throw Error('Shareholder parent is not rendered as a navigation link at '+width);
   if(urlPath(await link.getAttribute('href'))!==target)throw Error('Incorrect shareholder href at '+width);
   if(desktop)await link.hover();
   const button=link.locator('xpath=..').locator(desktop?'button[data-submenu-trigger]':'button[data-menu-toggle]');
   if(await button.count()!==1)throw Error('Separate submenu arrow is missing at '+width);
   if(!desktop)await button.click();
   if(await button.getAttribute('aria-expanded')!=='true')throw Error('Shareholder submenu did not open at '+width);
   const panelId=await button.getAttribute('aria-controls');
   const panel=page.locator('#'+panelId);
   if(await panel.count()!==1||await panel.getAttribute('hidden')!==null)
    throw Error('Shareholder panel remains hidden at '+width);
   const names=(await panel.locator('a,button').allTextContents()).map(norm).filter(Boolean);
   if(names.includes('tất cả'))throw Error('Redundant Tất cả still rendered at '+width);
   if(!names.some(x=>x.includes('thông tin quản trị'))||!names.some(x=>x.includes('bản công bố thông tin')))
    throw Error('Expected shareholder submenu entries missing at '+width+': '+names.join('|'));
   await Promise.all([
    page.waitForURL(u=>u.pathname.replace(/\/+$/,'')===target,{timeout:30000}),
    link.click()
   ]);
   const final=page.url();
   if(urlPath(final)!==target)throw Error('Clicked shareholder URL mismatch '+final);
   results.push({width,link:true,subMenu:true,removedAll:true,navigated:true});
  }finally{await page.close()}
 }
 console.log('PSE_SHAREHOLDER_PARENT_LIVE_QA=PASS '+JSON.stringify({source:'WordPress Menu Manager',childCount:children.length,results,readOnly:true}));
}finally{await browser.close()}
