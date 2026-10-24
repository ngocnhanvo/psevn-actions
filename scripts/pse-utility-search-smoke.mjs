/** Read-only production WordPress search API verification. No build, no writes. */
const entries=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const origins=entries.filter(x=>x.startsWith("WC_URL="));
if(origins.length!==1)throw Error("Expected one configured WordPress HTTPS origin");
const u=new URL(origins[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid WP origin");
const origin=u.origin;
const read=async path=>{
 const response=await fetch(origin+path,{headers:{Accept:"application/json","Cache-Control":"no-cache"},signal:AbortSignal.timeout(30000)});
 return {status:response.status,body:await response.json().catch(()=>null)};
};
const posts=await read("/wp-json/wp/v2/posts?status=publish&per_page=1&_fields=id,slug,title");
if(posts.status!==200||!Array.isArray(posts.body)||!posts.body.length)
 throw Error("Published source posts not readable for search QA");
const post=posts.body[0];
if(!Number.isSafeInteger(post.id)||!String(post.slug||"").trim())throw Error("Unexpected source post id/slug");
const slugPart=String(post.slug).slice(0,Math.min(40,String(post.slug).length));
if(slugPart.length<2)throw Error("Source post slug too short");
const search=await read("/wp-json/pse/v1/post-search?q="+encodeURIComponent(slugPart)+"&page=1&per_page=12");
if(search.status!==200||!Number.isSafeInteger(search.body?.total)||!Array.isArray(search.body?.items)||
 !search.body.items.some(x=>x.id===post.id&&x.slug===post.slug))
 throw Error("Search by actual partial post slug failed");
console.log("PSE_SEARCH_SLUG=PASS; source_post_id="+post.id+"; public_only=true");
const title=String(post.title?.rendered||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
if(title.length>=3){
 const query=title.slice(0,Math.min(40,title.length)).trim();
 const titleResult=await read("/wp-json/pse/v1/post-search?q="+encodeURIComponent(query)+"&page=1&per_page=12");
 if(titleResult.status!==200||!titleResult.body?.items?.some(x=>x.id===post.id))
  throw Error("Search by published post title failed");
 console.log("PSE_SEARCH_TITLE=PASS; published_only=true");
}
// Exercise the post_content branch against a real body-only token, not title/slug.
const articles=await read("/wp-json/wp/v2/posts?status=publish&per_page=18&_fields=id,slug,title,excerpt,content");
if(articles.status!==200||!Array.isArray(articles.body))throw Error("Cannot read published body sample");
let bodyProbe=null;
for(const candidate of articles.body){
 const content=String(candidate.content?.rendered||"").replace(/<[^>]*>/g," ");
 const other=[candidate.slug,candidate.title?.rendered,candidate.excerpt?.rendered].join(" ").toLocaleLowerCase("vi-VN");
 const tokens=content.match(/[\p{L}][\p{L}\p{M}]{10,}/gu)||[];
 const token=tokens.find(t=>!other.includes(t.toLocaleLowerCase("vi-VN"))&&t.length<=80);
 if(token){bodyProbe={id:candidate.id,token};break}
}
if(!bodyProbe)throw Error("Cannot find a grounded content-only search token");
const bodyResult=await read("/wp-json/pse/v1/post-search?q="+encodeURIComponent(bodyProbe.token)+"&page=1&per_page=24");
if(bodyResult.status!==200||!bodyResult.body?.items?.some(x=>x.id===bodyProbe.id))
 throw Error("Search by actual published article content token failed");
console.log("PSE_SEARCH_CONTENT=PASS; source_post_id="+bodyProbe.id+"; published_only=true");
const bad=await read("/wp-json/pse/v1/post-search?q=a");
if(bad.status!==400)throw Error("Short query validation must reject with HTTP 400; got "+bad.status);
console.log("PSE_SEARCH_INPUT_VALIDATION=PASS; no_wp_write=true; astro_build=false");
