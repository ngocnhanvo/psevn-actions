/** Source-verified WordPress investor child taxonomy migration; safe, idempotent, resumable. */
import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const envFrontend=(()=>{const s=rows.filter(x=>x.startsWith("WC_URL_CLIENT="));if(s.length!==1)throw Error("PSE frontend origin missing");const u=new URL(s[0].slice(14).replace(/^['"]|['"]$/g,""));if(u.protocol!=="https:"||u.username||u.password||!["","/"].includes(u.pathname)||u.search||u.hash)throw Error("Frontend origin invalid");return u.origin})();
const authorized=process.env.GITHUB_EVENT_PATH&&JSON.parse(await(await import("node:fs/promises")).readFile(process.env.GITHUB_EVENT_PATH,"utf8")).head_commit?.message==="cms(pse): classify source-verified investor archive articles";
const rows=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const v=rows.filter(x=>x.startsWith("WC_URL="));if(v.length!==1)throw Error("PSE WP origin absent");
const wpUrl=new URL(v[0].slice(7).replace(/^['"]|['"]$/g,""));if(wpUrl.protocol!=="https:"||wpUrl.username||wpUrl.password||!["","/"].includes(wpUrl.pathname)||wpUrl.search||wpUrl.hash)throw Error("Untrusted CMS origin");
const specs=[{id:77023,parent:77022,name:"Thông tin Quản trị",slug:"thong-tin-quan-tri"},
{id:77024,parent:77022,name:"Bản công bố thông tin",slug:"ban-cong-bo-thong-tin"},
{id:77026,parent:77021,name:"Báo cáo tài chính",slug:"bao-cao-tai-chinh"},
{id:77027,parent:77021,name:"Báo cáo thường niên",slug:"bao-cao-thuong-nien"},
{id:77028,parent:77021,name:"Tài liệu quản trị công ty",slug:"tai-lieu-quan-tri-cong-ty"}];
const browser=await chromium.launch({headless:true});
const wp=await browser.newPage({viewport:{width:1440,height:880}});
try{
 await wp.goto(wpUrl.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await wp.locator("#user_login").count()){
  await wp.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await wp.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const body=await wp.locator("body").innerText(),m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],val=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const input=wp.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await input.count())throw Error("Login math unavailable");await input.fill(String(val))}
  await Promise.all([wp.waitForLoadState("domcontentloaded"),wp.locator("#wp-submit").click()]);
 }
 if(wp.url().includes("wp-login"))throw Error("Admin login failed");
 const nonce=await wp.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("REST nonce failed");return(await r.text()).trim()});
 const api=(path,method="GET",body)=>wp.evaluate(async({path,nonce,method,body})=>{const r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});return{http:r.status,headers:{total:r.headers.get("X-WP-Total"),pages:r.headers.get("X-WP-TotalPages")},data:await r.json().catch(()=>({}))}},{path,nonce,method,body});
 const [menus,cats,first]=await Promise.all([
  api("/wp-json/wp/v2/menu-items?context=edit&per_page=100"),
  api("/wp-json/wp/v2/categories?context=edit&per_page=100&hide_empty=false&_fields=id,slug,name,parent"),
  api("/wp-json/wp/v2/posts?context=edit&status=publish&categories=1744&per_page=100&page=1&_fields=id,slug,categories")
 ]);
 if(menus.http!==200||!Array.isArray(menus.data)||cats.http!==200||!Array.isArray(cats.data)||first.http!==200||!Array.isArray(first.data))throw Error("PSE taxonomy API preflight unavailable");
 const parentCat=cats.data.filter(c=>c.id===1744&&c.slug==="thong-tin-co-dong"&&Number(c.parent)===0);
 if(parentCat.length!==1)throw Error("Parent investor category moved");
 const all=[...first.data],num=Number(first.headers.pages||1);
 if(num>12)throw Error("Investor REST page limit changed");
 for(let k=2;k<=num;k++){
  const r=await api("/wp-json/wp/v2/posts?context=edit&status=publish&categories=1744&per_page=100&page="+k+"&_fields=id,slug,categories");
  if(r.http!==200||!Array.isArray(r.data))throw Error("WordPress post pagination truncated");
  all.push(...r.data);
 }
 const bySlug=new Map();
 for(const post of all){if(bySlug.has(post.slug))throw Error("Ambiguous WP post slug");bySlug.set(post.slug,post)}
 const source=await browser.newPage();
 await source.route(/\.(jpe?g|webp|png|gif|svg|woff2?|ttf)(\?.*)?$/i,route=>route.abort());
 const manifest=[];
 for(const spec of specs){
  const item=menus.data.filter(x=>Number(x.id)===spec.id);
  if(item.length!==1||Number(item[0].parent)!==spec.parent||String(item[0].title?.raw||item[0].title?.rendered||"").trim()!==spec.name)throw Error("Menu identity mismatch "+spec.slug);
  const legacy=new URL(item[0].url);if(legacy.hostname!=="www.pse.vn"||legacy.protocol!=="https:"||legacy.pathname!=="/quan-he-nha-dau-tu/"+(spec.id===77023||spec.id===77024?"tin-tuc-co-dong/":"")+spec.slug+".html")throw Error("Unexpected original category URL "+spec.slug);
  const base=legacy.pathname.replace(/\.html$/,"/"),pending=[legacy.href],visited=new Set(),found=new Map();
  while(pending.length){
   if(visited.size>=75)throw Error("Too many legacy category archive pages "+spec.slug);
   const target=pending.shift();if(visited.has(target))continue;visited.add(target);
   const response=await source.goto(target,{waitUntil:"domcontentloaded",timeout:45000});
   if(response?.status()!==200)throw Error("Legacy category browse failed "+spec.slug);
   const hits=await source.evaluate(({base,listing})=>{
    const root=document.querySelector(".blog");if(!root)throw Error("Missing trusted original category layout");
    const links=[...root.querySelectorAll("a[href]")].map(a=>a.href);
    const items=[],next=[];
    for(const href of links){let u;try{u=new URL(href)}catch{continue};if(u.hostname!=="www.pse.vn"||u.protocol!=="https:")continue;
     if(u.pathname.startsWith(base) && /^\d+-[a-z0-9-]+\.html$/.test(u.pathname.slice(base.length)))items.push(u.pathname);
     if(u.pathname===listing&&u.searchParams.has("start") && /^\d{1,5}$/.test(u.searchParams.get("start")||""))next.push(u.href);
    }
    return{items:[...new Set(items)],next:[...new Set(next)]};
   },{base,listing:legacy.pathname});
   for(const pathname of hits.items){
    const filename=pathname.split("/").at(-1);
    const slug=filename.replace(/^\d+-/,"").replace(/\.html$/,"");
    if(bySlug.has(slug))found.set(slug,{wpId:bySlug.get(slug).id,source:pathname});
   }
   for(const link of hits.next)if(!visited.has(link)&&!pending.includes(link))pending.push(link);
  }
  if(!found.size)throw Error("No verifiable published WP posts mapped to "+spec.slug);
  const existing=cats.data.filter(c=>c.slug===spec.slug);
  if(existing.length>1||(existing.length===1&&(existing[0].name!==spec.name||Number(existing[0].parent)!==1744)))throw Error("Conflicting WordPress investor category "+spec.slug);
  const plan={...spec,originalUrl:legacy.href,oldCategoryId:existing[0]?.id||null,sourcePages:visited.size,matched:[...found.entries()].map(([slug,z])=>({slug,...z}))};
  manifest.push(plan);
  console.log("PSE_INVESTOR_CLASS_PREFLIGHT="+JSON.stringify({slug:spec.slug,sourcePages:visited.size,verifiedWpMatches:plan.matched.length,sample:plan.matched.slice(0,3)}));
 }
 await mkdir("artifacts/pse-investor-classify",{recursive:true});
 await writeFile("artifacts/pse-investor-classify/audit.json",JSON.stringify({mode:authorized?"apply":"audit",beforeCategories:cats.data,plans:manifest},null,2)+"\n");
 if(!authorized){console.log("PSE_INVESTOR_CLASS=DRY_PASS; categories="+manifest.length+"; matches="+manifest.reduce((a,b)=>a+b.matched.length,0)+"; no_wp_write=true");process.exit(0)}
 let created=0,updated=0,menusSaved=0;
 for(const plan of manifest){
  let catId=plan.oldCategoryId;
  if(!catId){
   const r=await api("/wp-json/wp/v2/categories","POST",{name:plan.name,slug:plan.slug,parent:1744});
   if(r.http!==201||r.data.slug!==plan.slug||Number(r.data.parent)!==1744)throw Error("Category create failed "+plan.slug);
   catId=r.data.id;created++;
  }
  const verify=await api("/wp-json/wp/v2/categories/"+catId+"?context=edit&_fields=id,name,slug,parent");
  if(verify.http!==200||verify.data.slug!==plan.slug||Number(verify.data.parent)!==1744)throw Error("WP category readback failed "+plan.slug);
  for(const item of plan.matched){
   const current=await api("/wp-json/wp/v2/posts/"+item.wpId+"?context=edit&_fields=id,slug,status,categories");
   if(current.http!==200||current.data.slug!==item.slug||current.data.status!=="publish"||!current.data.categories?.includes(1744))throw Error("Post identity changed "+item.slug);
   if(current.data.categories.includes(catId))continue;
   const categories=[...new Set([...current.data.categories,catId])];
   const saved=await api("/wp-json/wp/v2/posts/"+item.wpId,"POST",{categories});
   if(saved.http!==200||saved.data?.id!==item.wpId)throw Error("Post tagging failed "+item.slug);
   const check=await api("/wp-json/wp/v2/posts/"+item.wpId+"?context=edit&_fields=id,categories,status");
   if(check.http!==200||!check.data.categories.includes(catId)||!check.data.categories.includes(1744)||check.data.status!=="publish")throw Error("Category assignment failed readback "+item.slug);
   updated++;
  }
  const dest=envFrontend+"/tin-tuc-su-kien/?cat="+plan.slug;
  const m=menus.data.find(x=>x.id===plan.id);
  if(m.url!==dest){
   const r=await api("/wp-json/wp/v2/menu-items/"+plan.id,"POST",{type:"custom",url:dest});
   if(r.http!==200||r.data?.url!==dest)throw Error("Menu link save failed "+plan.slug);
   const check=await api("/wp-json/wp/v2/menu-items/"+plan.id+"?context=edit");if(check.http!==200||check.data.url!==dest)throw Error("Menu readback failed "+plan.slug);
   menusSaved++;
  }
  console.log("PSE_INVESTOR_CLASS_APPLY="+JSON.stringify({slug:plan.slug,catId,posts:plan.matched.length,verified:true}));
 }
 console.log("PSE_INVESTOR_CLASS=PASS; categoriesCreated="+created+"; postAssignments="+updated+"; menusUpdated="+menusSaved+"; all_source_verified=true; no_build=true");
}finally{await browser.close()}
