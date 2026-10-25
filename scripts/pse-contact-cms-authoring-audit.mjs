import {chromium} from "playwright";
const lines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const xs=lines.filter(x=>x.startsWith("WC_URL="));
if(xs.length!==1)throw Error("Missing WC_URL");const wp=new URL(xs[0].slice(7).replace(/^['"]|['"]$/g,""));
if(wp.protocol!=="https:"||!wp.hostname||wp.username||wp.password||wp.search||wp.hash||!["","/"].includes(wp.pathname))throw Error("Invalid WP origin");
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});
try{
 await page.goto(wp.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const txt=await page.locator("body").innerText();
  const m=txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("Captcha not found");await f.fill(String(n))}
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WP login rejected");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("No nonce");return(await r.text()).trim();
 });
 const read=async route=>page.evaluate(async({route,nonce})=>{
  const r=await fetch(route,{credentials:"same-origin",headers:{Accept:"application/json","X-WP-Nonce":nonce}});
  return {status:r.status,data:await r.json().catch(()=>null)};
 },{route,nonce});
 const contact=await read("/wp-json/wp/v2/pages/47222?context=edit&_fields=id,slug,status,acf,content,title");
 if(contact.status!==200||contact.data?.slug!=="lien-he"||contact.data?.status!=="publish"||contact.data?.acf?.key!=="contact")throw Error("Unexpected PSE contact Page");
 const raw=String(contact.data.content?.raw||"");
 const section=raw.match(/<section\b[^>]*data-pse-contact-locations[^>]*>/i)?.[0]||"";
 const tableIds=["contact_00_vi","contact_00","contact_00_en"];
 const tables=[];
 for(const id of tableIds){const t=await read("/wp-json/tablepress/v1/table/"+id);
  tables.push({id,http:t.status,title:t.data?.title,fields:t.data?.fields?.map(f=>f.key),items:t.data?.items?.length,keys:t.data?.items?.[0]?Object.keys(t.data.items[0]):[]});
 }
 const nativeTable=tables.find(x=>x.id==="contact_00_vi");
 const shortcodeMatches=[...raw.matchAll(/\[table\s+id=contact_00_vi\s*\/\]/gi)];
 if(nativeTable?.http!==200||JSON.stringify(nativeTable.fields)!==JSON.stringify(["key","label","required"])||
  nativeTable.items!==6||shortcodeMatches.length!==1||
  !String(contact.data.acf?.cssmore||"").includes("PSE_CONTACT_WORDPRESS_OWNED_LAYOUT_V1"))
  throw Error("PSE Contact is not fully editable in native Editor + ESC Table + cssmore");
 console.log("PSE_CONTACT_CMS_AUDIT="+JSON.stringify({
  page:contact.data.id,action:contact.data.acf?.action,key:contact.data.acf?.key,
  cssmoreLength:String(contact.data.acf?.cssmore||"").length,bodyLength:raw.length,
  intro:Boolean(section),office:raw.includes('pse-contact-locations__office'),
  warehouses:["Kho Đồng Nai","Kho Long An","Kho Lâm Đồng","Kho Bình Phước","Kho Đắk Nông"].every(x=>raw.includes(x)),
  shortcodes:[...raw.matchAll(/\[table\s+id=([a-z0-9_-]+)\s*\/\]/gi)].map(m=>m[1]),
  forbiddenPlaceholder:raw.includes("Nội dung sẽ được cập nhật khi cấu hình website mới."),
  tables
 }));
 await page.goto(wp.origin+"/wp-admin/post.php?post=47222&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 const editor=await page.evaluate(()=>{
  const buttons=[...document.querySelectorAll("button")].map(b=>({text:(b.textContent||"").trim().slice(0,65),title:b.getAttribute("title"),id:b.id,cls:b.className})).filter(x=>/code|mã|shortcode|table|insert|chèn/i.test([x.text,x.title,x.id,x.cls].join(" "))).slice(0,30);
  return{editorMode:!!document.querySelector("#content_ifr")?"classic":"other",buttons,
   cssmore:[...document.querySelectorAll('.acf-field[data-name="cssmore"]')].map(f=>({name:f.dataset.name,type:f.dataset.type,fieldId:f.dataset.key,inputs:[...f.querySelectorAll("textarea,input")].map(x=>x.id)})),
   hasTinyMCE:Boolean(window.tinymce),hasCodeInsertIcon:Boolean(document.querySelector('#wp-content-media-buttons, .mce-toolbar'))};
 });
 console.log("PSE_CONTACT_EDITOR_AUDIT="+JSON.stringify(editor));
 console.log("PSE_CONTACT_AUDIT=PASS; READ_ONLY=true; NO_BUILD=true");
}finally{await browser.close()}