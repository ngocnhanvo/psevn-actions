/** WordPress-owned PSE Post category SSR paths, reusing native Routing Manager.
 * Audit by default; writes only on owner-request marker, no Astro build.
 */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const msg=String(event.head_commit?.message||"").split("\n")[0];
const apply=msg==="cms(pse): create WordPress news category SSR routes";
const audit=msg==="audit(pse): WordPress news category SSR route readiness" || !apply;
const lines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const configured=lines.filter(x=>x.startsWith("WC_URL="));
if(configured.length!==1)throw Error("Expected exactly one WP origin");
const parsed=new URL(configured[0].slice(7).replace(/^['"]|['"]$/g,""));
if(parsed.protocol!=="https:"||parsed.username||parsed.password||parsed.search||parsed.hash||!["","/"].includes(parsed.pathname))throw Error("Invalid WP origin");
const wp=parsed.origin;
const rules=[
  {key:"news-taxonomy",title:"PSE: Tin tức - danh mục WordPress SSR",
    from:"^/([^/]+)/([a-z][a-z0-9-]+)/?$",
    to:"/ssr/posts/$1/null?catSlug=$2",priority:390,
    conditions:[{type:"page_key",capture:1,value:"ssr-posts"}]},
  {key:"news-taxonomy-page",title:"PSE: Tin tức - trang danh mục WordPress SSR",
    from:"^/([^/]+)/([a-z][a-z0-9-]+)/([0-9]+)/?$",
    to:"/ssr/posts/$1/$3?catSlug=$2",priority:390,
    conditions:[{type:"page_key",capture:1,value:"ssr-posts"}]},
];
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:950}});
const report={mode:apply?"apply":"audit",created:[],verified:[],requested:rules.map(x=>x.key)};
try{
 await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=await page.locator("body").innerText();
  const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
    const a=+m[1],b=+m[3];
    const n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
    const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
    if(!await f.count())throw Error("WordPress login challenge missing");
    await f.fill(String(n));
  }
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login.php"))throw Error("WP admin auth failed");
 const nonce=await page.evaluate(async()=>{
   if(globalThis.wpApiSettings?.nonce)return globalThis.wpApiSettings.nonce;
   const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
   if(!r.ok)throw Error("REST nonce failed");
   return(await r.text()).trim();
 });
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error("Invalid WP REST nonce");
 const api=async(path,method="GET",body)=>page.evaluate(async({path,method,body,nonce})=>{
   const r=await fetch(path,{credentials:"same-origin",method,headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
   return{status:r.status,totalPages:Number(r.headers.get("X-WP-TotalPages")||1),data:await r.json().catch(()=>null)};
 },{path,method,body,nonce});
 const archive=await api("/wp-json/wp/v2/pages/77030?context=edit&_fields=id,slug,status,acf");
 if(archive.status!==200||archive.data?.id!==77030||archive.data.status!=="publish"||
   archive.data.slug!=="tin-tuc-su-kien"||archive.data.acf?.key!=="ssr-posts"||
   archive.data.acf?.action!=="PostsPage") throw Error("WordPress native PSE news Page checkpoint drifted");
 const wpCategories=await api("/wp-json/wp/v2/categories?per_page=100&hide_empty=false&_fields=id,slug,name,parent");
 if(wpCategories.status!==200||!Array.isArray(wpCategories.data)||!
   ["tin-cong-ty","tin-tong-hop","thu-vien"].every(slug=>wpCategories.data.some(c=>c.slug===slug)))
   throw Error("WordPress native news categories missing");
 const listing=await api("/wp-json/wp/v2/chuyen-huong-link?context=edit&status=any&per_page=100&page=1&_fields=id,status,acf,route_priority,route_conditions");
 if(listing.status!==200||!Array.isArray(listing.data)||listing.totalPages>20)
   throw Error("WordPress routing registry inaccessible");
 const stored=[...listing.data];
 for(let p=2;p<=listing.totalPages;p++){
  const next=await api("/wp-json/wp/v2/chuyen-huong-link?context=edit&status=any&per_page=100&page="+p+"&_fields=id,status,acf,route_priority,route_conditions");
  if(next.status!==200||!Array.isArray(next.data))throw Error("WordPress route registry pagination mismatch");
  stored.push(...next.data);
 }
 const exact=rules.map(rule=>{
  const present=stored.filter(x=>x.acf?.from_link===rule.from);
  if(present.length>1)throw Error("Duplicate native route "+rule.key);
  if(present.length){
   const item=present[0];
   if(item.acf?.to_link!==rule.to||item.acf?.match_type!=="Regex"||
      String(item.acf?.type).toLowerCase()!=="rewrite"||item.acf?.enable!==true)
      throw Error("WordPress source route conflict "+rule.key);
  }
  return {rule,found:present[0]||null};
 });
 // A lower-priority number is considered first. The new page_key condition
 // restricts these generic expressions to the native news archive Page only.
 const generic=stored.filter(x=>x.status==="publish"&&
    x.acf?.from_link==="^/([^/]+)/(.+)$");
 console.log("PSE_NEWS_CATEGORY_ROUTE_PREFLIGHT="+JSON.stringify({
   page:archive.data.id,categoryCount:wpCategories.data.length,routeCount:stored.length,
   generic:generic.map(x=>({id:x.id,priority:x.route_priority})),
   missing:exact.filter(x=>!x.found).map(x=>x.rule.key),
   audit:!apply
 }));
 if(!apply){console.log("PSE_NEWS_CATEGORY_SSR_RULES=DRY_PASS; writes=0; noBuild=true");process.exit(0)}
 await mkdir("artifacts/pse-news-category",{recursive:true});
 await writeFile("artifacts/pse-news-category/route-backup.json",JSON.stringify({before:exact.map(x=>x.found).filter(Boolean),rules,created:[]},null,2)+"\n");
 for(const {rule,found} of exact){
  if(found&&found.status==="publish"&&found.route_priority===rule.priority&&
    JSON.stringify(found.route_conditions||[])===JSON.stringify(rule.conditions)){
   report.verified.push({key:rule.key,id:found.id,already:true});continue;
  }
  let record=found;
  if(!record){
   const created=await api("/wp-json/wp/v2/chuyen-huong-link","POST",{
    title:rule.title,status:"draft",
    acf:{from_link:rule.from,to_link:rule.to,type:"Rewrite",match_type:"Regex",enable:true}
   });
   if(created.status!==201||!Number.isSafeInteger(Number(created.data?.id)))
    throw Error("WordPress route creation failed "+rule.key+" HTTP "+created.status);
   record=created.data;
   report.created.push({id:record.id,key:rule.key});
   await writeFile("artifacts/pse-news-category/route-backup.json",JSON.stringify({rules,created:report.created},null,2)+"\n");
  }
  const editor=await page.goto(wp+"/wp-admin/post.php?post="+record.id+"&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
  if(editor?.status()!==200||await page.locator("#publish").count()!==1||
     await page.locator('form#post input[name="esc_route_priority"]').count()!==1)
    throw Error("Native WordPress route editor unavailable "+rule.key);
  await page.locator('input[name="esc_route_priority"]').fill(String(rule.priority));
  const rows=page.locator("#esc-route-condition-rows tr");
  while(await rows.count()>0)await rows.last().locator(".esc-route-remove-condition").click();
  for(const condition of rule.conditions){
   await page.locator("#esc-route-add-condition").click();
   const row=rows.last();
   await row.locator('select[name="esc_route_condition_type[]"]').selectOption(condition.type);
   await row.locator('input[name="esc_route_condition_capture[]"]').fill(String(condition.capture));
   await row.locator('input[name="esc_route_condition_value[]"]').fill(condition.value);
  }
  const form=await page.locator("form#post").evaluate(form=>({
    action:new URL(form.getAttribute("action")||"",location.href).pathname,
    method:form.method.toLowerCase(),
    id:Number(form.querySelector('input[name="post_ID"]')?.value),
    hasNonce:!!form.querySelector('input[name="_wpnonce"]')?.value,
    hasRouteNonce:!!form.querySelector('input[name="esc_url_routing_conditions_nonce"]')?.value,
    saveAction:form.querySelector('input[name="action"]')?.value
  }));
  if(form.action!=="/wp-admin/post.php"||form.method!=="post"||
     form.id!==record.id||!form.hasNonce||!form.hasRouteNonce||form.saveAction!=="editpost")
    throw Error("Native WP post form validation failed "+rule.key);
  await Promise.all([
    page.waitForNavigation({waitUntil:"domcontentloaded",timeout:60000}),
    page.locator("form#post").evaluate(form=>HTMLFormElement.prototype.submit.call(form)),
  ]);
  const saved=await api("/wp-json/wp/v2/chuyen-huong-link/"+record.id+"?context=edit&_fields=id,status,acf,route_priority,route_conditions");
  if(saved.status!==200||saved.data?.route_priority!==rule.priority||
     JSON.stringify(saved.data?.route_conditions||[])!==JSON.stringify(rule.conditions)||
     saved.data.acf?.from_link!==rule.from||saved.data.acf?.to_link!==rule.to)
    throw Error("WordPress SSR route readback failed "+rule.key);
  if(saved.data.status!=="publish"){
    const published=await api("/wp-json/wp/v2/chuyen-huong-link/"+record.id,"POST",{status:"publish"});
    if(published.status!==200||published.data?.status!=="publish")
      throw Error("Cannot publish news category SSR route "+rule.key);
  }
  report.verified.push({key:rule.key,id:record.id,priority:rule.priority});
  console.log("PSE_NEWS_CATEGORY_ROUTE_SAVED="+JSON.stringify(report.verified.at(-1)));
 }
 console.log("PSE_NEWS_CATEGORY_SSR_RULES=PASS; verified="+report.verified.length+"; writes="+report.created.length+"; wpManaged=true; noBuild=true");
}finally{await browser.close();}
