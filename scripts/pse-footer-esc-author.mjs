/** Create the shared footer's native ESC Table without inventing certification/legal claims. */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const rows=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const entry=rows.filter(s=>s.startsWith("WC_URL="));
if(entry.length!==1)throw Error("WordPress origin missing");
const u=new URL(entry[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid WP origin");
if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("WP login secrets absent");
const origin=u.origin, tableId="pub_footer_assets_vi";
const keys=["group","label","image","value","href","visible"];
const beforePath="artifacts/pse-footer/esc-before.json";
const browser=await chromium.launch({headless:true});
const p=await browser.newPage({viewport:{width:1440,height:980}});
p.on("dialog",async d=>d.type()==="confirm"?d.accept():d.dismiss());
try {
 await p.goto(origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await p.locator("#user_login").count()){
  await p.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await p.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const text=await p.locator("body").innerText();
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3];
   const n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const captcha=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await captcha.count())throw Error("WP arithmetic challenge control absent");
   await captcha.fill(String(n));
  }
  await Promise.all([p.waitForLoadState("domcontentloaded"),p.locator("#wp-submit").click()]);
 }
 if(p.url().includes("wp-login"))throw Error("WP login failed");
 const nonce=await p.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("WP REST nonce failed");
  return (await r.text()).trim();
 });
 const get=route=>p.evaluate(async({route,nonce})=>{
  const r=await fetch(route,{credentials:"same-origin",cache:"no-store",headers:{"X-WP-Nonce":nonce,"Cache-Control":"no-cache"}});
  return {http:r.status,data:await r.json().catch(()=>({}))};
 },{route,nonce});
 const first=await get("/wp-json/tablepress/v1/table/"+tableId);
 await mkdir("artifacts/pse-footer",{recursive:true});
 await writeFile(beforePath,JSON.stringify({
  tableId,exists:first.http===200,http:first.http,
  fields:first.data?.fields||[],items:first.data?.items||[],
  note:"This backup is restricted to footer table content; no WordPress user data."
 },null,2)+"\n");
 if(first.http===200){
  if(first.data?.id!==tableId||JSON.stringify(first.data.fields?.map(x=>x.key))!==JSON.stringify(keys))
   throw Error("Existing footer ESC Table has a different schema; preserve for manual parity review");
  console.log("PSE_FOOTER_ESC_CMS=ALREADY_EXISTS; rows="+(first.data.items?.length||0)+"; write=false");
  process.exit(0);
 }
 if(first.http!==404)throw Error("ESC Table preflight failed HTTP "+first.http);
 // The first Add Table request can finish server-side even when Playwright
 // times out waiting for the editor navigation. Recover its unique empty row.
 const list=await get("/wp-json/tablepress/v1/tables/prefix/all?per_page=100&page=1");
 if(list.http!==200||!Array.isArray(list.data))throw Error("ESC Table inventory unavailable after preflight");
 const candidates=list.data.filter(x=>x?.name==="Footer PSE - Thông tin bổ sung");
 if(candidates.length>1)throw Error("Multiple footer draft tables; do not create another");
 const draftId=candidates[0]?.id;
 if(candidates.length===1 && (!draftId||!/^[a-zA-Z0-9_-]+$/.test(String(draftId))))
  throw Error("Footer draft has no safe native TablePress ID");
 if(draftId){
  console.log("PSE_FOOTER_RECOVER_EXISTING_DRAFT=true");
  await p.goto(origin+"/wp-admin/admin.php?page=tablepress&action=edit&table_id="+draftId,{waitUntil:"domcontentloaded",timeout:65000});
  await p.waitForFunction(()=>Array.isArray(window.tp?.table?.data),null,{timeout:25000});
  const draft=await p.evaluate(()=>({id:window.tp.table.id,grid:window.tp.table.data}));
  if(draft.id!==String(draftId)||draft.grid.length!==3||draft.grid.some(r=>r.length!==keys.length||r.some(x=>String(x||"").trim())))
   throw Error("Existing draft not blank; stop before overwriting content");
 }else{
  await p.goto(origin+"/wp-admin/admin.php?page=tablepress_add",{waitUntil:"domcontentloaded",timeout:65000});
  await p.locator('input[name="table[name]"]').fill("Footer PSE - Thông tin bổ sung");
  await p.locator('textarea[name="table[description]"]').fill("Bảng toàn cục cho footer. Các hàng: certification (chứng nhận dùng Insert Image có alt), responsible (thông tin người phụ trách), credit (ghi công); visible=0 để ẩn. Thông tin công ty, fax, BCT lấy từ WordPress Thông tin chung.");
  const sizes=p.locator('input[type="number"]');
  if(await sizes.count()<2)throw Error("Native TablePress create controls missing");
  await sizes.nth(0).fill("3");
  await sizes.nth(1).fill(String(keys.length));
  await p.getByRole("button",{name:"Add Table"}).click({noWaitAfter:true,timeout:25000});
  await p.locator("#table-id").waitFor({state:"visible",timeout:45000});
 }
 if(await p.locator("#table-id").getAttribute("readonly")!==null)throw Error("ESC Table ID is immutable");
 await p.locator("#table-id").fill(tableId);
 await p.locator("#table-name").focus();
 await p.getByRole("button",{name:/Save Changes|Lưu thay đổi/i}).first().click({noWaitAfter:true});
 await p.waitForTimeout(1600);
 await p.goto(origin+"/wp-admin/admin.php?page=tablepress&action=edit&table_id="+tableId,{waitUntil:"domcontentloaded",timeout:65000});
 await p.waitForFunction(()=>Array.isArray(window.tp?.table?.data)&&typeof window.tp?.editor?.setValueFromCoords==="function",null,{timeout:25000});
 const state=await p.evaluate(()=>({id:window.tp.table.id,grid:window.tp.table.data}));
 if(state.id!==tableId||state.grid.length!==3||state.grid.some(row=>row.length!==keys.length||row.some(x=>String(x||"").trim())))
  throw Error("New ESC Table is not blank and correct size");
 await p.evaluate(keys=>{
  const t=window.tp;
  const descriptions=["Loại nhóm","Nhãn","Ảnh bằng Insert Image","Nội dung","Liên kết","Hiện 1 / ẩn 0"];
  for(let i=0;i<keys.length;i++){
   t.editor.setValueFromCoords(i,0,keys[i]);
   t.editor.setValueFromCoords(i,1,descriptions[i]);
  }
  // The reference footer explicitly credits its designer; do not invent URLs.
  ["credit","Thiết kế","","Designed by ESC","","1"].forEach((v,i)=>t.editor.setValueFromCoords(i,2,v));
  t.helpers.unsaved_changes.set();
 },keys);
 await p.getByRole("button",{name:"Save Changes",exact:true}).first().click();
 let saved;
 for(let n=0;n<16;n++){
  await p.waitForTimeout(950);
  saved=await get("/wp-json/tablepress/v1/table/"+tableId);
  if(saved.http===200&&
     JSON.stringify(saved.data?.fields?.map(x=>x.key))===JSON.stringify(keys)&&
     saved.data?.items?.length===1&&saved.data.items[0].group==="credit"&&
     saved.data.items[0].value==="Designed by ESC")break;
 }
 if(saved?.data?.items?.length!==1||saved.data.items[0].value!=="Designed by ESC")
   throw Error("Native footer TablePress save/readback failed");
 console.log("PSE_FOOTER_ESC_CMS=PASS; id="+tableId+"; source=WordPress; global=true; rows=1; certifications=unverified_not_published; no_astro_build=true");
}finally{await browser.close();}
