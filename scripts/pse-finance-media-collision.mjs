/** Read-only: inspect existing WordPress PDF media whose filename resembles PSE legacy financial URLs. */
import {chromium} from "playwright";
import {createHash} from "node:crypto";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const checkpoint=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const options=String(process.env.ENV_FILE||"").split(/\r?\n/).map(v=>v.trim()).filter(v=>v.startsWith("WC_URL="));
if(options.length!==1)throw Error("WordPress origin missing");
const wp=new URL(options[0].slice(7).replace(/^['"]|['"]$/g,"")).origin;
if(wp!=="https://admin-pse.webnvn.com")throw Error("Incorrect WordPress host");
const originals=[
 "https://www.pse.vn/images/CBTT_BCTC_ban_nien.pdf",
 "https://www.pse.vn/images/20261104-CV-26-83-%C4%90NB-H%C4%90QT-%C4%90%C3%ADnh_ch%C3%ADnh_th%C3%B4ng_tin_%C4%91%C3%A3_c%C3%B4ng_b%E1%BB%91_trong_BCTC_qu%C3%BD_3.2026.pdf",
 "https://www.pse.vn/images/20260320-CV-26-16-%C4%90NB-H%C4%90QT-CBTT_BCTC_%C4%91%C3%A3_ki%E1%BB%83m_to%C3%A1n_n%C4%83m_2025.pdf"
];
const report={schema:"pse-financial-media-collision-v1",source:[],candidates:[],errors:[]};
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext();
const hash=b=>createHash("sha256").update(b).digest("hex");
try{
 for(const url of originals){
  const r=await ctx.request.get(url,{timeout:90000});
  const bytes=await r.body();
  report.source.push({url,http:r.status(),contentType:r.headers()["content-type"]||"",bytes:bytes.length,sha256:hash(bytes),prefix:bytes.subarray(0,8).toString("latin1")});
 }
 const names=["CBTT_BCTC_ban_nien","20261104","20260320",...originals.map(url=>"pse-legacy-"+createHash("sha256").update(url).digest("hex").slice(0,16))];
 const candidates=new Map();
 for(const name of names){
  const r=await ctx.request.get(wp+"/wp-json/wp/v2/media?search="+encodeURIComponent(name)+"&per_page=100&_fields=id,slug,source_url,title,mime_type",{timeout:45000});
  if(r.status()!==200){report.errors.push({query:name,http:r.status()});continue}
  const posts=await r.json();
  for(const item of posts)if(item?.source_url&&(!candidates.has(item.id)))candidates.set(item.id,item);
 }
 for(const orig of report.source){
  const cached=checkpoint.media?.[orig.url];
  if(cached?.url)candidates.set(cached.id,{id:cached.id,slug:"manifest",source_url:cached.url});
 }
 const filtered=[...candidates.values()].filter(p=>{
  const u=decodeURIComponent(new URL(p.source_url,wp).pathname).toLowerCase();
  return /cbtt_bctc_ban_nien|20261104|20260320|pse-legacy-[a-f0-9]{16}/i.test(u);
 }).slice(0,25);
 let count=0;
 for(const item of filtered){
  if(++count>25)break;
  const entry={id:item.id,slug:item.slug,url:item.source_url};
  try{
   const r=await ctx.request.get(new URL(item.source_url,wp).href,{timeout:85000});
   const body=await r.body();
   entry.http=r.status();entry.mime=r.headers()["content-type"]||"";
   entry.bytes=body.length;entry.sha256=hash(body);
   entry.prefix=body.subarray(0,8).toString("latin1");
   entry.matchedSource=report.source.filter(x=>x.sha256===entry.sha256).map(x=>x.url);
  }catch(e){entry.error=String(e).slice(0,160)}
  report.candidates.push(entry);
 }
 const mediaMeta=await ctx.request.get(wp+"/wp-json/wp/v2/media/82544?_fields=id,date,slug,post,source_url,title,mime_type",{timeout:30000});
 report.attachment82544=mediaMeta.status()===200?await mediaMeta.json():{http:mediaMeta.status()};
 report.attachmentReferences=[];
 let pageNo=1,totalPages=1;
 do{
  const p=await ctx.request.get(wp+"/wp-json/wp/v2/posts?status=publish&per_page=100&page="+pageNo+"&_fields=id,slug,content",{timeout:45000});
  if(p.status()!==200)throw Error("Cannot audit all posted references: HTTP "+p.status());
  totalPages=Number(p.headers()["x-wp-totalpages"]||1);
  if(totalPages>20)throw Error("Unbounded WordPress post pagination");
  const posts=await p.json();
  for(const post of posts)if(String(post.content?.rendered||"").includes("CBTT_BCTC_ban_nien.pdf"))
   report.attachmentReferences.push({id:post.id,slug:post.slug});
  pageNo++;
 }while(pageNo<=totalPages);
 console.log("PSE_FINANCE_ATTACHMENT_82544="+JSON.stringify({media:report.attachment82544,
   referenceCount:report.attachmentReferences.length,references:report.attachmentReferences}));
 console.log("PSE_FINANCE_MEDIA_COLLISION="+JSON.stringify({source:report.source,
  candidates:report.candidates.filter(x=>x.matchedSource?.length||/cbtt_bctc_ban_nien/i.test(x.url)),
  candidateScanned:report.candidates.length,errors:report.errors}));
}finally{
 await mkdir("artifacts/pse-finance-media-collision",{recursive:true});
 await writeFile("artifacts/pse-finance-media-collision/report.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
