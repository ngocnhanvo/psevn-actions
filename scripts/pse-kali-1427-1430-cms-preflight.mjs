/** Read-only preflight for legacy Kali links #1427/#1430 before any CMS mutation. */
import { chromium, request } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const root='https://pse.webnvn.com',wp='https://admin-pse.webnvn.com',dir='artifacts/pse-kali-1427-1430-cms-preflight';
if(process.env.GITHUB_REPOSITORY!=='ngocnhanvo/psevn-actions'||process.env.GITHUB_REF!=='refs/heads/main')throw Error('Wrong execution scope');
await mkdir(dir,{recursive:true});
const proof=JSON.parse(await readFile('inputs/proof/report.json','utf8'));
if(!proof.readOnly||!proof.noCmsWrites||![1427,1430].every(id=>proof.rows.find(x=>x.id===id)?.ready))throw Error('Verified original proof unavailable');
const browser=await chromium.launch(),net=await request.newContext({timeout:45000});
const report={readOnly:true,noCmsWrites:true,proofRun:44993780995,rows:[],page83572:null,errors:[]};
const save=()=>writeFile(dir+'/report.json',JSON.stringify(report,null,2)+'\n');
const paths=['/hoat-dong-kinh-doanh/san-pham/kali-phu-my.html'];
try {
 const p=await browser.newPage();
 const homepage=await p.goto(root+'/kali-phu-my-mo-ta-cac-bien-the',{waitUntil:'domcontentloaded',timeout:60000});
 if(homepage?.status()!==200)throw Error('Parent Page not HTTP200');
 const links=await p.locator('main a[href]').evaluateAll(els=>els.map(a=>({text:a.textContent.trim(),href:a.href})));
 report.page83572={http:200,legacyLinks:links.filter(l=>/kali-phu-my\.html\?id=(1427|1430)/.test(l.href)),nativeLinks:links.filter(l=>/kali-phu-my-(mieng|bot)-mop/.test(l.href))};
 const rest=await net.get(wp+'/wp-json/wp/v2/pages/83572?_fields=id,slug,status,acf,content');
 if(rest.status()!==200)throw Error('Parent Page public REST unavailable');
 const parent=await rest.json();
 if(parent.id!==83572||parent.slug!=='kali-phu-my-mo-ta-cac-bien-the'||parent.acf?.key!=='pse-historical-kali-1426')throw Error('Unexpected parent Page');
 for(const id of [1427,1430]){
  const legacy=paths[0]+'?id='+id;
  const target='/san-pham/kali-phu-my-'+(id===1427?'mieng':'bot')+'-mop-'+id;
  const slug='kali-phu-my-'+(id===1427?'mieng':'bot')+'-mop-mo-ta-va-hdsd';
  const pageRoute='/'+slug;
  const checks=[];
  for(const path of [legacy,target,pageRoute]){
   const r=await net.get(root+path,{maxRedirects:0,failOnStatusCode:false});
   checks.push({path,status:r.status(),location:r.headers().location??null});
  }
  const wpPage=await net.get(wp+'/wp-json/wp/v2/pages?slug='+slug+'&_fields=id,slug,status,acf');
  const wpProduct=await net.get(wp+'/wp-json/wp/v2/product?slug=kali-phu-my-'+(id===1427?'mieng':'bot')+'-mop-'+id+'&_fields=id,slug,status,name');
  const row={id,original:proof.rows.find(x=>x.id===id),checks,
   nativePage:{status:wpPage.status(),data:wpPage.status()===200?await wpPage.json():null},
   nativeProduct:{status:wpProduct.status(),data:wpProduct.status()===200?await wpProduct.json():null}};
  report.rows.push(row);console.log('PSE_KALI_1427_1430_CMS_PREFLIGHT='+JSON.stringify({id,checks,nativePage:row.nativePage,nativeProduct:row.nativeProduct}));
 }
 await save();
}catch(e){report.errors.push(String(e));await save();throw e}
finally{await save();await browser.close();await net.dispose()}
