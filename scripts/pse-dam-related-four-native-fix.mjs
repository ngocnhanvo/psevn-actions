/** Preserve category rich HTML, repair four proven links and exact legacy mappings. */
import {chromium,request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
const message="cms(pse): repair four proven Dam Phu My related URLs native WP";
const ev=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||process.env.GITHUB_REF!=="refs/heads/main"||ev.head_commit?.message!==message||process.env.PSE_DAM_FRESH_BACKUP!=="yes")throw Error("Unapproved write");
const proof=JSON.parse(await readFile("inputs/dam/report.json","utf8"));
const wp="https://admin-pse.webnvn.com",front="https://pse.webnvn.com",key="_vcs_category_rich_description",uri="/wp-json/wp/v2/product_cat/1763";
const digest=s=>createHash("sha256").update(s).digest("hex");
const expected=[[1668,80944,"dam-phu-my-chuyen-dung-cho-drone-1668","00056"],[1669,80946,"dam-phu-my-chuyen-dung-cho-nong-lam-truong-1669","00056"],[1676,80956,"sa-phu-my-1682","05345"],[1677,80948,"dap-phu-my-1677","05347"]];
if(proof.schema!=="pse-dam-related-links-audit-v1"||proof.rows.length!==5||proof.cms.id!==1763||proof.cms.tables!==10||proof.cms.descriptionSha256!=="2e211a54fdd0897eaf0587fe66ead87b8d9ebeff56c0e231eea09c95f7b32188")throw Error("Wrong audit");
const plans=expected.map(([id,wpId,slug,code])=>{
 const p=proof.rows.find(r=>r.id===id),from=p?.sourceLink?.href,to="/san-pham/"+slug,c=p?.candidates?.find(x=>x.id===wpId&&x.slug===slug);
 const norm=s=>String(s).replace(/[–—]/g,"-").replace(/\s+/g," ").trim();
 if(!p||!from?.startsWith("/hoat-dong-kinh-doanh/san-pham/dam-phu-my/8-trang-chu/"+id+"-")||p.sourceLink.url!=="https://pse.vn"+from||p.cms.length!==1||p.cms[0].href!==from||p.sourceArticle.http!==200||!c||!p.sourceArticle.text.includes("Mã số: "+code)||!c.body.includes("Mã số: "+code)||norm(c.body.replace(/^Thông tin chi tiết /,"").replace("Hướng dẫn sử dụng Hướng dẫn sử dụng","Hướng dẫn sử dụng"))!==norm(p.sourceArticle.text.split("Các bài viết khác")[0])||!p.checks.some(x=>x.url===front+to&&x.http===200&&x.canonical===front+to))throw Error("Unproven matching source "+id);
 return {id,wpId,from,to,code,body:c.body};
});
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
for(const [k,v] of [["WC_URL",wp],["WC_URL_CLIENT",front]]){const a=env.filter(x=>x.startsWith(k+"="));if(a.length!==1||new URL(a[0].slice(k.length+1).replace(/^['"]|['"]$/g,"")).origin!==v)throw Error("Wrong origin "+k)}
const out="artifacts/pse-dam-related-four-fix";await mkdir(out,{recursive:true});
const report={schema:"pse-dam-related-four-native-fix-v1",plans,writes:[],remaining:[1678],noProductWrites:true};
const save=()=>writeFile(out+"/report.json",JSON.stringify(report,null,2)+"\n");
const browser=await chromium.launch({headless:true}),page=await browser.newPage(),net=await request.newContext({timeout:45000});let api;
try{
 // Native WP protected REST editor, using existing source owned nonce.
 await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const login=(await page.locator("#loginform").innerText()).slice(0,500);
  const m=login.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i);
  if(m){const a=+m[1],b=+m[3],result=({"+":a+b,"-":a-b,"×":a*b,x:a*b,"*":a*b})[m[2]];
   const field=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await field.count())throw Error("Native WP login math input absent");
   await field.fill(String(result))}
  await page.locator("#wp-submit").click();
 }
 await page.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 if(page.url().includes("wp-login")||!await page.locator("#adminmenu").count())throw Error("WordPress admin not authenticated");
 const nonce=await page.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("REST nonce unavailable");return(await r.text()).trim()});
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error("Bad WordPress nonce");
 api=(path,method="GET",body)=>page.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,
   Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  return{http:r.status,pages:Number(r.headers.get("X-WP-TotalPages")||1),data:await r.json().catch(()=>null)};
 },{path,method,body,nonce});

 const fields="?context=edit&_fields=id,slug,parent,count,description,meta";
 const before=await api(uri+fields);
 if(before.http!==200||before.data.id!==1763||before.data.slug!=="dam-phu-my"||before.data.parent!==1760||before.data.count!==4)throw Error("Category identity changed");
 const raw=before.data.meta?.[key];if(typeof raw!=="string"||(raw.match(/<table\b/gi)||[]).length!==10)throw Error("Rich HTML unavailable");
 const publicR=await net.get(wp+"/wp-json/astro/v1/get-product-categories");const cat=(await publicR.json()).find(x=>x.id===1763);
 if(publicR.status()!==200||!cat||digest(cat.description)!==proof.cms.descriptionSha256)throw Error("Category changed since audit; do not overwrite");
 let updated=raw;
 for(const p of plans){
  const count=updated.split(p.from).length-1;
  if(count!==1)throw Error("Unexpected exact old href occurrences "+p.id+" "+count);
  const product=await net.get(wp+"/wp-json/wp/v2/product/"+p.wpId+"?_fields=id,slug,status,content");
  const prod=await product.json();
  if(product.status()!==200||prod.slug!==p.to.split("/").at(-1)||prod.status!=="publish"||!String(prod.content?.rendered).includes(p.code))throw Error("Native Product identity changed "+p.id);
  const live=await net.get(front+p.to,{maxRedirects:0});
  if(live.status()!==200||!(await live.text()).includes(front+p.to))throw Error("Canonical unavailable "+p.id);
  updated=updated.replace(p.from,p.to);
 }
 // No layout/label/table mutations. Round-trip exact raw string before writing.
 let reversed=updated;for(const p of plans)reversed=reversed.replace(p.to,p.from);
 if(reversed!==raw)throw Error("Only four href edits allowed");
 const list=[];
 for(let n=1;n<=40;n++){
  const q=await api("/wp-json/wp/v2/chuyen-huong-link?context=edit&status=any&per_page=100&page="+n+"&orderby=id&order=asc&_fields=id,status,acf");
  if(q.http!==200||!Array.isArray(q.data)||q.pages<1||q.pages>40)throw Error("Routing registry incomplete");
  list.push(...q.data);if(n===q.pages)break;
 }
 for(const p of plans){
  const m=list.filter(x=>x.acf?.from_link===p.from);
  if(m.length>1||m.some(x=>x.acf.to_link!==p.to||String(x.acf.type)!=="301"||x.acf.match_type!=="Exact"||x.acf.enable!==true))throw Error("Conflicting existing redirect "+p.id);
  p.existing=m[0]?{id:m[0].id,status:m[0].status}:null;
 }
 await writeFile(out+"/rollback.json",JSON.stringify({categoryId:1763,originalHtml:raw,plans},null,2)+"\n");
 await save();
 for(const p of plans){
  let id=p.existing?.id;
  if(!id){const r=await api("/wp-json/wp/v2/chuyen-huong-link","POST",{status:"draft",title:"PSE: Đạm Phú Mỹ - link bài gốc "+p.id,acf:{from_link:p.from,to_link:p.to,type:"301",match_type:"Exact",enable:true}});
   if(r.http!==201||!Number.isSafeInteger(Number(r.data?.id)))throw Error("Redirect draft failed "+p.id);
   id=Number(r.data.id);report.writes.push({kind:"redirect-draft",id,sourceId:p.id});await save();}
  const check=async()=>{const r=await api("/wp-json/wp/v2/chuyen-huong-link/"+id+"?context=edit&_fields=id,status,acf");if(r.http!==200||r.data.acf.from_link!==p.from||r.data.acf.to_link!==p.to||String(r.data.acf.type)!=="301"||r.data.acf.match_type!=="Exact"||r.data.acf.enable!==true)throw Error("Redirect readback failed "+p.id);return r.data.status};
  if(await check()!=="publish"){const r=await api("/wp-json/wp/v2/chuyen-huong-link/"+id,"POST",{status:"publish"});if(r.http!==200||await check()!=="publish")throw Error("Redirect publish failed "+p.id);report.writes.push({kind:"redirect-publish",id,sourceId:p.id});await save();}
  p.redirectId=id;
 }
 const fresh=await api(uri+fields);if(fresh.data?.meta?.[key]!==raw)throw Error("Concurrent editor change");
 const r=await api(uri,"POST",{meta:{[key]:updated}});
 if(r.http!==200)throw Error("Category write failed");
 report.writes.push({kind:"category-meta",id:1763});await save();
 const final=await api(uri+fields);if(final.http!==200||final.data.meta?.[key]!==updated||final.data.count!==4||final.data.description!==before.data.description)throw Error("Exact category readback mismatch");
 const pr=await net.get(wp+"/wp-json/astro/v1/get-product-categories");const pc=(await pr.json()).find(x=>x.id===1763);
 if(pr.status()!==200||!pc||plans.some(p=>!pc.description.includes(p.to)||pc.description.includes(p.from))||(pc.description.match(/<table\b/gi)||[]).length!==10||!pc.description.includes(proof.rows.find(x=>x.id===1678).sourceLink.href))throw Error("Public category API mismatch");
 report.pass=true;console.log("PSE_DAM_RELATED_FOUR_APPLY_PASS="+JSON.stringify({plans:plans.map(({id,wpId,redirectId,from,to})=>({id,wpId,redirectId,from,to})),categoryId:1763,tables:10,relatedLinksChanged:4,remaining:1678,noProductWrites:true}));
}finally{await save();await net.dispose();await browser.close()}
