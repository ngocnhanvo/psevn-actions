/** PSE category source-backed five-post release QA; strictly read-only. */
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const vars=Object.fromEntries(String(process.env.ENV_FILE||'').split(/\r?\n/)
 .map(s=>s.trim().replace(/^export\s+/,'' )).filter(x=>/^(WC_URL|WC_URL_CLIENT)=/.test(x))
 .map(x=>{const pos=x.indexOf('=');return [x.slice(0,pos),x.slice(pos+1).replace(/^['"]|['"]$/g,'')]}));
function origin(val){const u=new URL(val);if(u.protocol!=='https:'||u.username||u.password||u.port||!['','/'].includes(u.pathname)||u.search||u.hash)throw Error('Invalid PSE env');return u.origin}
const wp=origin(vars.WC_URL),front=origin(vars.WC_URL_CLIENT);
if(wp===front)throw Error('Invalid tenant separation');
const expected=[
 {source:'1603',id:82801,slug:'chuong-trinh-xuan-yeu-thuong-tet-se-chia-trao-tang-100-phan-qua-den-cac-ho-dan-co-hoan-canh-kho-khan-tren-dia-ban-phuong-6-thanh-pho-tan-an',date:'2025-01-08',assets:2},
 {source:'1586',id:82805,slug:'pvfcco-pse-to-chuc-khoa-dao-tao-noi-bo-kiem-soat-rui-ro-trong-boi-canh-moi',date:'2024-07-17',assets:2},
 {source:'1599',id:82817,slug:'pvfcco-pse-to-chuc-hoi-nghi-tong-ket-cong-tac-dang-hoat-dong-kinh-doanh-nam-2024-trien-khai-ke-hoach-cong-tac-nam-2025-va-hoi-nghi-nguoi-lao-dong-nam-2025',date:'2024-12-18',assets:4},
 {source:'1565',id:82820,slug:'pvfcco-pse-chuoi-hoat-dong-y-nghia-ky-niem-15-nam-thanh-lap-cong-ty-18-08-2008-18-08-2023',date:'2023-08-24',assets:7},
 {source:'1601',id:82828,slug:'pvfcco-pse-to-chuc-le-cong-bo-va-trao-quyet-dinh-ve-cong-tac-can-bo-2024',date:'2024-12-31',assets:5}
];
const report={schema:'pse-tin-tong-hop-five-posts-live-qa-v1',readonly:true,category:null,posts:[],original1616:null,front:[],checks:[],status:'STARTED'};
const root='artifacts/pse-tin-tong-hop-five-posts';
await mkdir(root,{recursive:true});
async function json(url){
 const r=await fetch(url,{headers:{Accept:'application/json','Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
 return {status:r.status,data:await r.json().catch(()=>null),total:Number(r.headers.get('x-wp-total')||0)};
}
const browser=await chromium.launch({headless:true});
try{
 const cat=await json(wp+'/wp-json/wp/v2/categories?slug=tin-tong-hop&hide_empty=false&_fields=id,parent,slug,count');
 if(cat.status!==200||cat.data?.length!==1||cat.data[0].id!==1746||cat.data[0].parent!==1742)throw Error('Incorrect WP category');
 const published=await json(wp+'/wp-json/wp/v2/posts?categories=1746&status=publish&per_page=1&_fields=id');
 if(published.status!==200||published.total<300)throw Error('Published Tin tong hop posts not available');
 report.category={id:1746,parent:1742,published:published.total};
 for(const x of expected){
  const r=await json(wp+'/wp-json/wp/v2/posts/'+x.id+'?_fields=id,slug,date,status,title,content,categories');
  const p=r.data;
  if(r.status!==200||p?.id!==x.id||p.slug!==x.slug||p.status!=='publish'||
    !String(p.date||'').startsWith(x.date)||!p.categories?.includes(1746)||!p.categories?.includes(1742))
    throw Error('WP published data not equal original certified record source '+x.source);
  const html=String(p.content?.rendered||'');
  const assetCount=(html.match(/<img\b/gi)||[]).length;
  if(html.replace(/<[^>]+>/g,' ').trim().length<90||assetCount<x.assets)
    throw Error('WP body/media missing source '+x.source+' images '+assetCount+' expected '+x.assets);
  if(/<img\b[^>]+(?:src|srcset)=["'][^"']*\/\/(?:www\.)?pse\.vn\b/i.test(html))
    throw Error('Legacy site hotlinked image source '+x.source);
  report.posts.push({source:x.source,id:p.id,slug:p.slug,date:p.date,images:assetCount,title:String(p.title?.rendered||'').replace(/<[^>]+>/g,' ').trim()});
 }
 const p1616=await json(wp+'/wp-json/wp/v2/posts/77405?_fields=id,slug,date,status,categories,content,title');
 if(p1616.status!==200||p1616.data?.id!==77405||p1616.data.status!=='publish'||
    !p1616.data.date?.startsWith('2025-03-03')||p1616.data.slug!=='pvfcco-pse-to-chuc-le-cong-bo-va-trao-quyet-dinh-ve-cong-tac-can-bo'||
    !p1616.data.categories?.includes(1742)||p1616.data.categories?.includes(1746)||
    !String(p1616.data.content?.rendered||'').includes('3/3/2025'))
   throw Error('2025 existing article was altered or misclassified');
 report.original1616={id:77405,date:p1616.data.date,slug:p1616.data.slug,categories:p1616.data.categories};
 report.checks.push('source_verified_5_wordpress_post_ids_dates_media');
 report.checks.push('distinct_2024_and_2025_slug_category_safety');
 for(const width of [1366,390]){
  const ctx=await browser.newContext({viewport:{width,height:width===1366?900:844},isMobile:width===390,deviceScaleFactor:1});
  const page=await ctx.newPage();
  const res=await page.goto(front+'/tin-tuc-su-kien/tin-tong-hop',{waitUntil:'domcontentloaded',timeout:60000});
  const html=await page.content();
  const visible=await page.locator('body').innerText();
  const count=visible.match(new RegExp('Tổng\\s+'+published.total+'\\s+bài viết','i'));
  const scroll=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  if(res?.status()!==200||!count||scroll>5)
    throw Error('SSR archive mismatch width '+width+'; HTTP '+res?.status()+' count_match='+Boolean(count)+' overflow='+scroll);
  const slugsVisible=expected.filter(x=>html.includes(x.slug)).map(x=>x.source);
  if(!slugsVisible.includes('1603')||!slugsVisible.includes('1601')||!slugsVisible.includes('1599'))
    throw Error('New 2024/25 source posts are not present on first archive page: '+slugsVisible.join(','));
  const articleLink=await page.locator('a[href*="pvfcco-pse-to-chuc-le-cong-bo-va-trao-quyet-dinh-ve-cong-tac-can-bo-2024"]').first().getAttribute('href');
  if(!articleLink)throw Error('No detail route for 2024 distinct article');
  const detail=await page.goto(new URL(articleLink,front).href,{waitUntil:'domcontentloaded',timeout:60000});
  const detailText=await page.locator('body').innerText();
  if(detail?.status()!==200||!detailText.includes('30/12/2024'))
    throw Error('2024 article detail route missing or wrong content');
  await page.screenshot({path:root+'/tin-tong-hop-'+width+'.png',fullPage:true,timeout:45000});
  report.front.push({width,archiveHttp:res.status(),total:published.total,newPostSlugsOnFirstPage:slugsVisible,detailHttp:detail.status(),scrollOverflow:scroll,detailUrl:new URL(articleLink,front).pathname});
  report.checks.push('SSR_live_'+width+'_and_2024_detail');
  await ctx.close();
 }
 report.status='PASS';
 console.log('PSE_TIN_TONG_HOP_FIVE_POSTS_LIVE='+JSON.stringify({status:report.status,wpPublished:published.total,posts:report.posts.map(p=>({source:p.source,id:p.id,images:p.images})),original1616:report.original1616,front:report.front,checks:report.checks}));
}catch(e){report.status='FAIL';report.error=String(e?.message||e);console.error('PSE_TIN_TONG_HOP_FIVE_POSTS_LIVE_ERROR='+report.error);throw e}
finally{await writeFile(root+'/report.json',JSON.stringify(report,null,2)+'\n');await browser.close()}
