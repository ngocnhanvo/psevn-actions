/** PSE company legacy source vs ALL published WP Posts, based on immutable prior 10-page source artifact. READ ONLY. */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const marker=(await readFile(".pse-company-global-posts-request","utf8")).trim();
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
if(marker!=="MODE=READONLY"||String(event.head_commit?.message||"").split("\n")[0]!=="audit(pse): compare company gaps to all published WordPress posts")
 throw Error("Only explicit read-only global WP audit supported");
const artifact=JSON.parse(await readFile("artifacts/source/joomla-source-parity.json","utf8"));
if(artifact.mode!=="AUDIT"||artifact.wordpress?.allDescendantPosts!==409||
 artifact.comparisons?.sourceIdentifiers!==55||artifact.comparisons?.items?.length!==55)
 throw Error("PSE original 10-page source evidence artifact identity mismatch");
const rows=artifact.comparisons.items;
const settings=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const val=settings.filter(s=>s.startsWith("WC_URL="));
if(val.length!==1)throw Error("Missing WP origin");
const uri=new URL(val[0].split("=").slice(1).join("=").replace(/^['"]|['"]$/g,""));
if(uri.protocol!=="https:"||!uri.hostname||uri.username||uri.password||uri.search||uri.hash||!["","/"].includes(uri.pathname))throw Error("Invalid WP origin");
const browser=await chromium.launch({headless:true});
const admin=await browser.newPage({viewport:{width:1400,height:900}});
const norm=s=>String(s||"").normalize("NFC").toLocaleLowerCase("vi").replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");
const report={mode:"READONLY",sourceRun:45951216521,sourceTitles:rows.length,globalPosts:0,globalPages:0,results:[],summary:{},noWrites:true};
try{
 await admin.goto(uri.origin+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
 if(await admin.locator("#user_login").count()){
  await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const t=await admin.locator("body").innerText();
  const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
  if(m){const a=+m[1],b=+m[3],n=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
   const f=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
   if(!await f.count())throw Error("Missing WP math challenge");await f.fill(String(n));
  }
  await Promise.all([admin.waitForLoadState("domcontentloaded"),admin.locator("#wp-submit").click()]);
 }
 if(admin.url().includes("wp-login"))throw Error("WP login denied");
 const nonce=await admin.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  if(!r.ok)throw Error("Missing REST nonce");return(await r.text()).trim()});
 const api=async path=>admin.evaluate(async({path,nonce})=>{const r=await fetch(path,{credentials:"same-origin",
  cache:"no-store",headers:{"X-WP-Nonce":nonce,Accept:"application/json"}});
  return{http:r.status,total:Number(r.headers.get("X-WP-Total")||0),
   pages:Number(r.headers.get("X-WP-TotalPages")||0),data:await r.json().catch(()=>null)};
 },{path,nonce});
 const all=[];
 for(let page=1;page<=35;page++){
  const a=await api("/wp-json/wp/v2/posts?status=publish&per_page=100&page="+page+"&_fields=id,slug,title,categories,date,link");
  if(a.http!==200||!Array.isArray(a.data)||a.pages<1||a.pages>35)throw Error("WP global Post pagination failed page="+page+" http="+a.http+" pages="+a.pages);
  all.push(...a.data); report.globalPosts=a.total;report.globalPages=a.pages;
  if(page>=a.pages)break;
 }
 if(all.length!==report.globalPosts||new Set(all.map(p=>p.id)).size!==all.length)throw Error("WP global Post enumeration incomplete");
 const byTitle=new Map();
 for(const p of all){const k=norm(p.title?.rendered);if(!byTitle.has(k))byTitle.set(k,[]);byTitle.get(k).push(p)}
 const bySlug=new Map(all.map(p=>[p.slug,p]));
 const unmatched=rows.filter(r=>r.status!=="DIRECT_PARENT");
 for(const x of unmatched){
  const names=byTitle.get(norm(x.sourceTitle))||[];
  const exactSlug=x.slug?bySlug.get(x.slug):undefined;
  const candidates=names.length?names:exactSlug?[exactSlug]:[];
  const source2026=x.sourcePage===1;
  const valid=candidates.filter(p=>!(source2026&&/công tác cán bộ/i.test(x.sourceTitle)&&!p.date?.startsWith("2026")));
  const oldCollision=source2026&&/công tác cán bộ/i.test(x.sourceTitle)&&candidates.length&&!valid.length;
  const classification=valid.length?"PRESENT_WORDPRESS_OUTSIDE_PARENT_OR_MATCHED":
   oldCollision?"2026_DISTINCT_POST_ABSENT_TITLE_COLLISION":"NO_EXACT_TITLE_IN_ALL_PUBLISHED_POSTS";
  report.results.push({sourceTitle:x.sourceTitle,sourcePage:x.sourcePage,originalCategoryStatus:x.status,
   classification,wpMatches:candidates.map(p=>({id:p.id,title:p.title?.rendered,date:p.date,slug:p.slug,categories:p.categories}))});
 }
 report.summary={totalSource:rows.length,direct:rows.filter(x=>x.status==="DIRECT_PARENT").length,
  missingGlobalExact:report.results.filter(x=>x.classification==="NO_EXACT_TITLE_IN_ALL_PUBLISHED_POSTS").length,
  collision2026:report.results.filter(x=>x.classification==="2026_DISTINCT_POST_ABSENT_TITLE_COLLISION").length,
  presentElsewhere:report.results.filter(x=>x.classification==="PRESENT_WORDPRESS_OUTSIDE_PARENT_OR_MATCHED").length};
 console.log("PSE_COMPANY_GLOBAL_POST_PARITY="+JSON.stringify({summary:report.summary,globalPosts:report.globalPosts,
  globalPages:report.globalPages,results:report.results}).slice(0,29000));
}finally{
 await mkdir("artifacts/pse-company-news",{recursive:true});
 await writeFile("artifacts/pse-company-news/global-posts-parity.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
