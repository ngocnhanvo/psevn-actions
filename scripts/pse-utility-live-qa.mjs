/** Read-only live Astro utility section + WordPress search SSR smoke. */
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
function origin(name){
 const match=env.filter(x=>x.startsWith(name+"="));
 if(match.length!==1)throw Error("Missing "+name);
 const u=new URL(match[0].slice(name.length+1).replace(/^['"]|['"]$/g,""));
 if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))
  throw Error("Invalid configured URL "+name);
 return u.origin;
}
const front=origin("WC_URL_CLIENT"),wp=origin("WC_URL");
if(front===wp)throw Error("WP and client origins cannot be identical");
async function request(url){
 const r=await fetch(url,{headers:{"Cache-Control":"no-cache","User-Agent":"PSE-Utilities-SSR-Smoke/1"},signal:AbortSignal.timeout(25000)});
 return {status:r.status,body:await r.text(),contentType:r.headers.get("content-type")||""};
}
const postRes=await request(wp+"/wp-json/wp/v2/posts?status=publish&per_page=1&_fields=id,slug,title");
if(postRes.status!==200)throw Error("WordPress source REST posts unavailable");
const posts=JSON.parse(postRes.body);
if(!Array.isArray(posts)||!posts[0]?.slug)throw Error("No real public WordPress post sample");
const slug=String(posts[0].slug).slice(0,35);
if(slug.length<2)throw Error("Live post slug unexpectedly short");
let homepage,searchPage,err="";
for(let attempt=0;attempt<3;attempt++){
 try{
  homepage=await request(front+"/");
  searchPage=await request(front+"/tim-kiem?q="+encodeURIComponent(slug));
  if(homepage.status!==200||searchPage.status!==200)throw Error("Live homepage/search HTTP "+homepage.status+"/"+searchPage.status);
  const html=homepage.body,s=searchPage.body;
  // Text and destinations belong to live WordPress ESC Table pse_03_vi.
  // Old organization-name snapshots are not valid after authorized CMS edits.
  const start=html.indexOf('data-pse-section="utilities"');
  const utilityHtml=start<0?"":html.slice(start,start+30000);
  const listMarkup=utilityHtml.match(/<ul\b[^>]*class="pse-tools__links"[^>]*>([\s\S]*?)<\/ul>/)?.[1]||"";
  const rows=[...listMarkup.matchAll(/<li\b[^>]*data-esc-builder-row="(\d+)"[^>]*>([\s\S]*?)<\/li>/g)]
   .map(m=>({row:Number(m[1]),href:m[2].match(/<a\b[^>]*href="([^"]+)"/)?.[1]||"",
    label:(m[2].match(/data-esc-builder-cell-field="label"[^>]*>([\s\S]*?)<\/span>/)?.[1]||"")
     .replace(/<[^>]+>/g,"").replace(/\s+/g," ").trim()}));
  const validLinks=rows.length>=6&&new Set(rows.map(x=>x.row)).size===rows.length&&rows.every(x=>{
   if(!x.label||!x.href)return false;
   try{return ["http:","https:"].includes(new URL(x.href.replaceAll("&amp;","&")).protocol)}
   catch{return false}
  });
  if(start<0||!html.includes('action="/tim-kiem"')||
     (utilityHtml.match(/class="pse-tools__panel"/g)||[]).length!==2||
     !validLinks||html.includes("Thống kê truy cập"))
    throw Error("Homepage utility ESC Table layout/links invalid: panels="+
      (utilityHtml.match(/class="pse-tools__panel"/g)||[]).length+"; links="+rows.length);
  console.log("PSE_UTILITY_CMS_RENDERED="+JSON.stringify(rows.map(x=>({row:x.row,label:x.label,href:x.href}))).slice(0,3000));
  if(!s.includes("Tìm kiếm bài viết")||!s.includes("Tìm thấy")||!s.includes(posts[0].slug))
    throw Error("Live WordPress post search SSR did not render real published post");
  console.log("PSE_UTILITIES_LIVE=PASS; esc_table=pse_03_vi; rendered_links="+rows.length+"; visitor_stats_removed=true");
  console.log("PSE_SEARCH_SSR_LIVE=PASS; real_published_post=true; request=GET_ONLY");
  process.exit(0);
 }catch(e){
  err=String(e instanceof Error?e.message:e).slice(0,200);
  if(attempt<2)await new Promise(r=>setTimeout(r,4000));
 }
}
throw Error("PSE live utility QA failed: "+err);
