import { chromium } from 'playwright';

const line=String(process.env.ENV_FILE||'').split(/\r?\n/)
 .map(x=>x.trim().replace(/^export\s+/,'')).filter(x=>x.startsWith('WC_URL_CLIENT='));
if(line.length!==1)throw Error('Frontend environment origin unavailable');
const parsed=new URL(line[0].slice('WC_URL_CLIENT='.length).replace(/^['"]|['"]$/g,''));
if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||
 !['','/'].includes(parsed.pathname))throw Error('Unsafe frontend origin');
const base=parsed.origin;
const expected=[
 'thong-diep','hoi-dong-quan-tri','ban-kiem-soat','ban-giam-doc',
 'so-do-to-chuc','qua-trinh-hinh-thanh-phat-trien','tam-nhin-su-menh',
 'dinh-huong-phat-trien','nganh-nghe-kinh-doanh','thanh-tuu'
];
const browser=await chromium.launch({headless:true});
let checks=0, failures=0;
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}});
  try{
   for(const slug of expected){
    const initial=await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:55000});
    if(initial?.status()!==200)throw Error('Homepage not available');
    if(width===390)await page.locator('#hamburger-btn').click();
    const trigger=width===1440
      ?page.locator('#desktop-menu button[data-menu-trigger]').filter({hasText:/PVFCCo-PSE/i}).first()
      :page.locator('#mobile-menu-container button[data-menu-toggle]').filter({hasText:/PVFCCo-PSE/i}).first();
    if(!await trigger.count())throw Error('Company dropdown trigger missing');
    await trigger.click();
    const panelId=await trigger.getAttribute('aria-controls');
    if(!panelId)throw Error('Dropdown aria-controls is missing');
    const panel=page.locator('[id="'+panelId+'"]');
    const links=panel.locator('a[href]');
    const candidates=await links.evaluateAll((nodes,slug)=>nodes.map(a=>({
      label:(a.textContent||'').trim(),
      url:a.href
    })).filter(a=>{
      try{return new URL(a.url).pathname.split('/').filter(Boolean).join('/')===slug;}catch{return false}
    }),slug);
    if(candidates.length!==1){
      const discovered=await links.evaluateAll(nodes=>nodes.map(a=>({
        label:(a.textContent||'').trim().slice(0,100),
        hostname:new URL(a.href).hostname,
        path:new URL(a.href).pathname,
        hrefAttribute:a.getAttribute('href')
      })));
      console.log('PSE_CORPORATE_MENU_OBSERVED='+JSON.stringify({width,slug,links:discovered}));
      const wpLine=String(process.env.ENV_FILE||'').split(String.fromCharCode(10))
        .map(x=>x.trim()).find(x=>x.startsWith('WC_URL='));
      if(wpLine){
        const wp=new URL(wpLine.slice('WC_URL='.length).replace(/^['"]|['"]$/g,''));
        const raw=await page.request.get(wp.origin+'/wp-json/esc-api/v1/menus',{timeout:20000});
        const obj=raw.ok()?await raw.json():{};
        const roots=obj?.menus?.Header?.vi?.items||[];
        const company=roots.find(x=>String(x.label||'').toLowerCase().includes('pvfcco-pse'));
        console.log('PSE_CORPORATE_WP_MENU_LIVE='+JSON.stringify({
          http:raw.status(),company:(company?.children||[]).map(x=>({
            label:x.label,slug:x.slug,href:x.href,linkType:x.linkType,linkMode:x.linkMode
          }))
        }));
      }

      throw Error('Missing/duplicate menu link for '+slug+': '+candidates.length);
    }
    const href=candidates[0].url;
    if(new URL(href).origin!==base)throw Error('Menu still points outside the Astro frontend: '+slug);
    const link=panel.getByRole('link',{name:candidates[0].label,exact:true});
    await Promise.all([
      page.waitForURL(u=>u.pathname.split('/').filter(Boolean).join('/')===slug,{timeout:20000}),
      link.click(),
    ]);
    const result=await page.evaluate(()=>({
      heading:(document.querySelector('#main-content.pse-public-page h1')?.textContent||'').trim(),
      main:!!document.querySelector('#main-content.pse-public-page'),
      overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+3
    }));
    const status=(await page.request.get(page.url(),{maxRedirects:4})).status();
    const ok=status===200&&result.main&&!!result.heading&&!result.overflow;
    checks++;if(!ok)failures++;
    console.log('PSE_CORPORATE_MENU_DESTINATION='+JSON.stringify({slug,width,path:new URL(href).pathname,status,...result,ok}));
   }
  }finally{await page.close()}
 }
 console.log('PSE_CORPORATE_MENU_DESTINATIONS_SUMMARY='+JSON.stringify({checks,failures,readOnly:true,expected:20}));
 if(checks!==20||failures)process.exitCode=1;
}finally{await browser.close()}
