/** READ ONLY validate nine misassigned WP posts against actual Joomla source sections,
 * and independently search original created dates for two recoverable market posts. */
import {chromium} from "playwright";
import {readFile} from "node:fs/promises";
import {searchDate} from "./pse-legacy-search-date.mjs";
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified||
 process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong PSE checkpoint");
const setting=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,"")).filter(x=>x.startsWith("WC_URL="));
if(setting.length!==1)throw Error("Missing unique WordPress host");
const host=new URL(setting[0].slice(7).replace(/^['"]|['"]$/g,""));
if(host.protocol!=="https:"||host.username||host.password)throw Error("Unexpected WP host");
const outOfScope=[77641,77169,77132,77188,80828,77949,77203,77216,77246];
const browser=await chromium.launch({headless:true});
try{
 const admin=await browser.newPage();
 await admin.goto(host.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
  await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
  const s=await admin.locator("body").innerText();
  const m=s.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||s.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){
   const a=+m[1],b=+m[3],answer=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const f=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error("WP captcha input missing");
   await f.fill(String(answer));
  }
  await Promise.all([admin.waitForLoadState("domcontentloaded"),admin.locator("#wp-submit").click()]);
 }
 if(admin.url().includes("wp-login"))throw Error("WP login unsuccessful");
 await admin.goto(host.origin+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 const nonce=await admin.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("WP REST nonce not available");
  return (await r.text()).trim();
 });
 const api=path=>admin.evaluate(async ({path,nonce})=>{
  const r=await fetch(path,{credentials:"same-origin",headers:{Accept:"application/json","X-WP-Nonce":nonce}});
  return {status:r.status,body:await r.json().catch(()=>null)};
 },{path,nonce});
 const catIds=[1743,1742,1746,1755,1756];
 const cats=await api("/wp-json/wp/v2/categories?include="+catIds.join(",")+"&per_page=100&_fields=id,name,slug,parent,count");
 if(cats.status!==200||cats.body.length!==catIds.length)throw Error("Category identity missing");
 const posts=[];
 for(const wpId of outOfScope){
  const entry=Object.entries(state.articles).find(([id,a])=>Number(a.wp_id)===wpId);
  if(!entry)throw Error("Missing WP source mapping "+wpId);
  const [joomlaId,item]=entry;
  const r=await api("/wp-json/wp/v2/posts/"+wpId+"?context=edit&_fields=id,slug,status,categories,title,date");
  if(r.status!==200||r.body.id!==wpId)throw Error("Missing WP post "+wpId);
  const original=new URL(item.source_url);
  const expectCompany=original.pathname.startsWith("/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/")||
    original.pathname.startsWith("/21-tin-tuc-su-kien/tin-cong-ty/");
  const expectKnowledge=original.pathname.startsWith("/hoat-dong-kinh-doanh/kien-thuc-nong-nghiep/");
  if(!expectCompany&&!expectKnowledge)throw Error("Unexpected original WP post category: "+wpId);
  const expected=expectCompany?[1742,1746]:[];
  if(!r.body.categories.includes(1743))throw Error("Market category already removed from "+wpId);
  const slug=new URL(item.source_url).pathname.match(/\/\d{2,6}-([^/]+)\.html$/)?.[1];
  if(r.body.slug!==slug)throw Error("WP slug and verified Joomla source mismatch "+wpId);
  posts.push({joomlaId,wpId,source:item.source_url,sourceClass:expectCompany?"company":"knowledge",
    expected,actual:r.body.categories,slug:r.body.slug,status:r.body.status,title:r.body.title?.raw});
 }
 const dates=[];
 const source=await browser.newPage();
 await source.route(/\.(?:woff2?|png|jpe?g|webp|gif|svg)(?:[?#]|$)/i,r=>r.abort());
 for(const id of ["342","351"]){
  const item=state.articles[id];
  if(item.status!=="quarantined"||item.reason!=="Article contains non-local mandatory media")
   throw Error("Original checkpoint status changed "+id);
  const response=await source.goto(item.source_url,{waitUntil:"domcontentloaded",timeout:60000});
  if(response?.status()!==200)throw Error("Source article unavailable "+id);
  const extracted=await source.evaluate(()=>{
   const el=document.querySelector('[itemprop="articleBody"]');
   return{title:document.title.replace(/\s+-\s+PSE\.VN\s*$/i,"").trim(),
    opening:el?.textContent?.replace(/\s+/g," ").trim().slice(0,300)||""};
  });
  const lookup=await searchDate(source,{id:Number(id),sourceUrl:item.source_url,title:extracted.title,opening:extracted.opening});
  dates.push({id,title:extracted.title,source:item.source_url,result:lookup});
 }
 console.log("PSE_MARKET_SOURCE_PROOF="+JSON.stringify({cats:cats.body,posts,dates,readonly:true}));
 console.log("PSE_MARKET_SOURCE_PROOF=PASS; posts="+posts.length+"; dates="+dates.filter(x=>x.result.day).length);
}finally{await browser.close()}
