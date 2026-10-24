/** Native WordPress PSE archive: explain taxonomy count vs SSR card count. READ ONLY. */
const line=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,"")).filter(s=>s.startsWith("WC_URL="));
if(line.length!==1)throw Error("Missing CMS origin");
const origin=new URL(line[0].slice(7).replace(/^['"]|['"]$/g,""));
if(origin.protocol!=="https:"||origin.username||origin.password)throw Error("Invalid PSE origin");
const slugs=["thong-tin-quan-tri","bao-cao-thuong-nien","tai-lieu-quan-tri-cong-ty","kien-thuc-nong-nghiep","huong-dan-su-dung-phan-bon","ban-cong-bo-thong-tin"];
for(const slug of slugs){
 const url=origin.origin+"/wp-json/wp/v2/categories?slug="+encodeURIComponent(slug)+"&_fields=id,slug,name,parent,count";
 const catResp=await fetch(url,{signal:AbortSignal.timeout(20000)});
 if(!catResp.ok)throw Error("WP categories HTTP "+catResp.status);
 const cats=await catResp.json();
 if(cats.length!==1)throw Error("Category identity changed "+slug);
 const q=new URL(origin.origin+"/wp-json/wp/v2/posts");q.searchParams.set("categories",String(cats[0].id));q.searchParams.set("per_page","12");q.searchParams.set("page","1");q.searchParams.set("status","publish");q.searchParams.set("orderby","date");q.searchParams.set("order","desc");
 const get=async params=>{const u=new URL(q.href);for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);const r=await fetch(u.href,{signal:AbortSignal.timeout(20000)});return{http:r.status,total:r.headers.get("X-WP-Total"),data:r.ok?await r.json():[]}};
 const [native,lang,_embed]=await Promise.all([get({}),get({lang:"vi"}),get({lang:"en"})]);
 const row={slug,id:cats[0].id,wpCategoryCount:cats[0].count,nativeTotal:native.total,viTotal:lang.total,enTotal:_embed.total,nativeCards:native.data.length,viCards:lang.data.length,enCards:_embed.data.length,firstNative:native.data.slice(0,3).map(x=>({id:x.id,slug:x.slug,acfLang:x.acf?.product_lang}))};
 console.log("PSE_POST_LANG_DISPARITY="+JSON.stringify(row));
}
console.log("PSE_POST_LANG_DIAGNOSTIC=PASS; readOnly=true");
