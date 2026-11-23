/** Independently validates Kali historical native content and exact query redirects in production. */
import {chromium,request} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const host='https://pse.webnvn.com',wp='https://admin-pse.webnvn.com',out='artifacts/pse-kali-1427-1430-live-qa';
if(process.env.GITHUB_REPOSITORY!=='ngocnhanvo/psevn-actions')throw Error('Wrong repository');
const expected=[
 {id:1425,to:'/kali-phu-my-bot-canada-mo-ta-va-hdsd'},
 {id:1427,to:'/san-pham/kali-phu-my-mieng-mop-1427'},
 {id:1430,to:'/kali-phu-my-bot-mop-mo-ta-va-hdsd'}
];
await mkdir(out,{recursive:true});
const report={pass:false,redirects:[],parent:null,pages:[],invalid:[],noCmsWrites:true};
const save=()=>writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
const browser=await chromium.launch({headless:true}),net=await request.newContext({timeout:60000});
try{
 const parent=await net.get(wp+'/wp-json/wp/v2/pages/83572?_fields=id,slug,status,acf,content');
 const cms=parent.status()===200?await parent.json():null;
 if(cms?.id!==83572||cms?.status!=='publish'||cms.acf?.key!=='pse-historical-kali-1426')throw Error('Parent CMS Page mismatch');
 for(const plan of expected){
  const url=host+'/hoat-dong-kinh-doanh/san-pham/kali-phu-my.html?id='+plan.id;
  const res=await net.get(url,{maxRedirects:0,failOnStatusCode:false}),loc=res.headers().location;
  if(res.status()!==301||!loc||new URL(loc,host).href!==host+plan.to)throw Error('Incorrect HTTP301 Location for '+plan.id);
  const target=await net.get(host+plan.to,{maxRedirects:0,failOnStatusCode:false});
  if(target.status()!==200)throw Error('Redirect target unavailable '+plan.id);
  const body=await target.text();
  if(!/<h1(?:\s|>)/i.test(body)||!body.includes('rel="canonical"')&&!body.includes("rel='canonical'"))throw Error('Destination SEO/H1 missing '+plan.id);
  report.redirects.push({...plan,http:301,targetHTTP:200});await save();
 }
 for(const invalid of ['999999','0','1431']){
  const res=await net.get(host+'/hoat-dong-kinh-doanh/san-pham/kali-phu-my.html?id='+invalid,{maxRedirects:0,failOnStatusCode:false});
  if(res.status()===301)throw Error('Unknown Joomla ID erroneously redirected '+invalid);
  report.invalid.push({id:invalid,http:res.status()});
 }
 const pageData=await net.get(wp+'/wp-json/wp/v2/pages?slug=kali-phu-my-bot-mop-mo-ta-va-hdsd&_fields=id,status,slug,acf,content,featured_media');
 const items=pageData.status()===200?await pageData.json():[];
 if(items.length!==1||items[0].status!=='publish'||items[0].acf?.key!=='pse-historical-kali-1430')throw Error('1430 WordPress Page source missing');
 for(const width of [1366,390]){
  const ctx=await browser.newContext({viewport:{width,height:860},isMobile:width===390,deviceScaleFactor:1}),p=await ctx.newPage();
  const parentRes=await p.goto(host+'/kali-phu-my-mo-ta-cac-bien-the',{waitUntil:'domcontentloaded',timeout:60000});
  if(parentRes?.status()!==200)throw Error('Parent frontend HTTP error');
  const pLinks=await p.locator('main a[href]').evaluateAll(xs=>xs.map(a=>a.href));
  for(const target of ['/san-pham/kali-phu-my-mieng-mop-1427','/kali-phu-my-bot-mop-mo-ta-va-hdsd'])
   if(!pLinks.includes(host+target))throw Error('Parent native link absent '+target);
  if(pLinks.some(x=>x.includes('pse.vn/hoat-dong-kinh-doanh/san-pham/kali-phu-my.html')||x.includes('pse.vn/index.php?option=com_content')))throw Error('Parent still links to original Joomla');
  const parentOverflow=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  if(parentOverflow>5)throw Error('Parent horizontal overflow '+width);
  report.parent={http:200,verifiedLinks:2,overflow:parentOverflow};
  const res=await p.goto(host+'/kali-phu-my-bot-mop-mo-ta-va-hdsd',{waitUntil:'domcontentloaded',timeout:60000});
  if(res?.status()!==200)throw Error('1430 native frontend HTTP '+res?.status());
  const canonical=await p.locator('link[rel=canonical]').getAttribute('href');
  const root=p.locator('.pse-historical-kali-1430');
  if(canonical!==host+'/kali-phu-my-bot-mop-mo-ta-va-hdsd'||await root.count()!==1||await root.locator('table').count()!==2||await root.locator('img').count()!==1)throw Error('1430 canonical/content structure mismatch '+width);
  const image=root.locator('img').first();await image.scrollIntoViewIfNeeded();await image.evaluate(async img=>img.decode());
  const metrics=await root.evaluate(x=>({text:x.textContent||'',overflow:document.documentElement.scrollWidth-innerWidth,src:x.querySelector('img')?.currentSrc}));
  console.log('PSE_KALI_1430_METRICS='+JSON.stringify({width,textFirst:metrics.text.slice(0,300),hasText:metrics.text.includes('Kali Phú Mỹ Bột MOP'),overflow:metrics.overflow,src:metrics.src}));
  if(!metrics.text.normalize('NFKC').replace(/\s+/g,' ').includes('Kali Phú Mỹ Bột MOP')||metrics.overflow>5||!metrics.src?.startsWith(host+'/'))throw Error('1430 content/image/overflow mismatch '+width);
  report.pages.push({width,http:200,canonical,images:1,tables:2,overflow:metrics.overflow});await save();
  await p.screenshot({path:out+'/kali-1430-'+width+'.png',fullPage:true});await ctx.close();
 }
 report.pass=true;console.log('PSE_KALI_1430_REDIRECT_LIVE_PASS='+JSON.stringify(report));
}finally{await save();await net.dispose();await browser.close()}
