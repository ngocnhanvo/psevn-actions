/** GET-only Joomla original #379 legacy URL status vs verified WordPress canonical. */
import {request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong PSE repo");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const original="https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/379-pvfcco-se-to-chuc-tham-quan-phong-truyen-thong-pvfcco.html";
if(state.schema!=="pse-legacy-article-migration-v1"||state.articles?.["379"]?.source_url!==original)
 throw Error("Joomla 379 original URL changed");
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const origin=k=>{
 const x=vars.filter(v=>v.startsWith(k+"="));if(x.length!==1)throw Error("Missing "+k);
 const u=new URL(x[0].slice(k.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||
 !["","/"].includes(u.pathname))throw Error("Untrusted PSE origin "+k);
 return u.origin;
};
const wp=origin("WC_URL"),front=origin("WC_URL_CLIENT");
const old=new URL(original).pathname,slug="pvfcco-se-to-chuc-tham-quan-phong-truyen-thong-pvfcco";
const target="/"+slug;
const net=await request.newContext({timeout:50000});
const report={schema:"pse-379-exact-joomla-old-alias-live-v1",readOnly:true,
 noCmsWrites:true,noBuild:true,old,target,wpId:82119,rows:[],decision:null};
try{
 const [post,source,legacy,canonical]=await Promise.all([
  net.get(wp+"/wp-json/wp/v2/posts?slug="+slug+"&per_page=5&_fields=id,slug,status,date,categories",{failOnStatusCode:false}),
  net.get(original,{failOnStatusCode:false}),
  net.get(front+old,{maxRedirects:0,failOnStatusCode:false}),
  net.get(front+target,{maxRedirects:0,failOnStatusCode:false})
 ]);
 const posts=post.status()===200?await post.json():[];
 if(!Array.isArray(posts)||posts.length!==1||posts[0].id!==82119||
 posts[0].slug!==slug||posts[0].status!=="publish"||
 posts[0].date!=="2013-07-03T02:10:17"||
 !posts[0].categories?.includes(1742)||!posts[0].categories?.includes(1746)||
 source.status()!==200)throw Error("Joomla source or native original 379 publication not verified");
 const html=canonical.status()===200?await canonical.text():"";
 const m=html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)||
  html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical/i);
 const can=m?.[1]?new URL(m[1],front):null;
 const destinationOK=canonical.status()===200&&can?.origin===front&&
  can.pathname===target&&!can.search&&!can.hash;
 const prev=legacy.headers().location||"";
 const loc=prev?new URL(prev,front):null;
 const alreadyCorrect=legacy.status()===301&&loc?.origin===front&&loc.pathname===target&&
  !loc.search&&!loc.hash;
 report.rows=[{source:old,http:legacy.status(),location:prev||null},
  {destination:target,http:canonical.status(),canonical:m?.[1]||null}];
 report.decision=!destinationOK?"TARGET_NOT_READY":alreadyCorrect?
  "SOURCE_379_NATIVE_301_LIVE_PASS":"SOURCE_379_NEEDS_EXACT_WP_REDIRECT";
 const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
 const exactAcceptance=event.head_commit?.message==="test(pse): verify original Joomla 379 exact 301 postrelease";
 if(exactAcceptance){
  if(!alreadyCorrect||!destinationOK)throw Error("Original Joomla 379 canonical 301 not live after signed deployment");
  console.log("PSE_379_EXACT_ORIGINAL_301_LIVE_PASS="+JSON.stringify({
   originalId:379,wpPostId:82119,legacyHttp301:true,
   target,canonicalSameOrigin:true,sourceDate:"2013-07-03",
   readOnly:true,noBuild:true
  }));
 }
 console.log("PSE_379_LEGACY_ALIAS_SOURCE="+JSON.stringify({
  id:379,wpPostId:82119,targetOK:destinationOK,alreadyCorrect,decision:report.decision,
  rows:report.rows,readOnly:true,noBuild:true}));
 if(!destinationOK)throw Error("WordPress original 379 target not ready for redirect");
}finally{
 await mkdir("artifacts/pse-379-legacy-alias",{recursive:true});
 await writeFile("artifacts/pse-379-legacy-alias/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();
}
