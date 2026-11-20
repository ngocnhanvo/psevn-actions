/** Fast independent Joomla archive versus public WordPress REST identity check. READ ONLY. */
import {readFile,mkdir,writeFile} from "node:fs/promises";
const source="https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-tai-chinh.html";
const sourceBase="/quan-he-nha-dau-tu/bao-cao-tai-chinh/";
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const val=env.filter(x=>x.startsWith("WC_URL="));
if(val.length!==1)throw Error("PSE WP origin unavailable");
const u=new URL(val[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname)||!u.hostname.includes("pse"))throw Error("Unsafe PSE WP URL");
const wp=u.origin;
const cp=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(cp.schema!=="pse-legacy-article-migration-v1")throw Error("Wrong checkpoint");
const report={schema:"pse-financial-fast-diff-v1",source,wordpress:wp,sourcePages:[],sourceEntries:[],checkpointFinance:[],category:null,wordpressCount:null,wpPosts:[],missing:[],outsideFinanceCategory:[],wpExtra:[],sourceErrors:[],errors:[],status:"UNVERIFIED"};
const get=async(url)=>{
 const res=await fetch(url,{headers:{Accept:"application/json,text/html;q=0.9,*/*;q=0.5","User-Agent":"Mozilla/5.0 (compatible; PSE source parity; +https://pse.webnvn.com)"},signal:AbortSignal.timeout(35000)});
 if(!res.ok)throw Error("HTTP "+res.status+" "+url.slice(0,90));
 return res;
};
try{
 const seen=new Map();let zeros=0;
 for(let i=0;i<22;i++){
  const url=source+(i?"?start="+i*6:""),res=await get(url),html=await res.text(),found=new Map();
  for(const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)){
   let link;try{link=new URL(m[1].replace(/&amp;/g,"&"),source)}catch{continue}
   if(!["www.pse.vn","pse.vn"].includes(link.hostname))continue;
   const match=link.pathname.startsWith(sourceBase)&&link.pathname.slice(sourceBase.length).match(/^(\d{2,6})-([^/]+)\.html$/i);
   if(!match)continue;
   found.set(match[1],{id:match[1],slug:match[2],source:"https://www.pse.vn"+link.pathname});
  }
  let added=0;for(const [id,row] of found)if(!seen.has(id)){seen.set(id,row);added++}
  report.sourcePages.push({number:i+1,found:found.size,added});
  console.log("PSE_FINANCE_FAST_SOURCE="+JSON.stringify({page:i+1,found:found.size,added,total:seen.size}));
  zeros=added===0?zeros+1:0;
  if(zeros>=2&&i>=12)break;
 }
 report.sourceEntries=[...seen.values()];
 const checkpoint=Object.entries(cp.articles||{}).filter(([,row])=>String(row.source_url||"").includes(sourceBase));
 report.checkpointFinance=checkpoint.map(([id,row])=>({id,wpId:row.wp_id||null,status:row.status,reason:row.reason||null}));
 const byCheckpoint=new Map(checkpoint);
 if(seen.size!==76)report.errors.push("Original archive source count changed from previously verified 76 to "+seen.size);
 const cats=await(await get(wp+"/wp-json/wp/v2/categories?slug=bao-cao-tai-chinh&hide_empty=false&_fields=id,slug,parent,name,count")).json();
 if(!Array.isArray(cats)||cats.length!==1||cats[0].parent!==1744)throw Error("Financial category id/parent invalid");
 report.category=cats[0];
 let total=0,page=1,pages=1;
 while(page<=pages){
  const res=await get(wp+"/wp-json/wp/v2/posts?categories="+cats[0].id+"&per_page=100&page="+page+"&_fields=id,slug,status,title,categories,date,content,link");
  const data=await res.json();
  if(!Array.isArray(data))throw Error("WP REST post list invalid");
  if(page===1){total=Number(res.headers.get("x-wp-total")||0);pages=Number(res.headers.get("x-wp-totalpages")||1);}
  report.wpPosts.push(...data.map(p=>({id:p.id,slug:p.slug,date:p.date,title:p.title?.rendered||"",categories:p.categories,contentLength:String(p.content?.rendered||"").length})));
  if(pages>10)throw Error("Unexpected finance paging");
  page++;
 }
 report.wordpressCount=total;
 const bySlug=new Map(report.wpPosts.map(p=>[p.slug,p])),byId=new Map(report.wpPosts.map(p=>[p.id,p]));
 const matched=new Set();
 for(const row of report.sourceEntries){
  const meta=byCheckpoint.get(row.id);
  let post=meta?.wp_id?byId.get(Number(meta.wp_id)):null;
  if(!post)post=bySlug.get(row.slug);
  if(post){row.wpId=post.id;matched.add(post.id);continue}
  report.missing.push({...row,checkpoint:meta?{wpId:meta.wp_id||null,status:meta.status||null,reason:meta.reason||null}:null});
 }
 report.wpExtra=report.wpPosts.filter(x=>!matched.has(x.id));
 for(const miss of report.missing){
  const response=await get(wp+"/wp-json/wp/v2/posts?slug="+encodeURIComponent(miss.slug)+"&per_page=10&_fields=id,slug,status,categories,title,content");
  const posts=await response.json();
  if(posts.length){report.outsideFinanceCategory.push({sourceId:miss.id,slug:miss.slug,posts:posts.map(p=>({id:p.id,slug:p.slug,categories:p.categories,title:p.title?.rendered}))});}
 }
 if(report.missing.length)report.errors.push("Source articles missing from financial category "+report.missing.length);
 if(report.wpExtra.length)report.errors.push("Unverified financial category extra posts "+report.wpExtra.length);
 report.status=report.errors.length?"PARTIAL":"IDENTITY_PASS";
 console.log("PSE_FINANCE_FAST_SUMMARY="+JSON.stringify({
  source:seen.size,sourcePages:report.sourcePages.length,checkpoint:checkpoint.length,wpTotal:total,wpCount:report.wpPosts.length,
  missing:report.missing,outsideCategory:report.outsideFinanceCategory,extra:report.wpExtra,
  errors:report.errors,category:report.category,status:report.status
 }));
}catch(e){report.errors.push(String(e));report.status="FAIL";console.error("PSE_FINANCE_FAST_ERROR="+String(e))}
finally{await mkdir("artifacts/pse-financial-fast-diff",{recursive:true});await writeFile("artifacts/pse-financial-fast-diff/report.json",JSON.stringify(report,null,2)+"\n")}
if(report.status!=="IDENTITY_PASS")process.exitCode=1;
