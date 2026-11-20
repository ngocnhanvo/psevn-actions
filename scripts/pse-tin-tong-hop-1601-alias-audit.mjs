/** Read-only verification of two Joomla articles sharing the same WP slug. */
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
const expected=[
 {id:'1601',url:'https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/1601-pvfcco-pse-to-chuc-le-cong-bo-va-trao-quyet-dinh-ve-cong-tac-can-bo.html'},
 {id:'1616',url:'https://www.pse.vn/21-tin-tuc-su-kien/tin-cong-ty/1616-pvfcco-pse-to-chuc-le-cong-bo-va-trao-quyet-dinh-ve-cong-tac-can-bo.html'}
];
const env=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,''));
const matches=env.filter(x=>x.startsWith('WC_URL='));
if(matches.length!==1)throw Error('Missing unique WordPress origin');
const u=new URL(matches[0].slice(7).replace(/^['"]|['"]$/g,''));
if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))throw Error('Unexpected WordPress URL');
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:900}});
await context.route(/\.(?:png|jpe?g|webp|gif|svg|woff2?|ttf)(?:[?#]|$)/i,route=>route.abort());
const clean=v=>String(v||'').normalize('NFKC').replace(/[\u00a0\s]+/g,' ').trim();
const fingerprint=v=>createHash('sha256').update(clean(v).toLocaleLowerCase('vi-VN')).digest('hex').slice(0,24);
const report={schema:'pse-tin-tong-hop-1601-alias-audit-v1',readonly:true,source:[],wordpress:null,comparison:null};
try{
 for(const item of expected){
  const page=await context.newPage();
  try{
   const response=await page.goto(item.url,{waitUntil:'domcontentloaded',timeout:60000});
   const payload=await page.evaluate(()=>{
    const el=document.querySelector('[itemprop="articleBody"]')||document.querySelector('.item-page [itemprop="articleBody"]');
    return {title:document.title,body:el?.textContent||'',
     dateFields:[...document.querySelectorAll('meta[property="article:published_time"],dd.created,dd.published,time[datetime]')]
      .map(x=>x.getAttribute('content')||x.getAttribute('datetime')||x.textContent||'').map(x=>x.trim()).filter(Boolean).slice(0,5)};
   });
   report.source.push({id:item.id,url:item.url,http:response?.status()||0,title:clean(payload.title),dateFields:payload.dateFields,
    bodyChars:clean(payload.body).length,bodyHash:clean(payload.body).length>60?fingerprint(payload.body):null,
    bodyPreview:clean(payload.body).slice(0,250)});
  }catch(e){report.source.push({id:item.id,url:item.url,error:String(e?.message||e).slice(0,220)})}
  finally{await page.close()}
 }
 const admin=await context.newPage();
 await admin.goto(u.origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await admin.locator('#user_login').count()){
  await admin.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
  await admin.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
  const txt=(await admin.locator('#loginform').innerText()).slice(0,500);
  const m=txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){
   const a=Number(m[1]),b=Number(m[3]),ans=m[2]==='+'?a+b:m[2]==='-'?a-b:a*b;
   const input=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(await input.count())await input.fill(String(ans));
  }
  await admin.locator('#wp-submit').click();
 }
 await admin.goto(u.origin+'/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
 if(admin.url().includes('wp-login')||!(await admin.locator('#adminmenu').count()))
  throw Error('WP authorization unavailable');
 const nonce=await admin.evaluate(async()=>window.wpApiSettings?.nonce||await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(r=>r.text()));
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('WP REST nonce missing');
 const r=await admin.evaluate(async({nonce})=>{
  const resp=await fetch('/wp-json/wp/v2/posts/77405?context=edit&_fields=id,slug,status,date,title,content,categories,acf',{
   credentials:'same-origin',headers:{'X-WP-Nonce':nonce,Accept:'application/json'}
  });return {http:resp.status,data:await resp.json().catch(()=>null)}
 },{nonce});
 if(r.http!==200||r.data?.id!==77405)throw Error('WP mapped article ID changed');
 const text=await admin.evaluate(html=>new DOMParser().parseFromString(html,'text/html').body.textContent||'',r.data.content?.raw||'');
 report.wordpress={id:r.data.id,status:r.data.status,slug:r.data.slug,date:r.data.date,
  title:clean(r.data.title?.raw||r.data.title?.rendered),categories:r.data.categories,
  bodyChars:clean(text).length,bodyHash:fingerprint(text),bodyPreview:clean(text).slice(0,250)};
 report.comparison={sameJoomlaBody:report.source.every(x=>!!x.bodyHash)&&report.source[0].bodyHash===report.source[1].bodyHash,
  wpEquals1601:report.source[0].bodyHash===report.wordpress.bodyHash,
  wpEquals1616:report.source[1].bodyHash===report.wordpress.bodyHash,
  bothSourcesAvailable:report.source.every(x=>x.http===200&&x.bodyHash)};
 console.log('PSE_TIN_TONG_HOP_SOURCE_ALIAS='+JSON.stringify(report));
 await admin.close();
}finally{
 await mkdir('artifacts/pse-tin-tong-hop-1601-alias',{recursive:true});
 await writeFile('artifacts/pse-tin-tong-hop-1601-alias/report.json',JSON.stringify(report,null,2)+'\n');
 await browser.close();
}
