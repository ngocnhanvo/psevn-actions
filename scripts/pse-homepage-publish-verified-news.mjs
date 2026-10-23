// Owner-requested homepage news visibility. Source/date/media preflight PASS #39959890753; publish only verified legacy posts.
/** Publish only 3 previously verified PUBLIC articles already on legacy pse.vn.
 * Check all source metadata, category bindings and WordPress media before ANY
 * mutation; use WordPress core post REST with authenticated nonce.
 */
import {chromium} from "playwright";
const audit=process.env.PSE_NEWS_AUDIT_ONLY==="1";
const resync=process.env.PSE_NEWS_RESYNC_ONLY==="1";
const pendingAudit=process.env.PSE_NEWS_PENDING_AUDIT_ONLY==="1";
const cfg=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,"")).filter(s=>s.startsWith("WC_URL="));
if(cfg.length!==1)throw Error("Missing WordPress WC_URL");
const u=new URL(cfg[0].slice(7).trim().replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Unsafe CMS origin");
const origin=u.origin;
const specs=[
 {id:76975,category:1742,slug:"pvfcco-pse-to-chuc-thanh-cong-giai-pickleball-pse-open-2026",date:"2026-07-28T02:38:45",gmt:"2026-07-27T19:38:45",images:9,documents:0},
 {id:76976,category:1743,slug:"diem-tin-nganh-nong-nghiep-tren-cac-bao-ra-ngay-1462013",date:"2013-06-17T08:12:14",gmt:"2013-06-17T01:12:14",images:0,documents:0},
 {id:76977,category:1744,slug:"20261019-cbtt-bao-cao-tai-chinh-q3-2026",date:"2026-10-19T15:04:22",gmt:"2026-10-19T08:04:22",images:0,documents:2}
];
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1366,height:900}});
const page=await context.newPage();
try{
 if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("WP credentials missing");
 await page.goto(origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const t=await page.locator("body").innerText();
  const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error("Cannot locate WordPress math login field");
   await f.fill(String(n));
  }
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WordPress login failed");
 await page.goto(origin+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 const nonce=await page.evaluate(()=>window.wpApiSettings?.nonce||"");
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("WordPress core editor REST nonce missing");
 const request=(uri,method="GET",data)=>page.evaluate(async({uri,method,data,nonce})=>{
   const r=await fetch(uri,{method,credentials:"same-origin",headers:{Accept:"application/json",
     "X-WP-Nonce":nonce,...(data?{"Content-Type":"application/json"}:{})},
     ...(data?{body:JSON.stringify(data)}:{})});
   return {status:r.status,data:await r.json().catch(()=>null)};
 },{uri,method,data,nonce});
 const table=await request("/wp-json/tablepress/v1/table/pse_01_vi");
 if(table.status!==200||table.data?.id!=="pse_01_vi"||table.data?.items?.length!==3||
   !table.data.items.every((x,i)=>Number(x.categoryId)===specs[i].category))
  throw Error("CMS news ESC Table categories do not match previously verified IDs");
 const checked=[];
 for(const spec of specs){
  const r=await request("/wp-json/wp/v2/posts/"+spec.id+"?context=edit&_fields=id,status,slug,lang,date,date_gmt,categories,title,content,featured_media");
  const p=r.data;
  if(r.status!==200||p?.id!==spec.id||!["draft","publish"].includes(p.status)||
    p.slug!==spec.slug||!p.categories?.includes(spec.category)||
    p.date!==spec.date||p.date_gmt!==spec.gmt)throw Error("WordPress post metadata changed: "+spec.id);
  if(!String(p.title?.raw||p.title?.rendered||"").trim()||
    String(p.content?.raw||"").length<220)throw Error("Post body/title incomplete: "+spec.id);
  const images=await page.evaluate(html=>[...new DOMParser().parseFromString(html,"text/html").querySelectorAll("img[src]")]
    .map(x=>x.getAttribute("src")),String(p.content.raw));
  const docs=await page.evaluate(html=>[...new DOMParser().parseFromString(html,"text/html").querySelectorAll('a[href$=".pdf"],a[href*=".pdf?"]')]
    .map(x=>x.getAttribute("href")),String(p.content.raw));
  const mediaHost=new URL(origin).hostname;
  for(const asset of [...images,...docs]){
   const target=new URL(asset,origin);
   if(target.protocol!=="https:"||target.hostname!==mediaHost||!target.pathname.includes("/wp-content/uploads/"))
    throw Error("Post references unmigrated media: "+spec.id);
  }
  if(images.length!==spec.images||new Set(docs).size!==spec.documents)
   throw Error("Post media count changed: "+spec.id+" images="+images.length+" pdf="+docs.length);
  if(spec.id===76975&&!(p.featured_media>0))throw Error("Verified PSE Open featured image missing");
  checked.push({...spec,status:p.status});
  console.log("PSE_NEWS_PUBLISH_PREFLIGHT=PASS; post="+spec.id+"; category="+spec.category+
    "; status="+p.status+"; images="+images.length+"; pdfs="+new Set(docs).size+"; source_date=verified");
 }
 if(audit){
  console.log("PSE_NEWS_PUBLICATION_AUDIT=PASS; eligible="+checked.filter(x=>x.status==="draft").length+
    "; already_published="+checked.filter(x=>x.status==="publish").length+"; no_writes=true");
  process.exit(0);
 }
 if(pendingAudit){
   await page.goto(origin+"/wp-admin/admin.php?page=vcs-build-trigger",{waitUntil:"domcontentloaded",timeout:60000});
   const p=page.locator("#vcs-pending-count");
   await p.waitFor({state:"visible",timeout:16000});
   const count=Number((await p.innerText()).trim());
   console.log("PSE_WP_REAL_PENDING_AUDIT="+JSON.stringify({count,valid:Number.isSafeInteger(count),readOnly:true}));
   process.exit(0);
 }
 if(resync){
  if(checked.some(x=>x.status!=="publish"))throw Error("Do not sync publication events for unpublished post");
  await page.goto(origin+"/wp-admin/admin.php?page=vcs-build-trigger",{waitUntil:"domcontentloaded",timeout:60000});
  if(page.url().includes("wp-login"))throw Error("WordPress build admin login expired");
  const pending=async()=>{
    const el=page.locator("#vcs-pending-count");
    await el.waitFor({state:"attached",timeout:12000});
    const count=Number((await el.innerText()).trim());
    if(!Number.isSafeInteger(count)||count<0)throw Error("Invalid WordPress pending counter");
    return count;
  };
  const before=await pending();
  console.log("PSE_WP_POST_SYNC_PENDING_BEFORE="+before);
  if(before===0){
    for(const item of checked){
      // This invokes core wp_update_post -> save_post for a genuine missed
      // publication event. Reuse exactly the already verified date/status.
      const r=await request("/wp-json/wp/v2/posts/"+item.id,"POST",
        {status:"publish",date:item.date,date_gmt:item.gmt});
      if(r.status!==200||r.data?.status!=="publish")throw Error("WordPress resave failed "+item.id);
      const q=await request("/wp-json/wp/v2/posts/"+item.id+
        "?context=edit&_fields=id,status,slug,date,date_gmt,categories");
      if(q.status!==200||q.data?.status!=="publish"||q.data.slug!==item.slug||
        q.data.date!==item.date||q.data.date_gmt!==item.gmt||
        !q.data.categories?.includes(item.category))throw Error("WordPress resave altered verified post "+item.id);
      console.log("PSE_POST_CHANGE_EVENT_RESAVE=PASS; id="+item.id);
    }
  }
  await page.reload({waitUntil:"domcontentloaded",timeout:60000});
  const after=await pending();
  console.log("PSE_WP_POST_SYNC_PENDING_AFTER="+after);
  if(after<3)throw Error("WordPress post-change queue failed to include three source posts");
  console.log("PSE_POST_CHANGE_EVENTS=PASS; pending_before="+before+"; pending_after="+after+
    "; posts_verified=3; queued_normal_build=true; no_force=true");
  process.exit(0);
 }
 let changed=0;
 for(const item of checked){
  if(item.status==="publish"){console.log("PSE_NEWS_POST=ALREADY_PUBLISHED; id="+item.id);continue}
  const r=await request("/wp-json/wp/v2/posts/"+item.id,"POST",
   {status:"publish",date:item.date,date_gmt:item.gmt});
  if(r.status!==200||r.data?.id!==item.id||r.data.status!=="publish")
   throw Error("WordPress refused publication of verified post "+item.id+" HTTP "+r.status);
  changed++;
  const q=await request("/wp-json/wp/v2/posts/"+item.id+"?context=edit&_fields=id,status,slug,date,date_gmt,categories");
  if(q.status!==200||q.data?.status!=="publish"||q.data.slug!==item.slug||
    q.data.date!==item.date||q.data.date_gmt!==item.gmt||
    !q.data.categories?.includes(item.category))throw Error("Post read-after-write differs "+item.id);
  console.log("PSE_NEWS_POST_PUBLISH=PASS; id="+item.id+"; source_date_preserved=true");
 }
 for(const item of checked){
  const result=await request("/wp-json/wp/v2/posts?categories="+item.category+
    "&status=publish&lang=vi&per_page=5&_fields=id,slug,categories,status");
  if(result.status!==200||!Array.isArray(result.data)||!result.data.some(x=>x.id===item.id)){
   throw Error("Astro getPosts category/lang REST cannot see published news id="+item.id+
     " HTTP "+result.status);
  }
  console.log("PSE_NEWS_LANE_API=PASS; category="+item.category+"; verified_post="+item.id);
 }
 console.log("PSE_THREE_REAL_NEWS_LANES=PASS; public_posts=3; changed="+changed+
  "; content_and_dates_verified=true; requires_normal_wordpress_build="+(changed>0));
}finally{await browser.close()}
