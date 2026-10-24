/** Read-only verification of the two PSE post routing ACF defaults. */
import {chromium} from "playwright";
const configs=String(process.env.ENV_FILE||"").split(/\r?\n/)
 .map(x=>x.trim().replace(/^export\s+/,"")).filter(x=>x.startsWith("WC_URL="));
if(configs.length!==1)throw Error("Expected unique WC_URL");
const url=new URL(configs[0].slice(7).trim().replace(/^['"]|['"]$/g,""));
if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||
   !["/",""].includes(url.pathname))throw Error("Invalid WordPress origin");
if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("Missing WP credentials");
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1366,height:900}});
try {
 await page.goto(url.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
   await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
   await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
   const text=await page.locator("body").innerText();
   const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
   if(m){
     const a=+m[1],b=+m[3],value=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
     const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
     if(!await input.count())throw Error("Login challenge input unavailable");
     await input.fill(String(value));
   }
   await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WordPress login failed");
 console.log("PSE_ACF_ADMIN_AUTH=PASS");

 async function checkEditor(path,expected,label){
   await page.goto(url.origin+path,{waitUntil:"domcontentloaded",timeout:60000});
   if(page.url().includes("wp-login"))throw Error("Editor login lost "+label);
   const values=await page.evaluate(()=>{
     const o={};
     for(const name of ["key","action"]){
       const container=document.querySelector('.acf-field[data-name="'+name+'"]');
       const input=container?.querySelector('input:not([type=hidden]), textarea');
       o[name]=input?input.value:null;
     }
     return o;
   });
   if(values.key!==expected.key || values.action!==expected.action)
     throw Error(label+" ACF default mismatch: "+JSON.stringify(values));
   console.log("PSE_ACF_"+label+"=PASS; key="+values.key+"; action="+values.action+"; read_only=true");
 }
 // The owner provided a screenshot of an old migrated article with blank routing fields.
 await checkEditor("/wp-admin/post.php?post=78287&action=edit",
   {key:"ssr-post",action:"PostDetails"},"EXISTING_POST");
 await checkEditor("/wp-admin/post-new.php",
   {key:"ssr-post",action:"PostDetails"},"NEW_POST");
 // Pages retain their existing Page routing contract, not PostDetails.
 await checkEditor("/wp-admin/post.php?post=248&action=edit",
   {key:"home",action:"HomePage"},"HOME_PAGE_UNCHANGED");
 console.log("PSE_ACF_POST_DEFAULTS=PASS; edits=0; no_build=true");
} finally { await browser.close() }
