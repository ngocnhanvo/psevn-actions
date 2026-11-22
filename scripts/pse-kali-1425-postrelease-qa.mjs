/** Independent postrelease proof for owner-approved historical Kali routes. READ ONLY. */
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const origin='https://pse.webnvn.com';
const wp='https://admin-pse.webnvn.com';
const from='/hoat-dong-kinh-doanh/san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my/8-trang-chu/1425-kali-phu-my-bot-canada-mo-ta-va-hdsd.html';
const to='/kali-phu-my-bot-canada-mo-ta-va-hdsd';
const ownerOld='/kali-phu-my-mo-ta-va-hdsd';
const ownerTo='/san-pham/kali-phu-my-mieng-mop-1427';
const ownerLegacy='/hoat-dong-kinh-doanh/san-pham/dam-phu-my/8-trang-chu/1678-kali-phu-my-mo-ta-va-hdsd.html';
const dir='artifacts/pse-kali-1425-postrelease'; await mkdir(dir,{recursive:true});
const report={readonly:true,checks:[],screens:[],pass:false};
const save=()=>writeFile(dir+'/report.json',JSON.stringify(report,null,2)+'\n');
const browser=await chromium.launch({headless:true});
try{
 const ctx=await browser.newContext({viewport:{width:1366,height:860}});
 const get=async path=>{for(let i=0;i<3;i++){try{const r=await ctx.request.get(origin+path,{maxRedirects:0,timeout:35000,failOnStatusCode:false});if(r.status()>=500&&i<2)continue;return r}catch(e){if(i===2)throw e;await new Promise(ok=>setTimeout(ok,800*(i+1)))}}};
 for(const [oldPath,target] of [[from,to],[ownerOld,ownerTo],[ownerLegacy,ownerTo]]){
  const r=await get(oldPath);
  if(r.status()!==301)throw Error('Legacy does not HTTP301 '+oldPath+' status='+r.status());
  const loc=r.headers().location;
  if(!loc||new URL(loc,origin).href!==origin+target)throw Error('Legacy Location mismatch '+oldPath);
  const targetRes=await get(target);
  if(targetRes.status()!==200)throw Error('Target not HTTP200 '+target);
  report.checks.push({from:oldPath,to:target,status:301,location:loc,targetStatus:200});
 }
 const pageProof=await ctx.request.get(wp+'/wp-json/wp/v2/pages?slug=kali-phu-my-bot-canada-mo-ta-va-hdsd&_fields=id,slug,status,acf,featured_media',{timeout:45000});
 const pages=await pageProof.json();
 if(pageProof.status()!==200||!Array.isArray(pages)||pages.length!==1||pages[0].id!==83528||pages[0].status!=='publish'||pages[0].acf?.key!=='pse-historical-kali-1425'||pages[0].featured_media!==83527)throw Error('Native owner Page83528 changed');
 const productRes=await ctx.request.get(wp+'/wp-json/wp/v2/product/80938?_fields=id,slug,status,featured_media',{timeout:45000});
 const product=await productRes.json();
 if(productRes.status()!==200||product.id!==80938||product.status!=='publish'||product.slug!=='kali-phu-my-mieng-mop-1427'||!product.featured_media)throw Error('Owner Product80938 identity mismatch');
 const oldPage=await ctx.request.get(wp+'/wp-json/wp/v2/pages?slug=kali-phu-my-mo-ta-va-hdsd&_fields=id,slug,status',{timeout:45000});
 if(oldPage.status()!==200||JSON.stringify(await oldPage.json())!=='[]')throw Error('Superseded old Kali Page is public');
 report.checks.push({pageId:83528,mediaId:83527,ownerProductId:80938,ownerPageNotPublic:true});
 await ctx.close();
 for(const width of [1366,390]){
  const context=await browser.newContext({viewport:{width,height:860},deviceScaleFactor:1});
  const p=await context.newPage(),direct=[];
  p.on('request',r=>{try{if(new URL(r.url()).origin===wp)direct.push(r.url())}catch{}});
  const response=await p.goto(origin+to,{waitUntil:'domcontentloaded',timeout:60000});
  if(response?.status()!==200||p.url()!==origin+to)throw Error('Original Kali page not HTTP200 '+width);
  const canonical=await p.locator('link[rel="canonical"]').getAttribute('href');
  if(canonical!==origin+to)throw Error('Canonical mismatch '+width);
  const root=p.locator('.pse-historical-kali-1425');
  if(await root.count()!==1||await root.locator('table').count()!==2||await root.locator('img').count()!==1)throw Error('Source Page layout missing '+width);
  const imgs=root.locator('img');
  await imgs.first().scrollIntoViewIfNeeded();
  await imgs.first().evaluate(img=>img.decode());
  const src=await imgs.first().evaluate(img=>img.currentSrc||img.src);
  if(new URL(src).origin!==origin)throw Error('Media is not same origin');
  const live=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth}));
  if(live.overflow>5||direct.length)throw Error('Layout overflow or admin origin leaked '+width);
  if(await root.locator('a[href="'+ownerTo+'"]').count()<1&&await root.locator('a[href="'+origin+ownerTo+'"]').count()<1)throw Error('Superseded 1678 link does not point to Product '+width);
  if(await root.locator('a[href="'+ownerOld+'"]').count()||await root.locator('a[href="'+origin+ownerOld+'"]').count())throw Error('Stale 1678 Page link '+width);
  await p.screenshot({path:dir+'/kali-1425-'+width+'.png',fullPage:true,timeout:45000});
  report.screens.push({width,http:200,canonical,imagesDecoded:1,tables:2,overflow:live.overflow,ownerProductHrefVerified:true});
  await context.close();
 }
 report.pass=true;
 console.log('PSE_KALI_1425_POSTRELEASE_PASS='+JSON.stringify(report));
}finally{await save();await browser.close()}
