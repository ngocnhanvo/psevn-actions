/** Read-only browser proof for the PSE Pages -> ESC Visual Builder shortcut. */
import {chromium} from "playwright";

const matches=String(process.env.ENV_FILE||"").split(/\r?\n/)
 .map(x=>x.trim().replace(/^export\s+/,"")).filter(x=>x.startsWith("WC_URL="));
if(matches.length!==1)throw Error("Expected a single WordPress WC_URL");
const wp=new URL(matches[0].slice(7).trim().replace(/^['"]|['"]$/g,""));
if(wp.protocol!=="https:"||wp.username||wp.password||wp.search||wp.hash||
   !["/",""].includes(wp.pathname)||wp.hostname!=="admin-pse.webnvn.com")
  throw Error("Unexpected PSE WordPress origin");
if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)
  throw Error("WordPress QA credentials unavailable");

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
try{
  await page.goto(wp.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
  if(await page.locator("#user_login").count()){
    await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
    await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
    const text=await page.locator("body").innerText();
    const challenge=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)
      || text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if(challenge){
      const a=+challenge[1],b=+challenge[3];
      const result=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[challenge[2]];
      const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if(!await input.count())throw Error("Login challenge input not found");
      await input.fill(String(result));
    }
    await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
  }
  if(page.url().includes("wp-login"))throw Error("WordPress authentication failed");
  console.log("PSE_PAGE_ROW_ADMIN_LOGIN=PASS");

  await page.goto(wp.origin+"/wp-admin/edit.php?post_type=page",
    {waitUntil:"domcontentloaded",timeout:60000});
  let row=page.locator("#post-83572");
  if(await row.count()===0){
    await page.goto(wp.origin+"/wp-admin/edit.php?post_type=page&s=Kali",
      {waitUntil:"domcontentloaded",timeout:60000});
    row=page.locator("#post-83572");
  }
  if(await row.count()!==1)throw Error("Expected Page 83572 not found in Pages list");
  console.log("PSE_PAGE_ROW_PAGE_FOUND=PASS page_id=83572");

  const actions=row.locator(".row-actions a");
  const builder=actions.filter({hasText:"Edit với ESC builder"});
  if(await builder.count()!==1)throw Error("ESC builder Page action missing or duplicated");
  if(await actions.filter({hasText:"Rewrite & Republish"}).count())
    throw Error("Old Rewrite & Republish action still visible");
  const href=new URL(await builder.getAttribute("href"),wp.origin);
  if(href.origin!==wp.origin||href.pathname!=="/wp-admin/edit.php"||
     href.searchParams.get("post_type")!=="page"||
     href.searchParams.get("page")!=="esc-visual-builder"||
     href.searchParams.get("esc_vb_page")!=="83572")
    throw Error("Wrong Builder action URL");
  console.log("PSE_PAGE_ROW_LINK=PASS; old_rewrite=ABSENT; correct_page=83572");

  const [popup]=await Promise.all([
    page.waitForEvent("popup",{timeout:20000}),
    builder.click()
  ]);
  await popup.waitForLoadState("domcontentloaded",{timeout:60000});
  const picker=popup.locator("#esc-vb-page");
  await picker.waitFor({state:"visible",timeout:60000});
  if(await picker.inputValue()!=="83572")throw Error("Builder selected wrong Page");
  console.log("PSE_PAGE_ROW_BUILDER_OPEN=PASS; selected_page=83572; read_only=true");
  await popup.close();
}finally{
  await browser.close();
}
