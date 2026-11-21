/** PSE native SOP WP-ID route suffix; old source has NO Joomla detail id. No Astro router changes. */
import {chromium} from "playwright";
import {readFile,writeFile,mkdir} from "node:fs/promises";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const message=String(event.head_commit?.message||"").split("\n")[0];
const dryMessage="audit(pse): SOP native numeric detail route preflight";
const applyMessage="cms(pse): fix SOP Product native numeric detail slug";
if(![dryMessage,applyMessage].includes(message)||process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")
 throw Error("SOP slug action or owner mismatch");
const apply=message===applyMessage;
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,"")).filter(x=>x.startsWith("WC_URL="));
if(vars.length!==1)throw Error("Cannot identify unique PSE WordPress origin");
const url=new URL(vars[0].slice(7).replace(/^['"]|['"]$/g,""));
if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||url.port||!["","/"].includes(url.pathname))
 throw Error("Refusing unexpected WP origin");
const wp=url.origin;
const expected={id:82837,title:"Kali Phú Mỹ (SOP)",oldSlug:"kali-phu-my-sop",category:1762,featuredMedia:82836};
const nextSlug=expected.oldSlug+"-"+expected.id;
const norm=s=>String(s||"").replace(/<[^>]+>/g,"").normalize("NFC").replace(/\s+/g," ").trim();
const report={schema:"pse-sop-native-detail-slug-v1",mode:apply?"apply":"dry",
  oldSlug:expected.oldSlug,newSlug:nextSlug,productId:expected.id,before:null,after:null,route:null,issues:[]};
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
try{
 if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("WP Admin auth unavailable");
 await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const loginText=(await page.locator("#loginform").innerText()).slice(0,650);
  const m=loginText.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){
   const a=+m[1],b=+m[3],answer=m[2]==="+"?a+b:m[2]==="-"?a-b:a*b;
   const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error("WP login math challenge missing");
   await field.fill(String(answer));
  }
  await page.locator("#wp-submit").click();
 }
 await page.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 if(page.url().includes("wp-login")||!await page.locator("#adminmenu").count())throw Error("WP Admin session unavailable, no writes");
 const nonce=await page.evaluate(async()=>window.wpApiSettings?.nonce||
  await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"}).then(r=>r.text()));
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error("WP REST nonce invalid");
 const api=(path,method="GET",data)=>page.evaluate(async({path,method,data,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",
   headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(data?{"Content-Type":"application/json"}:{})},
   ...(data?{body:JSON.stringify(data)}:{})});
  return{http:r.status,pages:Number(r.headers.get("X-WP-TotalPages")||1),data:await r.json().catch(()=>null)};
 },{path,method,data,nonce});
 const [p,products,routes,media]=await Promise.all([
  api("/wp-json/wp/v2/product/"+expected.id+"?context=edit&_fields=id,slug,title,status,date,excerpt,content,product_cat,featured_media"),
  api("/wp-json/wp/v2/product?context=edit&status=publish,draft,private&per_page=100&_fields=id,slug,status"),
  api("/wp-json/wp/v2/chuyen-huong-link?context=edit&status=any&per_page=100&_fields=id,acf,status,route_priority"),
  api("/wp-json/wp/v2/media/"+expected.featuredMedia+"?context=edit&_fields=id,slug,mime_type")
 ]);
 if(p.http!==200||products.http!==200||routes.http!==200||media.http!==200||
  !Array.isArray(products.data)||!Array.isArray(routes.data))throw Error("WP product/registry readback failed");
 const product=p.data;
 if(product?.id!==expected.id||norm(product.title?.raw||product.title?.rendered)!==expected.title||
  ![expected.oldSlug,nextSlug].includes(product.slug)||product.status!=="publish"||
  !product.product_cat?.includes(expected.category)||product.featured_media!==expected.featuredMedia||
  !String(product.content?.raw||"").includes("50%")||
  !String(product.excerpt?.raw||"").includes("17%")||
  media.data?.mime_type!=="image/png"||!String(media.data.slug).includes("pse-fertilizer-sop-3fe372fc1425"))
  throw Error("SOP original Product/Media identity and contents changed; refusing slug edit");
 if(products.data.some(x=>x.id!==expected.id&&x.slug===nextSlug))
  throw Error("Target WordPress Product slug collision");
 const allRoutes=[...routes.data];
 if(!Number.isInteger(routes.pages)||routes.pages<1||routes.pages>20)throw Error("Unbounded WordPress routing registry");
 for(let pageNo=2;pageNo<=routes.pages;pageNo++){
  const page2=await api("/wp-json/wp/v2/chuyen-huong-link?context=edit&status=any&per_page=100&page="+pageNo+"&_fields=id,acf,status,route_priority");
  if(page2.http!==200||!Array.isArray(page2.data))throw Error("WordPress redirect registry pagination failed");
  allRoutes.push(...page2.data);
  if(page2.data.length<100)break;
 }
 const numericCandidates=allRoutes.filter(x=>String(x.acf?.from_link||"").includes("san-pham")||String(x.acf?.to_link||"").includes("/ssr/products"));
 console.log("PSE_SOP_NUMERIC_ROUTE_REGISTRY="+JSON.stringify({total:allRoutes.length,
  related:numericCandidates.map(x=>({id:x.id,from:x.acf?.from_link,to:x.acf?.to_link,
   type:x.acf?.type,matchType:x.acf?.match_type,enabled:x.acf?.enable,
   status:x.status,priority:x.route_priority})).slice(0,35)}).slice(0,6800));
 const numeric=allRoutes.filter(x=>
  x.acf?.from_link==="^/san-pham/([a-z0-9-]+-[0-9]{3,5})$"&&
  x.acf?.to_link==="/ssr/products/$1/detail"&&
  x.acf?.match_type==="Regex"&&
  String(x.acf?.type).toLowerCase()==="rewrite"&&
  x.acf?.enable===true&&x.status==="publish");
 if(numeric.length!==1)throw Error("No unique active WordPress-managed numeric Product detail rewrite");
 report.route={id:numeric[0].id,priority:numeric[0].route_priority,from:numeric[0].acf.from_link,to:numeric[0].acf.to_link};
 if(!new RegExp(report.route.from).test("/san-pham/"+nextSlug)||
    new RegExp(report.route.from).test("/san-pham/"+expected.oldSlug))
  throw Error("Existing SSR route regexp is not disjoint from old no-ID slug");
 report.before={id:product.id,slug:product.slug,featuredMedia:product.featured_media,
  categories:product.product_cat,status:product.status,date:product.date};
 console.log("PSE_SOP_NUMERIC_ROUTE_PREFLIGHT="+JSON.stringify({mode:report.mode,before:report.before,route:report.route,newSlug:nextSlug}));
 if(!apply){console.log("PSE_SOP_NUMERIC_SLUG=DRY_PASS; cmsWrites=0; noBuild=true");}
 else{
  if(product.slug!==nextSlug){
   const save=await api("/wp-json/wp/v2/product/"+expected.id,"POST",{slug:nextSlug});
   if(save.http!==200||save.data?.id!==expected.id||save.data?.slug!==nextSlug)
    throw Error("WP Product numeric detail slug write failed HTTP "+save.http);
  }
  const read=await api("/wp-json/wp/v2/product/"+expected.id+"?context=edit&_fields=id,slug,title,status,date,excerpt,content,product_cat,featured_media");
  const x=read.data;
  if(read.http!==200||x.id!==product.id||x.slug!==nextSlug||
   (x.title?.raw||x.title?.rendered)!==(product.title?.raw||product.title?.rendered)||
   x.status!==product.status||x.date!==product.date||
   x.excerpt?.raw!==product.excerpt?.raw||x.content?.raw!==product.content?.raw||
   x.featured_media!==product.featured_media||
   JSON.stringify(x.product_cat)!==JSON.stringify(product.product_cat))
    throw Error("SOP slug-only WordPress readback mismatch; unrelated fields may have changed");
  report.after={id:x.id,slug:x.slug,unchangedMedia:true,unchangedContent:true,unchangedTaxonomy:true};
  console.log("PSE_SOP_NUMERIC_SLUG=PASS; wp_id="+expected.id+"; slug="+nextSlug+"; route_id="+numeric[0].id+"; native_wp_only=true; noBuild=true");
 }
}catch(err){report.issues.push(String(err?.message||err).slice(0,350));console.error("PSE_SOP_NUMERIC_SLUG_ERROR="+report.issues.at(-1));throw err}
finally{
 await mkdir("artifacts/pse-product-batch",{recursive:true});
 await writeFile("artifacts/pse-product-batch/sop-slug-fix.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}