import {chromium,request} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const ev=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
if(process.env.GITHUB_REPOSITORY!=='ngocnhanvo/psevn-actions'||process.env.GITHUB_REF!=='refs/heads/main'||ev.head_commit?.message!=='cms(pse): restore Kali 1430 and repair exact links'||process.env.PSE_KALI_FRESH_BACKUP!=='yes')throw Error('Invalid CMS write scope');
const wp='https://admin-pse.webnvn.com',front='https://pse.webnvn.com',sha=x=>createHash('sha256').update(x).digest('hex'),norm=x=>String(x||'').normalize('NFKC').replace(/\s+/g,' ').trim();
const proof=JSON.parse(await readFile('inputs/proof/report.json','utf8')),r=proof.rows.find(x=>x.id===1430),source=JSON.parse(await readFile('inputs/proof/source-1430.json','utf8'));
const pre=JSON.parse(await readFile('inputs/preflight/report.json','utf8')),img=r?.detailImages?.[0],binary=img?await readFile('inputs/proof/'+img.fileArtifact):null;
if(!proof.readOnly||!r?.ready||!pre.readOnly||pre.errors?.length||r.title!=='Kali Phú Mỹ Bột MOP - Mô tả và HDSD'||r.bodySha!=='cec036796daec93cad3ab8c7a19d7912f2a166bf4038f57ff1cdd5ce3cfb9417'||r.fullBodySha!=='8910af2001ab1c69de8ff62adebd049981c1f86a164b538c60d6de75fd15ceb7'||sha(source.full)!==r.fullBodySha||img?.file!=='5-KALI-BOT_Phu_My_2019_cai_tien.png'||sha(binary)!==img.sha256)throw Error('Original 1430 evidence mismatch');
const dir='artifacts/pse-kali-1427-1430-native-repair';await mkdir(dir,{recursive:true});
const report={pass:false,writes:[],redirects:[]},save=()=>writeFile(dir+'/report.json',JSON.stringify(report,null,2)+'\n');
const b=await chromium.launch(),ctx=await b.newContext(),p=await ctx.newPage(),net=await request.newContext({timeout:45000});
try{
 await p.goto(wp+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await p.locator('#user_login').count()){
  if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error('WP credentials missing');
  await p.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);await p.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
  const match=(await p.locator('#loginform').innerText()).match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i);
  if(match){const a=+match[1],c=+match[3],v=({'+':a+c,'-':a-c,x:a*c,'×':a*c,'*':a*c})[match[2]],f=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();if(!await f.count())throw Error('Unknown captcha');await f.fill(String(v))}
  await p.locator('#wp-submit').click();
 }
 await p.goto(wp+'/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
 if(p.url().includes('wp-login')||!await p.locator('#adminmenu').count())throw Error('WP login failed');
 const nonce=await p.evaluate(async()=>window.wpApiSettings?.nonce||(await(await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'})).text()).trim());
 if(!/^[0-9a-z]{8,24}$/i.test(nonce))throw Error('Bad nonce');
 const api=async(path,method='GET',data)=>{const x=await ctx.request.fetch(wp+'/wp-json/wp/v2/'+path,{method,timeout:60000,headers:{'X-WP-Nonce':nonce,Accept:'application/json',...(data?{'Content-Type':'application/json'}:{})},...(data?{data}:{})});return {http:x.status(),d:await x.json().catch(()=>null),pages:Number(x.headers()['x-wp-totalpages']||1)}};
 const slug='kali-phu-my-bot-mop-mo-ta-va-hdsd',key='pse-historical-kali-1430';
 for(const type of ['pages','posts','product']){const q=await api(type+'?context=edit&status=publish,draft,pending,private,future&slug='+slug);if(q.http!==200||!Array.isArray(q.d)||q.d.length)throw Error('1430 slug conflict in '+type)}
 const parent=await api('pages/83572?context=edit&_fields=id,slug,status,acf,content,modified'),raw=String(parent.d?.content?.raw||'');
 if(parent.http!==200||parent.d.slug!=='kali-phu-my-mo-ta-cac-bien-the'||parent.d.acf?.key!=='pse-historical-kali-1426'||parent.d.status!=='publish')throw Error('Parent Page identity mismatch');
 const replacements=[
 ['https://pse.vn/hoat-dong-kinh-doanh/san-pham/kali-phu-my.html?id=1427',front+'/san-pham/kali-phu-my-mieng-mop-1427'],
 ['https://pse.vn/index.php?option=com_content&view=article&id=1430',front+'/'+slug]];
 for(const [a,z] of replacements)if(raw.split(a).length!==2||raw.includes(z))throw Error('Parent link changed');
 const changed=replacements.reduce((v,[a,z])=>v.replace(a,z),raw);
 if((raw.match(/<img(?:\s|>)/gi)||[]).length!==3||(changed.match(/<img(?:\s|>)/gi)||[]).length!==3)throw Error('Unexpected parent images');
 const target1427=await api('product/80938?_fields=id,slug,status');
 if(target1427.http!==200||target1427.d.slug!=='kali-phu-my-mieng-mop-1427'||target1427.d.status!=='publish')throw Error('1427 Product identity changed');
 const plans=[[1425,'/kali-phu-my-bot-canada-mo-ta-va-hdsd'],[1427,'/san-pham/kali-phu-my-mieng-mop-1427'],[1430,'/'+slug]].map(([id,to])=>({id,from:'/hoat-dong-kinh-doanh/san-pham/kali-phu-my.html?id='+id,to}));
 for(const plan of plans){
  const old=await net.get(front+plan.from,{maxRedirects:0,failOnStatusCode:false}),dest=await net.get(front+plan.to,{maxRedirects:0,failOnStatusCode:false});
  if(old.status()!==404||dest.status()!==(plan.id===1430?404:200))throw Error('Public URL changed '+plan.id);
 }
 const registry=[];
 for(let i=1;i<=40;i++){const q=await api('chuyen-huong-link?context=edit&status=any&per_page=100&page='+i+'&_fields=id,acf,status');if(q.http!==200||!Array.isArray(q.d)||q.pages>40)throw Error('Redirect inventory failed');registry.push(...q.d);if(i===q.pages)break}
 if(plans.some(x=>registry.some(y=>y.d?.acf?.from_link===x.from||y.acf?.from_link===x.from)))throw Error('Existing Kali redirect conflicts');
 const clean=await p.evaluate(({html,links})=>{
  const root=document.createElement('div');root.innerHTML=html;
  root.querySelectorAll('script,style,iframe,object,embed,form,input,button,link,meta,base,svg,video,audio').forEach(x=>x.remove());
  const allowed=new Set(['colspan','rowspan','scope','headers','alt','title','dir','lang']);
  const mapped=new Map([[1668,'/san-pham/dam-phu-my-chuyen-dung-cho-drone-1668'],[1669,'/san-pham/dam-phu-my-chuyen-dung-cho-nong-lam-truong-1669'],[1676,'/san-pham/sa-phu-my-1682'],[1677,'/san-pham/dap-phu-my-1677'],[1678,'/san-pham/kali-phu-my-mieng-mop-1427']]);
  let images=0;
  for(const e of root.querySelectorAll('*')){
   const href=e.getAttribute('href');for(const a of [...e.attributes])if(!allowed.has(a.name))e.removeAttribute(a.name);
   if(e.tagName==='IMG'){images++;e.setAttribute('src','__ORIGINAL_KALI_PNG__');e.setAttribute('loading','lazy')}
   if(e.tagName==='A'&&href){const l=links.find(x=>x.href===href);if(!l)throw Error('Unverified hyperlink');const u=new URL(l.url),m=u.pathname.match(/\/8-trang-chu\/(\d+)-/),path=u.hostname==='pse.vn'&&m?mapped.get(Number(m[1])):null;e.setAttribute('href',path?'https://pse.webnvn.com'+path:u.href)}
  }
  return {html:root.innerHTML,text:String(root.textContent||'').normalize('NFKC').replace(/\s+/g,' ').trim(),images,tables:[...root.querySelectorAll('table')].map(t=>[...t.rows].map(r=>[...r.cells].map(c=>String(c.textContent||'').normalize('NFKC').replace(/\s+/g,' ').trim())))};
 },{html:source.html,links:source.links});
 if(clean.images!==1||sha(clean.text)!==r.bodySha||JSON.stringify(clean.tables)!==JSON.stringify(source.tables))throw Error('1430 source HTML parity mismatch');
 await writeFile(dir+'/rollback.json',JSON.stringify({parentId:83572,parentModified:parent.d.modified,originalRaw:raw,originalSha:sha(raw)},null,2)+'\n');
 const check=await api('pages/83572?context=edit&_fields=modified,content');
 if(check.http!==200||check.d.modified!==parent.d.modified||sha(check.d.content?.raw)!==sha(raw))throw Error('Concurrent parent edit');
 const upload=await ctx.request.post(wp+'/wp-json/wp/v2/media',{data:binary,timeout:90000,headers:{'X-WP-Nonce':nonce,'Content-Type':'image/png','Content-Disposition':'attachment; filename="'+img.file+'"',Accept:'application/json'}});
 const u=await upload.json().catch(()=>null);
 if(upload.status()!==201||!Number.isSafeInteger(u?.id))throw Error('Original media upload failed');
 report.writes.push({type:'media',id:u.id});await save();
 const verifyMedia=await net.get(u.source_url,{maxRedirects:0,failOnStatusCode:false});
 if(verifyMedia.status()!==200||sha(await verifyMedia.body())!==img.sha256)throw Error('Original media byte readback failed');
 const content='<div class="'+key+'">'+clean.html.replace('__ORIGINAL_KALI_PNG__',u.source_url)+'</div>';
 const made=await api('pages','POST',{title:r.title,slug,status:'draft',content,acf:{action:'PublicPage',key,product_lang:'vi',label:r.title},featured_media:u.id});
 if(made.http!==201||!Number.isSafeInteger(made.d?.id))throw Error('1430 draft create failed');
 const pageId=made.d.id;report.writes.push({type:'page-draft',id:pageId});await save();
 const verifyPage=async status=>{const x=await api('pages/'+pageId+'?context=edit&_fields=id,status,slug,title,acf,content,featured_media');if(x.http!==200||x.d.status!==status||x.d.slug!==slug||x.d.acf?.key!==key||x.d.acf?.action!=='PublicPage'||x.d.content?.raw!==content||x.d.featured_media!==u.id||norm(x.d.title?.raw)!==r.title)throw Error('1430 Page readback failed')};
 await verifyPage('draft');const published=await api('pages/'+pageId,'POST',{status:'publish'});if(published.http!==200)throw Error('1430 publish failed');await verifyPage('publish');
 report.writes.push({type:'page-publish',id:pageId});await save();
 const upd=await api('pages/83572','POST',{content:changed});if(upd.http!==200)throw Error('Page 83572 update failed');
 const reread=await api('pages/83572?context=edit&_fields=content,acf');
 if(reread.http!==200||reread.d.content?.raw!==changed||reread.d.acf?.key!==parent.d.acf.key)throw Error('Page 83572 readback mismatch');
 report.writes.push({type:'parent-links',id:83572,count:2});await save();
 for(const plan of plans){
  const draft=await api('chuyen-huong-link','POST',{status:'draft',title:'PSE Kali query '+plan.id,acf:{from_link:plan.from,to_link:plan.to,type:'301',match_type:'Exact',enable:true}});
  if(draft.http!==201||!Number.isSafeInteger(draft.d?.id))throw Error('Redirect draft failed '+plan.id);
  const id=draft.d.id;report.writes.push({type:'redirect-draft',id});await save();
  const pub=await api('chuyen-huong-link/'+id,'POST',{status:'publish'});if(pub.http!==200)throw Error('Redirect publish failed '+plan.id);
  const q=await api('chuyen-huong-link/'+id+'?context=edit&_fields=id,status,acf');
  if(q.http!==200||q.d.status!=='publish'||q.d.acf?.from_link!==plan.from||q.d.acf?.to_link!==plan.to||String(q.d.acf?.type)!=='301'||q.d.acf?.match_type!=='Exact'||q.d.acf?.enable!==true)throw Error('301 readback failed '+plan.id);
  report.redirects.push({...plan,record:id});await save();
 }
 report.pass=true;console.log('PSE_KALI_NATIVE_REPAIR_PASS='+JSON.stringify(report));
}finally{await save();await net.dispose();await b.close()}
