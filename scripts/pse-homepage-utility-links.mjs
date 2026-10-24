/** PSE useful links: populate ONLY pse_03_vi via native ESC Table editor.
 * User supplied original seven organizations/URLs; no fabricated destination.
 */
import { chromium } from "playwright";
const values=[
 ["Tổng Công ty Phân bón và Hóa chất Dầu khí","http://dpm.vn/"],
 ["Tập đoàn Dầu khí Việt Nam","http://www.pvn.vn/"],
 ["Tổng công ty tài chính cổ phần dầu khí VN","http://pvfc.com.vn/"],
 ["Công ty CP Phân bón và Hóa chất Dầu Khí Miền Bắc","http://dpm-mb.vn/Home/"],
 ["Công ty CP Phân bón và Hóa chất Dầu Khí Miền Trung","http://pce.vn/"],
 ["Công ty CP Phân bón và Hóa chất Dầu Khí Tây Nam Bộ","http://dpmtnb.com.vn/"],
 ["Công ty CP quản lý và phát triển nhà Dầu khí miền Nam","http://www.pvfcco-sbd.vn/"]
];
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const configured=env.filter(s=>s.startsWith("WC_URL="));
if(configured.length!==1)throw Error("Missing WP origin");
const site=new URL(configured[0].slice(7).replace(/^['"]|['"]$/g,""));
if(site.protocol!=="https:"||site.username||site.password||site.search||site.hash||!["","/"].includes(site.pathname))
 throw Error("Untrusted PSE WP origin");
const origin=site.origin;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
page.on("dialog",async d=>{try{if(d.type()==="confirm")await d.accept();else await d.dismiss()}catch{}});
const read=()=>page.evaluate(async()=>{
 const r=await fetch("/wp-json/tablepress/v1/table/pse_03_vi",{credentials:"same-origin",
  headers:{Accept:"application/json","Cache-Control":"no-cache"}});
 return {status:r.status,data:await r.json().catch(()=>null)};
});
try{
 await page.goto(origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("Missing WP admin credentials");
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const body=await page.locator("body").innerText();
  const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=Number(m[1]),b=Number(m[3]),result=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const captcha=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await captcha.count())throw Error("WordPress login challenge field missing");
   await captcha.fill(String(result));
  }
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WordPress admin authentication failed");
 const current=await read();
 if(current.status!==200||current.data?.id!=="pse_03_vi"||
   current.data.fields?.map(x=>x.key).join(",")!=="label,href"||
   !Array.isArray(current.data.items))
  throw Error("Unexpected PSE ESC Table id/field source, no write");
 const existing=current.data.items.map(x=>[String(x.label||""),String(x.href||"")]);
 if(JSON.stringify(existing)===JSON.stringify(values)){
  console.log("PSE_USEFUL_LINKS=ALREADY_CORRECT; count=7; no_change=true");process.exit(0);
 }
 const legacy=[["Báo cáo tài chính","https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-tai-chinh.html"],
   ["Liên hệ","https://www.pse.vn/lien-he.html"]];
 if(JSON.stringify(existing)!==JSON.stringify(legacy))
  throw Error("Unexpected ESC Table content; refusing to override admin edits");
 await page.goto(origin+"/wp-admin/admin.php?page=tablepress&action=edit&table_id=pse_03_vi",
   {waitUntil:"domcontentloaded",timeout:60000});
 await page.waitForFunction(()=>window.tp?.table?.data&&typeof window.tp?.callbacks?.append==="function"&&
   typeof window.tp?.editor?.setValueFromCoords==="function",null,{timeout:30000});
 const before=await page.evaluate(()=>({
  id:window.tp.table.id||window.tp.table.meta?.id,
  rows:window.tp.table.data.map(x=>Array.from(x))
 }));
 if(before.id!=="pse_03_vi"||before.rows.length!==4||
    JSON.stringify(before.rows.slice(0,2))!==JSON.stringify([["label","href"],["Tên liên kết","Địa chỉ liên kết"]])||
    JSON.stringify(before.rows.slice(2))!==JSON.stringify(legacy))
  throw Error("Native ESC Table editor unexpected grid; no write");
 await page.evaluate(values=>{
  const tp=window.tp;
  tp.callbacks.append("rows",values.length-2);
  if(tp.table.data.length!==values.length+2)throw Error("ESC Table row expansion failed");
  for(let i=0;i<values.length;i++)
   for(let j=0;j<2;j++)tp.editor.setValueFromCoords(j,i+2,values[i][j]);
  tp.helpers.unsaved_changes.set();
 },values);
 await page.getByRole("button",{name:"Save Changes",exact:true}).first().click();
 await page.waitForTimeout(1700);
 const saved=await read();
 if(saved.status!==200||saved.data?.id!=="pse_03_vi"||
  JSON.stringify(saved.data.items.map(x=>[String(x.label||""),String(x.href||"")]))!==JSON.stringify(values))
  throw Error("ESC Table REST readback did not confirm all seven organization links");
 console.log("PSE_USEFUL_LINKS=PASS; esc_table=pse_03_vi; count=7; source=user_supplied_original; no_build=true");
}finally{await browser.close()}
