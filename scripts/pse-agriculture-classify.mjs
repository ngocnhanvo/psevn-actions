/** Verified Joomla agriculture menus to WordPress native taxonomy. Dry by default, staged with readback. */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const apply=event.head_commit?.message==="cms(pse): classify verified agricultural knowledge articles";
const rows=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const origin=(key)=>{const v=rows.filter(s=>s.startsWith(key+"="));if(v.length!==1)throw Error("Missing PSE "+key);const u=new URL(v[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));if(u.protocol!=="https:"||u.username||u.password||!["","/"].includes(u.pathname)||u.search||u.hash)throw Error("Untrusted origin "+key);return u.origin};
const wpOrigin=origin("WC_URL"),frontend=origin("WC_URL_CLIENT");
const families=[
 {id:77014,parentId:77004,name:"Kiến thức nông nghiệp",slug:"kien-thuc-nong-nghiep",parentSlug:null,path:"/hoat-dong-kinh-doanh/kien-thuc-nong-nghiep.html"},
 {id:77015,parentId:77014,name:"Hướng dẫn sử dụng phân bón",slug:"huong-dan-su-dung-phan-bon",parentSlug:"kien-thuc-nong-nghiep",path:"/hoat-dong-kinh-doanh/kien-thuc-nong-nghiep/huong-dan-su-dung-phan-bon.html"},
 {id:77016,parentId:77014,name:"Phân biệt và chọn mua phân bón",slug:"phan-biet-va-chon-mua-phan-bon",parentSlug:"kien-thuc-nong-nghiep",path:"/hoat-dong-kinh-doanh/kien-thuc-nong-nghiep/phan-biet-va-chon-mua-phan-bon.html"}
];
const browser=await chromium.launch({headless:true});const ctx=await browser.newContext({viewport:{width:1440,height:850}});const p=await ctx.newPage();
const manifest={mode:apply?"apply":"dry",families:[],changed:[]};
try{
 await p.goto(wpOrigin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await p.locator("#user_login").count()){
  await p.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");await p.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const s=await p.locator("body").innerText(),m=s.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||s.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const f=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("WordPress challenge missing");await f.fill(String(v))}
  await Promise.all([p.waitForLoadState("domcontentloaded"),p.locator("#wp-submit").click()]);
 }
 if(p.url().includes("wp-login"))throw Error("PSE login denied");
 const nonce=await p.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("REST nonce HTTP "+r.status);const s=(await r.text()).trim();if(!/^[a-zA-Z0-9]{8,24}$/.test(s))throw Error("Nonce malformed");return s});
 const api=(path,method="GET",body)=>p.evaluate(async({path,method,body,nonce})=>{const r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});return{http:r.status,data:await r.json().catch(()=>({}))}},{path,method,body,nonce});
 const [menus,categories,posts]=await Promise.all([
  api("/wp-json/wp/v2/menu-items?context=edit&per_page=100"),
  api("/wp-json/wp/v2/categories?context=edit&per_page=100&hide_empty=false&_fields=id,name,slug,parent,count"),
  api("/wp-json/wp/v2/posts?context=edit&status=publish&categories=1743&per_page=100&_fields=id,slug,status,categories,title")
 ]);
 if(menus.http!==200||!Array.isArray(menus.data)||categories.http!==200||!Array.isArray(categories.data)||posts.http!==200||!Array.isArray(posts.data))throw Error("CMS registry preflight failed");
 const market=categories.data.filter(x=>x.id===1743&&x.slug==="thong-tin-thi-truong"&&Number(x.parent)===0);
 if(market.length!==1)throw Error("Original existing PSE post category changed");
 const bySlug=new Map(posts.data.map(x=>[x.slug,x]));
 if(bySlug.size!==posts.data.length)throw Error("Ambiguous native WordPress Post slugs");
 const source=await ctx.newPage();await source.route(/\.(?:woff2?|ttf|png|jpe?g|gif|webp|svg)(?:\?.*)?$/i,r=>r.abort());
 for(const f of families){
  const m=menus.data.filter(x=>Number(x.id)===f.id&&Number(x.parent)===f.parentId&&String(x.title?.raw||x.title?.rendered||"").trim()===f.name);
  if(m.length!==1)throw Error("Menu identity changed "+f.slug);
  const target=frontend+"/tin-tuc-su-kien/?cat="+f.slug;
  if(m[0].url!==target&&m[0].url!=="https://www.pse.vn"+f.path)throw Error("Unverified Joomla menu source "+f.slug);
  const original="https://www.pse.vn"+f.path,queue=[original],seen=new Set(),found=new Map();
  while(queue.length){
   if(seen.size>=40)throw Error("Original pagination exceeded cap "+f.slug);
   const href=queue.shift();if(seen.has(href))continue;seen.add(href);
   const r=await source.goto(href,{waitUntil:"domcontentloaded",timeout:45000});
   if(r?.status()!==200)throw Error("Original agriculture source HTTP "+r?.status());
   const refs=await source.evaluate(()=>{
    const root=document.querySelector(".blog");if(!root)throw Error("Source Joomla blog missing");
    const articles=[...root.querySelectorAll(".item a[href]")].map(a=>a.href);
    const pagination=[...root.querySelectorAll("a[href]")].map(a=>a.href);
    return{articles,pagination};
   });
   const path=f.path.replace(/\.html$/,"/");
   for(const href2 of refs.articles){
    let u;try{u=new URL(href2)}catch{continue}
    if(u.protocol!=="https:"||u.hostname!=="www.pse.vn"||!u.pathname.startsWith(path))continue;
    const file=u.pathname.split("/").at(-1);
    if(!/^\d+-[a-z0-9-]+\.html$/.test(file))continue;
    const slug=file.replace(/^\d+-/,"").replace(/\.html$/,"");
    const post=bySlug.get(slug);
    if(post)found.set(slug,{id:post.id,slug,source:u.pathname,categories:post.categories});
   }
   for(const href2 of refs.pagination){
    let u;try{u=new URL(href2)}catch{continue}
    if(u.protocol!=="https:"||u.hostname!=="www.pse.vn"||u.pathname!==f.path||!u.searchParams.has("start")||!/^\d{1,5}$/.test(u.searchParams.get("start")||""))continue;
    if(!seen.has(u.href)&&!queue.includes(u.href))queue.push(u.href);
   }
  }
  if(f.slug!=="phan-biet-va-chon-mua-phan-bon"&&!found.size)throw Error("Expected verified PSE agriculture posts absent "+f.slug);
  const existing=categories.data.filter(x=>x.slug===f.slug);
  if(existing.length>1||existing.length===1&&existing[0].name!==f.name)throw Error("Conflicting native WP Category slug "+f.slug);
  manifest.families.push({...f,menuUrl:m[0].url,target,existingCategoryId:existing[0]?.id||null,found:[...found.values()],sourcePages:seen.size});
 }
 console.log("PSE_AGRICULTURE_CLASS_PREFLIGHT="+JSON.stringify(manifest.families.map(x=>({slug:x.slug,sourcePages:x.sourcePages,verifiedMatches:x.found.length,existingCategoryId:x.existingCategoryId,menuAlreadyBound:x.menuUrl===x.target}))));
 if(!apply){console.log("PSE_AGRICULTURE_CLASS=DRY_PASS; posts="+manifest.families.reduce((n,x)=>n+x.found.length,0)+"; categories=3; no_write=true");process.exit(0)}
 const byNewSlug=new Map();
 const backups=[];
 try{
  for(const f of manifest.families){
   const parentId=f.parentSlug?byNewSlug.get(f.parentSlug):0;
   if(parentId===undefined)throw Error("WP hierarchy source unresolved");
   let catId=f.existingCategoryId;
   if(catId){
    const cat=categories.data.find(x=>Number(x.id)===Number(catId));
    if(Number(cat.parent)!==Number(parentId))throw Error("Pre-existing WP category ancestry mismatch "+f.slug);
   }else{
    const r=await api("/wp-json/wp/v2/categories","POST",{slug:f.slug,name:f.name,parent:Number(parentId)});
    if(r.http!==201||r.data?.slug!==f.slug||Number(r.data?.parent)!==Number(parentId))throw Error("Category create failed "+f.slug);
    catId=Number(r.data.id);
    manifest.changed.push({type:"category-created",slug:f.slug,id:catId});
   }
   byNewSlug.set(f.slug,catId);
   const check=await api("/wp-json/wp/v2/categories/"+catId+"?context=edit&_fields=id,slug,name,parent");
   if(check.http!==200||check.data.slug!==f.slug||Number(check.data.parent)!==Number(parentId))throw Error("Category post-write verification failed "+f.slug);
   for(const post of f.found){
    const current=await api("/wp-json/wp/v2/posts/"+post.id+"?context=edit&_fields=id,slug,status,categories");
    if(current.http!==200||current.data.slug!==post.slug||current.data.status!=="publish"||!current.data.categories?.includes(1743))throw Error("Source Post identity changed "+post.slug);
    if(current.data.categories.includes(catId))continue;
    backups.push({postId:post.id,categories:[...current.data.categories]});
    const r=await api("/wp-json/wp/v2/posts/"+post.id,"POST",{categories:[...new Set([...current.data.categories,catId])]});
    if(r.http!==200||r.data?.id!==post.id||!r.data.categories?.includes(catId))throw Error("Post category mutation failed "+post.slug);
    const verify=await api("/wp-json/wp/v2/posts/"+post.id+"?context=edit&_fields=id,categories,status");
    if(verify.http!==200||verify.data.status!=="publish"||!verify.data.categories?.includes(catId)||!verify.data.categories?.includes(1743))throw Error("Post category readback failed "+post.slug);
    manifest.changed.push({type:"tag",postId:post.id,categoryId:catId});
   }
   if(f.menuUrl!==f.target){
    backups.push({menuId:f.id,url:f.menuUrl});
    const r=await api("/wp-json/wp/v2/menu-items/"+f.id,"POST",{type:"custom",url:f.target});
    if(r.http!==200||r.data?.url!==f.target)throw Error("Menu bind failed "+f.slug);
    const verify=await api("/wp-json/wp/v2/menu-items/"+f.id+"?context=edit");
    if(verify.http!==200||verify.data.url!==f.target)throw Error("Menu readback failed "+f.slug);
    manifest.changed.push({type:"menu",id:f.id,url:f.target});
   }
   console.log("PSE_AGRICULTURE_CLASS_SAVED="+JSON.stringify({categorySlug:f.slug,id:catId,matched:f.found.length,verified:true}));
  }
 }catch(e){
  for(const backup of backups.reverse()){
   try{
    if(backup.postId)await api("/wp-json/wp/v2/posts/"+backup.postId,"POST",{categories:backup.categories});
    if(backup.menuId)await api("/wp-json/wp/v2/menu-items/"+backup.menuId,"POST",{type:"custom",url:backup.url});
   }catch{}
  }
  throw e;
 }
 console.log("PSE_AGRICULTURE_CLASS=PASS; categories=3; matched="+manifest.families.reduce((n,x)=>n+x.found.length,0)+"; source_verification=true; no_build=true");
}finally{
 await mkdir("artifacts/pse-agriculture-classification",{recursive:true});
 await writeFile("artifacts/pse-agriculture-classification/manifest.json",JSON.stringify(manifest,null,2)+"\n");
 await browser.close();
}
