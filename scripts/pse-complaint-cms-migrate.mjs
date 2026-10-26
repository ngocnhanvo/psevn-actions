/** One-time native Classic Editor migration of the already-published PSE complaint Page.
 * No shortcode, no menu write, no API-based content write, no Astro build, no emails.
 * The exact Page, live form DOM contract, content and CSS are audited before saving.
 */
import {chromium} from "playwright";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const apply=String(event.head_commit?.message||"").trim()==="cms(pse): author complaint Page with native WordPress editor";
const sha=s=>createHash("sha256").update(String(s)).digest("hex");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const wc=env.filter(s=>s.startsWith("WC_URL="));
if(wc.length!==1)throw Error("Unique PSE WordPress origin unavailable");
const url=new URL(wc[0].slice(7).replace(/^['"]|['"]$/g,""));
if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||!["","/"].includes(url.pathname))throw Error("Unsafe WordPress origin");

const html="<div class=\"pse-complaint\" data-pse-cms-form=\"v1\">\n  <header class=\"pse-complaint__heading\">\n    <div class=\"pse-complaint__shell\">\n      <h1>Xử lý khiếu nại – Ý kiến khách hàng</h1>\n      <p>Gửi thông tin phản hồi, thắc mắc hoặc khiếu nại về sản phẩm, dịch vụ của PSE. Các trường có dấu * là bắt buộc.</p>\n    </div>\n  </header>\n  <section class=\"pse-complaint__shell pse-complaint__section\" aria-label=\"Xử lý khiếu nại – Ý kiến khách hàng\">\n    <form id=\"pse-complaint-form\" class=\"pse-complaint__form\" autocomplete=\"on\">\n      <div class=\"pse-complaint__section-heading\">\n        <span aria-hidden=\"true\" class=\"pse-complaint__step\">01</span>\n        <div><h2>Thông tin liên hệ</h2><p>Điền thông tin để PSE có thể liên hệ trao đổi khi cần.</p></div>\n      </div>\n      <div class=\"pse-complaint__grid\">\n        <label>Họ và tên <strong>*</strong><input name=\"name\" type=\"text\" autocomplete=\"name\" required minlength=\"2\" maxlength=\"120\" placeholder=\"Nhập họ và tên\" /></label>\n        <label>Email <strong>*</strong><input name=\"email\" type=\"email\" autocomplete=\"email\" required maxlength=\"160\" placeholder=\"email@example.com\" /></label>\n        <label>Điện thoại di động <strong>*</strong><input name=\"phone\" type=\"tel\" autocomplete=\"tel\" inputmode=\"tel\" required maxlength=\"24\" placeholder=\"09xx xxx xxx\" /></label>\n        <label>Điện thoại khác (nếu có)<input name=\"tel\" type=\"tel\" inputmode=\"tel\" maxlength=\"24\" placeholder=\"Số điện thoại khác\" /></label>\n        <label class=\"pse-complaint__wide\">Địa chỉ liên hệ <strong>*</strong><input name=\"address\" type=\"text\" autocomplete=\"street-address\" required minlength=\"5\" maxlength=\"240\" placeholder=\"Nhập địa chỉ liên hệ\" /></label>\n      </div>\n      <div class=\"pse-complaint__section-heading pse-complaint__section-heading--second\">\n        <span aria-hidden=\"true\" class=\"pse-complaint__step\">02</span>\n        <div><h2>Nội dung phản hồi</h2><p>Mô tả rõ vấn đề để hỗ trợ tiếp nhận và xử lý.</p></div>\n      </div>\n      <div class=\"pse-complaint__grid\">\n        <label class=\"pse-complaint__wide\">Tên mặt hàng <strong>*</strong><input name=\"product\" type=\"text\" required minlength=\"2\" maxlength=\"180\" placeholder=\"Tên hoặc mã sản phẩm\" /></label>\n        <label class=\"pse-complaint__wide\">Chủ đề <strong>*</strong><input name=\"subject\" type=\"text\" required minlength=\"4\" maxlength=\"160\" placeholder=\"Ví dụ: Phản hồi chất lượng sản phẩm\" /></label>\n        <label class=\"pse-complaint__wide\">Nội dung khiếu nại / ý kiến <strong>*</strong><textarea name=\"complaints\" required minlength=\"10\" maxlength=\"4000\" rows=\"7\" placeholder=\"Mô tả vấn đề, thời điểm phát sinh và mong muốn được hỗ trợ...\"></textarea></label>\n      </div>\n      <div class=\"pse-complaint__guard\" aria-hidden=\"true\"><label>Website<input name=\"website\" type=\"text\" tabindex=\"-1\" autocomplete=\"off\" /></label></div>\n      <div class=\"pse-complaint__security\">\n        <div id=\"pse-complaint-turnstile\" aria-label=\"Xác thực bảo mật\"></div>\n        <span id=\"pse-complaint-captcha-state\" role=\"status\">Đang tải xác thực bảo mật...</span>\n      </div>\n      <div class=\"pse-complaint__submit-row\">\n        <p>Thông tin được sử dụng để liên hệ xử lý yêu cầu này. Vui lòng không nhập mật khẩu hoặc thông tin thẻ thanh toán.</p>\n        <button type=\"submit\" id=\"pse-complaint-submit\" disabled>Gửi phản hồi <span aria-hidden=\"true\">↗</span></button>\n      </div>\n      <p id=\"pse-complaint-result\" role=\"status\" aria-live=\"polite\" class=\"pse-complaint__result\" hidden></p>\n    </form>\n  </section>\n</div>";
const css=".pse-complaint{background:#fbfdfb;color:#274535}\n .pse-complaint__shell{max-width:1180px;width:100%;margin:0 auto;padding-inline:clamp(18px,4vw,44px)}\n .pse-complaint__heading{border-bottom:1px solid #e0ebe3;background:white}\n .pse-complaint__heading .pse-complaint__shell{padding-top:clamp(34px,5vw,64px);padding-bottom:clamp(30px,4vw,50px)}\n .pse-complaint__heading h1{color:#164f36;font-weight:800;font-size:clamp(30px,3.2vw,46px);line-height:1.18;letter-spacing:-.025em}\n .pse-complaint__heading p{color:#597264;font-size:1.04rem;line-height:1.8;max-width:800px;margin-top:15px}\n .pse-complaint__section{padding-top:36px;padding-bottom:75px}\n .pse-complaint__form{border:1px solid #dce9df;border-radius:22px;background:white;padding:clamp(19px,4vw,48px);box-shadow:0 16px 40px rgba(15,72,40,.055)}\n .pse-complaint__section-heading{display:flex;align-items:start;gap:16px;margin-bottom:24px}\n .pse-complaint__section-heading--second{margin-top:45px}\n .pse-complaint__step{flex:none;background:#e4f2e8;color:#1d7549;font-weight:800;padding:13px;border-radius:12px}\n .pse-complaint__section-heading h2{font-weight:800;color:#17593d;font-size:clamp(21px,2.2vw,25px);line-height:1.4}\n .pse-complaint__section-heading p{color:#6a7c70;line-height:1.6;margin-top:4px}\n .pse-complaint__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px 24px}\n .pse-complaint__grid label{min-width:0;display:block;font-size:15px;font-weight:700;color:#294c37}\n .pse-complaint__grid label strong{color:#cf3745;display:inline}\n .pse-complaint__grid :is(input,textarea){display:block;margin-top:9px;font-family:inherit;font-size:16px;line-height:1.6;font-weight:400;width:100%;background:#fdfefd;border:1px solid #d3e3d8;border-radius:12px;padding:13px 16px;color:#2a4937;outline:0;min-width:0}\n .pse-complaint__grid :is(input,textarea):focus{border-color:#278652;box-shadow:0 0 0 3px #b9e6c6}\n .pse-complaint__grid textarea{resize:vertical;min-height:170px}\n .pse-complaint__wide{grid-column:1/-1}\n .pse-complaint__guard{position:absolute;left:-10000px;height:1px;width:1px;overflow:hidden}\n .pse-complaint__security{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:28px;color:#687f6e;font-size:13px;min-height:66px}\n .pse-complaint__submit-row{display:flex;align-items:center;justify-content:space-between;gap:22px;margin-top:24px}\n .pse-complaint__submit-row p{color:#6b7d71;font-size:13px;line-height:1.7;max-width:550px}\n .pse-complaint__submit-row button{display:inline-flex;align-items:center;justify-content:center;gap:13px;flex:none;border:0;border-radius:12px;background:#20744a;color:white;padding:15px 23px;font-size:15px;font-weight:800;cursor:pointer}\n .pse-complaint__submit-row button:not(:disabled):hover{background:#145633}\n .pse-complaint__submit-row button:disabled{background:#91af99;cursor:not-allowed}\n .pse-complaint__result{border-radius:12px;background:#e8f5ec;padding:14px 18px;margin-top:20px;font-size:15px;color:#145632;line-height:1.7}\n .pse-complaint__result[data-error=\"true\"]{background:#fff1ef;color:#a32a33}\n @media(max-width:680px){.pse-complaint__grid{grid-template-columns:1fr}.pse-complaint__submit-row{flex-direction:column;align-items:stretch}.pse-complaint__submit-row button{width:100%}.pse-complaint__section{padding-top:20px;padding-bottom:40px}.pse-complaint__form{border-radius:15px}}";

const browser=await chromium.launch({headless:true});
const p=await browser.newPage({viewport:{width:1440,height:950}});
const editorResourceErrors=[];
const earlyPageErrors=[];
p.on("pageerror",e=>earlyPageErrors.push(String(e?.message||e).slice(0,140)));
p.on("response",res=>{
  if(res.request().resourceType()==="script"&&res.status()>=400)
    editorResourceErrors.push({status:res.status(),path:new URL(res.url()).pathname});
});
p.on("requestfailed",req=>{
  if(req.resourceType()==="script")editorResourceErrors.push({networkFailed:true,path:new URL(req.url()).pathname});
});
try {
 await p.goto(url.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await p.locator("#user_login").count()){
   if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("WP credentials unavailable");
   await p.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
   await p.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
   const body=await p.locator("body").innerText();
   const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
   if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
     const input=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
     if(!await input.count())throw Error("WordPress login challenge field not found");
     await input.fill(String(v));
   }
   await Promise.all([p.waitForLoadState("domcontentloaded"),p.locator("#wp-submit").click()]);
 }
 if(p.url().includes("wp-login"))throw Error("WordPress authentication rejected");
 const nonce=await p.evaluate(async()=>{
   if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
   const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
   if(!r.ok)throw Error("Cannot obtain native WP REST nonce");return (await r.text()).trim();
 });
 const read=async()=>p.evaluate(async nonce=>{
  const r=await fetch("/wp-json/wp/v2/pages/81087?context=edit&_fields=id,slug,status,acf,title,content,modified",{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,"Cache-Control":"no-cache"}});
  return {http:r.status,data:await r.json().catch(()=>null)};
 },nonce);
 const v=await read();const d=v.data||{};
 if(v.http!==200||d.id!==81087||d.slug!=="xu-ly-khieu-nai-y-kien-khach-hang"||d.status!=="publish"||
   d.acf?.action!=="PseComplaintPage"||d.acf?.key!=="pse-complaint")throw Error("Wrong WordPress Page identity; stop");
 const before=String(d.content?.raw||""),priorCSS=String(d.acf?.cssmore||"");
 const expectedNames=["name","email","phone","tel","address","product","subject","complaints","website"];
 const hasExpected=()=>expectedNames.every(n=>html.includes('name="'+n+'"')) &&
   html.includes('id="pse-complaint-form"')&&html.includes('id="pse-complaint-turnstile"')&&
   html.includes('id="pse-complaint-submit"')&&html.includes('id="pse-complaint-result"');
 if(!hasExpected())throw Error("Form contract template incomplete");
 console.log("PSE_COMPLAINT_CMS_AUDIT="+JSON.stringify({apply,wpPage:81087,
   contentLength:before.length,contentHash:sha(before),cssLength:priorCSS.length,cssHash:sha(priorCSS),
   requiredNames:expectedNames.length,templateLength:html.length,cssTemplateLength:css.length}));
 if(before.includes('data-pse-cms-form="v1"')){
   const ok=expectedNames.every(n=>before.includes('name="'+n+'"'))&&priorCSS.includes(".pse-complaint__grid");
   if(!ok)throw Error("Partially migrated CMS; stop instead of overwrite");
   await p.goto(url.origin+"/wp-admin/post.php?post=81087&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
   const editorPageErrors=[];
   p.on("pageerror",error=>editorPageErrors.push(String(error?.message||error).slice(0,160)));
   await p.locator("#content-tmce").click();
   try {
     await p.waitForFunction(()=>Boolean(window.tinymce?.get("content")?.getBody()),null,{timeout:25000});
   } catch(error) {
     // Diagnostic only: never log credentials, content, cookies or nonce.
     const diag=await p.evaluate(()=>{
       const ed=window.tinymce?.get("content");
       return {tinymcePresent:!!window.tinymce,editorPresent:!!ed,
         editorInitialized:!!ed?.initialized,editorHidden:ed?.isHidden?.()??null,
         editorBodyExists:!!ed?.getBody?.(),selectedMode:document.querySelector("#wp-content-wrap")?.className||"",
         editorIframePresent:!!document.querySelector("#content_ifr"),
         currentPath:location.pathname,loginFormPresent:!!document.querySelector("#loginform")};
     }).catch(()=>({diagnosticUnavailable:true}));
     const init=await p.evaluate(()=>({
       preInitDefined:typeof window.tinyMCEPreInit!=="undefined",
       hasPreInitScript:[...document.scripts].some(script=>!script.src&&script.textContent.includes("tinyMCEPreInit")),
       loadedEditorScripts:[...document.scripts].filter(script=>script.src&&/editor|tinymce|load-scripts/.test(script.src)).map(script=>new URL(script.src).pathname).slice(-12),
       hasWordPressCoreEditor:!!window.switchEditors,
       visualButton:document.querySelector("#content-tmce")?.className||"",
       iframeCount:document.querySelectorAll("#wp-content-wrap iframe").length
     })).catch(()=>({unavailable:true}));
     console.log("PSE_COMPLAINT_TINYMCE_BOOT_DIAG="+JSON.stringify({...diag,...init,
       pageErrors:[...earlyPageErrors,...editorPageErrors].slice(0,6),
       scriptFailures:editorResourceErrors.slice(0,8)}));
     throw error;
   }
   const visual=await p.evaluate(()=>{
     const ed=window.tinymce.get("content"),body=ed.getBody(),grid=body.querySelector(".pse-complaint__grid");
     const view=ed.getDoc()?.defaultView;
     return {h1:body.querySelector("h1")?.textContent?.trim(),form:!!body.querySelector("#pse-complaint-form"),
       inputCount:body.querySelectorAll("#pse-complaint-form input,#pse-complaint-form textarea").length,
       sectionCount:body.querySelectorAll(".pse-complaint__section-heading").length,
       gridDisplay:grid&&view?.getComputedStyle(grid)?.display||null,
       gridColumns:grid&&view?.getComputedStyle(grid)?.gridTemplateColumns||null,
       h1FontSize:body.querySelector("h1")&&view?.getComputedStyle(body.querySelector("h1"))?.fontSize||null};
   });
   console.log("PSE_COMPLAINT_CMS_EDITOR_PARITY="+JSON.stringify(visual));
   if(!visual.form||visual.inputCount!==9||visual.sectionCount!==2||!visual.h1)throw Error("WordPress Visual Editor lost CMS form content");
   // Read-only live proof that the native TinyMCE iframe uses the same ACF
   // cssmore as Astro; source-level PHP tests alone cannot certify parity.
   if(visual.gridDisplay!=="grid"||String(visual.gridColumns||"").trim().split(/\s+/).length!==2)
     throw Error("WordPress native Visual Editor failed CMS cssmore two-column layout parity");
   console.log("PSE_COMPLAINT_CMS=ALREADY_DONE; no_write=true");process.exit(0);
 }
 // This Page was intentionally created with an empty editor. Never overwrite an
 // unexpected change made since the latest owner screenshot/checkpoint.
 if(before.replace(/<[^>]+>/g,"").replace(/&nbsp;/gi,"").trim()!==""||priorCSS.trim()!=="")throw Error("WordPress author content or CSS is not empty; stop before overwriting");
 await p.goto(url.origin+"/wp-admin/post.php?post=81087&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 await p.locator("#content-tmce").click();
 await p.waitForFunction(()=>{
   const ed=window.tinymce?.get("content");
   return !!ed?.selection&&!!ed?.getBody?.();
 },null,{timeout:25000});
 await p.locator("#content-html").click();
 await p.waitForFunction(()=>document.querySelector("#wp-content-wrap")?.classList.contains("html-active"),null,{timeout:12000});
 const mode=await p.evaluate(()=>{
   const e=window.tinymce?.get("content"),area=document.querySelector("#content"),wrap=document.querySelector("#wp-content-wrap");
   return {wrapClass:wrap?.className,editorHidden:e?.isHidden()??null,
     textareaVisible:!!area?.getClientRects().length,textareaLength:area?.value?.length||0,
     codeButtonActive:document.querySelector("#content-html")?.className||"",
     visualButtonActive:document.querySelector("#content-tmce")?.className||""};
 });
 console.log("PSE_COMPLAINT_CMS_EDITOR_MODE="+JSON.stringify(mode));
 if(!apply){console.log("PSE_COMPLAINT_CMS=DRY_PASS; no_write=true");process.exit(0)}
 if(!mode.wrapClass?.includes("html-active"))throw Error("Native Classic Editor remains in Visual mode; do not save");
 const editor=p.locator("#content");
 await editor.waitFor({state:"attached"});
 if((await editor.inputValue()).replace(/<[^>]+>/g,"").replace(/&nbsp;/gi,"").trim()!=="")throw Error("Classic Editor has changed while applying");
 const cssField=p.locator('.acf-field[data-name="cssmore"] textarea').first();
 if(!await cssField.count())throw Error("Native ACF cssmore field not found; do not save");
 if((await cssField.inputValue()).trim()!=="")throw Error("Native CSS field changed during edit");
 await editor.fill(html);
 await cssField.fill(css);
 const ready=await p.evaluate(()=>{
   const editor=document.querySelector("#content");const css=document.querySelector('.acf-field[data-name="cssmore"] textarea');
   return {html:editor?.value||"",css:css?.value||""};
 });
 if(ready.html!==html||ready.css!==css)throw Error("Native editor not synchronized");
 // Native Classic Editor Update, retaining WP nonce, revision, ACF and publish status.
 await p.locator("#publish").click();
 let result=null;
 for(let n=0;n<12;n++){
   try{
    await p.waitForLoadState("domcontentloaded",{timeout:15000});
    result=await read();if(result.http===200&&String(result.data?.content?.raw||"").includes('data-pse-cms-form="v1"'))break;
   }catch(e){if(!/navigation|Execution context was destroyed/i.test(String(e)))throw e}
   await p.waitForTimeout(900);
 }
 if(!result||result.http!==200)throw Error("WordPress Save readback unavailable");
 const a=result.data||{},body=String(a.content?.raw||""),savedCSS=String(a.acf?.cssmore||"");
 const fields=expectedNames.map(n=>({name:n,present:body.includes('name="'+n+'"')}));
 const ok=a.status==="publish"&&a.slug===d.slug&&a.acf?.key===d.acf?.key&&
   a.acf?.action===d.acf?.action&&body.includes('id="pse-complaint-form"')&&
   body.includes('id="pse-complaint-turnstile"')&&
   body.includes('id="pse-complaint-submit"')&&
   body.includes('id="pse-complaint-result"')&&
   body.includes("<form")&&fields.every(x=>x.present)&&savedCSS.includes(".pse-complaint__grid");
 console.log("PSE_COMPLAINT_CMS_SAVED="+JSON.stringify({ok,bodyLength:body.length,
   bodyHash:sha(body),cssLength:savedCSS.length,form:body.includes("<form"),fields,
   hasHeading:body.includes("Xử lý khiếu nại"),published:a.status==="publish"}));
 if(!ok)throw Error("Native Editor sanitized the required form or saved unexpected fields: do not deploy Astro");
 await p.goto(url.origin+"/wp-admin/post.php?post=81087&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 await p.locator("#content-tmce").click();
 await p.waitForFunction(()=>Boolean(window.tinymce?.get("content")?.getBody()),null,{timeout:25000});
 const visual=await p.evaluate(()=>{
  const e=window.tinymce.get("content"),root=e.getBody();
  return {heading:root.querySelector("h1")?.textContent?.trim(),form:!!root.querySelector("#pse-complaint-form"),
  fields:root.querySelectorAll("#pse-complaint-form input,#pse-complaint-form textarea").length,
  sections:root.querySelectorAll(".pse-complaint__section-heading").length};
 });
 console.log("PSE_COMPLAINT_CMS_VISUAL="+JSON.stringify(visual));
 if(!visual.form||visual.fields<9||visual.sections!==2)throw Error("Native WP Visual Editor does not preserve form editing; do not deploy Astro");
 console.log("PSE_COMPLAINT_CMS=PASS; no_menu_write=true; no_email=true; no_build=true");
}finally{await browser.close()}
