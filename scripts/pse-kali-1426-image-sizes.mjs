/**
 * WordPress Page 83572: tell browser actual CSS slot sizes of 3 Kali product images.
 * No media rewrite, no Astro source change, no arbitrary data changes.
 * Preview intercepts HTML RESPONSE ONLY. Real save affects post_content only.
 */
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
const apply=event.head_commit?.message==='cms(pse): optimize Kali image sizes' &&
  process.env.PSE_KALI_IMAGE_PREVIEW_ONLY!=='true';
const published=process.env.PSE_KALI_IMAGE_VERIFY_PUBLISHED==='true';
if(process.env.GITHUB_REPOSITORY!=='ngocnhanvo/psevn-actions'||
   process.env.GITHUB_REF!=='refs/heads/main')throw Error('Wrong target repository or branch');
if(apply&&process.env.PSE_KALI_IMAGE_FRESH_DB_BACKUP!=='true')
  throw Error('Missing fresh WordPress DB backup');

const sizes='(max-width: 640px) 170px, 190px';
const imgRe=/<img\b[^>]*>/gi;
const isSizes=tag=>/\bsizes\s*=/i.test(tag);
const getOrigin=key=>{
  const items=String(process.env.ENV_FILE||'').split(/\r?\n/)
    .map(x=>x.trim().replace(/^export\s+/,'')).filter(x=>x.startsWith(key+'='));
  if(items.length!==1)throw Error('Missing unique env key '+key);
  const u=new URL(items[0].slice(key.length+1).replace(/^['"]|['"]$/g,''));
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))
    throw Error('Untrusted origin '+key);
  return u.origin;
};
const wp=getOrigin('WC_URL'),front=getOrigin('WC_URL_CLIENT');
if(wp!=='https://admin-pse.webnvn.com'||front!=='https://pse.webnvn.com')
  throw Error('Wrong PSE origin');

const sha=x=>createHash('sha256').update(String(x||'')).digest('hex');
const output='artifacts/pse-kali-1426-image-sizes';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const admin=await browser.newPage({viewport:{width:1240,height:900}});
try{
  if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)
    throw Error('Missing WordPress admin credentials');
  await admin.goto(wp+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
  if(await admin.locator('#user_login').count()){
    await admin.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
    await admin.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
    const text=await admin.locator('body').innerText();
    const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||
      text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if(m){
      const a=+m[1],b=+m[3],answer=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
      const f=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if(!await f.count())throw Error('Unexpected WordPress login challenge');
      await f.fill(String(answer));
    }
    await admin.locator('#wp-submit').click();
  }
  if(admin.url().includes('wp-login'))throw Error('WordPress login failed');
  const nonce=await admin.evaluate(async()=>{
    if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
    const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});
    if(!r.ok)throw Error('Missing REST nonce');
    return (await r.text()).trim();
  });
  if(!/^[0-9a-z]{8,24}$/i.test(nonce))throw Error('Invalid WordPress REST nonce');
  const read=async()=>admin.evaluate(async n=>{
    const r=await fetch('/wp-json/wp/v2/pages/83572?context=edit&_fields=id,slug,status,content,acf,modified',{
      credentials:'same-origin',cache:'no-store',headers:{'X-WP-Nonce':n,Accept:'application/json'}
    });
    return {http:r.status,data:await r.json().catch(()=>null)};
  },nonce);
  const before=await read(),page=before.data||{},raw=String(page.content?.raw||'');
  if(before.http!==200||page.id!==83572||
     page.slug!=='kali-phu-my-mo-ta-cac-bien-the'||
     page.status!=='publish'||page.acf?.action!=='PublicPage'||
     page.acf?.key!=='pse-historical-kali-1426'||
     !raw.includes('pse-historical-kali-1426')||
     (raw.match(/<tr(?:\s|>)/gi)||[]).length!==3)
     throw Error('Page identity or table structure changed, refuse');
  const imgTags=[...raw.matchAll(imgRe)].map(x=>x[0]);
  if(imgTags.length!==3)throw Error('Expected three original images, found '+imgTags.length);
  const already=imgTags.filter(isSizes);
  if(already.length!==0&&
     (already.length!==3||already.some(t=>!t.includes('sizes="'+sizes+'"'))))
    throw Error('Existing image sizes attributes conflict; refuse mutation');
  const newRaw=raw.replace(imgRe,t=>isSizes(t)?t:t.replace(/<img\b/i,'<img sizes="'+sizes+'"'));
  if((newRaw.match(imgRe)||[]).length!==3||
     (newRaw.match(/sizes="\(max-width: 640px\) 170px, 190px"/g)||[]).length!==3||
     (newRaw.match(/<tr(?:\s|>)/gi)||[]).length!==3)
    throw Error('Unexpected candidate markup');
  const stripped=newRaw.replaceAll(' sizes="'+sizes+'"','');
  if(stripped!==raw.replaceAll(' sizes="'+sizes+'"',''))
    throw Error('Non-size text or image URL unexpectedly changed');
  const hash=sha(raw),cssHash=sha(page.acf?.cssmore);
  await writeFile(output+'/rollback.json',JSON.stringify({
    page:83572,modified:page.modified,sourceSha256:hash,
    previousContent:raw,previousCssSha256:cssHash,newSha256:sha(newRaw)
  },null,2)+'\n');
  console.log('PSE_KALI_IMAGE_SOURCE='+JSON.stringify({
    page:83572,images:3,existingSizes:already.length,candidateSizes:sizes,
    contentSha:hash.slice(0,18),newSha:sha(newRaw).slice(0,18),
    cssmoreChars:String(page.acf?.cssmore||'').length,apply,published}));

  const url=front+'/kali-phu-my-mo-ta-cac-bien-the';
  const cases=[{width:1240,dpr:1},{width:1240,dpr:2},
    {width:390,dpr:2},{width:390,dpr:3}];
  const all=[];
  for(const cfg of cases){
    const ctx=await browser.newContext({viewport:{width:cfg.width,height:900},
      deviceScaleFactor:cfg.dpr});
    const publicPage=await ctx.newPage();
    try{
      if(!published){
        await publicPage.route(url+'*',async route=>{
          const response=await route.fetch();
          const html=await response.text();
          const anchor='<div class="pse-historical-kali-1426"';
          const index=html.indexOf(anchor);
          if(index<0)throw Error('Unable to locate historical table in Astro page HTML');
          const last=html.indexOf('</table>',index);
          if(last<0)throw Error('Missing Kali table in rendered Astro markup');
          const end=last+'</table>'.length;
          const beforeTable=html.slice(index,end);
          const tags=[...beforeTable.matchAll(imgRe)];
          if(tags.length!==3)throw Error('Expected 3 rendered images, found '+tags.length);
          const afterTable=beforeTable.replace(imgRe,t=>isSizes(t)?
            t.replace(/\bsizes\s*=\s*(?:"[^"]*"|'[^']*')/i,'sizes="'+sizes+'"'):
            t.replace(/<img\b/i,'<img sizes="'+sizes+'"'));
          await route.fulfill({response,body:html.slice(0,index)+afterTable+html.slice(end)});
        });
      }
      const loaded=[];
      publicPage.on('response',r=>{
        if(r.request().resourceType()==='image'&&r.url().includes('/api/images/'))
          loaded.push({url:r.url(),status:r.status(),
            bytes:Number(r.headers()['content-length']||0)});
      });
      const response=await publicPage.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
      if(response?.status()!==200)throw Error('Public Page returned '+response?.status());
      await publicPage.locator('.pse-historical-kali-1426 img').evaluateAll(imgs=>
        imgs.forEach(img=>{img.loading='eager';}));
      await publicPage.waitForFunction(()=>{
        const imgs=[...document.querySelectorAll('.pse-historical-kali-1426 img')];
        return imgs.length===3&&imgs.every(img=>img.complete&&img.naturalWidth>0);
      },null,{timeout:45000});
      const data=await publicPage.evaluate(()=>{
        const imgs=[...document.querySelectorAll('.pse-historical-kali-1426 img')];
        return imgs.map(el=>{
          const rect=el.getBoundingClientRect();
          const m=el.currentSrc.match(/\/api\/images\/(\d+)\//);
          return {renderedWidth:Math.round(rect.width),renderedHeight:Math.round(rect.height),
            sizes:el.getAttribute('sizes'),selectedWidth:m?Number(m[1]):null,
            naturalWidth:el.naturalWidth,currentSrc:el.currentSrc};
        });
      });
      const max=(cfg.width<=640?640:640);
      if(data.length!==3||data.some(x=>x.sizes!==sizes||x.selectedWidth===null||
           x.selectedWidth>max||x.selectedWidth<Math.round(x.renderedWidth*cfg.dpr*0.85)))
        throw Error('Image candidate not responsive on '+JSON.stringify(cfg)+' '+JSON.stringify(data));
      const result={...cfg,images:data,imagesLoaded:loaded};
      all.push(result);
      console.log('PSE_KALI_IMAGE_RESPONSIVE='+JSON.stringify(result).slice(0,5000));
    }finally{await ctx.close();}
  }
  if(!published&&all.some(x=>x.images.some(im=>im.selectedWidth===2560)))
    throw Error('Preview still selects oversized 2560px image');
  if(apply&&newRaw!==raw){
    const latest=await read();
    if(latest.http!==200||latest.data?.modified!==page.modified||
       sha(latest.data?.content?.raw)!==hash||
       sha(latest.data?.acf?.cssmore)!==cssHash)
      throw Error('WordPress content changed during preflight');
    const saved=await admin.evaluate(async({nonce,content})=>{
      const r=await fetch('/wp-json/wp/v2/pages/83572',{
        method:'POST',credentials:'same-origin',
        headers:{'X-WP-Nonce':nonce,'Content-Type':'application/json'},
        body:JSON.stringify({content})});
      const j=await r.json().catch(()=>null);
      return {http:r.status,id:j?.id,code:j?.code||null};
    },{nonce,content:newRaw});
    if(saved.http!==200||saved.id!==83572)
      throw Error('WordPress rejected sizes edit '+JSON.stringify(saved));
  }
  if(apply){
    const after=await read();
    if(after.http!==200||after.data?.id!==83572||
      after.data?.content?.raw!==newRaw||
      sha(after.data?.acf?.cssmore)!==cssHash||
      after.data?.acf?.action!==page.acf.action||
      after.data?.acf?.key!==page.acf.key||
      after.data?.slug!==page.slug||after.data?.status!==page.status)
      throw Error('WordPress save/readback mismatch');
    console.log('PSE_KALI_IMAGE_SAVED=PASS page=83572 only_image_sizes_attrs_changed=true cssmore_unchanged=true');
  }
  console.log('PSE_KALI_IMAGE_RESULT=PASS preview='+(!apply)+' published='+published+' candidateMax=640');
}finally{await browser.close();}
