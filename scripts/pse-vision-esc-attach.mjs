/** Attach two validated WordPress ESC Table sections with native Insert Code and read-after-write. */
import {chromium} from "playwright";
import {createHash} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
const lines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim());
const matches=lines.filter(x=>x.startsWith("WC_URL="));
if(matches.length!==1)throw Error("Missing CMS origin");
const u=new URL(matches[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("CMS origin invalid");
const origin=u.origin,tableId="pse_vision_vi",pageId=79303,shortcode="[table id=pse_vision_vi /]";
const hash=x=>createHash("sha256").update(x).digest("hex");
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1500,height:980}});
page.on("dialog",async d=>d.type()==="confirm"?d.accept():d.dismiss());
try{
 await page.goto(origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const text=await page.locator("body").innerText();
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await f.count())throw Error("WP math input unavailable");await f.fill(String(v))}
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WP auth failed");
 const nonce=await page.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("Nonce request rejected");return (await r.text()).trim()});
 const get=route=>page.evaluate(async({route,nonce})=>{const r=await fetch(route,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,"Cache-Control":"no-cache"}});return {http:r.status,data:await r.json().catch(()=>({}))}},{route,nonce});
 const p=await get("/wp-json/wp/v2/pages/"+pageId+"?context=edit&_fields=id,slug,status,acf,content,modified");
 if(p.http!==200||p.data?.id!==pageId||p.data.slug!=="tam-nhin-su-menh"||
  p.data.status!=="publish"||p.data.acf?.key!=="pse-company-tam-nhin-su-menh"||
  p.data.acf?.action!=="PublicPage")throw Error("Wrong PSE source Page");
 const t=await get("/wp-json/tablepress/v1/table/"+tableId);
 if(t.http!==200||t.data?.id!==tableId||
  JSON.stringify(t.data.fields?.map(x=>x.key))!==JSON.stringify(["title","img","details"])||
  t.data.items?.length!==2||t.data.items[0].title!=="Sứ mệnh"||t.data.items[1].title!=="Tầm nhìn"||
  t.data.items.some(x=>!/<img\b/i.test(x.img||"")||!String(x.details||"").trim()))throw Error("Native WordPress ESC Table unverified; do not edit Page");
 const raw=String(p.data.content?.raw||"");
 if(!/<table\b/i.test(raw)&&raw.includes(shortcode)){
  console.log("PSE_VISION_ATTACH=ALREADY_DONE; wp_page_unchanged=true");
  process.exit(0);
 }
 const check=await page.evaluate(html=>{
  const root=document.createElement("div");root.innerHTML=html;
  const table=root.querySelector("table");
  if(!table||root.querySelectorAll("table").length!==1)throw Error("Source table structure changed");
  const rows=[...table.querySelectorAll("tr")];
  if(rows.length!==3||rows.some(x=>x.querySelectorAll("td").length!==2))throw Error("Source table rows changed");
  const cells=rows.map(r=>[...r.querySelectorAll("td")]);
  const title=[0,1].map(i=>(cells[0][i].textContent||"").trim());
  const images=[0,1].map(i=>cells[1][i].querySelector("img")?.getAttribute("src")||"");
  const desc=[0,1].map(i=>cells[2][i].innerHTML.trim());
  const excess=[...root.children].filter(x=>x!==table);
  if(excess.length!==2||excess.some(x=>!["extranews_separator","extranews_box"].includes(x.className)||x.innerHTML.trim()))throw Error("Unexpected source nodes outside legacy table");
  return {titles:title,images,desc,bodyText:desc.map(x=>{const d=document.createElement("div");d.innerHTML=x;return (d.textContent||"").replace(/\s+/g," ").trim()})};
 },raw);
 if(JSON.stringify(check.titles)!==JSON.stringify(t.data.items.map(x=>x.title))||
   check.desc.some((x,i)=>x!==t.data.items[i].details))throw Error("ESC content not identical to source WordPress Page");
 const parity=await page.evaluate(items=>items.map(i=>{const d=document.createElement("div");d.innerHTML=String(i.img||"");const im=d.querySelector("img");return {src:im?.getAttribute("src")||"",alt:im?.getAttribute("alt")||""}}),t.data.items);
 if(parity.some((x,i)=>x.src!==check.images[i]||!x.alt)){
  console.log("PSE_VISION_IMAGE_PARITY_DIAGNOSTIC="+JSON.stringify({source:check.images,native:parity}));
  throw Error("ESC image source parity failed");
 }
 await mkdir("artifacts/pse-vision",{recursive:true});
 await writeFile("artifacts/pse-vision/page-before-attach.json",JSON.stringify({
  id:pageId,key:p.data.acf.key,action:p.data.acf.action,raw,sha256:hash(raw),
  modified:p.data.modified,tableId,items:t.data.items,verifiedText:check.bodyText
 },null,2)+"\n");
 await page.goto(origin+"/wp-admin/post.php?post="+pageId+"&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 if(!await page.locator("form#post").count()||!await page.locator("#content-html").count()||!await page.locator("#publish").count())throw Error("Native WP editor unavailable");
 await page.locator("#content-html").click();
 const textarea=page.locator("textarea#content");
 if(!await textarea.isVisible()){await page.evaluate(()=>window.switchEditors?.go("content","html"));await page.waitForTimeout(800)}
 if(!await textarea.isVisible())throw Error("Text tab unavailable");
 const before=await textarea.inputValue();
 if(before!==raw)throw Error("Page modified concurrently, refuse attach");
 await textarea.fill("");
 await textarea.focus();
 const button=page.locator("#qt_content_tablepress_quicktags_button");
 if(!await button.isVisible())throw Error("Native Insert Code button missing");
 await button.click();
 const iframe=page.locator("#TB_iframeContent");
 await iframe.waitFor({state:"visible",timeout:25000});
 await page.frameLocator("#TB_iframeContent").locator('input.insert-shortcode[title="'+shortcode+'"]').click();
 await iframe.waitFor({state:"hidden",timeout:30000});
 const inserted=await textarea.inputValue();
 const unwrap=s=>s.replace(/<div\b[^>]*class=(["'])[^"']*tablepress-preview-wrap[^"']*\1[^>]*>[\s\S]*?<span\b[^>]*class=(["'])[^"']*tablepress-preview-badge[^"']*\2[^>]*>(\[table\s+id=pse_vision_vi\s*\/\])<\/span>\s*<\/div>/gi,shortcode);
 if(unwrap(inserted).trim()!==shortcode||/<table\b/i.test(inserted)){
  console.log("PSE_VISION_INSERT_DIAGNOSTIC="+JSON.stringify({len:inserted.length,preview:inserted.slice(0,550)}));
  throw Error("Native ESC Insert Code did not produce sole section shortcode");
 }
 if(process.env.PSE_VISION_ATTACH_DRY==="1"){console.log("PSE_VISION_ATTACH=DRY_PASS; no_cms_write=true");process.exit(0)}
 const navig=page.waitForNavigation({waitUntil:"domcontentloaded",timeout:25000}).catch(()=>null);
 await page.locator("#publish").click();
 await navig;
 let saved="",current=null;
 for(let i=0;i<12;i++){
  current=await get("/wp-json/wp/v2/pages/"+pageId+"?context=edit&_fields=id,slug,status,acf,content,modified");
  saved=String(current.data?.content?.raw||"");
  if(saved!==raw)break;
  await page.waitForTimeout(1000);
 }
 const tokens=[...saved.matchAll(/\[table\s+id=([a-z0-9_-]+)\s*\/\]/gi)].map(x=>x[1]);
 console.log("PSE_VISION_ATTACH_READBACK="+JSON.stringify({
  http:current?.http,id:current?.data?.id,status:current?.data?.status,
  action:current?.data?.acf?.action,key:current?.data?.acf?.key,
  tokens,hasLegacyTable:/<table\b/i.test(saved),normalized:unwrap(saved).trim()===shortcode
 }));
 if(current?.http!==200||current.data.id!==pageId||current.data.status!=="publish"||
  current.data.acf?.key!=="pse-company-tam-nhin-su-menh"||
  current.data.acf?.action!=="PublicPage"||JSON.stringify(tokens)!==JSON.stringify([tableId])||
  /<table\b/i.test(saved)||unwrap(saved).trim()!==shortcode)
  throw Error("Native WP Page save not verified, inspect revision before retry");
 console.log("PSE_VISION_ATTACH=PASS; table="+tableId+"; page="+pageId+"; native_insert_code=true; original_prose_preserved=true; no_astro_build=true");
}finally{await browser.close()}
