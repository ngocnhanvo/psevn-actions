/** Assign only source-confirmed PSE company news Posts to existing submenu Categories. */
import {chromium} from "playwright";
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const v=env.filter(x=>x.startsWith("WC_URL="));if(v.length!==1)throw Error("No unique WP origin");
const wpUrl=new URL(v[0].slice(7).replace(/^['"]|['"]$/g,""));if(wpUrl.protocol!=="https:"||wpUrl.username||wpUrl.password)throw Error("Bad WP origin");
const event=process.env.GITHUB_EVENT_PATH?JSON.parse(await(await import("node:fs/promises")).readFile(process.env.GITHUB_EVENT_PATH,"utf8")):{};
const apply=event.head_commit?.message==="cms(pse): classify source-verified news submenu posts";
const specs=[
 {slug:"tin-tong-hop",id:1746,parent:1742,path:"/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop.html"},
 {slug:"hoat-dong-chi-bo-hdqt-bks",id:1747,parent:1742,path:"/tin-tuc-su-kien/tin-cong-ty/hoat-dong-chi-bo-hdqt-bks.html"},
 {slug:"hoat-dong-cong-doan-doan-tn-nu-cong",id:1748,parent:1742,path:"/tin-tuc-su-kien/tin-cong-ty/hoat-dong-cong-doan-doan-tn-nu-cong.html"},
 {slug:"dang-uy",id:1749,parent:1742,path:"/tin-tuc-su-kien/tin-cong-ty/dang-uy.html"}
];
const browser=await chromium.launch({headless:true});const wp=await browser.newPage();
try{
 await wp.goto(wpUrl.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await wp.locator("#user_login").count()){
  await wp.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");await wp.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=await wp.locator("body").innerText(),m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],c=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const f=wp.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("Math verification missing");await f.fill(String(c))}
  await Promise.all([wp.waitForLoadState("domcontentloaded"),wp.locator("#wp-submit").click()]);
 }
 if(wp.url().includes("wp-login"))throw Error("WP auth failed");
 const nonce=await wp.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("REST nonce");return (await r.text()).trim()});
 const api=(path,method="GET",body)=>wp.evaluate(async({path,method,body,nonce})=>{const r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});return{http:r.status,pages:r.headers.get("X-WP-TotalPages"),data:await r.json().catch(()=>({}))}},{path,method,body,nonce});
 const first=await api("/wp-json/wp/v2/posts?status=publish&context=edit&categories=1742&per_page=100&page=1&_fields=id,slug,categories,status");
 if(first.http!==200||!Array.isArray(first.data))throw Error("Company WP Posts not available");
 const posts=[...first.data],num=Number(first.pages||1);if(num>12)throw Error("Too many WordPress company post pages");
 for(let i=2;i<=num;i++){const r=await api("/wp-json/wp/v2/posts?status=publish&context=edit&categories=1742&per_page=100&page="+i+"&_fields=id,slug,categories,status");if(r.http!==200||!Array.isArray(r.data))throw Error("WordPress posts truncated");posts.push(...r.data)}
 const bySlug=new Map();for(const post of posts){if(bySlug.has(post.slug))throw Error("Duplicate WP company post slug");bySlug.set(post.slug,post)}
 const cat=await api("/wp-json/wp/v2/categories?context=edit&hide_empty=false&per_page=100&_fields=id,slug,parent,count");
 if(cat.http!==200||!Array.isArray(cat.data))throw Error("Current categories invalid");
 for(const spec of specs){const match=cat.data.filter(x=>x.id===spec.id&&x.slug===spec.slug&&Number(x.parent)===spec.parent);if(match.length!==1)throw Error("WordPress category no longer matches "+spec.slug)}
 const source=await browser.newPage();await source.route(/\.(?:woff2?|ttf|png|jpe?g|webp)(?:\?.*)?$/i,route=>route.abort());
 const manifest=[],collisions=new Map();
 for(const spec of specs){
  const res=await source.goto("https://www.pse.vn"+spec.path,{waitUntil:"domcontentloaded",timeout:60000});
  if(res?.status()!==200)throw Error("Original category HTTP not 200 "+spec.slug);
  const found=await source.evaluate(path=>{
   const root=document.querySelector(".blog");if(!root)throw Error("Original Joomla Blog absent");
   const base=path.replace(/\.html$/,"/");
   return [...new Set([...root.querySelectorAll("a[href]")].map(a=>a.href).filter(h=>{try{const u=new URL(h);return u.protocol==="https:"&&u.hostname==="www.pse.vn"&&u.pathname.startsWith(base)&&/^\d+-[a-z0-9-]+\.html$/.test(u.pathname.slice(base.length))}catch{return false}}))];
  },spec.path);
  const matched=[];
  for(const link of found){
   const filename=new URL(link).pathname.split("/").at(-1);
   const m=filename.match(/^(\d+)-([a-z0-9-]+)\.html$/);if(!m)continue;
   const id=Number(m[1]),slug=m[2],post=bySlug.get(slug);
   if(!post)continue;
   matched.push({slug,wpId:post.id,joomlaId:id,source:link});
   if(!collisions.has(slug))collisions.set(slug,new Set());
   collisions.get(slug).add(id);
  }
  if(!matched.length)throw Error("No verified WP content for "+spec.slug);
  manifest.push({...spec,matched});
 }
 const ambiguous=[...collisions].filter(([slug,ids])=>ids.size>1).map(([slug])=>slug);
 let total=0;
 for(const spec of manifest){
  spec.matched=spec.matched.filter(x=>!ambiguous.includes(x.slug));
  total+=spec.matched.length;
  console.log("PSE_NEWS_SUBMENU_PREFLIGHT="+JSON.stringify({slug:spec.slug,wpCategory:spec.id,verified:spec.matched.length,excludedAmbiguous:ambiguous}));
 }
 if(!apply){
  console.log("PSE_NEWS_SUBMENU_CLASSIFICATION=DRY_PASS; verified="+total+"; ambiguous="+ambiguous.length+"; no_wp_write=true");
  process.exit(0);
 }
 let changed=0;
 for(const spec of manifest){
  for(const row of spec.matched){
   const r=await api("/wp-json/wp/v2/posts/"+row.wpId+"?context=edit&_fields=id,slug,status,categories");
   if(r.http!==200||r.data.slug!==row.slug||r.data.status!=="publish"||!r.data.categories?.includes(1742))throw Error("Prewrite WP post changed "+row.slug);
   if(r.data.categories.includes(spec.id))continue;
   const categories=[...new Set([...r.data.categories,spec.id])];
   const up=await api("/wp-json/wp/v2/posts/"+row.wpId,"POST",{categories});
   if(up.http!==200||up.data?.id!==row.wpId)throw Error("WP category assignment failed "+row.slug);
   const check=await api("/wp-json/wp/v2/posts/"+row.wpId+"?context=edit&_fields=id,slug,status,categories");
   if(check.http!==200||check.data.status!=="publish"||!check.data.categories.includes(spec.id)||!check.data.categories.includes(1742))throw Error("Readback of post assignment failed "+row.slug);
   changed++;
  }
  console.log("PSE_NEWS_SUBMENU_APPLY="+JSON.stringify({slug:spec.slug,verifiedPosts:spec.matched.length,catId:spec.id}));
 }
 console.log("PSE_NEWS_SUBMENU_CLASSIFICATION=PASS; categories="+manifest.length+"; tagged="+changed+"; ambiguousIgnored="+ambiguous.length+"; no_astro_build=true");
}finally{await browser.close()}
