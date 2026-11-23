/** Scoped WordPress CSS only: existing Page 83593. Preview before every save. */
import {chromium} from "playwright";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";

const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const allowedMessage="cms(pse): style NPK page via cssmore";
const apply=event.head_commit?.message===allowedMessage && process.env.PSE_NPK_PREVIEW_ONLY!=="true";
const live=process.env.PSE_NPK_VERIFY_PUBLISHED==="true";
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||
   process.env.GITHUB_REF!=="refs/heads/main")throw Error("Wrong repository or branch");
if(apply&&process.env.PSE_NPK_FRESH_DB_BACKUP!=="true")throw Error("Fresh verified DB backup required");

function origin(key){
  const items=String(process.env.ENV_FILE||"").split(/\r?\n/)
    .map(x=>x.trim().replace(/^export\s+/,"")).filter(x=>x.startsWith(key+"="));
  if(items.length!==1)throw Error("Missing unique environment key "+key);
  const u=new URL(items[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
  if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))
    throw Error("Unsafe origin for "+key);
  return u.origin;
}
const wp=origin("WC_URL"),front=origin("WC_URL_CLIENT");
if(wp!=="https://admin-pse.webnvn.com"||front!=="https://pse.webnvn.com")throw Error("Wrong PSE origin");
const css=(await readFile("scripts/pse-npk-1434-cssmore.css","utf8")).trim();
if(!css.startsWith("/* WordPress Page 83593")||!css.includes("table:first-of-type")||
   css.length<800||css.length>6000||/<script|@import|url\s*\(/i.test(css))
  throw Error("NPK scoped CSS approval mismatch");
const hash=x=>createHash("sha256").update(String(x||"")).digest("hex");
const dir="artifacts/pse-npk-1434-cssmore";
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1240,height:900},deviceScaleFactor:1});
const admin=await ctx.newPage();
try{
  if(!process.env.WP_ADMIN_USERNAME||!process.env.WP_ADMIN_PASSWORD)
    throw Error("Missing WordPress admin credentials");
  await admin.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
  if(await admin.locator("#user_login").count()){
    await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME);
    await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD);
    const body=await admin.locator("body").innerText();
    const m=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||
      body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if(m){
      const a=+m[1],b=+m[3],value=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
      const fld=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if(!await fld.count())throw Error("Unknown login challenge");
      await fld.fill(String(value));
    }
    await admin.locator("#wp-submit").click();
  }
  if(admin.url().includes("wp-login"))throw Error("WordPress admin login failed");
  const nonce=await admin.evaluate(async()=>{
    if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
    const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
    if(!r.ok)throw Error("REST nonce unavailable");
    return (await r.text()).trim();
  });
  if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("Invalid REST nonce");
  const get=async()=>admin.evaluate(async nonce=>{
    const r=await fetch("/wp-json/wp/v2/pages/83593?context=edit&_fields=id,slug,status,acf,content,modified",{
      credentials:"same-origin",cache:"no-store",headers:{"X-WP-Nonce":nonce}});
    return {http:r.status,page:await r.json().catch(()=>null)};
  },nonce);
  const prior=await get();
  const data=prior.page||{},raw=String(data.content?.raw||"");
  if(prior.http!==200||data.id!==83593||data.slug!=="npk-phu-my"||data.status!=="publish"||
     data.acf?.action!=="PublicPage"||data.acf?.key!=="pse-historical-npk-1434")
    throw Error("Unexpected WordPress NPK identity");
  const structure=await admin.evaluate(html=>{
    const root=document.createElement("div");root.innerHTML=html;
    const tables=[...root.querySelectorAll("table")];
    return {tableRows:tables.map(x=>x.rows.length),
      images:root.querySelectorAll("img").length,
      imageUrls:[...root.querySelectorAll("img")].map(x=>x.getAttribute("src")||"")};
  },raw);
  if(structure.tableRows.join(",")!=="20,4,4"||structure.images!==20)
    throw Error("Original WordPress NPK HTML changed shape");
  const currentCss=String(data.acf?.cssmore||"");
  // Git blob SHA of the previously live, source-reviewed CSS (one trailing newline).
  // Do not overwrite any independent manual CMS style edit.
  const legacyCssBlob="84a21d5e483ee354ac76dfaf26df579ba7bb2f12";
  const previousCssBlob="c26f45f964d022f05d7ea5190abe8242de2c28a0";
  const gitBlob=text=>createHash("sha1").update("blob "+Buffer.byteLength(text)+"\0"+text).digest("hex");
  const isLegacyCss=gitBlob(currentCss.trim()+"\n")===legacyCssBlob;
  if(currentCss.trim()&&currentCss.trim()!==css&&!isLegacyCss&&gitBlob(currentCss.trim()+"\n")!==previousCssBlob)
    throw Error("Existing cssmore differs from both reviewed revisions; refusing overwrite");
  if(live&&currentCss.trim()!==css)throw Error("Saved CSS not found for live readback");

  const groupOld="https://pse.vn/hoat-dong-kinh-doanh/san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my.html";
  const groupNew=front+"/san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my";
  const kaliOld="https://pse.vn/hoat-dong-kinh-doanh/san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my/8-trang-chu/1426-kali-phu-my.html";
  const kaliNew=front+"/kali-phu-my-mo-ta-cac-bien-the";
  const placeholderOld="https://pse.vn/hoat-dong-kinh-doanh/san-pham/nhom-phan-don-va-phan-phuc-hop-phu-my/8-trang-chu/49-noi-dung-dang-cap-nhat.html";
  const count=(text,needle)=>text.split(needle).length-1;
  const migrated=count(raw,groupNew)===1&&count(raw,kaliNew)===1&&
    count(raw,groupOld)===0&&count(raw,kaliOld)===0&&count(raw,placeholderOld)===0;
  let updated=raw;
  if(!migrated){
    if(count(raw,groupOld)!==1||count(raw,kaliOld)!==1||
       count(raw,placeholderOld)!==1||count(raw,groupNew)!==0||count(raw,kaliNew)!==0)
      throw Error("Source NPK related links unexpected; no mutation allowed");
    const placeholderPattern=/<li\b[^>]*>\s*<a\b[^>]*href=["']https:\/\/pse\.vn\/hoat-dong-kinh-doanh\/san-pham\/nhom-phan-don-va-phan-phuc-hop-phu-my\/8-trang-chu\/49-noi-dung-dang-cap-nhat\.html["'][^>]*>[\s\S]*?<\/a>\s*<\/li>/gi;
    const placeholderItems=[...raw.matchAll(placeholderPattern)];
    if(placeholderItems.length!==1||
       !/Nội dung đang cập nhật/i.test(placeholderItems[0][0])||
       !/19\/05\/2011/.test(placeholderItems[0][0]))
      throw Error("Unverifiable legacy placeholder list item; preserve original");
    updated=raw.replace(groupOld,groupNew).replace(kaliOld,kaliNew)
      .replace(placeholderPattern,"");
  }
  if(count(updated,groupNew)!==1||count(updated,kaliNew)!==1||
     [groupOld,kaliOld,placeholderOld].some(link=>updated.includes(link))||
     (updated.match(/<img(?:\s|>)/gi)||[]).length!==20||
     (updated.match(/<table(?:\s|>)/gi)||[]).length!==3||
     (updated.match(/<tr(?:\s|>)/gi)||[]).length!==28)
    throw Error("NPK scoped link rewrite changed unexpected body/media shape");
  const targets=await Promise.all([groupNew,kaliNew].map(url=>admin.request.get(url,{timeout:40000})));
  if(targets.some(response=>response.status()!==200))
    throw Error("New local related-link target not HTTP 200");
  if(live&&!migrated)throw Error("Published CSS QA requires migrated WordPress links");
  const changed=updated!==raw||currentCss.trim()!==css;
  const rawHash=hash(raw),cssHash=hash(currentCss);
  await writeFile(dir+"/rollback.json",JSON.stringify({
    page:83593,modified:data.modified,sourceContentSha256:rawHash,
    originalCssmore:currentCss,targetCssSha256:hash(css),
    sourceContent:raw,targetContentSha256:hash(updated),relatedLinksMigrated:migrated},null,2)+"\n");
  console.log("PSE_NPK_CSSMORE_PREFLIGHT="+JSON.stringify({
    page:83593,rawHash:rawHash.slice(0,16),cssOldLength:currentCss.length,
    cssNewLength:css.length,images:structure.images,rows:structure.tableRows,apply,live,migrated,changed}));

  const pub=await ctx.newPage();
  try{
    const response=await pub.goto(front+"/npk-phu-my",{waitUntil:"domcontentloaded",timeout:60000});
    if(response?.status()!==200)throw Error("Public NPK route not 200");
    const table=pub.locator("main .article-content > div > table").first();
    if(await pub.locator("main .article-content > div > table").count()!==3||
       await table.locator("tr").count()!==20||await table.locator("img").count()!==20)
      throw Error("Unexpected frontend table structure");
    if(!live)await pub.addStyleTag({content:css});
    else if(!await pub.locator("main style").evaluateAll(nodes=>nodes.some(n=>n.textContent.includes("/* WordPress Page 83593"))))
      throw Error("CSS not published on live Astro page");
    if(live){
      const related=await pub.locator("main .article-content a[href]").evaluateAll(links=>
        links.filter(a=>a.textContent.trim()).map(a=>({
          label:a.textContent.replace(/\s+/g," ").trim(),url:a.href
        })));
      const group=related.filter(x=>x.label.includes("Nhóm phân đơn và phân phức hợp Phú Mỹ"));
      const kali=related.filter(x=>x.label.includes("Kali Phú Mỹ"));
      if(group.length!==1||group[0].url!==groupNew||
         kali.length!==1||kali[0].url!==kaliNew||
         related.some(x=>/Nội dung đang cập nhật/i.test(x.label)||/^https?:\/\/(?:www\.)?pse\.vn\//i.test(x.url)))
        throw Error("Published NPK text related links point outside new PSE site");
      console.log("PSE_NPK_RELATED_LINKS_LIVE=PASS two_links_local=true placeholder_removed=true");
    }
    await table.locator("img").evaluateAll(imgs=>imgs.forEach(img=>{img.loading="eager";}));
    await pub.waitForFunction(()=>[...document.querySelectorAll("main .article-content > div > table:first-of-type img")].every(img=>img.complete),
      null,{timeout:45000});
    for(const width of [1440,1240,768,390]){
      await pub.setViewportSize({width,height:900});
      await pub.waitForTimeout(180);
      const state=await pub.evaluate(()=>{
        const tables=[...document.querySelectorAll("main .article-content > div > table")],first=tables[0];
        const rect=el=>{const r=el.getBoundingClientRect();return {
          x:Math.round(r.x),right:Math.round(r.right),width:Math.round(r.width),height:Math.round(r.height)};};
        const images=[...first.querySelectorAll("img")].map(img=>({
          ...rect(img),naturalW:img.naturalWidth,complete:img.complete,
          src:img.getAttribute("src")||""}));
        const cells=[...first.rows].flatMap(row=>[...row.cells].map(rect));
        const second=tables[1],third=tables[2];
        const h1=document.querySelector("main header h1");
        const titleGap=h1?Math.round(first.getBoundingClientRect().top-h1.getBoundingClientRect().bottom):null;
        return {width:innerWidth,docWidth:document.documentElement.scrollWidth,
          first:rect(first),firstDisplay:getComputedStyle(first).display,
          imageCount:images.length,images,
          firstRowCells:[...first.rows[0].cells].map(rect),
          maxCellRight:Math.max(...cells.map(c=>c.right)),
          otherTables:[{rows:second.rows.length,display:getComputedStyle(second).display,...rect(second)},
                       {rows:third.rows.length,display:getComputedStyle(third).display,...rect(third)}],
          h1:document.querySelector("main h1")?.textContent.trim(),titleGap};
      });
      const broken=state.images.filter(x=>x.naturalW===0);
      console.log("PSE_NPK_CSSMORE_LAYOUT="+JSON.stringify({
        width,state:{...state,images:undefined},
        broken:broken.map(x=>x.src),maxImageHeight:Math.max(...state.images.map(x=>x.height))}));
      if(state.h1!=="NPK Phú Mỹ"||state.titleGap===null||state.titleGap<45||state.titleGap>110||state.docWidth>width+3||
         state.imageCount!==20||state.maxCellRight>width+4||
         state.images.some(x=>x.width<=0||x.height>(width<=640?242:282))||
         state.first.height>(width<=640?16000:11000)||
         state.otherTables.some(x=>x.rows!==4||x.display!=="table")||
         (width<=640?(state.firstDisplay!=="block"||
           state.firstRowCells.some(x=>x.width<width-75)):
           (state.firstDisplay!=="table"||state.firstRowCells[1].width<state.firstRowCells[0].width)))
        throw Error("NPK layout preview assertions failed at "+width);
      // One imported external image at source position 4 has no usable
      // frontend src (known existing data defect). Never mask other broken images.
      if(broken.length>1||(broken.length===1&&
         (state.images.indexOf(broken[0])!==4||!structure.imageUrls[4]?.includes("dpm.vn"))))
        throw Error("Unexpected broken image outside known imported source #4");
      if(live&&broken.length!==0)throw Error("Published NPK original photo still broken at "+width);
      if(width===1240||width===390)
        await pub.screenshot({path:dir+"/"+(live?"live":"preview")+"-"+width+".png",fullPage:true});
    }
  }finally{await pub.close();}

  if(apply&&changed){
    const latest=await get();
    if(latest.http!==200||latest.page?.modified!==data.modified||
       hash(latest.page?.content?.raw)!==rawHash||
       hash(latest.page?.acf?.cssmore)!==cssHash)
      throw Error("Concurrent WordPress Page edit, refusing save");
    const saved=await admin.evaluate(async({nonce,css,updated})=>{
      const r=await fetch("/wp-json/wp/v2/pages/83593",{method:"POST",credentials:"same-origin",
        headers:{"X-WP-Nonce":nonce,"Content-Type":"application/json"},
        body:JSON.stringify({acf:{cssmore:css},content:updated})});
      const p=await r.json().catch(()=>null);
      return {http:r.status,id:p?.id,code:p?.code};
    },{nonce,css,updated});
    if(saved.http!==200||saved.id!==83593)
      throw Error("WordPress scoped CSS save failed HTTP "+saved.http+" "+saved.code);
  }
  if(apply){
    const after=await get();
    if(after.http!==200||after.page?.id!==83593||after.page?.acf?.cssmore?.trim()!==css||
       hash(after.page?.content?.raw)!==hash(updated)||
       after.page?.acf?.action!==data.acf.action||
       after.page?.acf?.key!==data.acf.key||after.page?.status!==data.status)
      throw Error("WordPress CSS post-save readback mismatch");
    console.log("PSE_NPK_CSSMORE_SAVED=PASS page=83593 cssmore_and_related_links_readback=true original_images_and_tables_preserved=true");
  }
  console.log("PSE_NPK_CSSMORE_QA=PASS apply="+apply+" published="+live+" tables=3 first_rows=20 images=20 relatedLinks="+(migrated?"migrated":"preflight"));
}finally{await browser.close();}
