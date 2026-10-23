/** Import the three verified original PSE featured articles as private WP drafts.
 * Never invent an old publication date, publish to production, or build Astro.
 * Each article is identified by its original legacy URL and deterministic slug.
 */
import { chromium } from 'playwright';
const sources=[
 {url:'https://www.pse.vn/21-tin-tuc-su-kien/tin-cong-ty/1736-pvfcco-pse-to-chuc-thanh-cong-giai-pickleball-pse-open-2026.html',slug:'pvfcco-pse-to-chuc-thanh-cong-giai-pickleball-pse-open-2026',title:'PVFCCo-PSE tổ chức thành công Giải Pickleball PSE Open 2026',categoryId:1742,signal:'PSE Open 2026'},
 {url:'https://www.pse.vn/hoat-dong-kinh-doanh/thong-tin-thi-truong/369-diem-tin-nganh-nong-nghiep-tren-cac-bao-ra-ngay-1462013.html',slug:'diem-tin-nganh-nong-nghiep-tren-cac-bao-ra-ngay-1462013',title:'Điểm tin ngành Nông nghiệp trên các báo ra ngày 14/6/2013',categoryId:1743,signal:'14/6/2013'},
 {url:'https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-tai-chinh/1737-20261019-cbtt-bao-cao-tai-chinh-q3-2026.html',slug:'20261019-cbtt-bao-cao-tai-chinh-q3-2026',title:'2026.10.19: CBTT – Báo cáo tài chính Q3/2026',categoryId:1744,signal:'Báo cáo tài chính quý 3 năm 2026'}
];
const readCmsOrigin=()=>{
 const match=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,'')).filter(s=>s.startsWith('WC_URL='));
 if(match.length!==1)throw Error('Missing/duplicate CMS origin');
 const u=new URL(match[0].slice(7).trim().replace(/^['"]|['"]$/g,''));
 if(u.protocol!=='https:'||!u.hostname||u.username||u.password||(u.port&&u.port!=='443')||!['','/'].includes(u.pathname)||u.search||u.hash)
   throw Error('Invalid CMS origin');
 return u.origin;
};
const origin=readCmsOrigin();
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:950}});
await context.route(/\.(png|jpe?g|gif|webp|svg|woff2?|ttf)(\?.*)?$/i,route=>route.abort());
const cms=await context.newPage();
try{
 const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
 if(!username||!password)throw Error('Missing admin credentials');
 await cms.goto(origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await cms.locator('#user_login').count()){
   await cms.locator('#user_login').fill(username);
   await cms.locator('#user_pass').fill(password);
   const body=await cms.locator('body').innerText();
   const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
   if(m){
     const a=Number(m[1]),b=Number(m[3]);
     const result=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];
     const field=cms.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
     if(!await field.count())throw Error('Missing arithmetic input');
     await field.fill(String(result));
   }
   await Promise.all([cms.waitForLoadState('domcontentloaded'),cms.locator('#wp-submit').click()]);
 }
 if(cms.url().includes('wp-login'))throw Error('WordPress Admin login failed');
 const nonce=await cms.evaluate(async()=>{
   if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
   const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});
   if(!r.ok)throw Error('Cannot acquire REST nonce');
   const n=(await r.text()).trim();
   if(!/^[a-zA-Z0-9]{8,24}$/.test(n)||n==='0')throw Error('Invalid REST nonce');
   return n;
 });
 const api=async(path,method='GET',data)=>cms.evaluate(async({path,method,data,nonce})=>{
   const res=await fetch(path,{method,credentials:'same-origin',
     headers:{Accept:'application/json','X-WP-Nonce':nonce,...(data?{'Content-Type':'application/json'}:{})},
     ...(data?{body:JSON.stringify(data)}:{})});
   return {status:res.status,data:await res.json().catch(()=>({}))};
 },{path,method,data,nonce});
 for(const entry of sources){
   const category=await api('/wp-json/wp/v2/categories/'+entry.categoryId+'?_fields=id,slug,name');
   if(category.status!==200||category.data.id!==entry.categoryId)throw Error('Expected PSE WordPress category missing '+entry.categoryId);
   const lookup=await api('/wp-json/wp/v2/posts?slug='+encodeURIComponent(entry.slug)+'&status=any&context=edit&per_page=30&_fields=id,slug,status,title,content,categories,acf');
   if(lookup.status!==200||!Array.isArray(lookup.data))throw Error('Cannot check existing post slug');
   if(lookup.data.length>1)throw Error('Duplicate source slug in WordPress: '+entry.slug);
   if(lookup.data.length===1){
     const existing=lookup.data[0];
     if(existing.status!=='draft'||!existing.categories?.includes(entry.categoryId)||
        String(existing.title?.raw||'')!==entry.title||
        !String(existing.content?.raw||'').includes(entry.signal))
       throw Error('Existing imported slug differs; do not overwrite: '+entry.slug);
     console.log('PSE_SOURCE_DRAFT=ALREADY_VERIFIED; wp_id='+existing.id+'; slug='+entry.slug);
     continue;
   }
   const sourcePage=await context.newPage();
   const response=await sourcePage.goto(entry.url,{waitUntil:'domcontentloaded',timeout:40000});
   if(response?.status()!==200)throw Error('Original source HTTP '+response?.status()+' for '+entry.slug);
   const parsed=await sourcePage.evaluate(()=>{
     const root=document.querySelector('[itemprop="articleBody"]');
     if(!root)throw Error('Missing proven articleBody source selector');
     const title=(document.title||'').replace(/\s+-\s+PSE\.VN$/i,'').trim();
     const copy=root.cloneNode(true);
     copy.querySelectorAll('script,style,iframe,form,button,nav,svg,video,audio,input').forEach(x=>x.remove());
     const safeTags=new Set(['P','DIV','SPAN','BR','B','STRONG','I','EM','UL','OL','LI','H2','H3','H4','TABLE','THEAD','TBODY','TR','TD','TH','A','IMG','BLOCKQUOTE']);
     const nodes=Array.from(copy.querySelectorAll('*'));
     for(const el of nodes.reverse()){
       if(!el.parentNode)continue;
       if(!safeTags.has(el.tagName)){el.replaceWith(...Array.from(el.childNodes));continue}
       for(const att of Array.from(el.attributes)){
         if(!['href','src','alt','title','colspan','rowspan'].includes(att.name))el.removeAttribute(att.name);
       }
       if(el.hasAttribute('href')){
         const u=new URL(el.getAttribute('href')||'',location.href);
         if(!['https:','http:'].includes(u.protocol)){el.removeAttribute('href')}else el.setAttribute('href',u.href);
       }
       if(el.hasAttribute('src')){
         const u=new URL(el.getAttribute('src')||'',location.href);
         if(!['https:','http:'].includes(u.protocol)){el.remove()}else el.setAttribute('src',u.href);
       }
     }
     const html=copy.innerHTML.trim();
     const chars=(copy.textContent||'').replace(/\s+/g,' ').trim().length;
     const originalLinks=Array.from(copy.querySelectorAll('a[href]')).filter(a=>/\.(pdf|docx?|xlsx?)(?:[?#]|$)/i.test(a.href)).length;
     return {title,html,chars,originalLinks,hasHtmlDate:!!document.querySelector('meta[property="article:published_time"],meta[name="date"],time[datetime]')};
   });
   await sourcePage.close();
   if(parsed.title!==entry.title||parsed.chars<140||parsed.chars>120000||
     !parsed.html.includes(entry.signal)||parsed.hasHtmlDate)
     throw Error('Source article not safely understood; no CMS write for '+entry.slug);
   const created=await api('/wp-json/wp/v2/posts','POST',{
     title:entry.title,slug:entry.slug,status:'draft',content:parsed.html,
     categories:[entry.categoryId],acf:{product_lang:'vi'}
   });
   if(created.status!==201||!Number.isSafeInteger(created.data.id)||created.data.slug!==entry.slug||created.data.status!=='draft')
     throw Error('Draft import failed HTTP '+created.status+' for '+entry.slug);
   const check=await api('/wp-json/wp/v2/posts/'+created.data.id+'?context=edit&_fields=id,slug,status,title,content,categories,acf');
   if(check.status!==200||check.data.status!=='draft'||check.data.slug!==entry.slug||
      String(check.data.title?.raw||'')!==entry.title||
      !check.data.categories?.includes(entry.categoryId)||
      !String(check.data.content?.raw||'').includes(entry.signal))
     throw Error('Draft read-after-write failed id='+created.data.id);
   const lang=check.data.acf?.product_lang||'UNVERIFIED';
   console.log('PSE_FEATURED_DRAFT_IMPORT=PASS; wp_id='+created.data.id+
     '; category_id='+entry.categoryId+'; slug='+entry.slug+
     '; source_body_chars='+parsed.chars+'; source_pdf_links='+parsed.originalLinks+
     '; language='+lang+'; publish_date=UNVERIFIED; status=DRAFT');
 }
 console.log('PSE_FEATURED_DRAFT_BATCH=PASS; HOMEPAGE_248_UNCHANGED=true; NOT_PUBLISHED=true; NO_BUILD=true');
}finally{await browser.close()}
