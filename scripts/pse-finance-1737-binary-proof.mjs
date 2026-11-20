/** Prove source/target binaries for 2026 finance article #1737 before any provenance mapping. READ ONLY. */
import {chromium} from "playwright";
import {createHash} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const src=[
 "https://www.pse.vn/images/20261019-CV-26-79-%C4%90NB-H%C4%90QT-CBTT_B%C3%A1o_c%C3%A1o_t%C3%A0i_ch%C3%ADnh_qu%C3%BD_3_n%C4%83m_2026.pdf",
 "https://www.pse.vn/images/20261019-CV-26-80-%C4%90NB-H%C4%90QT-Gi%E1%BA%A3i_tr%C3%ACnh_l%E1%BB%A3i_nhu%E1%BA%ADn_sau_thu%E1%BA%BF_ch%C3%AAnh_l%E1%BB%87ch_so_v%E1%BB%9Bi_th%E1%BB%B1c_hi%E1%BB%87n_c%C3%B9ng_k%E1%BB%B3.pdf"
];
const dest=[
 "https://admin-pse.webnvn.com/wp-content/uploads/2026/10/pse-legacy-76977-01-285604171799.pdf",
 "https://admin-pse.webnvn.com/wp-content/uploads/2026/10/pse-legacy-76977-02-57f8343d0a44.pdf"
];
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(state.schema!=="pse-legacy-article-migration-v1"||
 state.articles["1737"]?.wp_id!==76977||
 !state.articles["1737"]?.source_url?.includes("/bao-cao-tai-chinh/1737-"))
 throw Error("Source 1737 migration checkpoint changed");
const report={schema:"pse-finance-1737-binary-evidence-v1",id:"1737",wpId:76977,
 files:[],status:"UNVERIFIED",errors:[]};
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext();
try{
 const p=await ctx.request.get("https://admin-pse.webnvn.com/wp-json/wp/v2/posts/76977?_fields=id,slug,status,categories,content",{timeout:50000});
 const post=await p.json();
 if(p.status()!==200||post.id!==76977||post.status!=="publish"||!post.categories?.includes(1754)||
  post.slug!=="20261019-cbtt-bao-cao-tai-chinh-q3-2026"||
  !dest.every(u=>String(post.content?.rendered||"").includes(new URL(u).pathname)))
  throw Error("WordPress financial report post 1737 document identity changed");
 const sha=b=>createHash("sha256").update(b).digest("hex");
 for(let i=0;i<src.length;i++){
  const row={index:i+1,sourceUrl:src[i],targetUrl:dest[i]};
  const entries=[];
  for(const u of [src[i],dest[i]]){
   const r=await ctx.request.get(u,{timeout:180000});
   const b=await r.body();
   if(r.status()!==200||b.length<128||b.length>65*1024*1024||
    !String(r.headers()["content-type"]||"").toLowerCase().includes("pdf")||
    !b.subarray(0,8).toString("latin1").startsWith("%PDF-"))
    throw Error("Source or WordPress 1737 PDF invalid HTTP/content "+r.status()+" file "+(i+1));
   entries.push({bytes:b.length,sha256:sha(b)});
  }
  row.source=entries[0];row.target=entries[1];
  row.equal=row.source.bytes===row.target.bytes&&row.source.sha256===row.target.sha256;
  const query=await ctx.request.get("https://admin-pse.webnvn.com/wp-json/wp/v2/media?search="+
   encodeURIComponent(new URL(dest[i]).pathname.split("/").at(-1).replace(/\.pdf$/,""))+
   "&per_page=20&_fields=id,slug,source_url,mime_type",{timeout:45000});
  const matches=query.status()===200?(await query.json()).filter(m=>
   new URL(m.source_url,"https://admin-pse.webnvn.com").pathname===new URL(dest[i]).pathname):[];
  row.wpMediaIds=matches.map(x=>x.id);
  if(matches.length!==1||!row.equal)report.errors.push({
   index:i+1,reason:!row.equal?"Binary SHA mismatch":"Target media ownership ambiguous"
  });
  report.files.push(row);
  console.log("PSE_FINANCE_1737_BINARY="+JSON.stringify({index:row.index,source:row.source,target:row.target,
   equal:row.equal,wpMediaIds:row.wpMediaIds}));
 }
 report.status=report.errors.length?"PARTIAL":"BINARY_PROVENANCE_PASS";
}catch(e){report.status="FAIL";report.errors.push({error:String(e)});console.error("PSE_FINANCE_1737_BINARY_ERROR="+String(e))}
finally{
 await mkdir("artifacts/pse-finance-1737-binary",{recursive:true});
 await writeFile("artifacts/pse-finance-1737-binary/report.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
console.log("PSE_FINANCE_1737_PROOF_SUMMARY="+JSON.stringify({status:report.status,files:report.files.length,errors:report.errors}));
if(report.status!=="BINARY_PROVENANCE_PASS")process.exitCode=1;
