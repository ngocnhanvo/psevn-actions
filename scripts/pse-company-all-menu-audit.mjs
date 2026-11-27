/** Inspect PSE parent-only Tin Cong Ty taxonomy, WordPress Header order, and latest original headlines. READ ONLY. */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
if((await readFile(".pse-company-all-menu-request","utf8")).trim()!=="MODE=AUDIT") throw Error("Only read-only audit supported");
const ev=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
if(String(ev.head_commit?.message||"").split("\n")[0]!=="audit(pse): inspect company category and native menu") throw Error("Invalid audit marker");
const settings=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const origin=name=>{
 const val=settings.filter(x=>x.startsWith(name+"="));
 if(val.length!==1)throw Error("Missing "+name);
 const u=new URL(val[0].slice(name.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||!u.hostname||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid "+name);
 return u.origin;
};
const wp=origin("WC_URL"),site=origin("WC_URL_CLIENT");
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1400,height:900}});
const normalize=x=>String(x||"").normalize("NFC").trim().toLocaleLowerCase("vi").replace(/\s+/g," ");
const flatten=(a,p=0)=>a.flatMap(x=>[{...x,parentID:p},...flatten(x.children||[],Number(x.id))]);
const report={date:new Date().toISOString(),readonly:true};
try{
 await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const body=await page.locator("body").innerText();
  const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error("WP challenge input unavailable");
   await field.fill(String(n));
  }
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WP login failed");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("WP REST nonce unavailable");return(await r.text()).trim();
 });
 const api=async path=>page.evaluate(async({path,nonce})=>{
  const r=await fetch(path,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,"Cache-Control":"no-cache",Accept:"application/json"},cache:"no-store"});
  return {http:r.status,total:Number(r.headers.get("X-WP-Total")||0),pages:Number(r.headers.get("X-WP-TotalPages")||1),data:await r.json().catch(()=>null)};
 },{path,nonce});
 const [menu,categories,archive,native]=await Promise.all([
  api("/wp-json/esc-api/v1/menus?_esc_preview="+Date.now()),
  api("/wp-json/wp/v2/categories?hide_empty=false&per_page=100&_fields=id,slug,parent,count,name"),
  api("/wp-json/wp/v2/pages/77030?context=edit&_fields=id,slug,status,acf"),
  api("/wp-json/wp/v2/menu-items?context=edit&per_page=100&_fields=id,parent,menus,type,url,menu_order,title")
 ]);
 if(menu.http!==200||menu.data?.success!==true||categories.http!==200||!Array.isArray(categories.data)||categories.pages!==1||
   archive.http!==200||archive.data?.acf?.key!=="ssr-posts"||archive.data?.status!=="publish"||
   native.http!==200||!Array.isArray(native.data)||native.pages!==1)throw Error("Native CMS source check failed "+JSON.stringify({menu:menu.http,categories:categories.http,archive:archive.http,native:native.http}));
 const header=menu.data.menus?.Header?.vi;
 if(!header?.id||!Array.isArray(header.items))throw Error("Header/vi missing");
 const roots=header.items.filter(x=>/tin tức/i.test(normalize(x.label)));
 if(roots.length!==1)throw Error("News root ambiguous");
 const companies=(roots[0].children||[]).filter(x=>normalize(x.label)==="tin công ty");
 if(companies.length!==1)throw Error("Tin Cong Ty child ambiguous");
 const company=companies[0],all=(company.children||[]).filter(x=>normalize(x.label)==="tất cả");
 if(all.length>1)throw Error("Duplicate native all items");
 const categoriesBySlug=categories.data.filter(x=>x.slug==="tin-cong-ty");
 if(categoriesBySlug.length!==1)throw Error("WordPress tin-cong-ty category not unique");
 const category=categoriesBySlug[0],desc=[],visited=new Set([Number(category.id)]);
 let frontier=new Set(visited);
 while(frontier.size){const next=new Set();
  for(const c of categories.data){const id=Number(c.id);if(frontier.has(Number(c.parent))&&!visited.has(id)){desc.push(id);next.add(id);visited.add(id)}}
  frontier=next;
 }
 const excluded=desc.sort((a,b)=>a-b).join(",");
 const parentUrl="/wp-json/wp/v2/posts?status=publish&per_page=12&categories="+category.id+"&_fields=id,slug,title,categories,date";
 const [allPosts,direct,search1,search2,search3,route]=await Promise.all([
  api(parentUrl),
  api(parentUrl+(excluded?"&categories_exclude="+excluded:"")),
  api("/wp-json/wp/v2/posts?status=publish&search="+encodeURIComponent("Phú Mỹ Đông Nam Bộ tổ chức Lễ công bố")+"&per_page=10&_fields=id,slug,title,categories,date"),
  api("/wp-json/wp/v2/posts?status=publish&search="+encodeURIComponent("MỘT NGÀY THỨ BẢY ĐẦY Ý NGHĨA")+"&per_page=10&_fields=id,slug,title,categories,date"),
  api("/wp-json/wp/v2/posts?status=publish&search="+encodeURIComponent("Pickleball PSE Open 2026")+"&per_page=10&_fields=id,slug,title,categories,date"),
  page.request.get(site+"/"+archive.data.slug+"/tin-cong-ty",{timeout:60000,failOnStatusCode:false}).then(r=>({http:r.status()})).catch(e=>({http:0,error:String(e).slice(0,120)}))
 ]);
 for(const [name,r] of [["allPosts",allPosts],["direct",direct],["search1",search1],["search2",search2],["search3",search3]]){
  if(r.http!==200||!Array.isArray(r.data))throw Error(name+" WP query failed "+r.http);
 }
 const nativeMap=new Map(native.data.map(x=>[Number(x.id),x]));
 report.menu={menuId:header.id,totalItems:flatten(header.items).length,newsId:roots[0].id,companyId:company.id,
  children:(company.children||[]).map(x=>({id:x.id,label:x.label,href:x.href,linkMode:x.linkMode,menu_order:nativeMap.get(Number(x.id))?.menu_order})),
  all:all.map(x=>({id:x.id,href:x.href,label:x.label,linkMode:x.linkMode})),companyHref:company.href,showViewAll:company.showViewAll};
 report.taxonomy={category,descendantIds:desc,allAssigned:allPosts.total,allPages:allPosts.pages,
  directCount:direct.total,directPages:direct.pages,directFirst12:direct.data.map(x=>({id:x.id,title:x.title?.rendered,slug:x.slug,date:x.date,categories:x.categories})),
  pageId:archive.data.id,archiveRoot:archive.data.slug,publicRoute:site+"/"+archive.data.slug+"/tin-cong-ty",publicStatus:route};
 report.latest=[
  {source:"Phú Mỹ Đông Nam Bộ tổ chức Lễ công bố và trao quyết định về công tác cán bộ",count:search1.total,items:search1.data.map(x=>({id:x.id,title:x.title?.rendered,slug:x.slug,categories:x.categories}))},
  {source:"PHÚ MỸ ĐÔNG NAM BỘ: MỘT NGÀY THỨ BẢY ĐẦY Ý NGHĨA",count:search2.total,items:search2.data.map(x=>({id:x.id,title:x.title?.rendered,slug:x.slug,categories:x.categories}))},
  {source:"PVFCCo-PSE tổ chức thành công Giải Pickleball PSE Open 2026",count:search3.total,items:search3.data.map(x=>({id:x.id,title:x.title?.rendered,slug:x.slug,categories:x.categories}))}
 ];
 console.log("PSE_COMPANY_NEWS_AUDIT="+JSON.stringify(report).slice(0,26000));
 console.log("PSE_COMPANY_NEWS_READONLY=PASS");
}finally{
 await mkdir("artifacts/pse-company-news",{recursive:true});
 await writeFile("artifacts/pse-company-news/audit.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
