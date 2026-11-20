/**
 * Read-only diagnostic for 8 remaining original PSE disclosures.
 * Never modifies or uploads a post or attachment.
 */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(state.schema!=="pse-legacy-article-migration-v1")throw Error("Wrong PSE source checkpoint");
const lines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const match=lines.filter(x=>x.startsWith("WC_URL="));
if(match.length!==1)throw Error("No unique WP origin");
const u=new URL(match[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("WP origin unsafe");
const wp=u.origin;
const url1670=[
"https://www.pse.vn/images/Tai_lieu_%C4%90H%C4%90C%C4%90_2026_-_TV.pdf",
"https://www.pse.vn/images/Tai_lieu_%C4%90H%C4%90C%C4%90_2026_-_TA.pdf",
"https://www.pse.vn/images/CBTT_v%E1%BB%81_vi%E1%BB%87c_%E1%BB%A9ng_c%E1%BB%AD_%C4%91%E1%BB%81_c%E1%BB%AD_v%C3%A0o_H%C4%90QT_BKS_nhi%E1%BB%87m_k%E1%BB%B3_2026-2031.pdf",
"https://www.pse.vn/images/Uy-Quyen.pdf",
"https://www.pse.vn/images/uy_quyen.pdf"
];
const url1742=["https://www.pse.vn/images/VI_BaoCaoTaiChinh_6t_2026.pdf","https://www.pse.vn/images/CBTT_BCTC_ban_nien_2026-_TA.pdf"];
const toCheck=[...new Set([...url1670,...url1742])];
const browser=await chromium.launch({headless:true});
const result={schema:"pse-disclosure-edge-v1",wpOrigin:wp,slug1127:null,post1213:null,assets:[],errors:[]};
try{
const context=await browser.newContext({ignoreHTTPSErrors:false});
const rest=async(path)=>{
 const response=await context.request.get(wp+path,{timeout:35000});
 return {http:response.status(),body:await response.json().catch(()=>null)};
};
const slug1127="nghi-quyet-ve-viec-phe-duyet-don-vi-kiem-toan-bao-cao-tai-chinh-nam-2015";
const posts=await rest("/wp-json/wp/v2/posts?slug="+slug1127+"&_fields=id,status,slug,title,content,categories,date,link&per_page=10");
result.slug1127={http:posts.http,postCount:posts.body?.length||0,posts:(posts.body||[]).map(p=>({id:p.id,status:p.status,slug:p.slug,title:p.title?.rendered,content:(p.content?.rendered||"").slice(0,900),categories:p.categories,date:p.date,link:p.link}))};
console.log("PSE_EDGE_SLUG_1127="+JSON.stringify(result.slug1127));
const item=await rest("/wp-json/wp/v2/posts/79397?_fields=id,slug,title,content,categories,date,link");
if(item.http===200){
 const html=item.body.content?.rendered||"";
 result.post1213={id:item.body.id,category:item.body.categories,date:item.body.date,zipLinks:html.match(/https?:[^"'<>\s]+[.]zip/gi)||[],htmlExcerpt:html.slice(0,650)};
 console.log("PSE_EDGE_1213="+JSON.stringify(result.post1213));
}else result.errors.push("1213 WP public post HTTP "+item.http);
for(const url of toCheck){
 const meta={url,sourceId:url1670.includes(url)?"1670":"1742",wpMediaSlug:"pse-legacy-"+createHash("sha256").update(url).digest("hex").slice(0,16)};
 try{
  const head=await context.request.head(url,{timeout:35000});
  meta.headHttp=head.status();meta.headBytes=head.headers()["content-length"]||null;meta.headType=head.headers()["content-type"]||null;
  const m=await rest("/wp-json/wp/v2/media?slug="+meta.wpMediaSlug+"&_fields=id,slug,source_url,mime_type&per_page=5");
  meta.wpHttp=m.http;meta.wpMedia=m.body;
 }catch(e){meta.error=String(e).slice(0,200)}
 result.assets.push(meta);
 console.log("PSE_EDGE_ASSET="+JSON.stringify(meta));
}
}finally{
await mkdir("artifacts/pse-disclosure-edge",{recursive:true});
await writeFile("artifacts/pse-disclosure-edge/report.json",JSON.stringify(result,null,2)+"\n");
await browser.close();
}
