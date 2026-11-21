/** Source ID 1137 empty-body PDF diagnostic and ID 225 insecure image; strictly public GET only. */
import {readFile,mkdir,writeFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong PSE repo");
const src=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(src.schema!=="pse-legacy-article-migration-v1"||!src.backup_verified)
 throw Error("Source manifest changed");
const checks=[{joomlaId:1137,wpId:82550},{joomlaId:225,wpId:79574}];
if(checks.some(x=>src.articles?.[x.joomlaId]?.wp_id!==x.wpId))
 throw Error("Scoped Joomla -> WP source ID mapping changed");
const cms="https://admin-pse.webnvn.com",front="https://pse.webnvn.com";
const get=async url=>{
 const u=new URL(url);
 if(![cms,front].includes(u.origin)||u.protocol!=="https:")throw Error("Not a permitted PSE origin");
 const r=await fetch(url,{redirect:"manual",signal:AbortSignal.timeout(50000),headers:{Accept:"text/html,application/json"}});
 return{response:r,body:await r.text()};
};
const decode=s=>String(s||"").replace(/&amp;/gi,"&").replace(/&#038;/gi,"&");
const plain=s=>String(s||"").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
 .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ")
 .replace(/&(?:nbsp|#160);/gi," ").replace(/\s+/g," ").trim();
const links=s=>[...String(s||"").matchAll(/<(?:a|img)\b[^>]*(?:href|src)\s*=\s*["']([^"']+)["']/gi)]
 .map(x=>decode(x[1])).filter(x=>/\.(?:pdf|png|jpe?g|gif|webp|docx?|xlsx?)(?:$|[?#])/i.test(x)).slice(0,80);
const imgs=s=>[...String(s||"").matchAll(/<img\b[^>]*>/gi)].map(x=>({
 src:decode(x[0].match(/\bsrc\s*=\s*["']([^"']+)/i)?.[1]||"").slice(0,350),
 alt:decode(x[0].match(/\balt\s*=\s*["']([^"']+)/i)?.[1]||"").slice(0,120)
})).slice(0,40);
const output={schema:"pse-1137-225-native-post-asset-diagnostic-v1",readOnly:true,noCmsWrites:true,noBuild:true,rows:[]};
for(const item of checks){
 const native=cms+"/wp-json/wp/v2/posts/"+item.wpId+"?_fields=id,slug,status,title,content,excerpt,acf,featured_media,categories,date,modified,link";
 const rr=await get(native);
 if(rr.response.status!==200)throw Error("Exact WordPress Post REST HTTP "+rr.response.status+" "+item.wpId);
 const p=JSON.parse(rr.body);
 if(p.id!==item.wpId||p.status!=="publish"||
  !p.slug||!Array.isArray(p.categories)||p.categories.length===0)
  throw Error("Unexpected WordPress Post state "+item.wpId);
 const rich=String(p.content?.rendered||"");
 const acfKeys=Object.keys(p.acf||{}).slice(0,60);
 const acfMeta={};
 for(const [k,v] of Object.entries(p.acf||{}).slice(0,60)){
  acfMeta[k]=typeof v==="string"?{kind:"string",chars:v.length,sample:/file|pdf|image|media|attachment/i.test(k)?v.slice(0,120):null}:
   Array.isArray(v)?{kind:"array",size:v.length}:v&&typeof v==="object"?{kind:"object",keys:Object.keys(v).slice(0,8)}:{kind:typeof v,value:v};
 }
 const publicUrl=front+"/"+p.slug;
 const fr=await get(publicUrl);
 const html=fr.body, imageTags=imgs(html);
 const main=html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]||"";
 const mediaChildren=await get(cms+"/wp-json/wp/v2/media?parent="+item.wpId+"&per_page=100&_fields=id,slug,source_url,mime_type,media_details,title");
 let attachments=null;
 if(mediaChildren.response.status===200){const a=JSON.parse(mediaChildren.body);
  if(Array.isArray(a))attachments=a.map(x=>({id:x.id,type:x.mime_type,url:x.source_url,title:plain(x.title?.rendered||"").slice(0,90)}));
 }
 const row={joomlaId:item.joomlaId,source:src.articles[item.joomlaId].source_url,wpId:item.wpId,
  wpSlug:p.slug,wpTitle:plain(p.title?.rendered),nativeHtmlChars:rich.length,
  nativeTextChars:plain(rich).length,nativeImages:imgs(rich),nativeFileLinks:links(rich),
  acfKeys,acfMeta,featuredMedia:p.featured_media||0,
  frontend:{url:publicUrl,http:fr.response.status,bodyBytes:html.length,
   canonical:html.match(/<link\b[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1]||null,
   mainTextChars:plain(main).length,mainTextStart:plain(main).slice(0,240),
   fileLinks:links(main),imageTags:imageTags.slice(0,18),
   insecureImages:imageTags.filter(x=>/^http:\/\//i.test(x.src)).slice(0,8)},
  mediaChildrenStatus:mediaChildren.response.status,mediaChildren:attachments};
 output.rows.push(row);
 console.log("PSE_TARGET_POST_ASSET_DIAGNOSTIC="+JSON.stringify(row).slice(0,14500));
}
await mkdir("artifacts/pse-two-post-integrity",{recursive:true});
await writeFile("artifacts/pse-two-post-integrity/report.json",JSON.stringify(output,null,2)+"\n");
