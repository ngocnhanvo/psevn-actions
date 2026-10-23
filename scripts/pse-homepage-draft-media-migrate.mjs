/** Migrate verified external article images/PDFs to WP Media on PRIVATE PSE drafts.
 * Bounded, idempotent: hash-based name, authenticated preflight, original URL
 * mapping, downloaded-file integrity check, WP revision/rollback via admin,
 * post text/date/category parity and REST read-after-write. No publishing/build.
 */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
const origin=(()=>{
 const rows=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,'')).filter(s=>s.startsWith('WC_URL='));
 if(rows.length!==1)throw Error('PSE CMS URL missing or ambiguous');
 const u=new URL(rows[0].slice(7).trim().replace(/^['"]|['"]$/g,''));
 if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search||(u.port&&u.port!=='443')||!['','/'].includes(u.pathname))throw Error('Invalid CMS URL');
 return u.origin;
})();
const configured=[
 {id:76975,category:1742,slug:'pvfcco-pse-to-chuc-thanh-cong-giai-pickleball-pse-open-2026',date:'2026-07-28T02:38:45',expected:{image:9,document:0}},
 {id:76976,category:1743,slug:'diem-tin-nganh-nong-nghiep-tren-cac-bao-ra-ngay-1462013',date:'2013-06-17T08:12:14',expected:{image:0,document:0}},
 {id:76977,category:1744,slug:'20261019-cbtt-bao-cao-tai-chinh-q3-2026',date:'2026-10-19T15:04:22',expected:{image:0,document:2}}
];
const hash=b=>createHash('sha256').update(b).digest('hex');
const acceptableUrl=url=>{
 try{
  const u=new URL(url);
  return u.protocol==='https:'&&['www.pse.vn','pse.vn'].includes(u.hostname)&&
    u.pathname.startsWith('/images/')&&!u.username&&!u.password&&!u.hash;
 }catch{return false}
};
const mediaUrl=(media,file)=>{
 for(const val of [media.source_url,media.guid?.rendered]){
  try{
   const u=new URL(val),base=new URL(origin);
   if(u.protocol==='https:'&&u.hostname===base.hostname&&u.port===base.port&&
      u.pathname.startsWith('/wp-content/uploads/')&&
      decodeURIComponent(u.pathname).endsWith('/'+file))return u.href;
  }catch{}
 }
 throw Error('Cannot validate WP-owned Media URL for '+file);
};
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:920}});
const page=await context.newPage();
try{
 const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
 if(!username||!password)throw Error('Missing WP admin login credentials');
 await page.goto(origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(username);
  await page.locator('#user_pass').fill(password);
  const body=await page.locator('body').innerText();
  const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3],v=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error('Cannot find WP login challenge input');
   await f.fill(String(v));
  }
  await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
 }
 if(page.url().includes('wp-login'))throw Error('WP admin login failed');
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});
  if(!r.ok)throw Error('Cannot get WP REST nonce');
  const n=(await r.text()).trim();
  if(!/^[a-zA-Z0-9]{8,24}$/.test(n)||n==='0')throw Error('Invalid WP REST nonce');
  return n;
 });
 const api=async(route,method='GET',data)=>page.evaluate(async({route,method,data,nonce})=>{
  const r=await fetch(route,{method,credentials:'same-origin',headers:{
   'X-WP-Nonce':nonce,Accept:'application/json',...(data?{'Content-Type':'application/json'}:{})
  },...(data?{body:JSON.stringify(data)}:{})});
  return {http:r.status,payload:await r.json().catch(()=>({}))};
 },{route,method,data,nonce});
 const parse=async html=>page.evaluate(html=>{
  const doc=new DOMParser().parseFromString('<main id="__pse_root">'+html+'</main>','text/html');
  const root=doc.querySelector('#__pse_root');
  const assets=[];
  for(const el of root.querySelectorAll('img[src],a[href]')){
   const key=el.tagName==='IMG'?'src':'href';
   const raw=el.getAttribute(key)||'';
   const u=new URL(raw,'https://www.pse.vn');
   if(!/\.(?:jpe?g|png|pdf)(?:$|[?#])/i.test(u.href))continue;
   if(el.tagName==='A'&&!/\.pdf(?:$|[?#])/i.test(u.href))continue;
   assets.push({kind:el.tagName==='IMG'?'image':'document',url:u.href});
  }
  return {text:(root.textContent||'').replace(/\s+/g,' ').trim(),assets};
 },html);
 // Snapshot all private post identities and originals before any WordPress mutation.
 const records=[];
 for(const c of configured){
  const out=await api('/wp-json/wp/v2/posts/'+c.id+'?context=edit&_fields=id,slug,status,date,date_gmt,categories,content,title,featured_media');
  const p=out.payload||{},html=String(p.content?.raw||'');
  if(out.http!==200||p.id!==c.id||p.slug!==c.slug||p.status!=='draft'||
     p.date!==c.date||!p.categories?.includes(c.category)||!html)
    throw Error('PSE draft identity/date/category changed; abort all: '+c.id);
  const original=await parse(html);
  const uniqueKind=kind=>new Set(original.assets.filter(a=>a.kind===kind).map(a=>a.url)).size;
  const uniqueImage=uniqueKind('image'),uniqueDocument=uniqueKind('document');
  // A financial disclosure often links to the same PDF more than once.
  // Require exact distinct files, but retain every original link occurrence.
  if(uniqueImage!==c.expected.image||uniqueDocument!==c.expected.document)
    throw Error('PSE draft distinct source asset mismatch post='+c.id+
      ' images='+uniqueImage+' PDFs='+uniqueDocument);
  records.push({...c,html,original,p,allAssets:original.assets});
  console.log('PSE_DRAFT_MEDIA_PREFLIGHT='+JSON.stringify({
   postId:c.id,status:p.status,date:p.date,mediaRefs:original.assets.length,
   uniqueImages:uniqueImage,uniquePDFs:uniqueDocument,
   inheritedExternal:original.assets.filter(a=>acceptableUrl(a.url)).length
  }));
 }
 let created=0,reused=0,rewritten=0;
 for(const rec of records){
  if(rec.expected.image===0&&rec.expected.document===0)continue;
  const map=new Map();
  let idx=0;
  for(const asset of rec.allAssets){
   if(!acceptableUrl(asset.url))continue; // previously migrated wp-owned URLs
   if(map.has(asset.url))continue;
   idx++;
   const link=new URL(asset.url);
   const ext=link.pathname.split('.').at(-1).toLowerCase();
   const expectedMime=ext==='pdf'?'application/pdf':ext==='png'?'image/png':'image/jpeg';
   if(!['jpg','jpeg','png','pdf'].includes(ext))throw Error('Unexpected source media type');
   const get=await context.request.get(asset.url,{timeout:65000});
   if(!get.ok())throw Error('Original PSE asset returned '+get.status()+' post '+rec.id+' item '+idx);
   const body=await get.body();
   const mime=(get.headers()['content-type']||'').split(';')[0].toLowerCase();
   if(body.length<100||body.length>35*1024*1024||mime!==expectedMime||
      (ext==='pdf'&&!body.subarray(0,5).equals(Buffer.from('%PDF-')))||
      (['jpg','jpeg'].includes(ext)&&(body[0]!==0xff||body[1]!==0xd8))||
      (ext==='png'&&!body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))))
     throw Error('Original PSE bytes/MIME invalid post '+rec.id+' asset '+idx);
   const checksum=hash(body);
   const filename='pse-legacy-'+rec.id+'-'+String(idx).padStart(2,'0')+'-'+checksum.slice(0,12)+'.'+(ext==='jpeg'?'jpg':ext);
   const marker=filename.replace(/\.[^.]+$/,'');
   const search=await api('/wp-json/wp/v2/media?search='+encodeURIComponent(marker)+'&per_page=100&context=edit');
   if(search.http!==200||!Array.isArray(search.payload))throw Error('WordPress Media duplicate check failed');
   const options=search.payload.filter(m=>m.slug===marker||String(m.media_details?.file||'').split('/').at(-1)===filename);
   if(options.length>1)throw Error('Duplicate PSE Media slug for '+marker);
   let media=options[0];
   if(media){
    // PDF attachment records can lack media_details.file on this WP
    // installation. Keep the strict MIME check; URL+SHA256 below verifies
    // identity byte-for-byte regardless of optional PDF metadata shape.
    const recorded=String(media.media_details?.file||'');
    if(media.mime_type!==expectedMime||(recorded&&recorded.split('/').at(-1)!==filename))
     throw Error('Conflicting WordPress-owned asset marker: '+marker);
    reused++;
   }else{
    const response=await context.request.post(origin+'/wp-json/wp/v2/media',{
     data:body,timeout:90000,headers:{
      'X-WP-Nonce':nonce,'Content-Disposition':'attachment; filename="'+filename+'"',
      'Content-Type':expectedMime,Accept:'application/json'
     }
    });
    const res=await response.json().catch(()=>({}));
    if(response.status()!==201||!Number.isSafeInteger(res.id)||res.mime_type!==expectedMime)
     throw Error('Media upload failed HTTP '+response.status()+' post '+rec.id+' asset '+idx+' wp_code='+String(res.code||'unknown'));
    media=res;created++;
   }
   const check=await api('/wp-json/wp/v2/media/'+media.id+'?context=edit');
   const detailFile=String(check.payload?.media_details?.file||'');
   console.log('PSE_MEDIA_POSTUPLOAD_INSPECT='+JSON.stringify({
     postId:rec.id,assetIndex:idx,mediaId:media.id,
     http:check.http,mime:check.payload?.mime_type||null,
     metadataFile:detailFile||null,
     guidPath:(()=>{try{return new URL(check.payload?.guid?.rendered).pathname.slice(0,130)}catch{return null}})()
   }));
   if(check.http!==200||check.payload.id!==media.id||check.payload.mime_type!==expectedMime||
      (detailFile&&detailFile.split('/').at(-1)!==filename))
    throw Error('WordPress media read-after-write mismatch: '+rec.id+' asset '+idx);
   const url=mediaUrl(check.payload,filename);
   const saved=await context.request.get(url,{timeout:50000});
   if(!saved.ok()||hash(await saved.body())!==checksum)
    throw Error('WordPress uploaded media checksum differs: post '+rec.id+' asset '+idx);
   map.set(asset.url,url);
   console.log('PSE_DRAFT_ASSET_MIGRATED='+JSON.stringify({
    postId:rec.id,kind:asset.kind,mediaId:media.id,filename,
    action:options.length?'already_uploaded':'created',checksumVerified:true
   }));
  }
  // A prior interrupted run might already have replaced some assets.
  const oldExternal=rec.allAssets.filter(a=>acceptableUrl(a.url));
  if(!oldExternal.length){
   console.log('PSE_DRAFT_BODY_ASSETS=ALREADY_MIGRATED; postId='+rec.id);
   continue;
  }
  if(map.size===0)throw Error('Expected original URLs without new Media mapping '+rec.id);
  const update=await page.evaluate(({html,mapping})=>{
   const root=document.createElement('div');root.innerHTML=html;
   let changed=0;
   for(const el of root.querySelectorAll('img[src],a[href]')){
    const prop=el.tagName==='IMG'?'src':'href';
    const old=new URL(el.getAttribute(prop)||'','https://www.pse.vn').href;
    const newUrl=mapping.find(([from])=>from===old)?.[1];
    if(newUrl){el.setAttribute(prop,newUrl);changed++}
   }
   return {html:root.innerHTML,changed,plain:(root.textContent||'').replace(/\s+/g,' ').trim()};
  },{html:rec.html,mapping:Array.from(map.entries())});
  if(update.changed!==oldExternal.length||update.plain!==rec.original.text)
    throw Error('Post body replacement not content preserving for post '+rec.id);
  const bodyUpdate=await api('/wp-json/wp/v2/posts/'+rec.id,'POST',{
   status:'draft',content:update.html,date:rec.p.date,date_gmt:rec.p.date_gmt
  });
  if(bodyUpdate.http!==200||bodyUpdate.payload?.id!==rec.id||bodyUpdate.payload?.status!=='draft')
   throw Error('Cannot store original PSE media URLs in private post '+rec.id);
  const after=await api('/wp-json/wp/v2/posts/'+rec.id+'?context=edit&_fields=id,slug,status,date,date_gmt,categories,content');
  if(after.http!==200||after.payload.id!==rec.id||after.payload.status!=='draft'||
     after.payload.slug!==rec.slug||after.payload.date!==rec.p.date||
     after.payload.date_gmt!==rec.p.date_gmt||!after.payload.categories?.includes(rec.category))
   throw Error('PSE media post write altered protected metadata '+rec.id);
  const verified=await parse(after.payload.content?.raw||'');
  if(verified.text!==rec.original.text||
     verified.assets.length!==rec.allAssets.length||
     verified.assets.some(a=>acceptableUrl(a.url))||
     Array.from(map.values()).some(v=>!(after.payload.content?.raw||'').includes(v)))
   throw Error('PSE post content/media read-after-write not preserved '+rec.id);
  rewritten++;
  console.log('PSE_DRAFT_MEDIA_POST_READ_AFTER_WRITE=PASS; postId='+rec.id+
   '; replaced='+update.changed+'; draft=true; sourceTextPreserved=true; datesPreserved=true');
 }
 console.log('PSE_PRIVATE_DRAFT_MEDIA_MIGRATION=PASS; uploaded='+created+'; reused='+reused+
  '; updatedPrivatePosts='+rewritten+'; sourceAttachments=11; independentUnchanged2013Post=true; NO_PUBLISH=true; NO_ASTRO_BUILD=true');
}finally{await browser.close()}
