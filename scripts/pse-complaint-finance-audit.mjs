/** Discover safe native PSE WordPress CF7 complaint form capability and original finance widget; read only. */
import {chromium} from "playwright";
const vals=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,"")).filter(s=>s.startsWith("WC_URL="));
if(vals.length!==1)throw Error("PSE WP admin origin missing");
const u=new URL(vals[0].slice(7).replace(/^['"]|['"]$/g,""));if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid WP origin");
const browser=await chromium.launch({headless:true});const p=await browser.newPage();
try{
 await p.goto(u.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await p.locator("#user_login").count()){
  await p.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");await p.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const raw=await p.locator("body").innerText(),m=raw.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||raw.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],answer=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const c=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await c.count())throw Error("WP auth challenge missing");await c.fill(String(answer))}
  await Promise.all([p.waitForLoadState("domcontentloaded"),p.locator("#wp-submit").click()]);
 }
 if(p.url().includes("wp-login"))throw Error("WP authentication unavailable");
 const nonce=await p.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("REST nonce failed");return(await r.text()).trim()});
 const get=path=>p.evaluate(async({path,nonce})=>{const r=await fetch(path,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json"}});return{http:r.status,data:await r.json().catch(()=>({})),total:r.headers.get("X-WP-Total")}},{path,nonce});
 const [root,menus,pages]=await Promise.all([get("/wp-json/"),get("/wp-json/wp/v2/menu-items?context=edit&per_page=100"),get("/wp-json/wp/v2/pages?context=edit&status=publish,draft,private&per_page=100&_fields=id,slug,status,title,acf,content")]);
 if(root.http!==200||menus.http!==200||pages.http!==200||!Array.isArray(menus.data)||!Array.isArray(pages.data))throw Error("WP CMS registry unavailable");
 const cf7Routes=Object.keys(root.data.routes||{}).filter(x=>/contact-form-7|wpcf7|feedback|complain|khi[eế]u/i.test(x)).slice(0,40);
 const formQueries=["/wp-json/contact-form-7/v1/contact-forms?per_page=100","/wp-json/wp/v2/wpcf7_contact_form?context=edit&per_page=100"];
 const forms=[];
 for(const path of formQueries){
  const r=await get(path);
  const arr=Array.isArray(r.data)?r.data:(r.data?.data||r.data?.posts||[]);
  forms.push({path,http:r.http,count:Array.isArray(arr)?arr.length:null,records:(Array.isArray(arr)?arr:[]).slice(0,40).map(x=>({id:x.id,title:String(x.title?.rendered||x.title||"").slice(0,80),tagNames:[...String(x.form||x.properties?.form||"").matchAll(/\[(?:text\*?|email\*?|tel\*?|textarea\*?|select\*?|submit)\s+([a-zA-Z0-9_-]+)/g)].map(m=>m[1]),hasMail:!!(x.mail||x.properties?.mail)}))});
 }
 console.log("PSE_COMPLAINT_NATIVE_CF7="+JSON.stringify({routes:cf7Routes,forms}));
 const nativeForm=await get("/wp-json/contact-form-7/v1/contact-forms/49442");
 const cfg=nativeForm.data?.properties||{};
 const markup=String(cfg.form||"");
 const mail=cfg.mail||{};
 const contactRoute=root.data.routes?.["/contact-form-7/v1/contact-forms"]||{};
 console.log("PSE_COMPLAINT_CF7_CONTRACT="+JSON.stringify({http:nativeForm.http,id:nativeForm.data?.id,
   title:nativeForm.data?.title,propertyNames:Object.keys(cfg),existingFormTagNames:[...markup.matchAll(/\\[(?:text|email|tel|textarea|select)(?:\\*)?\\s+([a-zA-Z0-9_-]+)/g)].map(x=>x[1]),
   mailConfigured:Boolean(mail.recipient&&mail.sender&&mail.subject&&mail.body),mail2Active:!!cfg.mail_2?.active,
   configErrorCount:nativeForm.data?.config_errors?.length||0,
   writeMethodSupported:contactRoute.endpoints?.some(x=>Array.isArray(x.methods)&&x.methods.includes("POST"))||false,
   postFieldNames:contactRoute.endpoints?.filter(x=>x.methods?.includes("POST")).flatMap(x=>Object.keys(x.args||{}))||[]}));

 const choose=[77020,77025],existingMenus=menus.data.filter(x=>choose.includes(Number(x.id))).map(x=>({id:x.id,name:String(x.title?.raw||x.title?.rendered||"").trim(),type:x.type,parent:x.parent,url:x.url}));
 const existingPages=pages.data.filter(x=>/khieu-nai|khieu nai|y-kien|thong-tin-tai-chinh|finance|contact/i.test(x.slug)).map(x=>({id:x.id,slug:x.slug,status:x.status,action:x.acf?.action,key:x.acf?.key,contentLen:String(x.content?.raw||"").length}));
 console.log("PSE_COMPLAINT_NATIVE_MENU="+JSON.stringify({menus:existingMenus,pages:existingPages}));
 const page=await browser.newPage();
 for(const [kind,url] of [
  ["complaint","https://www.pse.vn/hoat-dong-kinh-doanh/xu-ly-khieu-nai-y-kien-khach-hang.html"],
  ["finance","https://www.pse.vn/quan-he-nha-dau-tu/thong-tin-tai-chinh.html"]
 ]){
  const r=await page.goto(url,{waitUntil:"domcontentloaded",timeout:60000});
  if(r?.status()!==200)throw Error("Original Joomla "+kind+" HTTP "+r?.status());
  const info=await page.evaluate(kind=>{
   const main=document.querySelector("main")||document.body;
   const form=main.querySelector("form");const inputs=[...(form?.querySelectorAll("input,textarea,select")||[])].map(x=>({tag:x.tagName,type:x.type||"",name:x.name||"",required:x.required||false})).filter(x=>x.name&&x.type!=="hidden");
   const iframes=[...main.querySelectorAll("iframe")].map(x=>({title:x.title||"",src:x.getAttribute("src")||"",width:x.width||"",height:x.height||""}));
   return {formExists:!!form,inputs,iframes,header:[...(main.querySelectorAll("h1,h2,h3")||[])].slice(0,7).map(x=>x.textContent?.replace(/\s+/g," ").trim()),visibleLength:(main.textContent||"").replace(/\s+/g," ").trim().length};
  },kind);
  console.log("PSE_COMPLAINT_ORIGINAL="+JSON.stringify({kind,url,http:r?.status(),info}).slice(0,8500));
 }
 console.log("PSE_COMPLAINT_FINANCE_AUDIT=PASS; nativeWordPressReadOnly=true; noBuild=true");
}finally{await browser.close()}
