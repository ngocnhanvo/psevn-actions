/** PSE legacy 301 migration through native WordPress Redirect CPT.
 * Audit by default. Explicit commit message enables guarded writes.
 * All Location targets are ROOT-RELATIVE: this script never pins the site domain.
 * No Astro build, no old-host DNS/cutover, no delete-force.
 */
import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";

const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const msg=String(event.head_commit?.message||"").split("\n")[0];
const apply=msg==="cms(pse): apply source-verified legacy 301 redirects";
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/)
  .map(s=>s.trim().replace(/^export\s+/,""));
function envOrigin(key){
  const found=vars.filter(x=>x.startsWith(key+"="));
  if(found.length!==1)throw Error("Missing unique configured origin "+key);
  const u=new URL(found[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
  if(u.protocol!=="https:"||!u.hostname||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))
    throw Error("Unsafe configured origin "+key);
  return u.origin;
}
const wp=envOrigin("WC_URL"),front=envOrigin("WC_URL_CLIENT");
const safePath=(s)=>typeof s==="string"&&s.startsWith("/")&&!s.startsWith("//")&&
  !/[\r\n\\]/.test(s)&&!s.includes("..")&&!s.includes("?")&&!s.includes("#");
const helmetSources=new Set([
"/dat-san-xuat-non-bao-hiem-so-luong-lon-gia-re/",
"/non-bao-hiem-3-4-cj.html",
"/non-bao-hiem-3-4-dau-dammtrax.html",
"/non-bao-hiem-3-4-dau-dammtrax-2.html",
"/non-bao-hiem-3-4-dreamgames.html",
"/non-bao-hiem-6-lo-8-lo-bimix.html",
"/non-bao-hiem-co-kieng-rft.html",
"/non-bao-hiem-co-kieng-sai-gon-moto-tour.html",
"/non-bao-hiem-co-kinh-bestapples.html",
"/non-bao-hiem-f1-homeland.html",
"/non-bao-hiem-ngan-hang-abbank.html",
"/non-bao-hiem-nua-dau-alo.html",
"/non-bao-hiem-nua-dau-bon-nuoc-inox-viet-my.html",
"/non-bao-hiem-nua-dau-gia-vespa-gumac-mau-2.html",
"/non-bao-hiem-nua-dau-in-logo-ahamove.html",
"/non-bao-hiem-nua-dau-in-logo-gas-anh-duong.html",
"/non-bao-hiem-nua-dau-vietcombank.html",
"/non-bao-hiem-qua-tang-gia-re-tai-tphcm/",
"/non-bao-hiem-vespa-yves-rocher.html",
"/san-pham/non-bao-hiem-vespa-2/",
"/san-pham/non-bao-hiem-vespa-special-2/",
"/xuong-san-xuat-mu-bao-hiem-tai-hcm.html"
]);
if(helmetSources.size!==22)throw Error("Retirement set must contain exactly 22 keys");

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const report={mode:apply?"apply":"audit",retired:[],alreadyRetired:[],proposed:[],
  published:[],unchanged:[],skipped:[],issues:[],counts:{}};
const artifact="artifacts/pse-legacy-redirect";
await mkdir(artifact,{recursive:true});
try{
  await page.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:65000});
  if(await page.locator("#user_login").count()){
    await page.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
    await page.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
    const t=await page.locator("body").innerText();
    const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||
      t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if(m){
      const a=+m[1],b=+m[3],c=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
      const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if(!await f.count())throw Error("Missing WP math challenge");await f.fill(String(c));
    }
    await Promise.all([page.waitForLoadState("domcontentloaded"),page.locator("#wp-submit").click()]);
  }
  if(page.url().includes("wp-login.php"))throw Error("WP auth failed");
  const nonce=await page.evaluate(async()=>{
    if(globalThis.wpApiSettings?.nonce)return globalThis.wpApiSettings.nonce;
    const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
    if(!r.ok)throw Error("WordPress REST nonce unavailable");
    return(await r.text()).trim();
  });
  if(!/^[A-Za-z0-9]{8,24}$/.test(nonce))throw Error("Invalid WordPress nonce");
  const api=async(path,method="GET",body)=>page.evaluate(async({path,method,body,nonce})=>{
    const r=await fetch(path,{method,credentials:"same-origin",headers:{
      "X-WP-Nonce":nonce,"Accept":"application/json","Cache-Control":"no-cache",
      ...(body?{"Content-Type":"application/json"}:{})
    },...(body?{body:JSON.stringify(body)}:{})});
    return {status:r.status,total:Number(r.headers.get("X-WP-Total")||0),
      pages:Number(r.headers.get("X-WP-TotalPages")||1),
      data:await r.json().catch(()=>null)};
  },{path,method,body,nonce});
  async function all(endpoint){
    const u=endpoint+(endpoint.includes("?")?"&":"?")+"per_page=100&page=";
    const first=await api(u+"1");
    if(first.status!==200||!Array.isArray(first.data)||first.pages>50)
      throw Error("WordPress registry inaccessible "+endpoint+" HTTP "+first.status);
    const out=[...first.data];
    for(let n=2;n<=first.pages;n++){
      const r=await api(u+n);
      if(r.status!==200||!Array.isArray(r.data))throw Error("WordPress pagination failed "+endpoint);
      out.push(...r.data);
    }
    return out;
  }
  const routes=await all("/wp-json/wp/v2/chuyen-huong-link?context=edit&status=any&_fields=id,title,status,acf,route_priority");
  const pages=await all("/wp-json/wp/v2/pages?context=edit&status=publish&_fields=id,slug,status,acf");
  const posts=await all("/wp-json/wp/v2/posts?context=edit&status=publish&_fields=id,slug,status,acf");
  const categories=await all("/wp-json/wp/v2/categories?hide_empty=false&_fields=id,slug,parent,count");
  const menuResult=await api("/wp-json/wp/v2/menu-items?context=edit&per_page=100&_fields=id,url,type");
  if(menuResult.status!==200||!Array.isArray(menuResult.data))
    throw Error("Cannot read native WordPress menu URLs");
  // Source-host identities come from the tracked Joomla inventory rather
  // than hardcoded domains; changing the public frontend needs no code edit.
  let legacyInventory=null;
  const legacyHostnames=new Set();
  try{
    legacyInventory=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
    for(const entry of Object.values(legacyInventory.articles||{})){
      try{
        const u=new URL(String(entry?.source_url||""));
        if(["https:","http:"].includes(u.protocol)&&!u.username&&!u.password)
          legacyHostnames.add(u.hostname.replace(/^www\./,""));
      }catch{}
    }
  }catch(e){
    report.issues.push({reason:"legacy article inventory unavailable",error:String(e).slice(0,120)});
  }
  const byPageSlug=new Map();
  for(const p of pages){
    if(p.slug&&p.status==="publish"&&!String(p.acf?.key||"").startsWith("ssr-"))
      byPageSlug.set(p.slug,p);
  }
  const byPostSlug=new Map();
  for(const p of posts)if(p.slug&&p.status==="publish"){
    if(byPostSlug.has(p.slug))byPostSlug.set(p.slug,null);else byPostSlug.set(p.slug,p);
  }
  // A Joomla URL is only a candidate if its last slug has a unique published
  // WordPress equivalent. Old menu URLs or imported source URLs provide evidence.
  const proposals=new Map();
  function add(from,to,basis){
    if(!safePath(from)||!safePath(to)||from===to||helmetSources.has(from))return;
    if(!/\.html$/i.test(from))return;
    const prev=proposals.get(from);
    if(prev&&prev.to!==to){report.issues.push({from,conflict:[prev.to,to]});proposals.delete(from);return}
    proposals.set(from,{from,to,basis});
  }
  // The three source category URLs below are verified Joomla paths from the
  // project's existing bounded public inventory seeds. Never infer redirects
  // for arbitrary categories: native taxonomy + live target must both exist.
  const publishedCategories=new Set(categories.map(c=>String(c.slug||"")));
  const legacyCategoryAliases=[
    ["/21-tin-tuc-su-kien/tin-cong-ty.html","tin-cong-ty"],
    ["/hoat-dong-kinh-doanh/thong-tin-thi-truong.html","thong-tin-thi-truong"],
    ["/quan-he-nha-dau-tu/bao-cao-tai-chinh.html","bao-cao-tai-chinh"],
  ];
  if(pages.some(p=>p.slug==="tin-tuc-su-kien"&&p.acf?.key==="ssr-posts")){
    for(const [source,slug] of legacyCategoryAliases){
      if(publishedCategories.has(slug))
        add(source,"/tin-tuc-su-kien/"+slug,"source-inventory+native-wp-category");
    }
  }
  // Owner-supplied explicit parity example.
  if(byPageSlug.has("thong-diep"))
    add("/pvfcco-pse/thong-diep.html","/thong-diep","owner-example+published-wp-page");

  for(const item of menuResult.data){
    const raw=String(item.url||"");
    let url;try{url=new URL(raw,front)}catch{continue}
    if(url.origin!==front&&!legacyHostnames.has(url.hostname.replace(/^www\./,"")))
      continue;
    const from=url.pathname;
    const tail=decodeURIComponent(from.split("/").at(-1)||"").replace(/\.html$/i,"");
    if(byPageSlug.has(tail))add(from,"/"+tail,"native-menu+published-wp-page");
  }
  // Reuse the already collected Joomla article migration manifest, rather than
  // recrawling hundreds of URLs or inventing their Joomla numeric IDs.
  if(legacyInventory){
    for(const entry of Object.values(legacyInventory.articles||{})){
      const raw=String(entry?.source_url||"");
      let source;try{source=new URL(raw)}catch{continue}
      const from=source.pathname;
      const last=decodeURIComponent(from.split("/").at(-1)||"");
      const match=last.match(/^\d{3,6}-(.+)\.html$/i);
      if(!match)continue;
      const slug=match[1];
      if(byPostSlug.get(slug))
        add(from,"/"+slug,"joomla-id+exact-published-wordpress-post-slug");
    }
  }
  // No blanket regex that would turn invalid articles/assets into false 301s.
  report.counts={routes:routes.length,pages:pages.length,posts:posts.length,
    menuUrls:menuResult.data.length,categories:categories.length,proposals:proposals.size};
  const existingByFrom=new Map();
  for(const r of routes){
    const from=String(r.acf?.from_link||"");
    if(!existingByFrom.has(from))existingByFrom.set(from,[]);
    existingByFrom.get(from).push(r);
  }
  const retire=routes.filter(r=>{
    const from=String(r.acf?.from_link||"");
    const title=String(r.title?.raw||r.title?.rendered||"").replace(/<[^>]*>/g,"");
    return helmetSources.has(from)&&title.includes("SEO 301 - "+from)&&
      String(r.acf?.type)==="301"&&String(r.acf?.match_type)==="Exact";
  });
  const notMatched=[...helmetSources].filter(from=>!retire.some(r=>r.acf?.from_link===from));
  const checked=[];
  for(const proposal of proposals.values()){
    const records=existingByFrom.get(proposal.from)||[];
    if(records.length>1){report.skipped.push({...proposal,reason:"duplicate WP rules"});continue}
    if(records.length===1){
      const r=records[0];
      if(r.status==="publish"&&String(r.acf?.to_link)===proposal.to&&
        String(r.acf?.type)==="301"&&r.acf?.enable)
        {report.unchanged.push({from:proposal.from,to:proposal.to,id:r.id});continue}
      report.skipped.push({...proposal,reason:"existing WordPress rule needs review",id:r.id});continue;
    }
    // One-hop canonical is mandatory, not merely an Astro 200 fallback.
    try{
      const u=new URL(proposal.to,front);
      const res=await fetch(u,{redirect:"manual",signal:AbortSignal.timeout(14000)});
      if(res.status!==200){
        report.skipped.push({...proposal,reason:"target HTTP "+res.status});continue;
      }
      const html=await res.text();
      const canonical=html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1]||
        html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical/i)?.[1]||"";
      if(canonical&&new URL(canonical,front).pathname!==proposal.to){
        report.skipped.push({...proposal,reason:"canonical mismatch"});continue;
      }
      checked.push(proposal);
    }catch(e){report.skipped.push({...proposal,reason:"target unavailable",error:String(e).slice(0,80)})}
  }
  report.proposed=checked;
  await writeFile(artifact+"/backup.json",JSON.stringify({
    mode:report.mode,at:new Date().toISOString(),routesBefore:routes,
    helmetMatched:retire.map(r=>r.id),helmetNotMatched:notMatched,proposals:[...proposals.values()]
  },null,2)+"\n");
  console.log("PSE_LEGACY_REDIRECT_PREFLIGHT="+JSON.stringify({
    ...report.counts,helmetMatched:retire.length,helmetNotMatched:notMatched.length,
    targetVerified:checked.length,alreadyCorrect:report.unchanged.length,
    skipped:report.skipped.length,apply
  }));
  if(apply){
    // Source record identity, source URL, type and published status are all
    // rechecked before trashing. DELETE without force = WordPress Trash.
    for(const r of retire){
      if(r.status==="trash"){report.alreadyRetired.push(r.id);continue}
      if(!["publish","draft","private"].includes(r.status)){
        report.issues.push({id:r.id,reason:"unexpected template route status"});continue;
      }
      const result=await api("/wp-json/wp/v2/chuyen-huong-link/"+r.id,"DELETE");
      if(result.status!==200||result.data?.deleted!==true)
        throw Error("Native WordPress trash failed for inherited ID "+r.id+" HTTP "+result.status);
      report.retired.push(r.id);
    }
    for(const candidate of checked){
      // Never upsert another source after a redirect with the same From appeared.
      const current=await all("/wp-json/wp/v2/chuyen-huong-link?context=edit&status=any&_fields=id,status,acf");
      if(current.some(r=>r.status!=="trash"&&r.acf?.from_link===candidate.from)){
        report.skipped.push({...candidate,reason:"concurrent rule appeared"});continue;
      }
      const made=await api("/wp-json/wp/v2/chuyen-huong-link","POST",{
        title:"PSE 301 - "+candidate.from,status:"draft",
        acf:{from_link:candidate.from,to_link:candidate.to,type:"301",
          match_type:"Exact",enable:true}
      });
      if(made.status!==201||!Number.isSafeInteger(Number(made.data?.id)))
        throw Error("Native WordPress 301 draft create failed "+candidate.from+" "+made.status);
      const id=Number(made.data.id);
      const published=await api("/wp-json/wp/v2/chuyen-huong-link/"+id,"POST",{status:"publish"});
      if(published.status!==200||published.data?.status!=="publish")
        throw Error("WordPress 301 publish failed id "+id);
      const proof=await api("/wp-json/wp/v2/chuyen-huong-link/"+id+"?context=edit&_fields=id,status,acf");
      if(proof.status!==200||proof.data?.acf?.from_link!==candidate.from||
        proof.data?.acf?.to_link!==candidate.to||String(proof.data?.acf?.type)!=="301"||
        !proof.data?.acf?.enable)throw Error("WordPress redirect readback failed id "+id);
      report.published.push({id,...candidate});
      console.log("PSE_301_WP_SAVED "+id+" "+candidate.from+" -> "+candidate.to);
    }
  }
  console.log("PSE_LEGACY_REDIRECT_RESULT="+JSON.stringify({
    mode:report.mode,retired:report.retired.length,published:report.published.length,
    alreadyCorrect:report.unchanged.length,sourceUnmatched:notMatched.length,
    targetSkipped:report.skipped.length,issues:report.issues.length,noBuild:true
  }));
}finally{
  await writeFile(artifact+"/result.json",JSON.stringify(report,null,2)+"\n");
  await browser.close();
}
