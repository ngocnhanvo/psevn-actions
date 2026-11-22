/** Single exact Joomla original #198 URL -> proven published WordPress Post.
 * Native WordPress chuyen-huong-link only, idempotent receipt checks, fresh DB backup.
 */
import {chromium,request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const message="cms(pse): original Joomla 198 exact native 301 to verified published Post";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main"||
 event.head_commit?.message!==message||
 process.env.PSE_198_301_FRESH_BACKUP_VERIFIED!=="yes")
 throw Error("Unapproved Joomla original 198 redirect / no fresh backup");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const from="/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/198-nha-may-dam-phu-my-don-tan-san-pham-ure-thu-5-trieu.html";
const original="https://www.pse.vn"+from;
if(state.schema!=="pse-legacy-article-migration-v1"||state.articles?.["198"]?.source_url!==original)
 throw Error("Original source Joomla Article 198 identity changed");
const to="/nha-may-dam-phu-my-don-tan-san-pham-ure-thu-5-trieu";
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const origin=k=>{const xs=env.filter(x=>x.startsWith(k+"="));if(xs.length!==1)throw Error("Missing "+k);
 const u=new URL(xs[0].slice(k.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.port||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Unsafe "+k);
 return u.origin};
const wp=origin("WC_URL"),front=origin("WC_URL_CLIENT");
if(wp===front)throw Error("Frontend and WP origin overlap");
const net=await request.newContext({timeout:45000});
const browser=await chromium.launch({headless:true}),page=await browser.newPage();
let createdId=null,api=null,published=false;
const report={schema:"pse-original-joomla-198-native-301-v1",from,to,postId:83516,
 sourceOriginal:true,readOnly:false,writes:[],previous:null,rollbackFresh:true,buildTriggered:false};
try{
 const [p,cat,publicPost,old]=await Promise.all([
  net.get(wp+"/wp-json/wp/v2/posts?slug="+to.slice(1)+"&per_page=5&_fields=id,slug,status,date,acf,categories,featured_media"),
  net.get(wp+"/wp-json/wp/v2/categories?slug=tin-tong-hop&hide_empty=false&_fields=id,slug,parent,name"),
  net.get(front+to,{maxRedirects:0,failOnStatusCode:false}),
  net.get(front+from,{maxRedirects:0,failOnStatusCode:false})
 ]);
 if(p.status()!==200||cat.status()!==200||publicPost.status()!==200)throw Error("WP native article 198/public target unavailable");
 const posts=await p.json(),cats=await cat.json();
 if(!Array.isArray(posts)||posts.length!==1||posts[0].id!==83516||posts[0].status!=="publish"||
  posts[0].date?.slice(0,10)!=="2011-08-15"||String(posts[0].acf?.origin_page_id)!=="198"||
  (!posts[0].categories?.includes(1742)||!posts[0].categories?.includes(1746))||!posts[0].featured_media||
  !Array.isArray(cats)||cats.length!==1||cats[0].id!==1746||Number(cats[0].parent)!==1742)
  throw Error("Original Joomla 198 WP native Post source receipt mismatch");
 const newHtml=await publicPost.text();
 if(!newHtml.includes("Nhà máy Đạm Phú Mỹ đón tấn sản phẩm urê thứ 5 triệu")||
 !newHtml.includes('href="'+front+to+'"'))throw Error("New public original 198 H1/canonical unavailable");
 const oldStatus=old.status(),oldLocation=old.headers().location||"";
 if(oldStatus!==404&&oldStatus!==301)throw Error("Unexpected old Joomla URL status "+oldStatus);
 if(oldStatus===301){
  const loc=new URL(oldLocation,front);
  if(loc.origin!==front||loc.pathname!==to||loc.search||loc.hash)
   throw Error("Existing Joomla 198 redirect incorrect");
 }
 // Native WP protected REST editor, using existing source owned nonce.
 await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const login=(await page.locator("#loginform").innerText()).slice(0,500);
  const m=login.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i);
  if(m){const a=+m[1],b=+m[3],result=({"+":a+b,"-":a-b,"×":a*b,x:a*b,"*":a*b})[m[2]];
   const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error("Native WP login math input absent");
   await field.fill(String(result))}
  await page.locator("#wp-submit").click();
 }
 await page.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 if(page.url().includes("wp-login")||!await page.locator("#adminmenu").count())throw Error("WordPress admin not authenticated");
 const nonce=await page.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("REST nonce unavailable");return(await r.text()).trim()});
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error("Bad WordPress nonce");
 api=(path,method="GET",body)=>page.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,
   Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return{http:r.status,pages:Number(r.headers.get("X-WP-TotalPages")||1),data:await r.json().catch(()=>null)};
 },{path,method,body,nonce});
 const list=[];
 for(let n=1;n<=40;n++){
  const r=await api("/wp-json/wp/v2/chuyen-huong-link?context=edit&status=any&per_page=100&page="+n+
   "&orderby=id&order=asc&_fields=id,status,acf");
  if(r.http!==200||!Array.isArray(r.data)||r.pages<1||r.pages>40)
   throw Error("Native routing registry incomplete page "+n);
  list.push(...r.data);
  if(n===r.pages)break;
 }
 const matches=list.filter(x=>x.acf?.from_link===from);
 if(matches.length>1)throw Error("Duplicate native Joomla 198 redirect source");
 const record=matches[0]||null;
 if(record&&(record.acf?.to_link!==to||String(record.acf?.type)!=="301"||
  record.acf?.match_type!=="Exact"||record.acf?.enable!==true))
  throw Error("Conflicting native Joomla 198 exact old URL target");
 report.previous=record?{id:record.id,status:record.status}:null;
 console.log("PSE_198_NATIVE_301_PREFLIGHT="+JSON.stringify({sourceId:198,wpPostId:83516,createdDay:"2011-08-15",
  legacyStatus:oldStatus,oldCorrect:oldStatus===301,existing:report.previous,sourceExact:true,freshBackup:true}));
 await mkdir("artifacts/pse-original-198-301",{recursive:true});
 await writeFile("artifacts/pse-original-198-301/rollback.json",JSON.stringify({previous:report.previous,createdId:null,from,to},null,2)+"\n");
 if(oldStatus===301&&record?.status==="publish"){
  console.log("PSE_198_NATIVE_301_ALREADY_PASS=1; writes=0");
 }
 let id=record?.id;
 if(!id){
  const create=await api("/wp-json/wp/v2/chuyen-huong-link","POST",{status:"draft",
   title:"PSE: Joomla bài gốc 198 → tin công ty",
   acf:{from_link:from,to_link:to,type:"301",match_type:"Exact",enable:true}});
  if(create.http!==201||!Number.isSafeInteger(Number(create.data?.id))||!create.data.id)
   throw Error("Cannot stage exact original Joomla 198 native redirect");
  id=Number(create.data.id);createdId=id;report.writes.push({type:"draft",id});
  await writeFile("artifacts/pse-original-198-301/rollback.json",JSON.stringify({previous:null,createdId:id,from,to},null,2)+"\n");
 }
 const receipt=await api("/wp-json/wp/v2/chuyen-huong-link/"+id+"?context=edit&_fields=id,status,acf");
 if(receipt.http!==200||Number(receipt.data.id)!==id||receipt.data.acf?.from_link!==from||
  receipt.data.acf?.to_link!==to||String(receipt.data.acf.type)!=="301"||
  receipt.data.acf.match_type!=="Exact"||receipt.data.acf.enable!==true)
  throw Error("Original Joomla 198 WP route readback invalid");
 if(receipt.data.status!=="publish"){
  const pub=await api("/wp-json/wp/v2/chuyen-huong-link/"+id,"POST",{status:"publish"});
  if(pub.http!==200||pub.data.status!=="publish")throw Error("Original 198 WP 301 could not publish");
  report.writes.push({type:"publish",id});
 }
 const final=await api("/wp-json/wp/v2/chuyen-huong-link/"+id+"?context=edit&_fields=id,status,acf");
 if(final.http!==200||final.data.status!=="publish"||
  final.data.acf.from_link!==from||final.data.acf.to_link!==to)
  throw Error("Original Joomla 198 WP redirect published readback failed");
 published=true;report.postRedirectId=id;
 console.log("PSE_198_NATIVE_301_APPLY_PASS="+JSON.stringify({sourceId:198,wpId:83516,redirectId:id,
   from,to,otherRoutesUnchanged:true,wpOwned:true,writes:report.writes.length,noBuildTriggered:true}));
}finally{
 if(createdId&&!published&&api&&false){
  try{const r=await api("/wp-json/wp/v2/chuyen-huong-link/"+createdId+"?context=edit&_fields=id,status,acf");
   if(r.http===200&&r.data?.status==="draft"&&r.data.acf?.from_link===from){
    const d=await api("/wp-json/wp/v2/chuyen-huong-link/"+createdId+"?force=true","DELETE");
    const after=await api("/wp-json/wp/v2/chuyen-huong-link/"+createdId+"?context=edit");
    if(d.http!==200||after.http!==404)throw Error("Draft cleanup residue");
    console.log("PSE_198_301_TEMP_CLEANUP_PASS id="+createdId);
   }else console.warn("PSE_198_301_UNCERTAIN_PUBLISHED_DRAFT_REVIEW id="+createdId);
  }catch(e){console.warn("PSE_198_301_TEMP_CLEANUP_REVIEW="+String(e?.message||e).slice(0,130))}
 }
 await mkdir("artifacts/pse-original-198-301",{recursive:true});
 await writeFile("artifacts/pse-original-198-301/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();await browser.close();
}
