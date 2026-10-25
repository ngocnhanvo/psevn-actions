/** Read-only source and live contract snapshot for PSE media, contact and complaint. No credentials, writes or outgoing form submissions. */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const envLines = String(process.env.ENV_FILE || "").split(/\r?\n/).map(x => x.trim().replace(/^export\s+/, ""));
const find = key => envLines.filter(x => x.startsWith(key + "=")).map(x => x.slice(key.length + 1).replace(/^['"]|['"]$/g, ""));
const wp = find("WC_URL"), front = find("WC_URL_CLIENT");
if (wp.length !== 1 || front.length !== 1) throw Error("Missing/duplicate PSE origins");
const safe = s => { const u = new URL(s); if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash || !["", "/"].includes(u.pathname)) throw Error("Invalid origin"); return u.origin; };
const wpOrigin = safe(wp[0]), frontend = safe(front[0]);
if (wpOrigin === frontend) throw Error("WordPress origin must be isolated");
const browser = await chromium.launch({ headless: true });
const results = { checkedAt: new Date().toISOString(), old: {}, frontend: {}, cms: {}, albums: [] };
const legacy = "https://www.pse.vn";
const legacyPaths = {
  photo: "/tin-tuc-su-kien/thu-vien/anh.html",
  video: "/tin-tuc-su-kien/thu-vien/video.html",
  contact: "/lien-he.html",
  complaint: "/hoat-dong-kinh-doanh/xu-ly-khieu-nai-y-kien-khach-hang.html"
};
try {
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  page.setDefaultTimeout(15000);
  for (const [kind,path] of Object.entries(legacyPaths)) {
    try {
      const response = await page.goto(legacy + path,{waitUntil:"domcontentloaded",timeout:45000});
      const detail = await page.evaluate(() => {
        const main = document.querySelector(".item-page,.blog,main,#content") || document.body;
        return {
          title: document.title.slice(0,180),
          h1: Array.from(document.querySelectorAll("h1")).map(x=>x.textContent?.trim()).slice(0,5),
          text: (main.textContent||"").replace(/\s+/g," ").trim().slice(0,450),
          internalLinks: Array.from(main.querySelectorAll("a[href]")).map(a=>({title:(a.textContent||a.querySelector("img")?.alt||"").trim().slice(0,130),url:a.href}))
            .filter(a=>{try {let x=new URL(a.url);return x.hostname==="www.pse.vn"||x.hostname==="pse.vn"}catch{return false}}).slice(0,110),
          images: Array.from(main.querySelectorAll("img")).map(x=>({src:x.currentSrc||x.src,alt:x.alt||""})).slice(0,100),
          iframeCount: main.querySelectorAll("iframe").length,
          formFields: Array.from(main.querySelectorAll("form input:not([type=hidden]),form textarea,form select")).map(x=>({name:x.getAttribute("name"),type:x.getAttribute("type")||x.tagName.toLowerCase()})).slice(0,25)
        };
      });
      results.old[kind] = {status:response?.status(),...detail};
      console.log("PSE_MEDIA_LEGACY "+kind+" http="+response?.status()+" internal="+detail.internalLinks.length+" images="+detail.images.length+" forms="+detail.formFields.length);
    } catch(e) { results.old[kind] = {error:String(e.message).slice(0,150)};console.log("PSE_MEDIA_LEGACY "+kind+" READ_FAIL"); }
  }
  const albumCandidates = (results.old.photo?.internalLinks||[])
    .filter(x => /\/tin-tuc-su-kien\/(?:thu-vien\/)?anh\//.test(new URL(x.url).pathname) && /\.html$/.test(new URL(x.url).pathname))
    .filter((x,i,a)=>a.findIndex(y=>y.url===x.url)===i).slice(0,24);
  for (const album of albumCandidates) {
    try {
      const response=await page.goto(album.url,{waitUntil:"domcontentloaded",timeout:45000});
      const detail=await page.evaluate(()=>{
        const content=document.querySelector("main,.item-page,article,#content")||document.body;
        return {h1:(content.querySelector("h1,h2")?.textContent||"").trim().slice(0,140),
          images:Array.from(content.querySelectorAll("img")).map(x=>({src:x.currentSrc||x.src,alt:x.alt||""})).slice(0,80),
          galleryLinks:Array.from(content.querySelectorAll("a[href]")).filter(x=>/\.(?:jpe?g|png|webp)(?:\?|$)/i.test(x.href)).map(x=>x.href).slice(0,120),
          hasSigpro:!!content.querySelector('[class*="sigpro"],[id*="sigpro"]')||/sigpro|simple image gallery/i.test(content.innerHTML)};
      });
      results.albums.push({url:album.url,title:album.title,http:response?.status(),...detail});
      console.log("PSE_MEDIA_ALBUM "+results.albums.length+" http="+response?.status()+" images="+detail.images.length+" galleryLinks="+detail.galleryLinks.length+" sigpro="+detail.hasSigpro);
    }catch(e){results.albums.push({url:album.url,title:album.title,error:String(e.message).slice(0,150)})}
  }
  for (const [kind,path] of Object.entries({photo:"/tin-tuc-su-kien/anh",video:"/tin-tuc-su-kien/video",contact:"/lien-he",complaint:"/hoat-dong-kinh-doanh/xu-ly-khieu-nai-y-kien-khach-hang"})) {
    try{
      const response=await page.goto(frontend+path,{waitUntil:"domcontentloaded",timeout:40000});
      const html=await page.evaluate(()=>({
        h1:Array.from(document.querySelectorAll("h1")).map(x=>x.textContent?.trim()).slice(0,4),
        cards:document.querySelectorAll("#posts-grid .grid>div").length,
        images:document.querySelectorAll("#main-content img").length,
        hasForm:!!document.querySelector("form#contact-form,form#pse-complaint-form"),
        menuOldLinks:Array.from(document.querySelectorAll("header a[href]")).filter(x=>/https?:\/\/(?:www\.)?pse\.vn/i.test(x.href)).length,
        bodyWidth:document.body.scrollWidth,viewportWidth:innerWidth
      }));
      results.frontend[kind]={http:response?.status(),...html};
      console.log("PSE_MEDIA_LIVE "+kind+" http="+response?.status()+" h1="+html.h1.length+" cards="+html.cards+" form="+html.hasForm);
    }catch(e){results.frontend[kind]={error:String(e.message).slice(0,150)};console.log("PSE_MEDIA_LIVE "+kind+" READ_FAIL")}
  }
  for (const slug of ["anh","video"]) {
    try {
      const response=await page.request.get(wpOrigin+"/wp-json/wp/v2/categories?slug="+slug,{timeout:35000});
      const cats=response.ok()?await response.json():[];
      const cat=cats[0];
      const posts=cat?await page.request.get(wpOrigin+"/wp-json/wp/v2/posts?categories="+cat.id+"&status=publish&per_page=1",{timeout:35000}):null;
      results.cms[slug]={categoryHttp:response.status(),categoryCount:cats.length,categoryId:cat?.id??null,reportedPublishedCount:cat?.count??null,postHttp:posts?.status()??null,postTotal:posts?.headers()["x-wp-total"]??null};
      console.log("PSE_MEDIA_WP "+slug+" categories="+cats.length+" published="+(posts?.headers()["x-wp-total"]||0));
    }catch(e){results.cms[slug]={error:String(e.message).slice(0,150)};}
  }
} finally { await browser.close(); }
await mkdir("artifacts/pse-media-pages",{recursive:true});
await writeFile("artifacts/pse-media-pages/audit.json",JSON.stringify(results,null,2));
console.log("PSE_MEDIA_READONLY_AUDIT_DONE records="+results.albums.length+" no_writes=true");
