/** One-record WordPress Page 83572 link repair. No Astro hard-coding, no placeholder Page. */
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
const apply=event.head_commit?.message==='cms(pse): fix Kali related links' && process.env.PSE_KALI_LINKS_PREVIEW_ONLY!=='true';
if(process.env.GITHUB_REPOSITORY!=='ngocnhanvo/psevn-actions'||process.env.GITHUB_REF!=='refs/heads/main')
  throw Error('Unexpected repository or branch');
if(apply&&process.env.PSE_KALI_FRESH_DB_BACKUP!=='true')
  throw Error('Fresh WordPress database backup required before Page mutation');

const val=key=>{
 const items=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,'')).filter(s=>s.startsWith(key+'='));
 if(items.length!==1)throw Error('Missing single environment key '+key);
 const u=new URL(items[0].slice(key.length+1).replace(/^['"]|['"]$/g,''));
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))
   throw Error('Unexpected origin shape '+key);
 return u.origin;
};
const wp=val('WC_URL'),front=val('WC_URL_CLIENT');
if(wp!=='https://admin-pse.webnvn.com'||front!=='https://pse.webnvn.com')
  throw Error('PSE origin mismatch');
const oldNpk='https://pse.vn/hoat-dong-kinh-doanh/san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my/8-trang-chu/1434-npk-phu-my.html';
const newNpk=front+'/npk-phu-my';
const oldPlaceholder='https://pse.vn/hoat-dong-kinh-doanh/san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my/8-trang-chu/49-noi-dung-dang-cap-nhat.html';
const sha=text=>createHash('sha256').update(String(text||'')).digest('hex');
const dir='artifacts/pse-kali-related-links';
await mkdir(dir,{recursive:true});

const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
try{
  if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)
    throw Error('Missing authorized WordPress admin credentials');
  await page.goto(wp+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
  if(await page.locator('#user_login').count()){
    await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
    await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
    const t=await page.locator('body').innerText();
    const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if(m){
      const a=+m[1],b=+m[3];
      const result=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
      const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if(!await f.count())throw Error('Unrecognized login challenge');
      await f.fill(String(result));
    }
    await page.locator('#wp-submit').click();
  }
  if(page.url().includes('wp-login'))throw Error('WordPress admin authentication rejected');
  const nonce=await page.evaluate(async()=>{
    if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
    const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});
    if(!r.ok)throw Error('WordPress REST nonce unavailable');
    return(await r.text()).trim();
  });
  if(!/^[0-9a-z]{8,24}$/i.test(nonce))throw Error('Bad WordPress REST nonce');
  const get=async()=>page.evaluate(async nonce=>{
    const r=await fetch('/wp-json/wp/v2/pages/83572?context=edit&_fields=id,slug,status,title,acf,content,modified',{
      credentials:'same-origin',cache:'no-store',headers:{'X-WP-Nonce':nonce,Accept:'application/json'}
    });
    return {http:r.status,data:await r.json().catch(()=>null)};
  },nonce);
  const before=await get(),d=before.data||{},raw=String(d.content?.raw||'');
  if(before.http!==200||d.id!==83572||d.slug!=='kali-phu-my-mo-ta-cac-bien-the'||
     d.status!=='publish'||d.acf?.key!=='pse-historical-kali-1426'||d.acf?.action!=='PublicPage'||
     !raw.includes('pse-historical-kali-1426')||(raw.match(/<img(?:\s|>)/gi)||[]).length!==3||
     (raw.match(/<tr(?:\s|>)/gi)||[]).length!==3)
     throw Error('Page 83572 identity/content shape changed; refuse mutation');
  const npkPage=await page.request.get(wp+'/wp-json/wp/v2/pages?slug=npk-phu-my&_fields=id,slug,status,title,acf',{timeout:30000});
  if(!npkPage.ok())throw Error('NPK Page source unavailable');
  const npkItems=await npkPage.json();
  if(npkItems.length!==1||npkItems[0].status!=='publish'||
     npkItems[0].acf?.key!=='pse-historical-npk-1434')throw Error('NPK target not verified');
  const liveNpk=await page.request.get(newNpk,{timeout:30000});
  if(liveNpk.status()!==200||!(await liveNpk.text()).includes('NPK Phú Mỹ'))
    throw Error('NPK production target missing');
  const count=(s,substring)=>s.split(substring).length-1;
  if(count(raw,oldNpk)!==1||count(raw,oldPlaceholder)!==1||
     count(raw,newNpk)!==0)throw Error('Legacy source links changed or already edited');
  const placeholderPattern=/<li\b[^>]*>\s*<a\b[^>]*href=["']https:\/\/pse\.vn\/hoat-dong-kinh-doanh\/san-pham\/nhom-phan-don-va-phan-phuc-hop-phu-my\/8-trang-chu\/49-noi-dung-dang-cap-nhat\.html["'][^>]*>\s*Nội dung đang cập nhật\s*-\s*<span>19\/05\/2011<\/span>\s*<\/a>\s*<\/li>/gi;
  const matches=[...raw.matchAll(placeholderPattern)];
  if(matches.length!==1)throw Error('Placeholder list node changed; cannot remove safely');
  const updated=raw.replace(oldNpk,newNpk).replace(placeholderPattern,'');
  if(updated===raw||updated.includes(oldNpk)||updated.includes(oldPlaceholder)||
     count(updated,newNpk)!==1||!updated.includes('Nhóm phân đơn và phân phức hợp Phú Mỹ')||
     (updated.match(/<img(?:\s|>)/gi)||[]).length!==3||
     (updated.match(/<tr(?:\s|>)/gi)||[]).length!==3)throw Error('Unexpected generated content');
  const undo={id:83572,slug:d.slug,modified:d.modified,originalRaw:raw,originalRawSha256:sha(raw),cssmore:String(d.acf?.cssmore||''),cssHash:sha(d.acf?.cssmore),plannedHash:sha(updated)};
  await writeFile(dir+'/rollback.json',JSON.stringify(undo,null,2)+'\n');
  console.log('PSE_KALI_LINKS_PREFLIGHT='+JSON.stringify({
    page:83572,sourceSha:sha(raw).slice(0,16),targetSha:sha(updated).slice(0,16),
    oldNpkCount:1,oldPlaceholderCount:1,validNpkId:npkItems[0].id,
    newNpk,placeholderRemoved:true,unchangedImages:3,cssChars:undo.cssmore.length,apply}));
  if(apply){
    const second=await get();
    if(second.http!==200||second.data?.modified!==d.modified||
       sha(second.data?.content?.raw)!==sha(raw)||sha(second.data?.acf?.cssmore)!==undo.cssHash)
      throw Error('Concurrent editor change before save');
    const result=await page.evaluate(async({nonce,updated})=>{
      const r=await fetch('/wp-json/wp/v2/pages/83572',{
        method:'POST',credentials:'same-origin',
        headers:{'X-WP-Nonce':nonce,'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify({content:updated})
      });
      const p=await r.json().catch(()=>null);
      return {http:r.status,id:p?.id,error:p?.code||null};
    },{nonce,updated});
    if(result.http!==200||result.id!==83572)
      throw Error('WordPress content update rejected HTTP '+result.http+' '+result.error);
    const after=await get();
    if(after.http!==200||after.data?.id!==83572||after.data?.content?.raw!==updated||
       after.data?.status!=='publish'||after.data?.slug!==d.slug||
       after.data?.acf?.action!==d.acf.action||after.data?.acf?.key!==d.acf.key||
       sha(after.data?.acf?.cssmore)!==undo.cssHash)
      throw Error('WordPress post-save readback mismatch');
    console.log('PSE_KALI_LINKS_WP_SAVED=PASS page=83572 only_content_changed=true cssmore_preserved=true obsolete_placeholder_removed=true');
  }
  console.log('PSE_KALI_LINKS='+JSON.stringify({status:'PASS',apply,target:newNpk,placeholder:'removed; original Joomla content is placeholder only'}));
}finally{await browser.close();}
