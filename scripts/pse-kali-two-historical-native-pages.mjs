/** Restore two exact original descriptive Joomla pages; no Woo Product, category or redirect writes. */
import {chromium,request} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const ev=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
if(process.env.GITHUB_REPOSITORY!=='ngocnhanvo/psevn-actions'||process.env.GITHUB_REF!=='refs/heads/main'||ev.head_commit?.message!=='cms(pse): restore two original Kali historical native pages'||process.env.PSE_KALI_FRESH_BACKUP!=='yes')throw Error('Unauthorized write scope');
const wp='https://admin-pse.webnvn.com',front='https://pse.webnvn.com',src='https://pse.vn',sha=x=>createHash('sha256').update(x).digest('hex'),norm=x=>String(x||'').normalize('NFKC').replace(/\s+/g,' ').trim();
for(const [k,v] of [['WC_URL',wp],['WC_URL_CLIENT',front]]){const a=String(process.env.ENV_FILE||'').split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,'')).filter(x=>x.startsWith(k+'='));if(a.length!==1||new URL(a[0].slice(k.length+1).replace(/^['"]|['"]$/g,'')).origin!==v)throw Error('Origin mismatch '+k)}
const specs=[
 {id:1425,slug:'kali-phu-my-bot-canada-mo-ta-va-hdsd',title:'Kali Phú Mỹ Bột CANADA- Mô tả và HDSD',body:'44fabc77e383deceab4cff0d6e10c831733e86af119671049ba67cf0b150bbf7',images:['3ad2953c0d8f52ccabad86436d40d9dcda808a458e397a94bc577921a99d4b66']},
 {id:1426,slug:'kali-phu-my-mo-ta-cac-bien-the',title:'Kali Phú Mỹ',body:'13b5f4bc0b124df9820b9060b11efed972b243044948b968fe1342a94458e268',images:['3ad2953c0d8f52ccabad86436d40d9dcda808a458e397a94bc577921a99d4b66','f0196b517182e82082defe27c23faf0e9660ad807003ae7efe03dc7e21e6b63f','00337427a0fc36f9b8df812571121e5aaf454fe6efc5504b8b480f51db4fef74']}
];
const manifest=JSON.parse(await readFile('inputs/kali-two/report.json','utf8'));
const data=new Map(),files=new Map();
for(const s of specs){
 const r=manifest.rows.find(x=>x.id===s.id),d=JSON.parse(await readFile('inputs/kali-two/source-'+s.id+'.json','utf8'));
 if(!manifest.readOnly||!manifest.noCmsWrites||!r?.ready||!r.archivedBodyMatch||!r.titleMatch||r.slug!==s.slug||r.title!==s.title||r.fullBodySha!==s.body||sha(d.full)!==s.body||d.title!==s.title||JSON.stringify(r.images.map(x=>x.sha256))!==JSON.stringify(s.images)||!r.source.startsWith(src+'/hoat-dong-kinh-doanh/san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my/8-trang-chu/'+s.id+'-')||r.route?.publicHTTP!==404)throw Error('Pinned source evidence mismatch '+s.id);
 for(const i of r.images){if(i.fileArtifact!=='original-'+i.sha256.slice(0,16)+'.png')throw Error('Artifact file mismatch');const buf=await readFile('inputs/kali-two/'+i.fileArtifact);if(sha(buf)!==i.sha256||buf.length!==i.bytes||buf.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Pinned PNG mismatch');files.set(i.sha256,{...i,buf})}
 data.set(s.id,{r,d});
}
const out='artifacts/pse-kali-two-historical-native-pages';await mkdir(out,{recursive:true});
const report={pass:false,writes:[],pages:[],media:[],noProductWrites:true,noCategoryWrites:true,noRedirectWrites:true};
const save=()=>writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');
const b=await chromium.launch({headless:true}),net=await request.newContext({timeout:45000}),parserCtx=await b.newContext({javaScriptEnabled:false}),ctx=await b.newContext();
await parserCtx.route('**/*',r=>r.abort());const parser=await parserCtx.newPage(),admin=await ctx.newPage();
try{
 await admin.goto(wp+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await admin.locator('#user_login').count()){
  if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error('Missing WP credentials');
  await admin.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);await admin.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
  const m=(await admin.locator('#loginform').innerText()).match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i);
  if(m){const a=+m[1],b=+m[3],v=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[m[2]];const f=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();if(!await f.count())throw Error('Unknown login challenge');await f.fill(String(v))}
  await admin.locator('#wp-submit').click();
 }
 await admin.goto(wp+'/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
 if(admin.url().includes('wp-login')||!await admin.locator('#adminmenu').count())throw Error('No WP session');
 const nonce=await admin.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'});if(!r.ok)throw Error('REST nonce unavailable');return(await r.text()).trim()});
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error('Bad REST nonce');
 const api=async(path,method='GET',body)=>{const r=await ctx.request.fetch(wp+'/wp-json/wp/v2/'+path,{method,headers:{'X-WP-Nonce':nonce,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{data:body}:{})});return {http:r.status(),pages:Number(r.headers()['x-wp-totalpages']||1),data:await r.json().catch(()=>null)}};
 const existing=new Map();
 for(const s of specs){
  const q='?context=edit&status=publish,draft,pending,private,future&slug='+s.slug+'&_fields=id,slug,status,title,acf,content,featured_media';
  const [pa,po,pr]=await Promise.all(['pages','posts','product'].map(t=>api(t+q)));
  if([pa,po,pr].some(x=>x.http!==200||!Array.isArray(x.data))||po.data.length||pr.data.length||pa.data.length>1)throw Error('Native slug collision '+s.id);
  const p=pa.data[0];if(p&&(p.acf?.action!=='PublicPage'||p.acf?.key!=='pse-historical-kali-'+s.id||!['draft','publish'].includes(p.status)))throw Error('Unowned existing Page '+s.id);
  existing.set(s.id,p);
 }
 // Existing redirect mappings are read-only evidence; don't invent destinations.
 const registry=[];
 for(let i=1;i<=40;i++){const r=await api('chuyen-huong-link?context=edit&status=publish&per_page=100&page='+i+'&orderby=id&order=asc&_fields=id,status,acf');if(r.http!==200||!Array.isArray(r.data)||r.pages<1||r.pages>40)throw Error('Redirect registry incomplete');registry.push(...r.data);if(i===r.pages)break}
 const rootLinks=new Map(),known=new Map(specs.map(s=>[new URL(data.get(s.id).r.source).pathname,'/'+s.slug]));
 known.set('/hoat-dong-kinh-doanh/san-pham/dam-phu-my/8-trang-chu/1678-kali-phu-my-mo-ta-va-hdsd.html','/kali-phu-my-mo-ta-va-hdsd');
 // The five alternate context paths were independently source-proven in
 // #44992472748. Require the exact pinned report AND the already-deployed
 // canonical source-context 301, not a slug guess.
 const aliases=JSON.parse(await readFile('inputs/link-proof/report.json','utf8'));
 const destinations=new Map([[1668,'/san-pham/dam-phu-my-chuyen-dung-cho-drone-1668'],[1669,'/san-pham/dam-phu-my-chuyen-dung-cho-nong-lam-truong-1669'],[1676,'/san-pham/sa-phu-my-1682'],[1677,'/san-pham/dap-phu-my-1677'],[1678,'/kali-phu-my-mo-ta-va-hdsd']]);
 if(!aliases.readOnly||aliases.aliasProof.length!==5||new Set(aliases.aliasProof.map(a=>a.id)).size!==5)throw Error('Pinned alias proof incomplete');
 for(const a of aliases.aliasProof){
  if(!destinations.has(a.id)||!a.equal||a.left?.http!==200||a.right?.http!==200||a.left.hash!==a.right.hash||a.left.structure!==a.right.structure||a.left.title!==a.right.title||!a.from.startsWith('/hoat-dong-kinh-doanh/san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my/8-trang-chu/'+a.id+'-')||a.from.replace('/nhom-phan-don-va-phan-phuc-hop-phu-my/','/dam-phu-my/')!==a.context)throw Error('Alias proof mismatch '+a.id);
  const rr=await net.get(front+a.context,{maxRedirects:0,failOnStatusCode:false});
  if(rr.status()!==301||!rr.headers().location||new URL(rr.headers().location,front).href!==front+destinations.get(a.id))throw Error('Production proven context changed '+a.id);
  known.set(a.from,destinations.get(a.id));
 }
 const state=JSON.parse(await readFile('docs/pse-legacy-migration-state.json','utf8'));
 const getCore=async(url)=>{
  const u=new URL(url);if(!['pse.vn','www.pse.vn'].includes(u.hostname)||u.protocol!=='https:'||u.username||u.password)throw Error('Untrusted Joomla GET');
  const res=await net.get(src+u.pathname+u.search,{maxRedirects:0,failOnStatusCode:false});
  if(res.status()!==200)throw Error('Original link HTTP '+res.status()+' '+u.pathname+u.search);
  await parser.setContent('<base href="'+src+u.pathname+u.search+'">'+(await res.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{waitUntil:'domcontentloaded'});
  return parser.evaluate(()=>{const n=x=>String(x||'').normalize('NFKC').replace(/\s+/g,' ').trim(),root=document.querySelector('.item-page [itemprop=articleBody]');if(!root)throw Error('No original core article');const c=root.cloneNode(true);c.querySelectorAll('.extranews_box,.extranews_separator').forEach(x=>x.remove());return {title:n(document.querySelector('.item-page h1,.item-page h2,h1')?.textContent),body:n(c.textContent),images:[...c.querySelectorAll('img[src]')].map(e=>new URL(e.getAttribute('src'),document.baseURI).pathname),tables:[...c.querySelectorAll('table')].map(t=>[...t.rows].map(r=>[...r.cells].map(x=>n(x.textContent))))}});
 };
 const queryLink=async u=>{
  if(u.pathname!=='/hoat-dong-kinh-doanh/san-pham/kali-phu-my.html'||!['?id=1425','?id=1427','?id=1430'].includes(u.search)||u.hash)throw Error('Unapproved original query '+u.pathname+u.search);
  const id=Number(u.searchParams.get('id')),actual=await getCore(src+u.pathname+u.search);
  let target=src+u.pathname+u.search,kind='preserved-original-query';
  if(id===1425){
   const row=data.get(id).r;
   if(actual.title!==row.title||sha(actual.body)!==row.bodySha||JSON.stringify(actual.images)!==JSON.stringify(row.images.map(i=>new URL(i.url).pathname)))throw Error('Query 1425 does not match pinned original');
   target=front+'/'+row.slug;kind='verified-native-query';
  }else{
   // Match the precise manifest article and an existing exact native redirect
   // only when the source variants really represent the same content.
   const historical=state.articles?.[id]?.source_url;
   if(historical){
    const h=new URL(historical);
    if(['pse.vn','www.pse.vn'].includes(h.hostname)&&!h.search&&!h.hash&&h.pathname.includes('/'+id+'-')){
     const prior=registry.filter(x=>x.acf?.from_link===h.pathname&&x.acf?.match_type==='Exact'&&String(x.acf?.type)==='301'&&x.acf?.enable===true);
     if(prior.length>1)throw Error('Conflicting exact product alias '+id);
     if(prior.length===1){
      const original=await getCore(src+h.pathname);
      if(actual.title===original.title&&actual.body===original.body&&JSON.stringify(actual.images)===JSON.stringify(original.images)&&JSON.stringify(actual.tables)===JSON.stringify(original.tables)){
       const t=new URL(prior[0].acf.to_link,front);if(t.origin!==front||t.search||t.hash)throw Error('Unsafe native query destination');
       const rr=await net.get(front+h.pathname,{maxRedirects:0,failOnStatusCode:false}),live=await net.get(t.href,{maxRedirects:0,failOnStatusCode:false});
       if(rr.status()===301&&rr.headers().location&&new URL(rr.headers().location,front).href===t.href&&live.status()===200){target=t.href;kind='verified-native-query'}
      }
     }
    }
   }
  }
  console.log('PSE_KALI_QUERY_PROOF='+JSON.stringify({id,title:actual.title,bodySha:sha(actual.body),images:actual.images,target,kind}));
  return {target,kind};
 };
 for(const s of specs){
  const {r,d}=data.get(s.id),links=[],seen=new Set();
  for(const l of d.links){
   if(seen.has(l.href))continue;seen.add(l.href);
   const u=new URL(l.url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('Untrusted source link');
   let target=u.href,kind='original-external';
   if(['pse.vn','www.pse.vn'].includes(u.hostname)){
    if(u.search){({target,kind}=await queryLink(u));links.push({from:l.href,to:target,kind});continue}
    const matches=registry.filter(x=>x.acf?.from_link===u.pathname&&x.acf?.match_type==='Exact'&&String(x.acf?.type)==='301'&&x.acf?.enable===true);
    if(matches.length>1)throw Error('Conflicting mapped source link');
    const mapped=known.get(u.pathname)||matches[0]?.acf?.to_link;
    if(mapped){const t=new URL(mapped,front);if(t.origin!==front||t.search||t.hash)throw Error('Unsafe target');target=t.href+u.hash;kind='verified-native';if(!specs.some(a=>'/'+a.slug===t.pathname)){const resp=await net.get(t.href,{maxRedirects:0,failOnStatusCode:false});if(resp.status()!==200)throw Error('Mapped native link not live '+t.pathname)}}
    else {target=src+u.pathname+u.hash;kind='preserved-original-source';const resp=await net.get(src+u.pathname,{maxRedirects:2,failOnStatusCode:false});if(resp.status()!==200)throw Error('Unmapped source link not available '+u.pathname)}
   }
   links.push({from:l.href,to:target,kind});
  }
  rootLinks.set(s.id,links);console.log('PSE_KALI_TWO_LINK_PLAN='+JSON.stringify({id:s.id,links}));
  // Test safe HTML transformation before all writes, preserving nested cells and text.
  const cleaned=await parser.evaluate(({html,links,source})=>{
   const root=document.createElement('div');root.innerHTML=html;const mapping=new Map(links.map(l=>[l.from,l.to])),imgs=[];
   root.querySelectorAll('script,style,iframe,object,embed,form,input,button,link,meta,base,svg,video,audio').forEach(e=>e.remove());
   const allowed=new Set(['colspan','rowspan','scope','headers','alt','title','dir','lang']);
   for(const el of root.querySelectorAll('*')){
    const href=el.getAttribute('href'),image=el.getAttribute('src'),tag=el.tagName.toLowerCase();for(const a of [...el.attributes])if(!allowed.has(a.name))el.removeAttribute(a.name);
    if(tag==='a'&&href){if(!mapping.has(href))throw Error('Unknown link');el.setAttribute('href',mapping.get(href))}
    if(tag==='img'){const u=new URL(image,source);imgs.push(decodeURIComponent(u.pathname.split('/').at(-1)));el.setAttribute('src','__PSE_IMAGE_'+(imgs.length-1)+'__');el.setAttribute('loading','lazy')}
   }
   const n=s=>String(s||'').normalize('NFKC').replace(/\s+/g,' ').trim();
   return {html:root.innerHTML,text:n(root.textContent),tables:[...root.querySelectorAll('table')].map(t=>[...t.rows].map(r=>[...r.cells].map(c=>n(c.textContent)))),imgs};
  },{html:d.html,links,source:r.source});
  if(sha(cleaned.text)!==s.body||JSON.stringify(cleaned.tables)!==JSON.stringify(d.tables)||JSON.stringify(cleaned.imgs)!==JSON.stringify(r.images.map(i=>i.file)))throw Error('Safe HTML differs from original '+s.id);
  data.get(s.id).clean=cleaned;
 }
 const media=new Map();
 async function exactMedia(m,hash){
  if(!m||m.mime_type!=='image/png'||!Number.isSafeInteger(m.id))return null;
  const list=[m.source_url,m.guid?.rendered],mf=String(m.media_details?.file||''),orig=m.media_details?.original_image;
  if(mf&&mf.split('/').every(x=>x&&x!=='.'&&x!=='..')&&!mf.includes('\\')){list.push('/wp-content/uploads/'+mf);if(orig&&!orig.includes('/')&&!orig.includes('\\')&&!['.','..'].includes(orig))list.push('/wp-content/uploads/'+mf.split('/').slice(0,-1).join('/')+'/'+orig)}
  for(const raw of [...new Set(list.filter(Boolean))]){const u=new URL(raw,wp+'/');if(u.origin!==wp||!u.pathname.startsWith('/wp-content/uploads/')||u.search||u.hash||u.username||u.password)continue;const r=await net.get(u.href,{maxRedirects:0,failOnStatusCode:false});if(r.status()===200&&sha(await r.body())===hash)return {id:m.id,url:u.href,sha256:hash}}
  return null;
 }
 // Reuse only actual byte-identical native Product Media, without editing it.
 const candidates=[];
 for(const id of [80954,80952,80938,82837]){const p=await api('product/'+id+'?_fields=id,status,featured_media');if(p.http===200&&p.data?.status==='publish'&&p.data.featured_media&&!candidates.includes(p.data.featured_media))candidates.push(p.data.featured_media)}
 const candidateMedia=[];for(const id of candidates){const r=await api('media/'+id+'?context=edit');if(r.http===200)candidateMedia.push(r.data)}
 for(const [hash,info] of files){
  let match=null;
  for(const m of candidateMedia){match=await exactMedia(m,hash);if(match)break}
  const filename='pse-kali-source-'+hash.slice(0,12)+'.png',marker=filename.slice(0,-4);
  if(!match){
   const r=await api('media?context=edit&per_page=100&search='+marker);
   if(r.http!==200||!Array.isArray(r.data))throw Error('Media inventory unavailable');
   const own=r.data.filter(x=>x.slug===marker);if(own.length>1)throw Error('Duplicate own Media');
   if(own.length){match=await exactMedia(own[0],hash);if(!match)throw Error('Owned Media not exact')}
  }
  if(!match){
   const r=await ctx.request.post(wp+'/wp-json/wp/v2/media',{data:info.buf,headers:{'X-WP-Nonce':nonce,'Content-Disposition':'attachment; filename="'+filename+'"','Content-Type':'image/png',Accept:'application/json'},timeout:90000});const m=await r.json();
   if(r.status()!==201||!Number.isSafeInteger(m.id))throw Error('Native Media upload failed '+r.status());
   report.writes.push({kind:'media',id:m.id,sha256:hash});await save();
   const rr=await api('media/'+m.id+'?context=edit');if(rr.http!==200)throw Error('Native Media readback failed');match=await exactMedia(rr.data,hash);
   if(!match)throw Error('Uploaded original PNG does not match');
  }
  media.set(hash,match);report.media.push(match);await save();
 }
 for(const s of specs){
  const {d,clean}=data.get(s.id),key='pse-historical-kali-'+s.id;
  let html=clean.html;for(let i=0;i<s.images.length;i++){const token='__PSE_IMAGE_'+i+'__';if(html.split(token).length!==2)throw Error('Image placeholder mismatch');html=html.replace(token,media.get(s.images[i]).url)}
  const content='<div class="'+key+'">'+html+'</div>',featured=media.get(s.images[0]).id;
  let p=existing.get(s.id);
  if(!p){const r=await api('pages','POST',{title:s.title,slug:s.slug,status:'draft',content,acf:{action:'PublicPage',key,product_lang:'vi',label:s.title},featured_media:featured});if(r.http!==201||!Number.isSafeInteger(r.data.id))throw Error('Native Page draft failed '+s.id);p=r.data;report.writes.push({kind:'page-draft',id:p.id,sourceId:s.id});await save()}
  const verify=async(status)=>{const r=await api('pages/'+p.id+'?context=edit&_fields=id,slug,status,acf,title,content,featured_media');if(r.http!==200||r.data.id!==p.id||r.data.slug!==s.slug||r.data.status!==status||norm(r.data.title?.raw)!==s.title||r.data.content?.raw!==content||r.data.acf?.key!==key||r.data.acf?.action!=='PublicPage'||(r.data.acf?.product_lang?.value??r.data.acf?.product_lang)!=='vi'||r.data.featured_media!==featured)throw Error('Exact Page readback mismatch '+s.id)};
  await verify(p.status);
  if(p.status==='draft'){const r=await api('pages/'+p.id,'POST',{status:'publish'});if(r.http!==200||r.data?.status!=='publish')throw Error('Publish failed '+s.id);report.writes.push({kind:'page-publish',id:p.id,sourceId:s.id});await save()}
  await verify('publish');
  const r=await net.get(wp+'/wp-json/wp/v2/pages/'+p.id+'?_fields=id,slug,status,acf,featured_media');const pub=await r.json();if(r.status()!==200||pub.status!=='publish'||pub.slug!==s.slug||pub.acf?.key!==key||pub.featured_media!==featured)throw Error('Public Page readback mismatch '+s.id);
  report.pages.push({sourceId:s.id,pageId:p.id,slug:s.slug,bodySha:s.body,tables:d.tables.length,images:s.images.map(h=>media.get(h)),links:rootLinks.get(s.id)});await save();
 }
 report.pass=true;console.log('PSE_KALI_TWO_NATIVE_PAGE_PASS='+JSON.stringify(report.pages));
}finally{await save();await net.dispose();await b.close()}
