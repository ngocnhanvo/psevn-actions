/** Prove original Joomla #204 old URL handling against published native #204. GET-only. */
import {request} from "playwright";
import {readFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong repo");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const original=state.articles?.["204"]?.source_url;
if(original!=="https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/204-npk-phu-my-16-16-8-13s-co-mat-tai-binh-phuoc.html")
 throw Error("Source Joomla #204 URL changed");
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const origin=k=>{const x=vars.filter(y=>y.startsWith(k+"="));if(x.length!==1)throw Error("Missing "+k);
const u=new URL(x[0].slice(k.length+1).replace(/^['"]|['"]$/g,""));if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||u.port||!["","/"].includes(u.pathname))throw Error("Bad "+k);return u.origin};
const front=origin("WC_URL_CLIENT"),wp=origin("WC_URL");
const old=new URL(original).pathname,target="/npk-phu-my-16-16-8-13s-co-mat-tai-binh-phuoc";
if(front===wp)throw Error("public/CMS origin overlap");
const net=await request.newContext({timeout:40000});
try{
 const record=await net.get(wp+"/wp-json/wp/v2/posts?slug="+target.slice(1)+"&per_page=5&_fields=id,slug,status,acf,date,featured_media",{timeout:40000,failOnStatusCode:false});
 const posts=record.status()===200?await record.json():[];
 if(posts.length!==1||posts[0].id!==83499||posts[0].status!=="publish"||posts[0].date?.slice(0,10)!=="2011-08-18"||
 String(posts[0].acf?.origin_page_id||"")!=="204")throw Error("Original WordPress Post 204 source id invalid");
 const rows=[];
 for(const path of [old,target]){
  const r=await net.get(front+path,{maxRedirects:0,failOnStatusCode:false,timeout:45000});
  const raw=r.status()===200?await r.text():"";
  const m=raw.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)||
   raw.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical/i);
  rows.push({path,http:r.status(),location:r.headers().location||null,canonical:m?.[1]||null});
 }
 const a=rows[0],b=rows[1];const url=a.location?new URL(a.location,front):null;
 const targetCanonical=b.canonical?new URL(b.canonical,front):null;
 const targetOK=b.http===200&&targetCanonical?.origin===front&&targetCanonical.pathname===target;
 const alreadyCorrect=a.http===301&&url?.origin===front&&url.pathname===target&&!url.search&&!url.hash;
 const decision=targetOK?(alreadyCorrect?"ORIGINAL_204_301_ALREADY_PASS":"ORIGINAL_204_OLD_ALIAS_REQUIRES_NATIVE_WP_RULE"):"ORIGINAL_204_TARGET_NOT_READY";
 console.log("PSE_204_ORIGINAL_LEGACY_ALIAS_READONLY="+JSON.stringify({originalId:204,wpPostId:83499,targetOK,alreadyCorrect,decision,sourcePath:old,target,rows,noWrites:true}));
 const ev=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
 if(ev.head_commit?.message==="test(pse): verify original Joomla 204 legacy 301 postrelease"){
  if(!alreadyCorrect||!targetOK)throw Error("Exact original Joomla 204 301 -> native canonical still missing");
  console.log("PSE_204_ORIGINAL_LEGACY_301_LIVE_PASS="+JSON.stringify({
   originalId:204,wpPostId:83499,http:301,destination:target,
   targetHttp:200,canonicalSameOrigin:true,readOnly:true,noBuild:true
  }));
 }
 if(!targetOK)throw Error("Cannot safely create original alias without live 204 public Post");
}finally{await net.dispose()}
