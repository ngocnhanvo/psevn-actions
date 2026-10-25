/** Replace inaccessible HTTP Joomla finance iframe with links to verified native WP financial disclosures, CMS-owned Page. */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const evt=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const apply=evt.head_commit?.message==="cms(pse): publish verified financial information Page and native menu";
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const parse=key=>{const a=env.filter(x=>x.startsWith(key+"="));if(a.length!==1)throw Error("Missing PSE "+key);const u=new URL(a[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Unsafe configured origin "+key);return u.origin};
const cms=parse("WC_URL"),frontend=parse("WC_URL_CLIENT"),slug="thong-tin-tai-chinh",name="Thông tin tài chính",menuId=77025,menuParent=77021;
const specs=[
 {slug:"bao-cao-tai-chinh",name:"Báo cáo tài chính",description:"Báo cáo tài chính theo kỳ kế toán và các tài liệu công bố đi kèm"},
 {slug:"bao-cao-thuong-nien",name:"Báo cáo thường niên",description:"Báo cáo thường niên và thông tin hoạt động được công bố"},
 {slug:"ban-cong-bo-thong-tin",name:"Bản công bố thông tin",description:"Các thông báo, văn bản công bố thông tin của công ty"}
];
const browser=await chromium.launch({headless:true});const p=await browser.newPage({viewport:{width:1440,height:900}});
const state={mode:apply?"apply":"dry",slug,menu:menuId,categories:[],page:null};
try{
 await p.goto(cms+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await p.locator("#user_login").count()){
  await p.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");await p.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const text=await p.locator("body").innerText(),m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const input=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await input.count())throw Error("WP math challenge missing");await input.fill(String(v))}
  await Promise.all([p.waitForLoadState("domcontentloaded"),p.locator("#wp-submit").click()]);
 }
 if(p.url().includes("wp-login"))throw Error("Admin session unavailable");
 const nonce=await p.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("REST nonce unavailable");return(await r.text()).trim()});
 const api=(path,method="GET",body)=>p.evaluate(async({path,method,body,nonce})=>{const r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});return{http:r.status,data:await r.json().catch(()=>({}))}},{path,method,body,nonce});
 const [menus,cats,pages]=await Promise.all([
  api("/wp-json/wp/v2/menu-items?context=edit&per_page=100"),
  api("/wp-json/wp/v2/categories?context=edit&per_page=100&hide_empty=false&_fields=id,slug,name,parent,count"),
  api("/wp-json/wp/v2/pages?context=edit&status=publish,draft,private&per_page=100&_fields=id,slug,status,acf,content")
 ]);
 if(menus.http!==200||cats.http!==200||pages.http!==200||!Array.isArray(menus.data)||!Array.isArray(cats.data)||!Array.isArray(pages.data))throw Error("WordPress registry unavailable");
 const menu=menus.data.filter(x=>Number(x.id)===menuId&&Number(x.parent)===menuParent&&String(x.title?.raw||x.title?.rendered||"").trim()===name);
 if(menu.length!==1)throw Error("Finance Header menu identity not verified");
 const existingPage=pages.data.filter(x=>x.slug===slug);
 if(existingPage.length>1||existingPage.length===1&&(existingPage[0].acf?.action!=="PublicPage"||existingPage[0].acf?.key!=="pse-business-"+slug))throw Error("Finance WP Page name collision");
 const oldUrl="https://www.pse.vn/quan-he-nha-dau-tu/thong-tin-tai-chinh.html";
 if(!(menu[0].url===oldUrl||(menu[0].type==="post_type"&&menu[0].object==="page")))throw Error("Unknown financial menu rewrite");
 const verified=[];
 for(const s of specs){
  const category=cats.data.filter(x=>x.slug===s.slug&&Number(x.parent)===1744);
  if(category.length!==1||Number(category[0].count)<1||category[0].name!==s.name)throw Error("Financial source taxonomy not trustworthy "+s.slug);
  const target=frontend+"/tin-tuc-su-kien/?cat="+encodeURIComponent(s.slug);
  verified.push({...s,categoryId:category[0].id,count:category[0].count,url:target});
 }
 state.categories=verified.map(x=>({id:x.categoryId,slug:x.slug,name:x.name,count:x.count,target:x.url}));
 state.page={existingId:existingPage[0]?.id||null};
 console.log("PSE_FINANCE_NAV_PREFLIGHT="+JSON.stringify({mode:state.mode,menuId,menuUrl:menu[0].url,categories:state.categories,page:state.page}));
 if(!apply){console.log("PSE_FINANCE_NAV=DRY_PASS; categories=3; originalIframeUnusable=true; noWrites=true; noAstroBuild=true");process.exit(0)}
 const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
 const html='<div class="pse-finance-resources"><p class="pse-finance-intro">Các báo cáo tài chính, báo cáo thường niên và văn bản công bố thông tin của công ty được cập nhật trong các chuyên mục dưới đây.</p><nav class="pse-finance-grid" aria-label="Các chuyên mục thông tin tài chính">'+verified.map(x=>'<a class="pse-finance-card" href="'+esc(x.url)+'"><span class="pse-finance-number">0'+(verified.indexOf(x)+1)+'</span><span class="pse-finance-description"><strong>'+esc(x.name)+'</strong><small>'+esc(x.description)+'</small></span><span class="pse-finance-arrow" aria-hidden="true">↗</span></a>').join("")+"</nav></div>";
 const css=`.pse-finance-resources{max-width:1180px;margin:0 auto;color:#294c39}.pse-finance-intro{max-width:850px;font-size:1.07rem;line-height:1.85;color:#53715d;margin:0 0 30px}.pse-finance-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:20px}.pse-finance-card{display:flex;align-items:flex-start;gap:15px;min-width:0;padding:26px;border:1px solid #d4e6d9;border-radius:20px;background:#fff;color:#1b5738;text-decoration:none;box-shadow:0 9px 28px rgba(16,69,39,.07);transition:box-shadow .2s,border-color .2s,transform .2s}.pse-finance-card:hover{border-color:#97bfa2;box-shadow:0 17px 35px rgba(16,69,39,.14);transform:translateY(-2px)}.pse-finance-card:focus-visible{outline:3px solid #32916a;outline-offset:3px}.pse-finance-number{display:grid;place-items:center;flex:none;font-weight:800;color:#166139;background:#e8f5eb;border-radius:12px;width:42px;height:42px}.pse-finance-description{display:flex;flex:1;min-width:0;flex-direction:column;gap:8px}.pse-finance-description strong{font-size:1.14rem;line-height:1.4}.pse-finance-description small{color:#617769;line-height:1.65;font-size:.91rem}.pse-finance-arrow{color:#278659;font-size:24px;flex:none}@media(max-width:540px){.pse-finance-grid{grid-template-columns:1fr}.pse-finance-card{padding:20px}}`;
 let id=existingPage[0]?.id;
 if(!id){
  const r=await api("/wp-json/wp/v2/pages","POST",{title:name,slug,status:"draft",content:html,acf:{key:"pse-business-"+slug,action:"PublicPage",cssmore:css}});
  if(r.http!==201||!Number.isSafeInteger(Number(r.data?.id)))throw Error("Native financial Page creation failed");
  id=r.data.id;
 }
 const get=()=>api("/wp-json/wp/v2/pages/"+id+"?context=edit&_fields=id,slug,status,acf,content");
 const page=await get(),body=String(page.data.content?.raw||"");
 if(page.http!==200||page.data.slug!==slug||page.data.acf?.action!=="PublicPage"||page.data.acf?.key!=="pse-business-"+slug||verified.some(x=>!body.includes(x.url))||((body.match(/class="pse-finance-card"/g)||[]).length!==3))throw Error("Native financial Page CMS readback failed");
 if(page.data.status==="draft"){
  const r=await api("/wp-json/wp/v2/pages/"+id,"POST",{status:"publish"});
  if(r.http!==200||r.data.status!=="publish")throw Error("Native financial Page publication failed");
 }else if(page.data.status!=="publish")throw Error("Unexpected financial Page status");
 if(menu[0].type!=="post_type"||Number(menu[0].object_id)!==Number(id)){
  const r=await api("/wp-json/wp/v2/menu-items/"+menuId,"POST",{type:"post_type",object:"page",object_id:id});
  if(r.http!==200||Number(r.data.object_id)!==Number(id))throw Error("Finance WordPress header link update refused");
 }
 const [final,finalMenu]=await Promise.all([get(),api("/wp-json/wp/v2/menu-items/"+menuId+"?context=edit")]);
 if(final.http!==200||final.data.status!=="publish"||finalMenu.http!==200||finalMenu.data.type!=="post_type"||Number(finalMenu.data.object_id)!==Number(id))throw Error("Finance Page final data/menu verification failed");
 console.log("PSE_FINANCE_NAV=PASS; Page="+id+"; WP_categories=3; menu="+menuId+"; source_data=true; no_stock_quotes_invented=true; noAstroBuild=true");
}finally{await mkdir("artifacts/pse-finance",{recursive:true});await writeFile("artifacts/pse-finance/manifest.json",JSON.stringify(state,null,2)+"\n");await browser.close()}
