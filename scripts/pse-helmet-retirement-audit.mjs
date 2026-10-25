/** Read-only proof for the 22 retired template helmet paths.
 * No CMS writes, no build, no hardcoded frontend hostname, no old-host DNS.
 * Distinguishes missing records from records explicitly found in Trash.
 */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";

const envLines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
function origin(key){
  const matches=envLines.filter(x=>x.startsWith(key+"="));
  if(matches.length!==1)throw Error("Expected one "+key);
  const u=new URL(matches[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
  if(u.protocol!=="https:"||!u.hostname||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))
    throw Error("Invalid configured origin "+key);
  return u.origin;
}
const wp=origin("WC_URL"),front=origin("WC_URL_CLIENT");
const original=await readFile("scripts/pse-legacy-redirect-301.mjs","utf8");
const setLiteral=original.match(/const helmetSources=new Set\((\[[\s\S]*?\])\);/);
if(!setLiteral)throw Error("Cannot locate authoritative 22-path retirement set");
const paths=JSON.parse(setLiteral[1]);
if(paths.length!==22||new Set(paths).size!==22||paths.some(p=>typeof p!=="string"||!p.startsWith("/")||p.startsWith("//")||/[?#\\\r\n]/.test(p)))
  throw Error("Authoritative 22-path set changed unexpectedly");

const report={at:new Date().toISOString(),mode:"read-only",paths:paths.length,active:[],trash:[],missing:[],other:[],frontend:[],errors:[]};
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage();
  await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
  if(await page.locator("#user_login").count()){
    await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
    await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
    const t=await page.locator("body").innerText();
    const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if(m){
      const a=+m[1],b=+m[3],value=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
      const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if(!await f.count())throw Error("WP login math challenge missing");
      await f.fill(String(value));
    }
    await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
  }
  if(page.url().includes("wp-login.php"))throw Error("WP authentication failed");
  const nonce=await page.evaluate(async()=>{
    if(globalThis.wpApiSettings?.nonce)return globalThis.wpApiSettings.nonce;
    const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
    if(!r.ok)throw Error("WP REST nonce unavailable");
    return(await r.text()).trim();
  });
  if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error("WP REST nonce invalid");
  async function readRegistry(status){
    const result=[];
    for(let n=1;n<=50;n++){
      const response=await page.evaluate(async({status,n,nonce})=>{
        const q=new URLSearchParams({context:"edit",status,per_page:"100",page:String(n),_fields:"id,title,status,acf"});
        const r=await fetch("/wp-json/wp/v2/chuyen-huong-link?"+q,{credentials:"same-origin",headers:{"X-WP-Nonce":nonce,"Accept":"application/json","Cache-Control":"no-cache"}});
        return {status:r.status,pages:Number(r.headers.get("X-WP-TotalPages")||0),data:await r.json().catch(()=>null)};
      },{status,n,nonce});
      if(response.status!==200||!Array.isArray(response.data))throw Error("WP registry status="+status+" page="+n+" HTTP="+response.status);
      result.push(...response.data);
      if(n>=response.pages)return result;
    }
    throw Error("WP registry status="+status+" pagination exceeded safety bound");
  }
  const [nonTrash,trashed]=await Promise.all([readRegistry("any"),readRegistry("trash")]);
  const byFrom=(rows)=>new Map(paths.map(p=>[p,rows.filter(r=>r.acf?.from_link===p)]));
  const activeMap=byFrom(nonTrash.filter(r=>r.status!=="trash"));
  const trashMap=byFrom(trashed.filter(r=>r.status==="trash"));
  for(const p of paths){
    const a=activeMap.get(p),t=trashMap.get(p);
    if(a.length)report.active.push({from:p,records:a.map(r=>({id:r.id,status:r.status,type:r.acf?.type,title:r.title?.raw||r.title?.rendered||""}))});
    if(t.length)report.trash.push({from:p,records:t.map(r=>({id:r.id,status:r.status,type:r.acf?.type,title:r.title?.raw||r.title?.rendered||""}))});
    if(!a.length&&!t.length)report.missing.push(p);
  }
  const checks=new Array(paths.length);let next=0;
  await Promise.all(Array.from({length:Math.min(5,paths.length)},async()=>{
    for(;;){
      const i=next++;if(i>=paths.length)return;
      const from=paths[i];
      try{
        const r=await page.request.get(front+from,{maxRedirects:0,timeout:20000,failOnStatusCode:false});
        checks[i]={from,status:r.status(),location:r.headers().location||null};
      }catch(e){checks[i]={from,error:String(e).slice(0,180)}}
    }
  }));
  report.frontend=checks;
  report.errors=checks.filter(x=>x.error||x.status===301);
  console.log("PSE_HELMET_22_READ_ONLY="+JSON.stringify({
    expected:22,active:report.active.length,trash:report.trash.length,absent:report.missing.length,
    live301:checks.filter(x=>x.status===301).length,networkErrors:checks.filter(x=>x.error).length,
    noCMSWrites:true,noBuild:true
  }));
  if(report.active.length||report.errors.length)throw Error("Helmet retirement requires review: active="+report.active.length+" live301_or_network_error="+report.errors.length);
}finally{
  await mkdir("artifacts/pse-helmet-22-audit",{recursive:true});
  await writeFile("artifacts/pse-helmet-22-audit/result.json",JSON.stringify(report,null,2)+"\n");
  await browser.close();
}
