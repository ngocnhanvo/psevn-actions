/** Publish only the existing verified PSE complaint draft; menu unchanged until public route QA. */
import {chromium} from "playwright";
const vals=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const line=vals.filter(x=>x.startsWith("WC_URL="));
if(line.length!==1)throw Error("Missing/duplicate configured WordPress URL");
const u=new URL(line[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||!u.hostname||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Unsafe WordPress origin");
const browser=await chromium.launch({headless:true});const p=await browser.newPage();
try {
 await p.goto(u.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await p.locator("#user_login").count()){
  await p.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await p.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=await p.locator("body").innerText();
  const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],ans=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const f=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error("WP math input absent");await f.fill(String(ans));}
  await Promise.all([p.waitForLoadState("domcontentloaded"),p.locator("#wp-submit").click()]);
 }
 if(p.url().includes("wp-login"))throw Error("WordPress login refused");
 const nonce=await p.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("No REST nonce");return(await r.text()).trim();
 });
 const api=(url,method="GET",body)=>p.evaluate(async({url,method,body,nonce})=>{
  const r=await fetch(url,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return{http:r.status,data:await r.json().catch(()=>({}))};
 },{url,method,body,nonce});
 const url="/wp-json/wp/v2/pages/81087";
 const [before,menu,formId]=await Promise.all([api(url+"?context=edit&_fields=id,slug,status,acf,title,content"),api("/wp-json/wp/v2/menu-items/77020?context=edit"),api("/wp-json/pse/v1/contact-form-id")]);
 const b=before.data||{},m=menu.data||{};
 if(before.http!==200||b.id!==81087||b.slug!=="xu-ly-khieu-nai-y-kien-khach-hang"||
    b.acf?.action!=="PseComplaintPage"||b.acf?.key!=="pse-complaint"||
    !["draft","publish"].includes(b.status)||menu.http!==200||m.id!==77020||
    Number(m.parent)!==77004||!String(m.title?.raw||m.title?.rendered||"").includes("Xử lý khiếu nại"))
    throw Error("Complaint Page/menu identity not trustworthy");
 if(formId.http!==200||!Number.isSafeInteger(Number(formId.data?.id))||Number(formId.data.id)<1)
    throw Error("Configured CF7 form ID unavailable");
 const cfg=await api("/wp-json/contact-form-7/v1/contact-forms/"+formId.data.id);
 const mail=cfg.data?.properties?.mail||{};
 if(cfg.http!==200||!mail.recipient||!mail.sender||!mail.subject||!mail.body||cfg.data?.config_errors?.length)
    throw Error("CF7 mail configuration is not ready");
 if(b.status==="publish"){console.log("PSE_COMPLAINT_PUBLISH=ALREADY_DONE; id=81087; no_write=true");process.exit(0)}
 const changed=await api(url,"POST",{status:"publish"});
 if(changed.http!==200||changed.data?.status!=="publish")throw Error("WP Page Publish rejected");
 const [after,menuAfter]=await Promise.all([api(url+"?context=edit&_fields=id,slug,status,acf,title,content"),api("/wp-json/wp/v2/menu-items/77020?context=edit")]);
 if(after.http!==200||after.data.status!=="publish"||after.data.slug!==b.slug||
    after.data.acf?.action!==b.acf.action||after.data.acf?.key!==b.acf.key||
    after.data.title?.raw!==b.title?.raw||after.data.content?.raw!==b.content?.raw||
    menuAfter.http!==200||menuAfter.data.type!==m.type||menuAfter.data.url!==m.url)
    throw Error("Post-Publish Page/menu readback changed unexpectedly");
 console.log("PSE_COMPLAINT_PUBLISH=PASS page=81087 status=publish menuNotCutover=true noEmail=true noAstroBuild=true");
}finally{await browser.close()}
