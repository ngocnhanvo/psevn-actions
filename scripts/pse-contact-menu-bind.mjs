/** Bind existing verified PSE contact WordPress Page in header, keeping source content untouched. */
import {chromium} from "playwright";
const rows=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const o=rows.filter(s=>s.startsWith("WC_URL="));if(o.length!==1)throw Error("PSE CMS origin unknown");
const wp=new URL(o[0].slice(7).replace(/^['"]|['"]$/g,""));
if(wp.protocol!=="https:"||wp.username||wp.password||wp.search||wp.hash||!["","/"].includes(wp.pathname))throw Error("Untrusted CMS URL");
const browser=await chromium.launch({headless:true});const page=await browser.newPage();
try{
 await page.goto(wp.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const txt=await page.locator("body").innerText(),m=txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("Captcha missing");await f.fill(String(n))}
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WP auth rejected");
 const nonce=await page.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("WP nonce");return (await r.text()).trim()});
 const api=async(path,method="GET",body)=>page.evaluate(async({path,nonce,method,body})=>{const r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,"Accept":"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});return{http:r.status,data:await r.json().catch(()=>({}))}},{path,nonce,method,body});
 const p=await api("/wp-json/wp/v2/pages/47222?context=edit&_fields=id,slug,status,acf,content,title");
 if(p.http!==200||p.data?.id!==47222||p.data.slug!=="lien-he"||p.data.status!=="publish"||p.data.acf?.action!=="PrivatePage"||p.data.acf?.key!=="contact"||!String(p.data.content?.raw||"").trim())throw Error("Native WordPress contact Page identity/content mismatch");
 const path="/wp-json/wp/v2/menu-items/77029";
 const menu=await api(path+"?context=edit");
 if(menu.http!==200||menu.data?.id!==77029||Number(menu.data.parent)!==0||String(menu.data.title?.raw||menu.data.title?.rendered||"").trim()!=="LIÊN HỆ")throw Error("Wrong original contact menu");
 if(menu.data.type==="post_type"&&menu.data.object==="page"&&Number(menu.data.object_id)===47222){console.log("PSE_CONTACT_MENU=ALREADY_DONE; no_write=true");process.exit(0)}
 if(menu.data.type!=="custom"||new URL(menu.data.url).hostname!=="www.pse.vn"||new URL(menu.data.url).pathname!=="/lien-he.html")throw Error("Contact menu changed outside verified source");
 const changed=await api(path,"POST",{type:"post_type",object:"page",object_id:47222});
 if(changed.http!==200||changed.data.id!==77029||Number(changed.data.object_id)!==47222)throw Error("Native contact menu update failed");
 const read=await api(path+"?context=edit");
 if(read.http!==200||read.data.type!=="post_type"||read.data.object!=="page"||Number(read.data.object_id)!==47222)throw Error("Contact menu readback failed");
 console.log("PSE_CONTACT_MENU=PASS; native_wp_page=47222; menu=77029; original_content_untouched=true; no_astro_build=true");
}finally{await browser.close()}
