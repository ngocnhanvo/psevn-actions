/** Read-only full 190 PSE disclosures audit: source document/image counts vs WP,
 * WordPress uploaded-asset reachability. No CMS writes and no Astro build.
 */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const checkpoint=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(checkpoint.schema!=="pse-legacy-article-migration-v1")throw Error("Wrong checkpoint schema");
const articles=Object.entries(checkpoint.articles).filter(([,x])=>String(x.source_url||"").includes("/quan-he-nha-dau-tu/tin-tuc-co-dong/ban-cong-bo-thong-tin/"))
 .map(([sourceId,x])=>({sourceId,url:x.source_url,wpId:x.wp_id||null}));
if(articles.length!==190||new Set(articles.map(x=>x.sourceId)).size!==190)throw Error("Expected precisely 190 verified original IDs");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const opt=env.filter(x=>x.startsWith("WC_URL="));
if(opt.length!==1)throw Error("Exactly one WP origin required");
const u=new URL(opt[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Unsafe WP origin");
const wp=u.origin;
const browser=await chromium.launch({headless:true});
const report={schema:"pse-disclosure-190-media-parity-v1",sourceRecords:190,wordpressPublished:null,checked:0,sourceFailed:[],sourceMissingMedia:[],mediaCountMismatch:[],legacyMediaLinks:[],brokenWordpressFiles:[],wordpressFilesChecked:0,results:[],errors:[]};
try{
 const ctx=await browser.newContext();
 async function get(path){
  const r=await ctx.request.get(wp+path,{timeout:45000});
  if(!r.ok())throw Error("WP REST HTTP "+r.status()+" "+path);
  return {data:await r.json(),total:Number(r.headers()["x-wp-total"]||0)};
 }
 const a=await get("/wp-json/wp/v2/posts?categories=1753&per_page=100&page=1&_fields=id,slug,status,title,content,link");
 const b=await get("/wp-json/wp/v2/posts?categories=1753&per_page=100&page=2&_fields=id,slug,status,title,content,link");
 report.wordpressPublished=a.total;
 const byId=new Map([...a.data,...b.data].map(p=>[p.id,p]));
 const assetPattern=/\.(?:pdf|zip|rar|docx?|xlsx?|pptx?|jpe?g|png|gif|webp|svg)(?:[?#]|$)/i;
 const type=url=>/\.(?:jpe?g|png|gif|webp|svg)(?:[?#]|$)/i.test(url)?"image":"document";
 const extractor=(container,base,localHostOnly)=>{
  const out=[];
  for(const el of container.querySelectorAll("a[href],img[src],iframe[src],object[data],embed[src]")){
   const tag=el.tagName.toLowerCase(),raw=el.getAttribute("href")||el.getAttribute("src")||el.getAttribute("data")||"";
   if(!raw||!assetPattern.test(raw))continue;
   try {
    const url=new URL(raw,base);
    if(localHostOnly&&!["pse.vn","www.pse.vn"].includes(url.hostname))continue;
    const kind=type(url.pathname);
    out.push({url:url.href,kind,tag});
   }catch{}
  }
  return [...new Map(out.map(x=>[x.url,x])).values()];
 };
 let index=0;
 const worker=async()=>{
  const page=await ctx.newPage();
  await page.route(/\.(?:jpe?g|png|gif|webp|svg|woff2?|ttf)(?:[?#]|$)/i,r=>r.abort());
  try{
   while(index<articles.length){
    const a=articles[index++],post=byId.get(a.wpId);
    const item={sourceId:a.sourceId,wpId:a.wpId,sourceUrl:a.url,sourceHttp:null,wpFound:!!post,sourceDocuments:0,wpDocuments:0,sourceImages:0,wpImages:0,sourceFiles:[],wordpressFiles:[]};
    if(!post){report.sourceMissingMedia.push({id:a.sourceId,reason:"Post absent in WordPress"});report.results.push(item);continue}
    try{
     const r=await page.goto(a.url,{waitUntil:"domcontentloaded",timeout:45000});
     item.sourceHttp=r?.status()||null;
     if(item.sourceHttp!==200)throw Error("Source HTTP "+item.sourceHttp);
     const extracted=await page.evaluate(({wpHtml,wp})=>{
      const sourceRoot=document.querySelector('[itemprop="articleBody"]')||document.querySelector(".item-page")||document.querySelector("main");
      const fragment=document.createElement("div");
      fragment.innerHTML=wpHtml;
      const pattern=/\.(?:pdf|zip|rar|docx?|xlsx?|pptx?|jpe?g|png|gif|webp|svg)(?:[?#]|$)/i;
      const sourceAssets=[],wpAssets=[];
      function extract(root,base,arr,origin){
       if(!root)return;
       for(const el of root.querySelectorAll("a[href],img[src],iframe[src],object[data],embed[src]")){
        const raw=el.getAttribute("href")||el.getAttribute("src")||el.getAttribute("data")||"";
        if(!raw||!pattern.test(raw))continue;
        try{
         const u=new URL(raw,base);
         if(origin==="source"&&!["www.pse.vn","pse.vn"].includes(u.hostname))continue;
         const kind=/\.(?:jpe?g|png|gif|webp|svg)$/i.test(u.pathname)?"image":"document";
         arr.push({url:u.href,kind,tag:el.tagName});
        }catch{}
       }
      }
      extract(sourceRoot,location.href,sourceAssets,"source");
      extract(fragment,wp,wpAssets,"target");
      return{source:[...new Map(sourceAssets.map(x=>[x.url,x])).values()],
        target:[...new Map(wpAssets.map(x=>[x.url,x])).values()]};
     },{wpHtml:String(post.content?.rendered||""),wp});
     const sourceFiles=extracted.source,wpFiles=extracted.target;
     item.sourceDocuments=sourceFiles.filter(x=>x.kind==="document").length;
     item.wpDocuments=wpFiles.filter(x=>x.kind==="document").length;
     item.sourceImages=sourceFiles.filter(x=>x.kind==="image").length;
     item.wpImages=wpFiles.filter(x=>x.kind==="image").length;
     item.sourceFiles=sourceFiles;
     item.wordpressFiles=wpFiles;
     if(item.sourceDocuments>item.wpDocuments||item.sourceImages>item.wpImages)
      report.mediaCountMismatch.push({sourceId:a.sourceId,wpId:a.wpId,sourceDocs:item.sourceDocuments,wpDocs:item.wpDocuments,sourceImgs:item.sourceImages,wpImgs:item.wpImages,sourceFiles,wpFiles});
     const old=wpFiles.filter(x=>/^(?:www\.)?pse\.vn$/i.test(new URL(x.url).hostname)&&/\/(?:images|media|files)\//.test(new URL(x.url).pathname));
     if(old.length)report.legacyMediaLinks.push({sourceId:a.sourceId,wpId:a.wpId,links:old});
     report.checked++;
    }catch(e){
     item.error=String(e).slice(0,200);
     report.sourceFailed.push({sourceId:a.sourceId,url:a.url,error:item.error});
    }
    report.results.push(item);
    if(report.results.length%20===0)console.log("PSE_MEDIA_PARITY_PROGRESS="+report.results.length+"/"+articles.length);
   }
  }finally{await page.close()}
 };
 await Promise.all([worker(),worker(),worker()]);
 const local=new Map();
 for(const r of report.results)for(const f of r.wordpressFiles)
  if(f.url.startsWith(wp+"/wp-content/uploads/"))local.set(f.url,true);
 const files=[...local.keys()];
 let cursor=0;
 const probe=async()=>{
  while(cursor<files.length){
   const url=files[cursor++];
   try {
    const resp=await ctx.request.head(url,{timeout:25000});
    if(resp.status()===404||resp.status()===410)report.brokenWordpressFiles.push({url,http:resp.status()});
    else if(!resp.ok())report.errors.push({url,http:resp.status(),type:"HEAD_UNVERIFIED"});
   }catch(e){report.errors.push({url,error:String(e).slice(0,140),type:"HEAD_UNVERIFIED"})}
   report.wordpressFilesChecked++;
  }
 };
 await Promise.all([probe(),probe(),probe(),probe()]);
}finally{
 await mkdir("artifacts/pse-disclosure-media-parity",{recursive:true});
 await writeFile("artifacts/pse-disclosure-media-parity/report.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
const summary={sourceRecords:report.sourceRecords,wordpressPublished:report.wordpressPublished,sourceChecked:report.checked,sourceFailed:report.sourceFailed.length,mediaCountMismatch:report.mediaCountMismatch.length,oldLinks:report.legacyMediaLinks.length,filesChecked:report.wordpressFilesChecked,brokenFiles:report.brokenWordpressFiles.length,unverifiedHead:report.errors.length};
console.log("PSE_190_MEDIA_PARITY="+JSON.stringify(summary));
for(const item of report.mediaCountMismatch.slice(0,30))console.log("PSE_190_MEDIA_MISMATCH="+JSON.stringify({sourceId:item.sourceId,sourceDocs:item.sourceDocs,wpDocs:item.wpDocs,sourceImgs:item.sourceImgs,wpImgs:item.wpImgs}));
if(report.sourceFailed.length||report.mediaCountMismatch.length||report.brokenWordpressFiles.length||report.wordpressPublished!==190)process.exitCode=1;
