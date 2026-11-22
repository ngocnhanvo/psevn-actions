/** Read-only inventory: historical Joomla post identities against current public WordPress registry. No edits/build. */
import {chromium} from "playwright";
import {readFile,writeFile,mkdir} from "node:fs/promises";
const checkpoint=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
if(checkpoint.schema!=="pse-legacy-article-migration-v1"||!checkpoint.backup_verified||
 process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("Unknown PSE source checkpoint");
const origin="https://admin-pse.webnvn.com",oldOrigin="https://www.pse.vn";
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext();
const get=async path=>{
 const r=await ctx.request.get(origin+path,{timeout:60000,headers:{Accept:"application/json"}});
 return{http:r.status(),pages:Number(r.headers()["x-wp-totalpages"]||1),
  total:Number(r.headers()["x-wp-total"]||0),data:await r.json().catch(()=>null)};
};
const full=async({route,fields})=>{
 const base="/wp-json/wp/v2/"+route+"?per_page=100&"+fields;
 const first=await get(base+"&page=1");
 if(first.http!==200||!Array.isArray(first.data)||first.pages<1||first.pages>50)throw Error("Public REST index unavailable "+route+" HTTP "+first.http);
 const all=[...first.data];
 for(let page=2;page<=first.pages;page++){
  const r=await get(base+"&page="+page);
  if(r.http!==200||!Array.isArray(r.data))throw Error("Public REST incomplete "+route+" page "+page);
  all.push(...r.data);
 }
 if(first.total&&all.length!==first.total)throw Error("WordPress "+route+" changed during read-only audit");
 return all;
};
const result={schema:"pse-legacy-804-article-public-post-inventory-v1",sourceCheckpointCount:Object.keys(checkpoint.articles).length,
 createdAt:"2026-11-21",readOnly:true,wordpress:{},groups:[],entries:[],summary:{}};
try{
 const [posts,products,categories,pages]=await Promise.all([
  full({route:"posts",fields:"status=publish&_fields=id,slug,status,date,categories,acf"}),
  full({route:"product",fields:"status=publish&_fields=id,slug,title,product_cat,featured_media"}),
  full({route:"categories",fields:"hide_empty=false&_fields=id,slug,parent"}),
  full({route:"pages",fields:"status=publish&_fields=id,slug,status,acf,content"})
 ]);
 const byId=new Map(posts.map(p=>[p.id,p])),bySlug=new Map();
 for(const p of posts){if(!bySlug.has(p.slug))bySlug.set(p.slug,[]);bySlug.get(p.slug).push(p)}
 const catBySlug=new Map(categories.map(c=>[c.slug,c]));
 const groups=new Map(),statuses={};
 for(const [sourceId,item] of Object.entries(checkpoint.articles)){
  if(!item.source_url?.startsWith(oldOrigin+"/"))throw Error("Invalid historical source URL for "+sourceId);
  const path=item.source_url.slice(oldOrigin.length).split("?")[0];
  const match=path.match(/\/(\d+)-([^/]+)\.html$/i);
  if(!match||Number(match[1])!==Number(sourceId))throw Error("Source checkpoint ID/path mismatch "+sourceId);
  const family=path.slice(0,match.index),slug=match[2];
  const postsExact=item.wp_id?[byId.get(Number(item.wp_id))].filter(Boolean):[];
  const postsSlug=bySlug.get(slug)||[];
  const sourceProduct=/\/hoat-dong-kinh-doanh\/san-pham\//.test(family);
  const sourceGallery=/\/tin-tuc-su-kien\/thu-vien\/anh$/.test(family);
  // Joomla archive URL keeps the numeric article ID. The native source-owned
  // WP gallery slug intentionally retains it (e.g. 1053-ngay-hoi...),
  // unlike ordinary Posts. Count only the exact ACF source-ID owner.
  const gallerySlug=sourceId+"-"+slug;
  const sourceGalleryOwners=sourceGallery?(bySlug.get(gallerySlug)||[]).filter(p=>
    p.status==="publish"&&String(p.acf?.origin_page_id||"")===String(sourceId)&&
    p.acf?.key==="ssr-post"&&p.acf?.action==="PostDetails"):[];
  if(sourceGalleryOwners.length>1)throw Error("Multiple native WP Posts own Joomla gallery "+sourceId);
  const alternativeProduct=sourceProduct?products.filter(p=>String(p.slug).endsWith("-"+sourceId)):[];
  // Distribution source items 1031 and 1568 were independently migrated as native
  // WordPress Pages (see PSE_DISTRIBUTION_MODERN_UI_2026-10-25.md), not Posts.
  const distributorPage=(family==="/hoat-dong-kinh-doanh/kenh-phan-phoi"&&
    ((sourceId==="1031"&&slug==="he-thong-kho")||
     (sourceId==="1568"&&slug==="quy-che-nha-phan-phoi")));
  // These are verified, owner-authored native Pages preserving distinct Joomla
  // original article bodies; they MUST NOT be mistaken for unrelated Products.
  // Exact native Page IDs, ACF ownership and original paths were independently
  // source-proven before their guarded WordPress imports (#45044832598,
  // #45045362671) and native Joomla 301 publication (#45047327023).
  const originalHistoricalPages={
    "1425":{slug:"kali-phu-my-bot-canada-mo-ta-va-hdsd",pageId:83528,key:"pse-historical-kali-1425"},
    "1426":{slug:"kali-phu-my-mo-ta-cac-bien-the",pageId:83572,key:"pse-historical-kali-1426"},
    "1434":{slug:"npk-phu-my",pageId:83593,key:"pse-historical-npk-1434"}
  };
  const nativeHistorical=sourceProduct?originalHistoricalPages[sourceId]:null;
  const nativePages=(distributorPage||nativeHistorical)?pages.filter(p=>
    p.status==="publish"&&p.acf?.action==="PublicPage"&&
    (nativeHistorical
     ?p.id===nativeHistorical.pageId&&p.slug===nativeHistorical.slug&&p.acf?.key===nativeHistorical.key
     :p.slug===slug&&p.acf?.key==="pse-business-"+slug)&&
    String(p.content?.rendered||"").replace(/<[^>]+>/g,"").trim().length>15):[];
  let status="NOT_PUBLIC";
  let current=postsExact[0]||null;
  if(current)status="PUBLISHED_ID";
  else if(postsSlug.length===1){current=postsSlug[0];status="PUBLISHED_SLUG"}
  else if(sourceGalleryOwners.length===1){current=sourceGalleryOwners[0];status="PUBLISHED_GALLERY";}
  else if(alternativeProduct.length===1)status="NATIVE_PRODUCT";
  else if(nativePages.length===1)status="NATIVE_PAGE";
  else if(sourceGallery)status="PHOTO_GALLERY_NOT_PUBLIC";
  const expectedCategory=catBySlug.get(family.split("/").at(-1));
  const taxonomyMismatch=!!current&&!!expectedCategory&&!current.categories.includes(expectedCategory.id);
  const entry={sourceId:Number(sourceId),sourcePath:path,sourceFamily:family,
   checkpointStatus:item.status,wpId:item.wp_id||null,matchedWpId:current?.id||null,
   matchedNativePageId:nativePages.length===1?nativePages[0].id:null,
   status,expectedCategoryId:expectedCategory?.id||null,taxonomyMismatch,
   reason:status==="NOT_PUBLIC"?item.reason||null:null};
  result.entries.push(entry);statuses[status]=(statuses[status]||0)+1;
  if(!groups.has(family))groups.set(family,{source:0,published:0,missing:0,nativeProduct:0,nativePage:0,gallery:0,taxonomyMismatch:0,unpublishedSourceIds:[]});
  const g=groups.get(family);g.source++;
  if(status.startsWith("PUBLISHED"))g.published++;
  else if(status==="NATIVE_PRODUCT")g.nativeProduct++;
  else if(status==="NATIVE_PAGE")g.nativePage++;
  else{g.missing++;g.unpublishedSourceIds.push(Number(sourceId))}
  if(sourceGallery)g.gallery++;
  if(taxonomyMismatch)g.taxonomyMismatch++;
 }
 result.wordpress={publishedPostCount:posts.length,publishedProductCount:products.length,
  publishedPageCount:pages.length,categoryCount:categories.length};
 result.groups=[...groups].map(([family,g])=>({family,...g})).sort((a,b)=>b.source-a.source);
 result.summary={...statuses,source:result.entries.length,
  taxonomyMismatch:result.entries.filter(x=>x.taxonomyMismatch).length};
 console.log("PSE_ALL_LEGACY_POST_SOURCE_PARITY="+JSON.stringify({summary:result.summary,wordpress:result.wordpress,
  groups:result.groups.map(g=>({family:g.family,source:g.source,published:g.published,missing:g.missing,nativeProduct:g.nativeProduct,nativePage:g.nativePage,gallery:g.gallery,taxonomyMismatch:g.taxonomyMismatch,missingIds:g.unpublishedSourceIds.slice(0,35)}))}));
 console.log("PSE_ALL_LEGACY_POST_SOURCE_AUDIT=PASS; read_only=true; no_cms_write=true; no_astro_build=true");
}finally{
 await mkdir("artifacts/pse-content-parity",{recursive:true});
 await writeFile("artifacts/pse-content-parity/inventory.json",JSON.stringify(result,null,2)+"\n");
 await ctx.close();await browser.close();
}