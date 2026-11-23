/** 19 source-verified Joomla NPK ?id= aliases -> exact published WordPress Products. */
import {chromium,request} from "playwright";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {createRedirectMatcher,compileRedirectRules} from "./redirect-rules-loader.mjs";

const repo="ngocnhanvo/psevn-actions";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const apply=event.head_commit?.message==="cms(pse): publish 19 NPK Joomla 301 redirects"&&process.env.PSE_NPK_301_PREVIEW_ONLY!=="true";
if(process.env.GITHUB_REPOSITORY!==repo||process.env.GITHUB_REF!=="refs/heads/main")throw Error("Incorrect repository/ref");
if(apply&&process.env.PSE_NPK_301_BACKUP_OK!=="yes")throw Error("Verified fresh WordPress DB backup required");
const values=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
function origin(key){
 const x=values.filter(s=>s.startsWith(key+"="));if(x.length!==1)throw Error("Missing "+key);
 const u=new URL(x[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid origin "+key);
 return u.origin;
}
const wp=origin("WC_URL"),site=origin("WC_URL_CLIENT");
if(wp!=="https://admin-pse.webnvn.com"||site!=="https://pse.webnvn.com")throw Error("Wrong PSE hosts");
const legacy="/hoat-dong-kinh-doanh/san-pham/npk-phu-my.html";
const special="/hoat-dong-kinh-doanh/san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my/8-trang-chu/1434-npk-phu-my.html";
const mapping=[
 ["1436","npk-phu-my-17-15-9-10s-te-1703"],
 ["1435","npk-phu-my-17-15-9-13s-te-1702"],
 ["1482","npk-16-7-16-05412"],
 ["1438","npk-phu-my-15-15-15-te-1717"],
 ["1440","npk-phu-my-16-8-16-te-1686"],
 ["1442","npk-phu-my-16-8-17-te-1687"],
 ["1446","npk-phu-my-17-7-17-te-1689"],
 ["1449","npk-phu-my-20-7-7-te-1713"],
 ["1451","npk-phu-my-20-20-15-te-1699"],
 ["1455","npk-phu-my-17-17-8-13s-te-1700"],
 ["1459","npk-phu-my-16-16-8-5s-te-00066"],
 ["1460","npk-phu-my-16-16-8-9s-te-00063"],
 ["1461","npk-phu-my-16-16-8-10s-te-00062"],
 ["1462","npk-phu-my-16-16-8-13s-te-1705"],
 ["1463","npk-phu-my-16-6-19-te-1683"],
 ["1464","npk-phu-my-16-16-16-te-1716"],
 ["1465","npk-phu-my-16-8-8-te-1712"],
 ["1483","npk-phu-my-15-5-20-te-1690"],
 ["1484","npk-phu-my-20-5-5-te-1711"]
].map(([id,slug])=>({id,slug,from:legacy+"?id="+id,to:"/san-pham/"+slug}));
if(mapping.length!==19||new Set(mapping.map(x=>x.id)).size!==19||new Set(mapping.map(x=>x.to)).size!==19)throw Error("Invalid 19 source identities");

const dir="artifacts/pse-npk-19-301";await mkdir(dir,{recursive:true});
const report={schema:"pse-npk-19-query-exact-redirects-v1",apply,source:legacy,preserve:{source:special,target:"/npk-phu-my"},rules:mapping,created:[],published:[],existing:[],errors:[],result:"PREPARING"};
const save=()=>writeFile(dir+"/report.json",JSON.stringify(report,null,2)+"\n");
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const net=await request.newContext({timeout:45000});
try{
 await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
 if(await page.locator("#user_login").count()){
  await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=(await page.locator("#loginform").innerText()).slice(0,550);
  const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i);
  if(m){
   const a=+m[1],b=+m[3],value=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(!await input.count())throw Error("WP login math field missing");
   await input.fill(String(value));
  }
  await page.locator("#wp-submit").click();
 }
 await page.goto(wp+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:65000});
 if(page.url().includes("wp-login")||!await page.locator("#adminmenu").count())throw Error("WordPress login failed");
 const nonce=await page.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("REST nonce unavailable");
  return (await r.text()).trim();
 });
 if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error("Invalid WP nonce");
 const api=(path,method="GET",body=null)=>page.evaluate(async({path,method,body,nonce})=>{
  const r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {http:r.status,pages:Number(r.headers.get("X-WP-TotalPages")||1),data:await r.json().catch(()=>null)};
 },{path,method,body,nonce});
 const root="/wp-json/wp/v2/chuyen-huong-link";
 const all=[];
 for(let n=1;n<=35;n++){
  const r=await api(root+"?context=edit&status=any&per_page=100&page="+n+"&_fields=id,status,acf");
  if(r.http!==200||!Array.isArray(r.data)||r.pages<1||r.pages>35)throw Error("WordPress redirect inventory incomplete page "+n);
  all.push(...r.data);
  if(n>=r.pages)break;
 }
 const existingPreserved=all.filter(x=>x.status==="publish"&&x.acf?.from_link===special);
 if(existingPreserved.length!==1||existingPreserved[0].acf?.to_link!=="/npk-phu-my"||String(existingPreserved[0].acf?.type)!=="301")
  throw Error("Existing Joomla NPK article redirect altered or missing");
 // Exact query matcher test: distinct variants, extra query preserved, unrelated id doesn't redirect.
 const testRules=mapping.map((x,i)=>({id:i+1,from:x.from,to:x.to,type:301,matchType:"Exact",priority:100,conditions:[]}));
 const matcher=createRedirectMatcher(compileRedirectRules(testRules));
 for(const row of mapping){
  const route=matcher(legacy,"id="+row.id);
  if(!route||route.type!==301||route.to!==row.to||route.query!=="")throw Error("Source query routing mismatch "+row.id);
  const extras=matcher(legacy,"foo=bar&id="+row.id);
  if(!extras||extras.to!==row.to||extras.query!=="foo=bar")throw Error("Extra query stripping unexpected "+row.id);
 }
 if(matcher(legacy,"id=999999")||matcher(legacy,"")||matcher(special,"id=1434"))
  throw Error("Unsafe catch-all or unexpected Joomla redirect query routing");
 const found=[];
 for(const x of mapping){
  const records=all.filter(r=>r.acf?.from_link===x.from&&r.status!=="trash");
  if(records.length>1)throw Error("Duplicate source in WordPress routing registry "+x.id);
  const existing=records[0]||null;
  if(existing&&(existing.acf?.to_link!==x.to||String(existing.acf?.type)!=="301"||
      existing.acf?.match_type!=="Exact"||existing.acf?.enable!==true||
      !["draft","publish"].includes(existing.status)))
   throw Error("Conflicting native redirect source "+x.id);
  found.push(existing);
 }
 // Verify each native Product canonical with independent front HTTP/HTML response (not just slug existence).
 for(let offset=0;offset<19;offset+=4){
  const checks=await Promise.all(mapping.slice(offset,offset+4).map(async x=>{
   const r=await net.get(site+x.to,{maxRedirects:0,failOnStatusCode:false});
   const html=r.status()===200?await r.text():"";
   return {id:x.id,http:r.status(),hasTitle:/<h1(?:\s|>)/i.test(html)};
  }));
  if(checks.some(x=>x.http!==200||!x.hasTitle))throw Error("Missing native Product target "+JSON.stringify(checks));
 }
 const preserved=await net.get(site+special,{maxRedirects:0,failOnStatusCode:false});
 if(preserved.status()!==301||preserved.headers().location!=="/npk-phu-my")
  throw Error("Existing Joomla article 301 not intact");
 report.result="PREFLIGHT_PASS";
 console.log("PSE_NPK_19_301_PREFLIGHT="+JSON.stringify({aliases:19,alreadyPublished:found.filter(x=>x?.status==="publish").length,
  toCreate:found.filter(x=>!x).length,sourceQueryMatcher:true,sourcePage301Preserved:true,targets200:19,apply}));
 await save();
 if(apply){
  for(let i=0;i<19;i++){
   const x=mapping[i];let record=found[i];
   if(!record){
    const created=await api(root,"POST",{title:"PSE NPK Joomla product "+x.id+" legacy exact query 301",
      status:"draft",acf:{from_link:x.from,to_link:x.to,type:301,match_type:"Exact",enable:true}});
    if(created.http!==201||!Number.isSafeInteger(created.data?.id))
     throw Error("Create uncertain; inspect registry before retry "+x.id);
    record=created.data;report.created.push({oldId:x.id,redirectId:record.id});await save();
   }else report.existing.push({oldId:x.id,redirectId:record.id});
   let read=await api(root+"/"+record.id+"?context=edit&_fields=id,status,acf");
   if(read.http!==200||read.data?.id!==record.id||
      read.data.acf?.from_link!==x.from||read.data.acf?.to_link!==x.to||
      String(read.data.acf?.type)!=="301"||read.data.acf?.match_type!=="Exact"||read.data.acf?.enable!==true)
    throw Error("WordPress redirect readback mismatch "+x.id);
   if(read.data.status!=="publish"){
    const published=await api(root+"/"+record.id,"POST",{status:"publish"});
    if(published.http!==200||published.data?.status!=="publish")throw Error("Redirect publish failed "+x.id);
   }
   read=await api(root+"/"+record.id+"?context=edit&_fields=id,status,acf");
   if(read.http!==200||read.data?.status!=="publish"||read.data?.acf?.from_link!==x.from||
      read.data?.acf?.to_link!==x.to)throw Error("Published redirect readback mismatch "+x.id);
   report.published.push({sourceId:x.id,redirectId:record.id,from:x.from,to:x.to});
   console.log("PSE_NPK_301_PUBLISHED="+JSON.stringify(report.published.at(-1)));
   await save();
  }
  report.result="CMS_19_EXACT_QUERY_301_PUBLISHED";
  console.log("PSE_NPK_19_301_SAVED=PASS count="+report.published.length+" needsAstroBuild=true");
 }else console.log("PSE_NPK_19_301_DRY_RUN=PASS write=false");
 await save();
}catch(e){report.result="FAILED_OR_PARTIAL";report.errors.push(String(e?.message||e).slice(0,400));await save();throw e;}
finally{await net.dispose();await browser.close();}
