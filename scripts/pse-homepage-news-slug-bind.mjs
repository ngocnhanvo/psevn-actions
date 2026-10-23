/** Bind each existing PSE news tab to the *real* WordPress category slug.
 * Preserves current categoryId and 3 labels; one extra ESC Table column.
 * Native TablePress editor only; audit-only mode does not change WP.
 */
import {chromium} from "playwright";
const audit=process.env.PSE_NEWS_SLUG_AUDIT_ONLY==="1";
const origins=String(process.env.ENV_FILE||"").split(/\r?\n/)
 .map(x=>x.trim().replace(/^export\s+/,"")).filter(x=>x.startsWith("WC_URL="));
if(origins.length!==1)throw Error("Missing WP origin");
const url=new URL(origins[0].slice(7).trim().replace(/^['"]|['"]$/g,""));
if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||!["","/"].includes(url.pathname))
 throw Error("Invalid WP admin origin");
const origin=url.origin;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:950}});
page.on("dialog",async d=>{if(d.type()==="confirm")await d.accept();else await d.dismiss()});
try{
 await page.goto(origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)throw Error("Missing WP admin credentials");
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const text=await page.locator("body").innerText();
  const m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3],answer=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await input.count())throw Error("Arithmetic login input missing");
   await input.fill(String(answer));
  }
  await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
 }
 if(page.url().includes("wp-login"))throw Error("WP login failed");
 await page.goto(origin+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 const nonce=await page.evaluate(()=>window.wpApiSettings?.nonce||"");
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("WP REST editor nonce unavailable");
 const read=path=>page.evaluate(async({path,nonce})=>{
  const r=await fetch(path,{credentials:"same-origin",
    headers:{"X-WP-Nonce":nonce,Accept:"application/json","Cache-Control":"no-cache"}});
  return {status:r.status,data:await r.json().catch(()=>null)};
 },{path,nonce});
 const table=await read("/wp-json/tablepress/v1/table/pse_01_vi");
 if(table.status!==200||table.data?.id!=="pse_01_vi"||table.data?.items?.length!==3)
  throw Error("Unexpected source PSE news table");
 const keys=table.data.fields?.map(x=>x.key)||[];
 if(![3,4].includes(keys.length)||keys.slice(0,3).join(",")!=="label,categoryId,href"||
    (keys.length===4&&keys[3]!=="categorySlug"))
  throw Error("ESC news table column contract changed");
 const ids=table.data.items.map(item=>Number(item.categoryId));
 if(ids.some(id=>!Number.isSafeInteger(id)||id<=0)||new Set(ids).size!==3)
  throw Error("WordPress news category IDs are invalid");
 const slugs=[];
 for(const id of ids){
  const cat=await read("/wp-json/wp/v2/categories/"+id+"?_fields=id,slug");
  if(cat.status!==200||cat.data?.id!==id||!cat.data.slug)throw Error("Cannot resolve category ID "+id);
  const verify=await read("/wp-json/wp/v2/categories?slug="+encodeURIComponent(cat.data.slug)+"&_fields=id,slug");
  if(verify.status!==200||verify.data?.length!==1||verify.data[0].id!==id)
   throw Error("Category slug mismatch "+id);
  const posts=await read("/wp-json/wp/v2/posts?_embed=true&status=publish&categories="+id+
    "&orderby=date&order=desc&per_page=5&page=1&lang=vi");
  if(posts.status!==200||!Array.isArray(posts.data)||posts.data.length>5||
     posts.data.some(p=>p.status!=="publish"||!p.categories.includes(id)))
    throw Error("WP latest posts REST contract failed "+id);
  console.log("PSE_NEWS_SLUG_LOOKUP=PASS; id="+id+"; slug="+cat.data.slug+"; latest_count="+posts.data.length);
  slugs.push(cat.data.slug);
 }
 if(keys.length===4){
   if(table.data.items.some((item,i)=>item.categorySlug!==slugs[i]))
     throw Error("Previously edited categorySlug differs from REST identity");
   console.log("PSE_NEWS_SLUG_BIND=ALREADY_COMPLETE; no_write=true");
   process.exit(0);
 }
 if(audit){
   console.log("PSE_NEWS_SLUG_AUDIT=PASS; items=3; confirmed_slugs="+slugs.join(",")+"; no_write=true");
   process.exit(0);
 }
 await page.goto(origin+"/wp-admin/admin.php?page=tablepress&action=edit&table_id=pse_01_vi",
   {waitUntil:"domcontentloaded",timeout:60000});
 await page.waitForFunction(()=>Array.isArray(window.tp?.table?.data)&&
   typeof window.tp?.callbacks?.append==="function"&&
   typeof window.tp?.editor?.setValueFromCoords==="function",null,{timeout:25000});
 const snapshot=await page.evaluate(()=>({
   id:window.tp.table.id||window.tp.table.meta?.id,
   rows:window.tp.table.data.map(x=>Array.from(x))
 }));
 if(snapshot.id!=="pse_01_vi"||snapshot.rows.length!==5||
   snapshot.rows[0].join(",")!==keys.join(",")||
   snapshot.rows.slice(2).some((row,i)=>row[0]!==table.data.items[i].label||
     String(row[1])!==String(ids[i])||String(row[2]||"")!==String(table.data.items[i].href||"")))
   throw Error("Native ESC Table does not match backed-up REST content");
 await page.evaluate(slugs=>{
   const tp=window.tp;
   tp.callbacks.append("columns",1);
   if(tp.table.data.length!==5||tp.table.data.some(row=>row.length!==4))
     throw Error("ESC Table native Add Column did not create one column");
   tp.editor.setValueFromCoords(3,0,"categorySlug");
   tp.editor.setValueFromCoords(3,1,"Slug chuyên mục WordPress");
   slugs.forEach((slug,i)=>tp.editor.setValueFromCoords(3,i+2,slug));
   tp.helpers.unsaved_changes.set();
 },slugs);
 await page.getByRole("button",{name:"Save Changes",exact:true}).first().click();
 let ok=false;
 for(let i=0;i<20;i++){
   await page.waitForTimeout(1000);
   const result=await read("/wp-json/tablepress/v1/table/pse_01_vi");
   const d=result.data;
   if(result.status===200&&
      d?.fields?.map(x=>x.key).join(",")==="label,categoryId,href,categorySlug"&&
      d.items?.length===3&&d.items.every((item,i)=>item.categorySlug===slugs[i]&&
        Number(item.categoryId)===ids[i]&&item.label===table.data.items[i].label)){
     ok=true;break;
   }
 }
 if(!ok)throw Error("ESC Table native Save read-after-write mismatch");
 console.log("PSE_NEWS_SLUG_BIND=PASS; rows=3; native_editor=true; category_ids_unchanged=true; no_astro_build=true");
}finally{await browser.close()}
