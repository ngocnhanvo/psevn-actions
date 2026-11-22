/** Read-only production PSE #382 native Post vs SSR direct and old legacy URL.
 * Only public GET URLs, never WP writes/FTP secrets or private WP data.
 */
import {mkdir,writeFile} from "node:fs/promises";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Wrong repository");
const slug="pvfcco-se-to-chuc-thanh-conh-chuyen-du-lich-chau-au-cho-khach-hang-tieu-bieu-cua-cong-ty".replace("thanh-conh","thanh-cong");
const site="https://pse.webnvn.com",cms="https://admin-pse.webnvn.com";
const original="/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/382-"+slug+".html";
const paths=[
  ["canonical",site+"/"+slug],
  ["ssrDetail",site+"/ssr/posts/"+slug+"/detail?curUrl="+encodeURIComponent("/"+slug)],
  ["legacy",site+original],
  ["nativeRest",cms+"/wp-json/wp/v2/posts/83543?_fields=id,status,slug,acf,date,title,content,link"]
];
const output="artifacts/pse-382-live-post-qa/read-only.json";
const report={schema:"pse-382-public-ssr-live-diagnostics-v1",sourceId:382,publicUrlsOnly:true,readOnly:true,noWordPressWrites:true,requests:[]};
for(const [name,url] of paths){
 const entry={name,path:new URL(url).pathname,http:null,redirectLocation:null,contentType:null,
  responseUrl:null,bytes:null,title:null,markers:{},imageUrls:[],articleContainerHint:null};
 try{
  const res=await fetch(url,{redirect:"manual",signal:AbortSignal.timeout(35000),headers:{Accept:"text/html,application/json"}});
  entry.http=res.status;entry.redirectLocation=(res.headers.get("location")||"").slice(0,300);
  entry.contentType=(res.headers.get("content-type")||"").split(";")[0];
  entry.responseUrl=new URL(res.url).pathname;
  const buf=Buffer.from(await res.arrayBuffer());
  if(buf.length>3_000_000)throw Error("Unbounded public response");
  entry.bytes=buf.length;const body=buf.toString("utf8");
  if(name==="nativeRest"){
   let data;try{data=JSON.parse(body)}catch{}
   entry.markers={id:data?.id,status:data?.status,slugEqual:data?.slug===slug,
     titleEqual:/PVFCCo SE tổ chức thành công chuyến du lịch châu Âu/.test(data?.title?.rendered||""),
     bodyContainsWieliczka:(data?.content?.rendered||"").includes("Wieliczka"),
     wpPhotoUrls:(data?.content?.rendered||"").match(/\/wp-content\/uploads\/[^"' ]+/g)?.slice(0,4)||[]};
  }else{
   entry.title=(body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||"").replace(/\s+/g," ").slice(0,240);
   entry.markers={containsSlug:body.includes(slug),hasArticleTitle:/PVFCCo SE tổ chức thành công chuyến du lịch châu Âu/.test(body),
    hasWieliczka:body.includes("Wieliczka"),hasBaLan:body.includes("Ba_Lan.jpg"),
    hasAustria:body.includes("Ao_2.jpg"),
    containsGeneric404:/không tìm thấy trang|404 Not Found|page not found/i.test(body),
    containsPostDetails:body.includes("PostDetails"),
    hasDataSSR:body.includes("ssr/posts")};
   entry.imageUrls=[...new Set((body.match(/(?:src|href)=["'][^"']+\.(?:png|jpe?g|webp)(?:\?[^"']*)?["']/gi)||[])
    .map(x=>x.slice(x.indexOf("=")+2,-1)).filter(u=>/Ba_Lan|Ao_2|Wieliczka/i.test(u)))].slice(0,15);
   entry.articleContainerHint=(body.match(/<h1[^>]*>[\s\S]{0,500}<\/h1>/i)?.[0]||"").replace(/<[^>]+>/g,"").replace(/\s+/g," ").slice(0,240);
  }
 }catch(e){entry.error=String(e?.name||"network").slice(0,80)}
 report.requests.push(entry);
 console.log("PSE_382_PUBLIC_READONLY="+JSON.stringify(entry));
}
report.summary={canonicalHttp:report.requests[0].http,ssrHttp:report.requests[1].http,
 legacyHttp:report.requests[2].http,wpStatus:report.requests[3].markers?.status,
 frontendArticleTitle:report.requests[0].markers?.hasArticleTitle,
 ssrArticleTitle:report.requests[1].markers?.hasArticleTitle,
 noCmsWrites:true};
await mkdir("artifacts/pse-382-live-post-qa",{recursive:true});
await writeFile(output,JSON.stringify(report,null,2)+"\n");
console.log("PSE_382_PUBLIC_QA_SUMMARY="+JSON.stringify(report.summary));
