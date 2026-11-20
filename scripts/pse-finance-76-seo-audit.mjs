/** Independently audit original <title> and meta description against all 76 WordPress Yoast fields. READ ONLY. */
import {chromium} from "playwright";
import {readFile,writeFile,mkdir} from "node:fs/promises";
const m=JSON.parse(await readFile("artifacts/pse-financial-original/report.json","utf8"));
if(m.schema!=="pse-financial-report-source-parity-v1"||m.sourceArticles?.length!==76)
 throw Error("Missing independent audited 76-item source snapshot");
const env=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const u=env.filter(x=>x.startsWith("WC_URL="));
if(u.length!==1)throw Error("PSE WordPress origin missing");
const wp=new URL(u[0].slice(7).replace(/^['"]|['"]$/g,"")).origin;
if(wp!=="https://admin-pse.webnvn.com")throw Error("Wrong PSE WordPress host");
const report={schema:"pse-finance-76-source-seo-audit-v1",sourceCount:76,checked:0,
 sourceTitleCount:0,sourceMetaDescriptionCount:0,titleMismatch:[],descriptionMismatch:[],
 descriptionSourceMissingWithTargetValue:[],sourceMissing:[],failed:[],rows:[],status:"UNVERIFIED"};
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1180,height:800}});
const normalize=s=>String(s||"").replace(/\s+/g," ").trim();
try{
 const response=await ctx.request.get(wp+"/wp-json/wp/v2/posts?categories=1754&per_page=100&page=1&_fields=id,slug,status,pse_seo_title,pse_seo_description,excerpt",{timeout:60000});
 if(response.status()!==200||Number(response.headers()["x-wp-total"])!==76)
  throw Error("PSE native financial WordPress archive identity changed");
 const wordpress=await response.json();
 const bySlug=new Map(wordpress.map(r=>[r.slug,r]));
 if(wordpress.length!==76||bySlug.size!==76)throw Error("PSE WordPress slug parity invalid");
 let current=0;
 const worker=async()=>{
  const page=await ctx.newPage();
  await page.route(/\.(?:png|jpe?g|gif|webp|svg|woff2?|ttf)(?:[?#]|$)/i,r=>r.abort());
  while(current<m.sourceArticles.length){
   const row=m.sourceArticles[current++];
   const wpPost=bySlug.get(row.slug);
   if(!wpPost||!Number.isSafeInteger(wpPost.id)||typeof wpPost.pse_seo_title!=="string"||
    typeof wpPost.pse_seo_description!=="string"){
    report.failed.push({id:row.id,error:"WordPress post/Yoast field not in registered REST response"});continue;
   }
   let seo=null;
   for(let attempt=0;attempt<2&&!seo;attempt++){
    try{
     const r=await page.goto(row.href,{waitUntil:"domcontentloaded",timeout:40000});
     if(r?.status()!==200)throw Error("Original HTTP "+r?.status());
     seo=await page.evaluate(()=>{
      const title=document.querySelector("head title")?.textContent||"";
      const meta=document.querySelector('head meta[name="description" i]')?.getAttribute("content")||"";
      return {title,meta};
     });
    }catch(e){
     if(attempt===1)report.failed.push({id:row.id,error:String(e).slice(0,180)});
    }
   }
   if(!seo)continue;
   const originalTitle=normalize(seo.title),originalDescription=normalize(seo.meta);
   const newTitle=normalize(wpPost.pse_seo_title),newDescription=normalize(wpPost.pse_seo_description);
   if(originalTitle)report.sourceTitleCount++;
   if(originalDescription)report.sourceMetaDescriptionCount++;
   if(originalTitle&&originalTitle!==newTitle)report.titleMismatch.push({id:row.id,wpId:wpPost.id,sourceTitle:originalTitle,targetTitle:newTitle});
   if(originalDescription&&originalDescription!==newDescription)report.descriptionMismatch.push({id:row.id,wpId:wpPost.id,source:originalDescription,target:newDescription});
   if(!originalDescription&&newDescription)report.descriptionSourceMissingWithTargetValue.push({
    id:row.id,wpId:wpPost.id,description:newDescription,
    generatedFromExcerpt:newDescription===normalize(wpPost.excerpt?.rendered?.replace(/<[^>]*>/g,""))
   });
   report.rows.push({id:row.id,wpId:wpPost.id,sourceTitle:originalTitle,
    sourceDescription:originalDescription||null,wpTitle:newTitle,
    wpDescription:newDescription||null,
    titleParity:!originalTitle||originalTitle===newTitle,
    descriptionParity:!originalDescription||originalDescription===newDescription});
   report.checked++;
  }
  await page.close();
 };
 await Promise.all([worker(),worker(),worker(),worker()]);
 // Joomla does not publish SEO meta descriptions for these 76 pages.
 // Existing destination-only descriptions are retained rather than erased:
 // missing source metadata is not evidence that a target value is invalid.
 report.status=report.checked===76&&!report.failed.length&&!report.titleMismatch.length&&
  !report.descriptionMismatch.length?"PASS_SOURCE_FIELDS":"PARTIAL";
 console.log("PSE_FINANCE_76_SEO="+JSON.stringify({status:report.status,source:76,checked:report.checked,
   sourceTitleCount:report.sourceTitleCount,sourceMetaDescriptionCount:report.sourceMetaDescriptionCount,
   titleMismatch:report.titleMismatch.slice(0,20),titleMismatchCount:report.titleMismatch.length,
   descMismatch:report.descriptionMismatch.slice(0,12),descMismatchCount:report.descriptionMismatch.length,
   sourceMissingWithTarget:report.descriptionSourceMissingWithTargetValue.slice(0,12),
   sourceMissingWithTargetCount:report.descriptionSourceMissingWithTargetValue.length,
   sourceErrors:report.failed}));
}catch(e){report.status="FAIL";report.failed.push({error:String(e)});console.error("PSE_FINANCE_76_SEO_FATAL="+String(e))}
finally{
 await mkdir("artifacts/pse-finance-76-seo",{recursive:true});
 await writeFile("artifacts/pse-finance-76-seo/report.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
if(report.status!=="PASS")process.exitCode=1;
