/** G8 ESC Table preflight: authenticated WordPress READ ONLY, never saves. */
import {chromium} from "playwright";
import {createHash} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const matches=vars.filter(s=>s.startsWith("WC_URL="));
if(matches.length!==1)throw Error("Ambiguous or missing PSE WordPress origin");
const site=new URL(matches[0].slice(7).replace(/^['"]|['"]$/g,""));
if(site.protocol!=="https:"||site.username||site.password||site.search||site.hash||!["","/"].includes(site.pathname))throw Error("Invalid PSE WordPress origin");
if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("WP Admin secrets missing");
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
try{
 await page.goto(site.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const body=await page.locator("body").innerText();
  const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];const inp=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();if(!await inp.count())throw Error("Login math input unavailable");await inp.fill(String(v))}
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WP login rejected");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("WP nonce HTTP "+r.status);
  return (await r.text()).trim();
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("WP REST nonce missing");
 const api=async route=>page.evaluate(async({route,nonce})=>{const r=await fetch(route,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,"Cache-Control":"no-cache"}});return {http:r.status,data:await r.json().catch(()=>({}))}},{route,nonce});
 const response=await api("/wp-json/wp/v2/pages/79311?context=edit&_fields=id,slug,status,acf,content,title,modified");
 if(response.http!==200||response.data.id!==79311||response.data.slug!=="thanh-tuu"||response.data.status!=="publish"||response.data.acf?.action!=="PublicPage"||response.data.acf?.key!=="pse-company-thanh-tuu")throw Error("WordPress Page ID/action/key mismatch: "+response.http);
 const raw=response.data.content?.raw||"";
 const awards=await page.evaluate(html=>{
  const node=document.createElement("div");node.innerHTML=html;
  const t=node.querySelector('table#Table_01 table');if(!t)throw Error("Legacy awards nested table missing");
  const rows=[...t.querySelectorAll("tr")].filter(r=>r.closest("table")===t);
  return rows.map(row=>{const c=[...row.children].filter(e=>/^(TD|TH)$/.test(e.tagName));if(c.length!==2)throw Error("Award row expected 2 cells");const image=c[0].querySelector("img");const title=c[1].querySelector("div");const list=[...c[1].querySelectorAll("li")].map(li=>li.innerHTML);return {year:(title?.textContent||"").trim().replace(/\s+/g," "),image:{src:image?.getAttribute("src")||"",alt:image?.getAttribute("alt")||""},descriptions:list};});
 },raw);
 const years=["Năm 2026","Năm 2015","Năm 2013","Năm 2012","Năm 2011","Năm 2010","Năm 2009","Năm 2008"];
 if(awards.length!==8||awards.some((x,i)=>x.year!==years[i]||!x.image.src||!x.descriptions.length)||awards.reduce((n,x)=>n+x.descriptions.length,0)!==17)throw Error("G8 award content drift");
 const imageNames=awards.map(a=>decodeURIComponent(new URL(a.image.src,site.origin).pathname.split("/").at(-1)||""));
 const media=await api("/wp-json/wp/v2/media?context=edit&per_page=100&search=pse-corp-thanh-tuu");
 if(media.http!==200||!Array.isArray(media.data))throw Error("WP Media inventory unavailable");
 const mapped=imageNames.map((name,i)=>{const found=media.data.filter(m=>(m.media_details?.file||"").split("/").at(-1)===name);return {year:awards[i].year,name,ids:found.map(m=>m.id),alt:found.map(m=>m.alt_text)}}); 
 const exists=await api("/wp-json/tablepress/v1/table/pse_awards_vi");
 await page.goto(site.origin+"/wp-admin/admin.php?page=tablepress_add",{waitUntil:"domcontentloaded",timeout:60000});
 const editor={addPage:await page.locator('input[name="table[name]"]').count(),rows:await page.locator('input[type="number"]').count()};
 const checkpoint={page:{id:response.data.id,slug:response.data.slug,status:response.data.status,acf:response.data.acf,modified:response.data.modified,contentSha256:createHash("sha256").update(raw).digest("hex")},awards,mapped,existingTableHttp:exists.http,editor,readOnly:true};
 await mkdir("artifacts/pse-awards-esc",{recursive:true});
 await writeFile("artifacts/pse-awards-esc/audit.json",JSON.stringify(checkpoint,null,2)+"\n");
 console.log("PSE_AWARDS_ESC_AUDIT="+JSON.stringify({pageId:checkpoint.page.id,yearCount:awards.length,descriptionCount:17,yearLabels:awards.map(x=>x.year),mapped,existingTableHttp:exists.http,editor,readOnly:true}));
 if(exists.http!==404)throw Error("Target ESC Table ID already in use or endpoint inaccessible; abort before authoring");
 if(editor.addPage!==1||editor.rows<2)throw Error("Native ESC Table Add editor not ready");
 if(mapped.some(x=>x.ids.length!==1))throw Error("Image media IDs cannot be uniquely resolved; preflight incomplete");
}finally{await browser.close()}
