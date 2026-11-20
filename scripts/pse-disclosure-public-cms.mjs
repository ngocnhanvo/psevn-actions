/** Public, read-only PSE disclosure CMS verification (no WordPress login). */
import {readFile,mkdir,writeFile} from "node:fs/promises";
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(state.schema!=="pse-legacy-article-migration-v1")throw Error("Wrong migration checkpoint");
const config=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const origin=name=>{
 const match=config.filter(x=>x.startsWith(name+"="));
 if(match.length!==1)throw Error("Missing "+name);
 const u=new URL(match[0].slice(name.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||u.pathname!=="/")throw Error("Unsafe origin "+name);
 return u.origin;
};
const wp=origin("WC_URL"),target=origin("WC_URL_CLIENT");
const rows=Object.entries(state.articles).filter(([,v])=>v.source_url?.includes("/quan-he-nha-dau-tu/tin-tuc-co-dong/ban-cong-bo-thong-tin/")).map(([id,v])=>({id,source:v.source_url,status:v.status,wpId:v.wp_id||null}));
const api=async path=>{
 let err;
 for(let i=0;i<2;i++){
  try{
   const r=await fetch(wp+path,{headers:{"Accept":"application/json","User-Agent":"PSE-Disclosure-Parity/1.0"},signal:AbortSignal.timeout(25000)});
   let data=await r.json().catch(()=>null);
   if(r.status>=500)throw Error("HTTP "+r.status);
   return {status:r.status,total:r.headers.get("x-wp-total"),pages:r.headers.get("x-wp-totalpages"),data};
  }catch(e){err=e}
 }
 throw Error("WP REST GET unavailable "+path.split("?")[0]+"; "+String(err).slice(0,120));
};
const report={schema:"pse-disclosure-public-cms-v1",wpOrigin:wp,frontend:target,checkpointCount:rows.length,sourceArchiveIndependentUnique:190,sourceOnlyIds:["75","1740","1742"].filter(id=>!rows.some(row=>row.id===id)),category:null,categoryTotal:null,postsFetched:0,publicPublished:[],unavailable:[],wrongCategory:[],wrongSlugs:[],differentVerifiedDates:[],oldLinks:[],emptyContent:[],errors:[]};
try{
 const c=await api("/wp-json/wp/v2/categories?slug=ban-cong-bo-thong-tin&hide_empty=false&_fields=id,slug,name,parent,count");
 if(c.status!==200||c.data?.length!==1)throw Error("Category not public or duplicated "+c.status);
 const cat=c.data[0];report.category=cat;
 const archive=await api("/wp-json/wp/v2/posts?categories="+cat.id+"&per_page=1&_fields=id");
 if(archive.status!==200)throw Error("Archive category REST unavailable "+archive.status);
 report.categoryTotal=Number(archive.total||0);
 const wpIds=rows.map(x=>x.wpId).filter(Boolean),posts=[];
 for(let i=0;i<wpIds.length;i+=40){
  const ids=wpIds.slice(i,i+40);
  const r=await api("/wp-json/wp/v2/posts?include="+ids.join(",")+"&per_page=100&_fields=id,status,slug,categories,title,link,content,date");
  if(r.status!==200||!Array.isArray(r.data))throw Error("Published post batch blocked at "+i);
  posts.push(...r.data);
 }
 const byId=new Map(posts.map(p=>[Number(p.id),p]));
 for(const row of rows){
  const post=byId.get(Number(row.wpId));
  if(!post){report.unavailable.push(row);continue}
  report.publicPublished.push({id:row.id,wpId:post.id,categoryOk:post.categories?.includes(cat.id),link:post.link});
  if(!post.categories?.includes(cat.id))report.wrongCategory.push({id:row.id,wpId:post.id,categories:post.categories});
  const expectedSlug=new URL(row.source).pathname.split("/").at(-1).replace(/^\d+-/,"").replace(/[.]html$/i,"");
  if(post.slug!==expectedSlug)report.wrongSlugs.push({id:row.id,wpId:post.id,expectedSlug,actualSlug:post.slug});
  const proof=state.articles[row.id];
  if(proof?.verified_date && proof.date_source==="joomla_com_search_created" &&
      String(post.date||"").slice(0,10)!==String(proof.verified_date).slice(0,10)){
   report.differentVerifiedDates.push({id:row.id,wpId:post.id,originalVerifiedDay:proof.verified_date,wpDate:post.date});
  }

  const body=String(post.content?.rendered||"");
  if(!body.replace(/<[^>]*>/g,"").trim() && !/<(?:img|iframe|embed)\b/i.test(body))report.emptyContent.push({id:row.id,wpId:post.id});
  const old=[...new Set((body.match(/https?:\/\/(?:www\.)?pse\.vn\/(?:images|media|files)\/[^"'\s<>]+/gi)||[]))];
  if(old.length)report.oldLinks.push({id:row.id,wpId:post.id,links:old.slice(0,10)});

 }
 report.postsFetched=posts.length;
 console.log("PSE_DISCLOSURE_PUBLIC_CMS="+JSON.stringify({category:cat,categoryTotal:report.categoryTotal,checkpointRecords:rows.length,publishedFound:posts.length,unavailable:report.unavailable.length,wrongCategory:report.wrongCategory.length,wrongSlugs:report.wrongSlugs.length,dateDifferences:report.differentVerifiedDates.length,oldMediaLinks:report.oldLinks.length,emptyContent:report.emptyContent.length,sourceOnly:report.sourceOnlyIds}));
 const fresh=await fetch(target+"/tin-tuc-su-kien/ban-cong-bo-thong-tin",{signal:AbortSignal.timeout(25000),headers:{"User-Agent":"Mozilla/5.0"}});
 report.frontendHttp=fresh.status;
 const html=await fresh.text();
 report.frontendPublishedSummary=html.match(/Trang\s*1\s*\/\s*\d+[^<]{0,80}/i)?.[0]||null;
 console.log("PSE_DISCLOSURE_FRONTEND="+JSON.stringify({http:report.frontendHttp,pagination:report.frontendPublishedSummary}));
} catch(e){
 report.errors.push(String(e).slice(0,240));
 console.error("PSE_DISCLOSURE_PUBLIC_CMS_ERROR="+String(e).slice(0,240));
} finally{
 await mkdir("artifacts/pse-disclosure-cms-public",{recursive:true});
 await writeFile("artifacts/pse-disclosure-cms-public/audit.json",JSON.stringify(report,null,2)+"\n");
 console.log("PSE_DISCLOSURE_PUBLIC_AUDIT="+JSON.stringify({cmsTotal:report.categoryTotal,wpPublished:report.postsFetched,unavailable:report.unavailable.length,wrongCategory:report.wrongCategory.length,wrongSlugs:report.wrongSlugs.length,dateDifferences:report.differentVerifiedDates.length,oldMediaLinks:report.oldLinks.length,emptyContent:report.emptyContent.length,errors:report.errors.length}));
}
if(report.errors.length)process.exitCode=1;
