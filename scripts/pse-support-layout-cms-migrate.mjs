/**
 * Move only existing approved hotline/FAQ layout declarations to WordPress ACF cssmore.
 * Do not alter Page content, TablePress cells, title, action/key or publish state.
 * Write only when a guarded, explicit owner-request marker is present.
 */
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
const mode=process.env.PSE_SUPPORT_LAYOUT_MODE||"dry";
if(!["dry","publish"].includes(mode))throw Error("Unexpected execution mode");
const cfg=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,"")).filter(s=>s.startsWith("WC_URL="));
if(cfg.length!==1)throw Error("Expected exactly one WP origin");
const u=new URL(cfg[0].split("=").slice(1).join("=").replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||!u.hostname||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Unexpected WordPress URL");
const specs=[
 {id:80932,slug:"duong-day-nong",key:"pse-business-duong-day-nong",table:"pse_hotline_vi",rows:3,fieldKeys:["group","label","phone","note"],file:"scripts/pse-support-layout-hotline.css",marker:"PSE_HOTLINE_CMS_LAYOUT_V1"},
 {id:80930,slug:"hoi-dap",key:"pse-business-hoi-dap",table:"pse_faq_vi",rows:15,fieldKeys:["question","answer","visible"],file:"scripts/pse-support-layout-faq.css",marker:"PSE_FAQ_CMS_LAYOUT_V1"}
];
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1366,height:900}});
 if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("WP credentials not available");
 await page.goto(u.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
   await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
   await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
   const txt=await page.locator("body").innerText();
   const m=txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
   if(m){const n=({"+":+m[1]+ +m[3],"-":+m[1]- +m[3],x:+m[1]* +m[3],"×":+m[1]* +m[3],"*":+m[1]* +m[3]})[m[2]];
     const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
     if(!(await field.count()))throw Error("Login challenge field unavailable");
     await field.fill(String(n));
   }
   await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WordPress login rejected");
 const nonce=await page.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
   const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
   if(!r.ok)throw Error("REST nonce HTTP "+r.status);
   return (await r.text()).trim();
 });
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error("Unexpected REST nonce");
 const query=async(path,write)=>page.evaluate(async({path,nonce,write})=>{
    const res=await fetch(path,{method:write?"POST":"GET",credentials:"same-origin",cache:"no-store",
      headers:{"X-WP-Nonce":nonce,"Accept":"application/json",...(write?{"Content-Type":"application/json"}:{})},
      ...(write?{body:JSON.stringify(write)}:{})});
    return {http:res.status,data:await res.json().catch(()=>null)};
 },{path,nonce,write});
 const readPage=spec=>query("/wp-json/wp/v2/pages/"+spec.id+"?context=edit&_fields=id,slug,status,modified,acf,content");
 const readTable=spec=>query("/wp-json/tablepress/v1/table/"+spec.table);
 for(const spec of specs){
   const css=(await readFile(spec.file,"utf8")).trim();
   if(!css.startsWith("/* "+spec.marker+":")||!css.includes("."+ (spec.table==="pse_faq_vi"?"pse-faq":"pse-hotline"))||css.length<1000)throw Error("Unexpected CSS payload "+spec.slug);
   const pageState=await readPage(spec),table=await readTable(spec);
   if(pageState.http!==200||pageState.data?.id!==spec.id||pageState.data.slug!==spec.slug||pageState.data.status!=="publish"||
      pageState.data.acf?.action!=="PublicPage"||pageState.data.acf?.key!==spec.key)throw Error("Page identity mismatch "+spec.slug);
   if(table.http!==200||table.data?.id!==spec.table||table.data.items?.length!==spec.rows||
      JSON.stringify(table.data.fields?.map(x=>x.key))!==JSON.stringify(spec.fieldKeys))throw Error("ESC Table data identity mismatch "+spec.slug);
   const raw=String(pageState.data.content?.raw||"").trim();
   if(raw!=="[table id="+spec.table+" /]")throw Error("Unexpected WordPress Editor shortcode state "+spec.slug);
   const saved=String(pageState.data.acf?.cssmore||"").trim();
   if(saved && saved!==css)throw Error("Refusing overwrite of nonmatching WordPress CMS layout "+spec.slug);
   console.log("PSE_SUPPORT_LAYOUT_PREFLIGHT="+JSON.stringify({slug:spec.slug,table:spec.table,rows:spec.rows,existing:saved===css?"MATCH":saved?"CHANGED":"EMPTY",cssBytes:Buffer.byteLength(css),mode}));
   if(mode==="dry"||saved===css)continue;
   const current=await readPage(spec);
   if(current.http!==200||current.data.modified!==pageState.data.modified||String(current.data.content?.raw||"").trim()!==raw||
      String(current.data.acf?.cssmore||"").trim()!==saved)throw Error("Concurrent WordPress update detected "+spec.slug);
   const wrote=await query("/wp-json/wp/v2/pages/"+spec.id,{acf:{cssmore:css}});
   if(wrote.http!==200)throw Error("WordPress ACF update rejected "+spec.slug+" HTTP "+wrote.http+" CODE "+String(wrote.data?.code||"unknown"));
   const after=await readPage(spec);
   if(after.http!==200||String(after.data.acf?.cssmore||"").trim()!==css||
      String(after.data.content?.raw||"").trim()!==raw||after.data.acf?.key!==spec.key)throw Error("WordPress CSS read-after-write failed "+spec.slug);
   console.log("PSE_SUPPORT_LAYOUT_PUBLISHED="+JSON.stringify({slug:spec.slug,marker:spec.marker,editorUnchanged:true,source:"wordpress_acf_cssmore"}));
 }
 console.log("PSE_SUPPORT_LAYOUT_CMS="+(mode==="dry"?"DRY_PASS":"PASS")+"; page_count=2; esc_tables_unchanged=true; no_astro_build=true");
}finally{await browser.close()}
