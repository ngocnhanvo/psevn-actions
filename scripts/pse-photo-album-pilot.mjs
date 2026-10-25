/** PSE pilot: three verified Joomla gallery photographs -> WordPress Media and Post.
 * Dry-run unless owner-authorized exact commit message; idempotent after partial upload.
 */
import {chromium,request} from "playwright";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const apply=event.head_commit?.message==="cms(pse): import verified three-photo album pilot";
const lines=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const origin=key=>{const a=lines.filter(s=>s.startsWith(key+"="));if(a.length!==1)throw Error("PSE origin missing "+key);const u=new URL(a[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Invalid origin");return u.origin};
const wp=origin("WC_URL"),front=origin("WC_URL_CLIENT");if(wp===front)throw Error("CMS origin not isolated");
const source="https://www.pse.vn/tin-tuc-su-kien/thu-vien/anh/994-nha-dai-doan-ket.html";
const directory="https://www.pse.vn/images/gallery/Nha_Dai_Doan_Ket/";
const names=["img_0035.jpg","img_0037.jpg","img_0038.jpg"],slug="994-nha-dai-doan-ket",title="Nhà đại đoàn kết";
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const browser=await chromium.launch({headless:true}),context=await browser.newContext(),admin=await context.newPage(),outside=await request.newContext({timeout:60000});
try{
  const original=await context.newPage();
  const r=await original.goto(source,{waitUntil:"domcontentloaded",timeout:60000});
  if(r?.status()!==200)throw Error("Legacy gallery HTTP not 200");
  const links=await original.evaluate(()=>[...document.querySelectorAll("a[href]")].map(x=>x.href).filter(x=>x.startsWith("https://www.pse.vn/images/gallery/Nha_Dai_Doan_Ket/")&&/\.jpe?g$/i.test(x)));
  const actual=[...new Set(links)].map(url=>new URL(url).pathname.split("/").pop());
  if(JSON.stringify(actual)!==JSON.stringify(names))throw Error("Gallery source changed, refusing migration");
  const photos=[];
  for(const name of names){
    const image=await outside.get(directory+name,{timeout:60000});
    if(!image.ok())throw Error("Joomla JPEG unavailable "+name);
    const bytes=await image.body();
    if(bytes.length<1024||bytes.length>18000000||bytes[0]!==255||bytes[1]!==216)throw Error("Joomla file is not validated JPEG "+name);
    const digest=sha(bytes),filename="pse-album-994-"+digest.slice(0,16)+".jpg";
    photos.push({name,bytes,digest,filename,marker:filename.slice(0,-4)});
  }
  await admin.goto(wp+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
  if(await admin.locator("#user_login").count()){
    await admin.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
    await admin.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
    const text=await admin.locator("body").innerText(),m=text.match(/(\d+)\s*([+\-x×*])\s*(\d+)/);
    if(m){
      const a=Number(m[1]),b=Number(m[3]),n=({"+":a+b,"-":a-b,"x":a*b,"×":a*b,"*":a*b})[m[2]];
      const captcha=admin.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if(!await captcha.count())throw Error("WordPress challenge unavailable");
      await captcha.fill(String(n));
    }
    await Promise.all([admin.waitForLoadState("domcontentloaded"),admin.locator("#wp-submit").click()]);
  }
  if(admin.url().includes("wp-login"))throw Error("WordPress login failed");
  const nonce=await admin.evaluate(async()=>{if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});if(!r.ok)throw Error("Nonce failed");return(await r.text()).trim()});
  if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("Invalid WP nonce");
  const api=(path,method="GET",body)=>admin.evaluate(async({path,method,body,nonce})=>{const r=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json().catch(()=>({}))}},{path,method,body,nonce});
  const c=await api("/wp-json/wp/v2/categories?slug=anh");
  if(c.status!==200||!Array.isArray(c.data)||c.data.length!==1||c.data[0].slug!=="anh")throw Error("WordPress photo Category unavailable");
  const category=c.data[0];
  const posts=await api("/wp-json/wp/v2/posts?context=edit&slug="+slug+"&per_page=10&_fields=id,slug,status,acf,categories,content,featured_media");
  if(posts.status!==200||!Array.isArray(posts.data)||posts.data.length>1)throw Error("WordPress gallery Post conflict");
  const post=posts.data[0]||null;
  if(post&&(!post.categories.includes(category.id)||post.acf?.key!=="ssr-post"||post.acf?.action!=="PostDetails"))throw Error("Existing gallery Post identity mismatch");
  for(const photo of photos){
    const r=await api("/wp-json/wp/v2/media?context=edit&search="+encodeURIComponent(photo.marker)+"&per_page=100&_fields=id,slug,mime_type,source_url,media_details");
    if(r.status!==200||!Array.isArray(r.data))throw Error("Cannot inspect WP Media");
    const matches=r.data.filter(x=>x.slug===photo.marker&&x.mime_type==="image/jpeg");
    if(matches.length>1)throw Error("Ambiguous WordPress JPEG "+photo.name);
    photo.existingId=matches[0]?.id||null;
  }
  console.log("PSE_ALBUM_PILOT_PREFLIGHT="+JSON.stringify({mode:apply?"apply":"dry",postId:post?.id||null,categoryId:category.id,photos:photos.map(p=>({name:p.name,digest:p.digest,bytes:p.bytes.length,existingId:p.existingId}))}));
  if(!apply){console.log("PSE_ALBUM_PILOT=DRY_PASS; noCmsWrites=true; noAstroBuild=true");process.exit(0);}
  for(const [i,photo] of photos.entries()){
    let id=photo.existingId;
    if(!id){
      const uploaded=await context.request.post(wp+"/wp-json/wp/v2/media",{data:photo.bytes,headers:{"X-WP-Nonce":nonce,"Content-Type":"image/jpeg","Content-Disposition":'attachment; filename="'+photo.filename+'"',Accept:"application/json"},timeout:120000});
      const data=await uploaded.json().catch(()=>({}));
      if(uploaded.status()!==201||data.mime_type!=="image/jpeg"||!Number.isSafeInteger(Number(data.id)))throw Error("WP JPEG upload failed "+photo.name+" HTTP "+uploaded.status());
      id=Number(data.id);
    }
    const media=await api("/wp-json/wp/v2/media/"+id+"?context=edit");
    if(media.status!==200||media.data.mime_type!=="image/jpeg")throw Error("WordPress Media identity invalid");
    const filename=String(media.data.media_details?.file||"").replace(/^\/+/, "");
    const options=[media.data.source_url,media.data.guid?.rendered];
    if(filename.split("/").at(-1)===photo.filename)options.push(wp+"/wp-content/uploads/"+filename);
    let native="";
    for(const raw of options.filter(Boolean)){
      let url;try{url=new URL(raw,wp)}catch{continue}
      if(url.origin!==wp||!url.pathname.startsWith("/wp-content/uploads/")||!url.pathname.endsWith("/"+photo.filename))continue;
      try{const r=await outside.get(url.href,{timeout:60000});if(r.ok()&&sha(await r.body())===photo.digest){native=url.href;break;}}catch{}
    }
    if(!native)throw Error("Native WordPress JPEG hash verification failed "+photo.name);
    photo.id=id;photo.native=native;
    if(!photo.existingId){
      const alt=title+" — ảnh "+(i+1);
      const updated=await api("/wp-json/wp/v2/media/"+id,"POST",{title:alt,alt_text:alt});
      if(updated.status!==200)throw Error("WP JPEG ALT update failed "+photo.name);
    }
    console.log("PSE_ALBUM_PILOT_MEDIA_VERIFIED="+JSON.stringify({id,name:photo.name,digest:photo.digest}));
  }
  // WordPress-owned URLs remain editable in WP; Astro photo details convert
  // them to same-origin /api/files before rendering public HTML.
  const content='<div class="pse-photo-album wp-block-gallery">'+photos.map((photo,index)=>
    '<figure class="wp-block-image"><img src="'+esc(photo.native)+'" alt="'+esc(title+" — ảnh "+(index+1))+'" loading="lazy" decoding="async" /></figure>'
  ).join("")+"</div>";
  let id=post?.id;
  if(!id){
    const result=await api("/wp-json/wp/v2/posts","POST",{title,slug,status:"draft",content,categories:[category.id],featured_media:photos[0].id,acf:{action:"PostDetails",key:"ssr-post",origin_page_id:"994"}});
    if(result.status!==201||!Number.isSafeInteger(Number(result.data?.id)))throw Error("WordPress gallery draft failed");
    id=Number(result.data.id);
  }
  const read=()=>api("/wp-json/wp/v2/posts/"+id+"?context=edit&_fields=id,slug,status,acf,categories,content,featured_media");
  let item=await read();
  if(item.status!==200||item.data.slug!==slug||!item.data.categories.includes(category.id)||item.data.acf?.action!=="PostDetails"||item.data.acf?.key!=="ssr-post")throw Error("WP photo Post identity/readback mismatch");
  if(!photos.every(p=>String(item.data.content?.raw||"").includes(p.filename)))throw Error("WP gallery content incomplete");
  if(item.data.status==="draft"){
    const r=await api("/wp-json/wp/v2/posts/"+id,"POST",{status:"publish"});
    if(r.status!==200||r.data.status!=="publish")throw Error("WordPress photo publication failed");
  }else if(item.data.status!=="publish")throw Error("Unexpected post state");
  item=await read();
  if(item.status!==200||item.data.status!=="publish")throw Error("WordPress published Post readback failed");
  console.log("PSE_ALBUM_PILOT=PASS; photos=3; post="+id+"; nativeWP=true; noAstroBuild=true");
}finally{await outside.dispose();await browser.close();}
