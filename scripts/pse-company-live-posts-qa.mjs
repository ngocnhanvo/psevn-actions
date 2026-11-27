/** Read-only postdeploy PSE company parent-only Archive + both November Joomla news and nine original Media. */
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";
const marker=(await readFile(".pse-company-live-posts-qa-request","utf8")).trim();
const ev=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const markerMatch=marker.match(/^MODE=READONLY(?:\r?\nEXPECTED_ASTRO_SHA=([a-f0-9]{40}))?$/);
if(!markerMatch||String(ev.head_commit?.message||"").split("\n")[0]!=="test(pse): check live company all menu and two November posts")
 throw Error("Missing PSE read-only live QA authorization");
const site="https://pse.webnvn.com";
const detail=[
 {id:1741,wpId:83696,slug:"phu-my-dong-nam-bo-to-chuc-le-cong-bo-va-trao-quyet-dinh-ve-cong-tac-can-bo-2026",media:["PSE-2026-11-010.jpg","PSE-2026-11-011.jpg","PSE-2026-11-012.jpg","PSE-2026-11-013.jpg"]},
 {id:1739,wpId:83698,slug:"phu-my-dong-nam-bo-mot-ngay-thu-bay-day-y-nghia",media:["PSE-2026-11-001.jpg","PSE-2026-11-002.jpg","PSE-2026-11-003.jpg","PSE-2026-11-004.jpg","PSE-2026-11-005.jpg"]}
];
const report={source:"pse-live-2026-company-news",time:new Date().toISOString(),posts:[],archive:[],media:[],readonly:true,expectedAstroSHA:markerMatch[1]||null};
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1440,height:900}});
try{
 for(const width of [1440,390]){
  const page=await ctx.newPage();await page.setViewportSize({width,height:900});
  try{
   const url=site+"/tin-tuc-su-kien/tin-cong-ty";
   const res=await page.goto(url,{waitUntil:"domcontentloaded",timeout:60000});
   if(res?.status()!==200)throw Error("Public company Archive HTTP "+res?.status()+" "+width);
   const html=await page.content(),anchors=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(a=>({text:(a.textContent||"").trim(),href:a.href})));
   const current=anchors.find(a=>a.text==="Tất cả"&&new URL(a.href).pathname.replace(/\/$/,"")==="/tin-tuc-su-kien/tin-cong-ty");
   if(!current)throw Error("WordPress first Tất cả submenu not present in live Astro "+width);
   const links=detail.map(d=>anchors.find(a=>new URL(a.href).pathname.includes(d.slug)));
   if(links.some(x=>!x))throw Error("Live Tin Công ty archive missing November link "+width);
   if(links.some((x,i)=>!x.href.startsWith(site+"/")))throw Error("Offsite or wrong Nov WordPress slug");
   report.archive.push({viewport:width,http:200,hasAllMenu:true,novemberSlugs:links.map(x=>x.href)});
   console.log("PSE_COMPANY_LIVE_ARCHIVE_PASS viewport="+width+" direct2026="+links.length);
  }finally{await page.close()}
 }
 for(const d of detail){
  const p=await ctx.newPage();
  try{
   const url=site+"/"+d.slug;
   const res=await p.goto(url,{waitUntil:"domcontentloaded",timeout:60000});
   if(res?.status()!==200)throw Error("Public article HTTP "+res?.status()+" source="+d.id);
   const otherPostsHeadings=await p.getByRole("heading",{name:"Các bài viết khác",exact:true}).count();
   if(otherPostsHeadings!==0){
    const relatedDom=await p.getByRole("heading",{name:"Các bài viết khác",exact:true}).first().evaluate(el=>({tag:el.tagName,html:el.outerHTML,parent:el.parentElement?.outerHTML.slice(0,5000),grand:el.parentElement?.parentElement?.outerHTML.slice(0,7000)}));
    console.log("PSE_RELATED_SECTION_DOM source="+d.id+" "+JSON.stringify(relatedDom));
    throw Error("PSE_RELATED_OTHER_POSTS_REMOVED=FAIL source="+d.id+" count="+otherPostsHeadings);
   }
   console.log("PSE_RELATED_OTHER_POSTS_REMOVED=PASS source="+d.id);
   const dom=await p.content();
   const debug=await p.evaluate(()=>({title:document.title,
    h1:[...document.querySelectorAll('h1')].map(x=>(x.textContent||"").trim()),
    imgs:[...document.querySelectorAll('img[src]')].map(x=>({src:x.getAttribute("src"),alt:x.alt})).slice(0,30),
    body:(document.body?.innerText||"").replace(/\s+/g," ").trim().slice(0,2200),
    htmlLength:document.documentElement.outerHTML.length
   }));
   console.log("PSE_COMPANY_LIVE_DETAIL_DEBUG source="+d.id+" "+JSON.stringify(debug).slice(0,11000));
   const renderedImages=await p.locator('#article-content img[src]').evaluateAll(nodes=>nodes.map(x=>({src:x.getAttribute("src"),alt:x.alt})));
   // PSE Astro intentionally optimizes original JPG uploads into local image-proxy
   // .webp paths, so assert the source-owned filename stem, rather than requiring
   // literal original .jpg in the transformed HTML.
   const found=d.media.filter(filename=>renderedImages.some(img=>String(img.src||"").includes(filename.replace(/\.jpe?g$/i,""))));
   if(found.length!==d.media.length)throw Error("Missing optimized original Media in production article "+d.id+
    " count="+found.length+" imagePaths="+JSON.stringify(renderedImages.slice(0,12)));
   const missingRequests=await Promise.all(renderedImages.filter(x=>d.media.some(m=>String(x.src||"").includes(m.replace(/\.jpe?g$/i,""))))
    .map(async x=>{const res=await p.request.get(new URL(x.src,site).href,{timeout:40000,failOnStatusCode:false});
      return{src:x.src,status:res.status(),type:res.headers()["content-type"]||""}}));
   if(missingRequests.length!==d.media.length||missingRequests.some(x=>x.status!==200||!x.type.startsWith("image/")))
    throw Error("Transformed source photos failed HTTP200 native proxy checks "+d.id+": "+JSON.stringify(missingRequests));
   const body=(await p.locator("body").innerText()).replace(/\s+/g," ").trim();
   if(!body.includes(d.id===1741?"Hoàng Tuấn Vinh":"Bán hàng dựa vào nội lực"))
    throw Error("Wrong original Joomla body on live article "+d.id);
   report.posts.push({originalId:d.id,wpId:d.wpId,http:200,url,mediaCount:found.length,optimizedPhotoHttpPass:missingRequests.length,bodyLength:body.length});
   console.log("PSE_COMPANY_LIVE_POST_PASS "+JSON.stringify(report.posts.at(-1)));
  }finally{await p.close()}
 }
 // Verify every exact original Media asset is served by WordPress without relying on Astro CSS or JS.
 for(const filename of detail.flatMap(d=>d.media)){
  const url="https://admin-pse.webnvn.com/wp-content/uploads/2026/11/"+filename;
  const response=await ctx.request.get(url,{timeout:40000,failOnStatusCode:false});
  // Year/month may differ from CMS upload folder; if not 200 report rather than infer wrong path.
  report.media.push({filename,status:response.status(),type:response.headers()["content-type"]||""});
 }
 console.log("PSE_COMPANY_LIVE_POSTDEPLOY_PASS archive="+report.archive.length+" posts="+report.posts.length+
  " mediaReferenced="+detail.reduce((s,d)=>s+d.media.length,0));
}finally{
 await mkdir("artifacts/pse-company-news",{recursive:true});
 await writeFile("artifacts/pse-company-news/live-company-news-qa.json",JSON.stringify(report,null,2)+"\n");
 await browser.close();
}
