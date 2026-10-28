/** PSE Woo REST credential identity audit via authenticated WordPress Admin, READ ONLY. */
import { chromium } from "playwright";
const lines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
function env(name){const a=lines.filter(x=>x.startsWith(name+"="));if(a.length!==1)throw Error("Missing unique "+name);return a[0].slice(name.length+1).trim().replace(/^['"]|['"]$/g,"");}
const origin=new URL(env("WC_URL"));
if(origin.protocol!=="https:"||origin.hostname!=="admin-pse.webnvn.com"||origin.username||origin.password||origin.search||origin.hash||!["","/"].includes(origin.pathname))throw Error("Wrong WordPress identity");
const key=env("WOO_KEY");
if(!/^ck_[A-Za-z0-9]{20,}$/i.test(key))throw Error("Configured consumer key format invalid");
if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("Missing WordPress Admin credentials");
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1400,height:900}});
try{
 await page.goto(origin.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const body=await page.locator("body").innerText();
  const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error("Missing challenge input");
   await field.fill(String(v));
  }
  await page.locator("#wp-submit").click({noWaitAfter:true,timeout:25000});
  await page.waitForFunction(()=>location.pathname.startsWith("/wp-admin")&&!document.querySelector("#loginform"),null,{timeout:45000});
 }
 console.log("PSE_AGENT_WP_ADMIN_LOGIN=PASS");
 await page.goto(origin.origin+"/wp-admin/admin.php?page=wc-settings&tab=advanced&section=keys",{waitUntil:"domcontentloaded",timeout:65000});
 if(page.url().includes("wp-login"))throw Error("WP Admin session lost");
 const info=await page.evaluate((suffix)=>{
   const body=document.body.innerText;
   const keysPage=body.includes("REST API")||body.includes("API keys")||body.includes("Khóa API")||body.includes("API Keys");
   const rows=[...document.querySelectorAll("table.wp-list-table tbody tr, table.wc_keys tbody tr")];
   const matched=rows.some(r=>r.innerText.includes(suffix));
   return {keysPage,rows:rows.length,matched,permissionDenied:/not allowed|không có quyền|not sufficient permissions/i.test(body)};
 },key.slice(-7));
 console.log("PSE_AGENT_WOO_KEYS_PAGE="+(info.keysPage?"PASS":"UNVERIFIED")+" rows="+info.rows+" configured_key_suffix_visible="+info.matched+" permission_denied="+info.permissionDenied);
 if(info.permissionDenied)throw Error("WordPress admin lacks WooCommerce key management permission");
 if(!info.keysPage)throw Error("WooCommerce API keys page unavailable");
 console.log("PSE_AGENT_WOO_KEY_IDENTITY_AUDIT=PASS read_only=true; KEY_MATCH="+(info.matched?"YES":"NO_OR_NOT_LISTED"));
} finally{await browser.close();}
