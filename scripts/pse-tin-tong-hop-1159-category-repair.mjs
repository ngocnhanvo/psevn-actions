/** Restore category 1746 for one exact, source-verified WP post #79852. */
import {chromium} from 'playwright';
const env=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,'' )).filter(s=>s.startsWith('WC_URL='));
if(env.length!==1||process.env.GITHUB_REPOSITORY!=='ngocnhanvo/psevn-actions')throw Error('Unexpected PSE context');
const u=new URL(env[0].slice(7).replace(/^['"]|['"]$/g,''));
if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port||!['','/'].includes(u.pathname))throw Error('Unsafe WP origin');
if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error('Missing WP authorization');
const wp=u.origin,mode=process.argv.includes('--apply')?'apply':'preflight';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
try{
 await page.goto(wp+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
 if(await page.locator('#user_login').count()){
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME);
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD);
  const m=(await page.locator('#loginform').innerText()).slice(0,500).match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){
   const a=+m[1],b=+m[3],n=m[2]=='+'?a+b:m[2]=='-'?a-b:a*b;
   const fld=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(await fld.count())await fld.fill(String(n));
  }
  await page.locator('#wp-submit').click();
 }
 await page.goto(wp+'/wp-admin/post.php?post=248&action=edit',{waitUntil:'domcontentloaded',timeout:60000});
 if(page.url().includes('wp-login')||!await page.locator('#adminmenu').count())throw Error('WP admin login failed');
 const nonce=await page.evaluate(async()=>window.wpApiSettings?.nonce||await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',{credentials:'same-origin'}).then(x=>x.text()));
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error('WP REST nonce invalid');
 const api=async(path,method='GET',data)=>page.evaluate(async({path,method,data,nonce})=>{
  const res=await fetch(path,{method,credentials:'same-origin',
   headers:{Accept:'application/json','X-WP-Nonce':nonce,...(data?{'Content-Type':'application/json'}:{})},
   ...(data?{body:JSON.stringify(data)}:{})});
  return {status:res.status,data:await res.json().catch(()=>null)};
 },{path,method,data,nonce});
 const child=await api('/wp-json/wp/v2/categories?slug=tin-tong-hop&_fields=id,slug,parent');
 if(child.status!==200||child.data?.length!==1||child.data[0].id!==1746||child.data[0].parent!==1742)throw Error('Category taxonomy changed');
 const fields='id,slug,date,status,title,content,excerpt,categories';
 const before=await api('/wp-json/wp/v2/posts/79852?context=edit&_fields='+fields);
 const p=before.data;
 if(before.status!==200||p?.id!==79852||p.status!=='publish'||!String(p.date||'').startsWith('2015-12-11')||
  !p.categories?.includes(1742)||p.categories?.includes(1746)||p.categories.length!==1||
  p.slug!=='pvfcco-se-ph%c3%a2n-b%c3%b3n-ph%c3%ba-m%e1%bb%b9-gi%c3%bap-t%c4%83ng-n%c4%83ng-su%e1%ba%a5t-tr%c3%aan-c%c3%a2y-h%e1%bb%93-ti%c3%aau'||
  String(p.title?.raw||p.title?.rendered)!=='PVFCCo SE: Phân bón Phú Mỹ giúp tăng năng suất trên cây Hồ tiêu'||
  !String(p.content?.raw||'').includes('09/12/2015'))throw Error('Source verified WP 79852 identity unexpectedly changed');
 if(mode==='apply'){
  const written=await api('/wp-json/wp/v2/posts/79852','POST',{categories:[1742,1746]});
  if(written.status!==200||written.data?.id!==79852)throw Error('Failed to save missing category');
  const check=await api('/wp-json/wp/v2/posts/79852?context=edit&_fields='+fields);
  const q=check.data;
  if(check.status!==200||q?.id!==p.id||q.slug!==p.slug||q.date!==p.date||q.status!==p.status||
    (q.title?.raw||q.title?.rendered)!==(p.title?.raw||p.title?.rendered)||
    q.content?.raw!==p.content?.raw||q.excerpt?.raw!==p.excerpt?.raw||
    !q.categories.includes(1742)||!q.categories.includes(1746)||q.categories.length!==2)
   throw Error('WordPress exact record readback changed outside taxonomy');
  console.log('PSE_1159_TIN_TONG_HOP_RETAG=PASS; wp_id=79852; source_id=1159; before=1742; after=1742,1746; content_date_slug_unchanged=true');
 }else console.log('PSE_1159_TIN_TONG_HOP_PREFLIGHT=PASS; wp_id=79852; source_id=1159; source_proof_run=44836547178');
}finally{await browser.close()}
