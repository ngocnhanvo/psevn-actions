/** Original Joomla news menu -> native WordPress taxonomy, idempotent.
 * By default READ ONLY. Apply only on exact reviewed GitHub commit message.
 * Never modify existing taxonomy, articles, menu, Pages, Redirects or Astro build.
 * Preflight audit PASS #40069609241: seven missing categories, zero conflicts.
 */
import {chromium} from "playwright";
import {readFile,writeFile,mkdir} from "node:fs/promises";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const apply=event?.head_commit?.message==="cms(pse): create verified hierarchical news categories";
const rows=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,"")).filter(s=>s.startsWith("WC_URL="));
if(rows.length!==1)throw Error("Missing or ambiguous PSE WordPress origin");
const base=new URL(rows[0].slice(7).replace(/^['"]|['"]$/g,""));
if(base.protocol!=="https:"||!base.hostname||base.username||base.password||
   !["","/"].includes(base.pathname)||base.search||base.hash)throw Error("Invalid PSE WP origin");
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:900}});
const page=await context.newPage();
const manifest={mode:apply?"apply":"audit",before:[],proposed:[],created:[]};
try{
 if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("Missing PSE admin credentials");
 await page.goto(base.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const m=(await page.locator("body").innerText()).match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i);
  if(m){
   const a=Number(m[1]),b=Number(m[3]);
   const n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error("WP math challenge field missing");
   await f.fill(String(n));
  }
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("PSE WordPress login failed");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("WP nonce failed");
  const n=(await r.text()).trim();
  if(!/^[a-zA-Z0-9]{8,24}$/.test(n)||n==="0")throw Error("Bad REST nonce");
  return n;
 });
 const api=async(route,method="GET",body)=>page.evaluate(async({route,method,body,nonce})=>{
  const r=await fetch(route,{method,credentials:"same-origin",headers:{
   Accept:"application/json","X-WP-Nonce":nonce,...(body?{"Content-Type":"application/json"}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  return{status:r.status,data:await r.json().catch(()=>({}))};
 },{route,method,body,nonce});
 const menu=await api("/wp-json/wp/v2/menu-items?context=edit&per_page=100");
 if(menu.status!==200||!Array.isArray(menu.data))throw Error("Cannot read Joomla-sourced PSE menu");
 const nodes=menu.data.map(x=>({...x,label:String(x.title?.raw||x.title?.rendered||"").replace(/\s+/g," ").trim()}));
 const child=id=>nodes.filter(x=>Number(x.parent)===Number(id));
 const unique=(items,label)=>{const found=items.filter(x=>x.label===label);if(found.length!==1)throw Error("Missing/duplicate menu "+label);return found[0]};
 const top=unique(nodes.filter(x=>!x.parent),"TIN TỨC - SỰ KIỆN");
 const company=unique(child(top.id),"Tin Công ty");
 const library=unique(child(top.id),"Thư viện");
 if(child(top.id).length!==2||child(company.id).length!==4||child(library.id).length!==2)
   throw Error("Joomla news menu hierarchy diverged");
 const taxonomy=await api("/wp-json/wp/v2/categories?context=edit&hide_empty=false&per_page=100&_fields=id,slug,name,parent,count");
 if(taxonomy.status!==200||!Array.isArray(taxonomy.data))throw Error("Cannot inspect WordPress categories");
 const existing=taxonomy.data;
 manifest.before=existing.map(x=>({id:x.id,slug:x.slug,name:x.name,parent:x.parent,count:x.count}));
 const get=slug=>existing.filter(x=>x.slug===slug);
 const companyCat=get("tin-cong-ty");
 if(companyCat.length!==1||Number(companyCat[0].parent)!==0)
   throw Error("Existing company category identity changed");
 const list=[
  {slug:"thu-vien",name:"Thư viện",parentSlug:null},
  ...child(company.id).map(x=>({url:x.url,name:x.label,parentSlug:"tin-cong-ty"})),
  ...child(library.id).map(x=>({url:x.url,name:x.label,parentSlug:"thu-vien"})),
 ];
 if(list.length!==7)throw Error("Unexpected category count");
 for(const spec of list){
  if(!spec.slug){
   const url=new URL(spec.url);
   if(url.protocol!=="https:"||url.hostname!=="www.pse.vn"||
      !url.pathname.startsWith("/tin-tuc-su-kien/")||!url.pathname.endsWith(".html"))
     throw Error("Unverified original Joomla URL for "+spec.name);
   spec.slug=url.pathname.split("/").at(-1).replace(/\.html$/,"");
  }
  if(!/^[a-z0-9-]+$/.test(spec.slug))throw Error("Unsafe category slug "+spec.slug);
  const parent=spec.parentSlug==="tin-cong-ty"?companyCat[0]:get(spec.parentSlug||"")[0];
  if(spec.parentSlug&&!parent&&apply)throw Error("Category parent missing "+spec.parentSlug);
  const matches=get(spec.slug);
  if(matches.length>1)throw Error("Ambiguous existing WP category "+spec.slug);
  if(matches.length){
   if(matches[0].name!==spec.name||(parent&&Number(matches[0].parent)!==Number(parent.id)))
     throw Error("Do not overwrite conflicting existing category "+spec.slug);
   manifest.proposed.push({slug:spec.slug,action:"already-exists",id:matches[0].id});
   continue;
  }
  manifest.proposed.push({slug:spec.slug,name:spec.name,parentSlug:spec.parentSlug||null,action:"create"});
  if(!apply)continue;
  const write=await api("/wp-json/wp/v2/categories","POST",{name:spec.name,slug:spec.slug,parent:Number(parent?.id||0)});
  if(write.status!==201||write.data.slug!==spec.slug||!Number.isSafeInteger(Number(write.data.id)))
    throw Error("WP category create failed "+spec.slug+" HTTP "+write.status);
  const verify=await api("/wp-json/wp/v2/categories/"+write.data.id+"?context=edit&_fields=id,slug,name,parent,count");
  if(verify.status!==200||verify.data.name!==spec.name||verify.data.slug!==spec.slug||
     Number(verify.data.parent)!==Number(parent?.id||0))throw Error("WP category readback mismatch "+spec.slug);
  existing.push(verify.data);
  manifest.created.push({slug:spec.slug,id:verify.data.id,parent:verify.data.parent});
  console.log("PSE_NEWS_TAXONOMY_CREATED="+JSON.stringify(manifest.created.at(-1)));
 }
 console.log("PSE_NEWS_TAXONOMY_SUMMARY="+JSON.stringify({
  mode:manifest.mode,total:7,created:manifest.created.length,
  alreadyExists:manifest.proposed.filter(x=>x.action==="already-exists").length,
  noPostsEdited:true,noMenuEdited:true,noPagePublished:true,noAstroBuild:true
 }));
}finally{
 await mkdir("artifacts",{recursive:true});
 await writeFile("artifacts/pse-news-taxonomy.json",JSON.stringify(manifest,null,2)+"\n");
 await browser.close();
}
