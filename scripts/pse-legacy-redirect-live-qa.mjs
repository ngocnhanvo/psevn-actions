/** Verify live Astro HTTP 301/Location/target 200 for every published PSE mapping.
 * Read-only WP registry + public frontend. No builds, no source/host hardcoding.
 */
import {chromium} from "playwright";
import {mkdir,writeFile} from "node:fs/promises";
const lines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
function configured(key){
  const v=lines.filter(x=>x.startsWith(key+"="));
  if(v.length!==1)throw Error("Expected one "+key);
  const x=new URL(v[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
  if(x.protocol!=="https:"||!x.hostname||x.username||x.password||x.search||x.hash||!["","/"].includes(x.pathname))
    throw Error("Invalid origin for "+key);
  return x.origin;
}
const front=configured("WC_URL_CLIENT"),wp=configured("WC_URL");
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const report={front,checked:[],failed:[],helmetRetirement:[],count:0};
try{
  await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
  if(await page.locator("#user_login").count()){
    await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
    await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
    const t=await page.locator("body").innerText();
    const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if(m){
      const a=+m[1],b=+m[3],v=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
      const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if(!await f.count())throw Error("Cannot solve native WP login challenge");await f.fill(String(v));
    }
    await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
  }
  if(page.url().includes("wp-login.php"))throw Error("WordPress login unsuccessful");
  const nonce=await page.evaluate(async()=>{
    if(globalThis.wpApiSettings?.nonce)return globalThis.wpApiSettings.nonce;
    const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
    if(!r.ok)throw Error("WP nonce unavailable");return(await r.text()).trim();
  });
  const all=[];
  for(let p=1;p<=30;p++){
    const path="/wp-json/wp/v2/chuyen-huong-link?context=edit&status=any&per_page=100&page="+p+
      "&_fields=id,title,status,acf,route_priority";
    const r=await page.evaluate(async({path,nonce})=>{
      const result=await fetch(path,{headers:{"X-WP-Nonce":nonce,"Cache-Control":"no-cache"},credentials:"same-origin"});
      return{http:result.status,pages:Number(result.headers.get("X-WP-TotalPages")||1),
        data:await result.json().catch(()=>null)}
    },{path,nonce});
    if(r.http!==200||!Array.isArray(r.data)||r.pages>30)throw Error("WordPress redirect list failed HTTP "+r.http);
    all.push(...r.data);if(p>=r.pages)break;
  }
  const core=all.filter(r=>r.status==="publish"&&String(r.acf?.type).toLowerCase()==="rewrite");
  // Compare the exact live pre-apply WordPress baseline (audit #40217473093),
  // not a historical estimate of 14 Rewrite routes. Paths stay domain-neutral.
  const baseline=[
    ["^/([^/]+)/([a-z][a-z0-9-]+)/([0-9]+)/?$","/ssr/posts/$1/$3?catSlug=$2"],
    ["^/([^/]+)/([a-z][a-z0-9-]+)/?$","/ssr/posts/$1/null?catSlug=$2"],
    ["^/san-pham/([0-9]+)/?$","/ssr/products/san-pham/$1"],
    ["^/san-pham/([a-z0-9-]+)/([0-9]+)/?$","/ssr/products/san-pham/$2?catSlug=$1"],
    ["^/san-pham/([a-z0-9-]+)/?$","/ssr/products/san-pham/null?catSlug=$1"],
    ["^/san-pham/?$","/ssr/products/san-pham/null"],
    ["^/san-pham/([a-z0-9-]+-[0-9]{3,5})$","/ssr/products/$1/detail"],
    ["^/([^/.]+)$","/ssr/posts/$1/detail"],
    ["^/tin-tuc-su-kien/([1-9][0-9]*)$","/ssr/posts/tin-tuc-su-kien/$1"],
    ["/tin-tuc-su-kien","/ssr/posts/tin-tuc-su-kien/1"]
  ];
  for(const [from,to] of baseline){
    if(!core.some(r=>r.acf?.from_link===from&&r.acf?.to_link===to&&r.acf?.enable))
      throw Error("Structural WordPress Rewrite missing or modified: "+from);
  }
  const sourceRules=all.filter(r=>r.status==="publish"&&
    String(r.title?.raw||r.title?.rendered||"").includes("PSE 301 - ")&&
    String(r.acf?.type)==="301"&&r.acf?.enable===true);
  if(sourceRules.length===0)throw Error("No published PSE-owned 301s to validate");
  const seen=new Set();
  const eligible=[];
  for(const r of sourceRules){
    const from=String(r.acf.from_link||""),to=String(r.acf.to_link||"");
    if(!from.startsWith("/")||from.startsWith("//")||!to.startsWith("/")||to.startsWith("//")||
      /[\r\n\\]/.test(from+to)||from.includes("..")||to.includes("..")||from===to||
      !/\.html$/i.test(from)||seen.has(from))
      throw Error("Unsafe or duplicate native 301 rule "+r.id);
    seen.add(from);eligible.push({id:r.id,from,to});
  }
  report.count=eligible.length;
  // Six bounded read-only workers avoid exceeding the Actions timeout for
  // hundreds of legacy sources; preserve deterministic report ordering.
  const checks=new Array(eligible.length);
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(6,eligible.length)},async()=>{
    for(;;){
      const i=cursor++;
      if(i>=eligible.length)return;
      const x=eligible[i],start=front+x.from,target=front+x.to;
      try{
        const first=await page.request.get(start,{maxRedirects:0,timeout:25000,failOnStatusCode:false});
        const location=first.headers()["location"]||"";
        const second=await page.request.get(target,{maxRedirects:0,timeout:25000,failOnStatusCode:false});
        const html=second.status()===200?await second.text():"";
        const c=html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1]||
          html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical/i)?.[1]||"";
        // Missing, off-origin, or mismatched canonical is a real QA failure.
        // Never treat an absent canonical as PASS or accept the hidden WP host.
        const canonicalUrl=c?new URL(c,front):null;
        const canonicalOkay=Boolean(canonicalUrl)&&canonicalUrl.origin===front&&
          canonicalUrl.pathname===x.to&&!canonicalUrl.search&&!canonicalUrl.hash;
        const item={...x,sourceStatus:first.status(),location,targetStatus:second.status(),canonical:c||null,canonicalOkay};
        checks[i]={pass:first.status()===301&&location===x.to&&second.status()===200&&canonicalOkay,item};
      }catch(e){checks[i]={pass:false,item:{...x,error:String(e).slice(0,160)}}}
    }
  }));
  for(const result of checks){
    if(result.pass)report.checked.push(result.item);
    else report.failed.push(result.item);
  }
  console.log("PSE_LEGACY_301_LIVE_QA="+JSON.stringify({
    rules:eligible.length,pass:report.checked.length,fail:report.failed.length,
    structuralRewrites:core.length,frontSourceFromEnv:true,noBuild:true
  }));
  if(report.failed.length)throw Error("Live 301 parity failed "+report.failed.length+"/"+eligible.length);
}finally{
  await mkdir("artifacts/pse-legacy-301-live",{recursive:true});
  await writeFile("artifacts/pse-legacy-301-live/results.json",JSON.stringify(report,null,2)+"\n");
  await browser.close();
}
