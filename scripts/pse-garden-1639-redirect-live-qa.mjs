/** Exact old Joomla #1639 -> published native WP Garden family live 301 proof. GET-only. */
import {request} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const evt=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const marker="test(pse): verify exact original Joomla Garden 1639 native 301 live";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
 process.env.GITHUB_REF!=="refs/heads/main"||evt.head_commit?.message!==marker)
 throw Error("Unexpected Garden 1639 live QA request");
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const source=state.articles?.[1639];
const sourcePath="/hoat-dong-kinh-doanh/san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my/8-trang-chu/1639-phu-my-garden.html";
if(state.schema!=="pse-legacy-article-migration-v1"||new URL(source?.source_url||"https://invalid.local").pathname!==sourcePath||
 source.status!=="quarantined")throw Error("Source 1639 provenance mismatch");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const getOrigin=k=>{const matches=env.filter(x=>x.startsWith(k+"="));
 if(matches.length!==1)throw Error("Missing "+k);
 const u=new URL(matches[0].slice(k.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.port||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid "+k);
 return u.origin;
};
const front=getOrigin("WC_URL_CLIENT"),wp=getOrigin("WC_URL");
if(front===wp)throw Error("WP/frontend overlap");
const dest="/san-pham/phu-my-garden";
const slugs=["009","002","003","004","005","006","007","008"].map(n=>"phu-my-garden-pmgarden"+n);
const net=await request.newContext({timeout:45000});
const report={schema:"pse-exact-joomla-1639-garden-public-301-v1",sourceId:1639,sourcePath,target:dest,readOnly:true,redirect:{},category:{},products:[]};
try{
 const legacy=await net.get(front+sourcePath,{maxRedirects:0,failOnStatusCode:false,timeout:45000});
 const loc=legacy.headers()["location"]||"";
 const target=loc?new URL(loc,front):null;
 report.redirect={http:legacy.status(),location:loc};
 if(legacy.status()!==301||!target||target.origin!==front||target.pathname!==dest||target.search||target.hash)
  throw Error("Wrong exact source Joomla Garden public 301 Location");
 const archive=await net.get(front+dest,{maxRedirects:0,failOnStatusCode:false});
 const html=archive.status()===200?await archive.text():"";
 const canonical=html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1]||
  html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical/i)?.[1]||"";
 const cu=canonical?new URL(canonical,front):null;
 if(archive.status()!==200||!cu||cu.origin!==front||cu.pathname!==dest||cu.search||cu.hash)
  throw Error("Garden destination not canonical public HTTP200");
 report.category={http:200,canonical:cu.href};
 for(const slug of slugs){
  const url=front+"/san-pham/"+slug;
  const response=await net.get(url,{maxRedirects:0,failOnStatusCode:false});
  const body=response.status()===200?await response.text():"";
  const found=html.includes("/san-pham/"+slug);
  const can=body.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1]||
   body.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical/i)?.[1]||"";
  const u=can?new URL(can,front):null;
  if(!found||response.status()!==200||!u||u.origin!==front||u.pathname!=="/san-pham/"+slug||u.search||u.hash)
   throw Error("Redirect target lost verified original Garden variant "+slug);
  report.products.push({slug,http:200,listedInArchive:true,canonical:true});
 }
 console.log("PSE_GARDEN_1639_PUBLIC_301_PASS="+JSON.stringify({sourceId:1639,
  legacyStatus:301,target:dest,category200:true,exactNativeProducts:8,
  productCanonical200:report.products.length,readOnly:true,noBuild:true}));
}finally{
 await mkdir("artifacts/pse-garden-1639-live",{recursive:true});
 await writeFile("artifacts/pse-garden-1639-live/report.json",JSON.stringify(report,null,2)+"\n");
 await net.dispose();
}
