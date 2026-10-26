/**
 * Convert PSE hotline/FAQ from lone ESC shortcode text to the official TinyMCE
 * Insert Code image block. The Visual Builder remains the only layout builder.
 * Changes only the Page content through WordPress native editor after guarded
 * readback. Does not alter ESC Table rows, ACF CSS, URLs, status or Astro.
 */
import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";

const apply=process.env.PSE_SUPPORT_NATIVE_APPLY==="true";
const specs=[
 {id:80932,slug:"duong-day-nong",key:"pse-business-duong-day-nong",table:"pse_hotline_vi",
  count:3,keys:["group","label","phone","note"],css:"PSE_HOTLINE_CMS_LAYOUT_V1"},
 {id:80930,slug:"hoi-dap",key:"pse-business-hoi-dap",table:"pse_faq_vi",
  count:15,keys:["question","answer","visible"],css:"PSE_FAQ_CMS_LAYOUT_V1"},
];
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const wc=env.filter(s=>s.startsWith("WC_URL="));
if(wc.length!==1)throw Error("Configured WordPress origin absent or ambiguous");
const url=new URL(wc[0].slice(7).replace(/^['"]|['"]$/g,""));
if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||!["","/"].includes(url.pathname))
 throw Error("WordPress origin not a safe HTTPS root");
const origin=url.origin;
const tokens=html=>[...String(html||"").matchAll(/\[table\s+id=([a-z0-9_-]+)\s*\/\]/gi)].map(m=>m[1]);
const wrappers=html=>[...String(html||"").matchAll(/<div\b(?=[^>]*class=["'][^"']*tablepress-preview-wrap[^"']*["'])[^>]*>[\s\S]*?<\/div>/gi)].map(m=>m[0]);
const sha=html=>createHash("sha256").update(String(html)).digest("hex");
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1500,height:1050}});
page.on("dialog",async d=>{if(d.type()==="confirm")await d.accept();else await d.dismiss()});
await mkdir("artifacts/pse-support-native-blocks",{recursive:true});
try {
 if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("WordPress Admin secrets unavailable");
 await page.goto(origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
   await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
   await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
   const body=await page.locator("body").innerText();
   const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
   if(m){
     const a=+m[1],b=+m[3],val=({"+":a+b,"-":a-b,"x":a*b,"×":a*b,"*":a*b})[m[2]];
     const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
     if(!await f.count())throw Error("Login arithmetic field unavailable");
     await f.fill(String(val));
   }
   await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WordPress login refused");
 const nonce=await page.evaluate(async()=>{
   if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
   const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
   if(!r.ok)throw Error("REST nonce unavailable HTTP "+r.status);
   return (await r.text()).trim();
 });
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error("Unexpected REST nonce");
 const read=async route=>page.evaluate(async ({route,nonce})=>{
   const r=await fetch(route,{credentials:"same-origin",cache:"no-store",
     headers:{"X-WP-Nonce":nonce,"Accept":"application/json"}});
   return {http:r.status,data:await r.json().catch(()=>null)};
 },{route,nonce});
 const readPage=s=>read("/wp-json/wp/v2/pages/"+s.id+"?context=edit&_fields=id,slug,status,acf,content,modified");
 const readTable=s=>read("/wp-json/tablepress/v1/table/"+encodeURIComponent(s.table));
 for(const spec of specs){
   const before=await readPage(spec);
   const table=await readTable(spec);
   if(before.http!==200||before.data?.id!==spec.id||before.data?.slug!==spec.slug||
      before.data?.status!=="publish"||before.data?.acf?.key!==spec.key||
      before.data?.acf?.action!=="PublicPage")
      throw Error("Unexpected Page identity/status "+spec.slug);
   if(table.http!==200||table.data?.id!==spec.table||!Array.isArray(table.data?.items)||
      table.data.items.length!==spec.count||
      JSON.stringify(table.data.fields?.map(x=>x.key))!==JSON.stringify(spec.keys))
      throw Error("ESC Table schema/item count mismatch "+spec.table);
   const raw=String(before.data?.content?.raw||"");
   const css=String(before.data?.acf?.cssmore||"");
   const token="[table id="+spec.table+" /]";
   if(!css.includes(spec.css)||JSON.stringify(tokens(raw))!==JSON.stringify([spec.table]))
      throw Error("Page CSS or single native ESC Table token altered "+spec.slug);
   const existing=wrappers(raw);
   if(existing.length){
     if(existing.length!==1||tokens(existing[0]).length!==1||tokens(existing[0])[0]!==spec.table||
        !(existing[0].includes('data-table-id="'+spec.table+'"')||
          existing[0].includes("data-table-id='"+spec.table+"'"))||
        (existing[0].match(/<img\b/gi)||[]).length!==1)
       throw Error("Existing image preview wrapper is malformed "+spec.slug);
   }else if(raw.trim()!==token){
     throw Error("Page contains extra/editor markup; refuse destructive rewrite "+spec.slug);
   }
   await writeFile("artifacts/pse-support-native-blocks/"+spec.slug+"-before.json",
     JSON.stringify({id:spec.id,slug:spec.slug,raw,sha256:sha(raw),
       cssSha256:sha(css),table:spec.table,itemCount:table.data.items.length},null,2));
   await page.goto(origin+"/wp-admin/post.php?post="+spec.id+"&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
   await page.locator("#content-tmce").click();
   await page.waitForFunction(()=>Boolean(window.tinymce?.get("content")?.getBody()),null,{timeout:20000});
   if(await page.locator("#pse-support-editor-preview").count())
     throw Error("Duplicate custom support iframe must be retired before native editor QA");
   if(!existing.length){
     const staged=await page.evaluate(()=>{
       const e=window.tinymce.get("content");
       if(e.isHidden())throw Error("Classic Visual editor is not active");
       e.setContent('<p data-pse-native-insert="1">PSE_NATIVE_ESC_SLOT</p>');
       const p=e.getBody().querySelector('[data-pse-native-insert="1"]');
       if(!p)throw Error("Native ESC slot not available");
       e.focus();
       const range=e.dom.createRng();range.selectNodeContents(p);e.selection.setRng(range);
       return e.selection.getContent({format:"text"}).trim();
     });
     if(staged!=="PSE_NATIVE_ESC_SLOT")throw Error("Visual insertion selection lost");
     await page.evaluate(()=>{
       if(typeof window.tablepress_open_shortcode_thickbox!=="function")throw Error("Native ESC Insert Code absent");
       window.tablepress_open_shortcode_thickbox();
     });
     const choice=page.frameLocator("#TB_iframeContent").locator('.insert-shortcode[title*="'+spec.table+'"]');
     await choice.waitFor({state:"visible",timeout:20000});
     if((await choice.getAttribute("title"))?.trim()!==token)throw Error("Native ESC picker mismatch "+spec.table);
     await choice.click(); // actual native Insert Code; never write shortcode by REST or pasted text
     await page.locator("#TB_window").waitFor({state:"hidden",timeout:12000});
     await page.locator("#title").click();
   }
   await page.waitForFunction(t=>{
     const e=window.tinymce?.get("content");
     if(!e)return false;
     const images=[...e.getBody().querySelectorAll(".tablepress-preview-wrap img")];
     return images.length===1&&images[0].getAttribute("data-table-id")===t&&images[0].complete&&images[0].naturalWidth>0;
   },spec.table,{timeout:25000});
   const state=await page.evaluate(()=>{
     const e=window.tinymce.get("content");
     const img=e.getBody().querySelector(".tablepress-preview-wrap img");
     return {html:e.getContent(),images:e.getBody().querySelectorAll(".tablepress-preview-wrap img").length,
       imageWidth:img?.naturalWidth||0,imageHeight:img?.naturalHeight||0,
       previewId:img?.getAttribute("data-table-id"),hasPanel:!!document.querySelector("#pse-support-editor-preview")};
   });
   const wraps=wrappers(state.html);
   if(state.hasPanel||state.images!==1||state.previewId!==spec.table||
      state.imageWidth<=0||state.imageHeight<=0||
      wraps.length!==1||tokens(wraps[0]).length!==1||tokens(wraps[0])[0]!==spec.table||
      JSON.stringify(tokens(state.html))!==JSON.stringify([spec.table])||
      state.html.includes("PSE_NATIVE_ESC_SLOT"))
     throw Error("Native ESC Table image editor preview invalid "+spec.slug);
   await page.locator("#wp-content-wrap").screenshot({
     path:"artifacts/pse-support-native-blocks/"+spec.slug+"-visual-editor.png"});
   if(existing.length){
     console.log("PSE_SUPPORT_NATIVE=ALREADY_DONE "+JSON.stringify({page:spec.id,table:spec.table,
       imageWidth:state.imageWidth,tableRows:spec.count,sidePanel:false}));
     continue;
   }
   if(!apply){
     console.log("PSE_SUPPORT_NATIVE=DRY_PASS "+JSON.stringify({page:spec.id,table:spec.table,
       previewImageLoaded:true,imageWidth:state.imageWidth,noSave:true,noBuild:true}));
     continue;
   }
   const latest=await readPage(spec);
   if(latest.http!==200||String(latest.data?.content?.raw||"")!==raw||
      String(latest.data?.acf?.cssmore||"")!==css)
     throw Error("Concurrent WordPress content/CSS edit detected "+spec.slug);
   await page.locator("#publish").click();
   let saved;
   for(let n=0;n<8;n++){
     try{await page.waitForLoadState("domcontentloaded",{timeout:12000});saved=await readPage(spec);break}
     catch(e){if(!/navigation|execution context was destroyed/i.test(String(e)))throw e;await page.waitForTimeout(650)}
   }
   if(!saved||saved.http!==200)throw Error("WordPress save result indeterminate; verify read-only before replay");
   const after=String(saved.data?.content?.raw||"");
   const savedWraps=wrappers(after);
   if(savedWraps.length!==1||JSON.stringify(tokens(after))!==JSON.stringify([spec.table])||
      tokens(savedWraps[0])[0]!==spec.table||saved.data?.acf?.cssmore!==css)
      throw Error("WordPress after-save readback mismatch "+spec.slug);
   await page.goto(origin+"/wp-admin/post.php?post="+spec.id+"&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
   await page.locator("#content-tmce").click();
   await page.waitForFunction(t=>{
     const e=window.tinymce?.get("content");
     if(!e)return false;const img=e.getBody().querySelector(".tablepress-preview-wrap img");
     return !!img&&img.getAttribute("data-table-id")===t&&img.complete&&img.naturalWidth>0;
   },spec.table,{timeout:25000});
   console.log("PSE_SUPPORT_NATIVE=SAVED_PASS "+JSON.stringify({page:spec.id,table:spec.table,
     nativeImagePreview:1,cssUnchanged:true,escRowsUnchanged:true,noBuild:true}));
 }
 console.log("PSE_SUPPORT_NATIVE_EDITOR_QA=PASS pages=2 apply="+apply+" no_astro_build=true");
}finally{await browser.close()}
