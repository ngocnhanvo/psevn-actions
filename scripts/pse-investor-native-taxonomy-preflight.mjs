/** Read-only authoritative WP investor taxonomy preflight before source Posts #338/#1085. */
import {request} from "playwright";
const e=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const a=e.filter(x=>x.startsWith("WC_URL="));
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||a.length!==1)throw Error("Unauthorized WP origin");
const u=new URL(a[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.port||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Unexpected CMS origin");
const wp=u.origin,net=await request.newContext({timeout:40000});
try{
 const resp=await net.get(wp+"/wp-json/wp/v2/categories?hide_empty=false&per_page=100&_fields=id,slug,name,parent,count",{failOnStatusCode:false});
 if(resp.status()!==200)throw Error("Native WP category inventory HTTP "+resp.status());
 const rows=await resp.json();
 if(!Array.isArray(rows)||rows.length<10||rows.length>100)throw Error("Unexpected WP category registry count");
 rows.sort((x,y)=>Number(x.id)-Number(y.id));
 const cats=rows.filter(r=>/co-dong|co dong|quan-he|dau-tu|cong-bo|shareholder|thong-tin/i.test(r.slug+" "+r.name));
 console.log("PSE_INVESTOR_NATIVE_TAXONOMY="+JSON.stringify({total:rows.length,
  categories:rows.map(x=>({id:x.id,slug:x.slug,name:x.name,parent:x.parent,count:x.count})),
  investorCandidates:cats,exactLegacyFamilyPresent:rows.some(x=>x.slug==="tin-tuc-co-dong"),readOnly:true,noCmsWrites:true}));
 const ids=[338,1085];
 for(const id of ids){
  console.log("PSE_INVESTOR_SOURCE_CATEGORY_ID="+JSON.stringify({id,sourceFamily:"/quan-he-nha-dau-tu/tin-tuc-co-dong",sourceTaxonomyMappingNeedsNativeEvidence:true}));
 }
}finally{await net.dispose()}
