/** Source-only investigation of Joomla category feeds and metadata for archived governance entry 92. */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const base='https://www.pse.vn/quan-he-nha-dau-tu/tai-lieu-quan-tri-cong-ty.html';
const page92='https://www.pse.vn/quan-he-nha-dau-tu/tai-lieu-quan-tri-cong-ty/92-dieu-le-cong-ty-co-phan-phan-bon-va-hoa-chat-dau-khi-dong-nam-bo.html';
const queries=[
 base+'?start=25&format=feed&type=rss',
 base+'?start=25&format=feed&type=atom',
 base+'?start=30&format=feed&type=rss',
 base+'?start=30&format=feed&type=atom'
];
const output={schema:'pse-governance-92-feed-metadata-v1',readOnly:true,feeds:[],pageMetadata:null,evidence:null};
const b=await chromium.launch({headless:true});
try{
 const c=await b.newContext({viewport:{width:1280,height:900}});
 await c.route(/\.(?:jpe?g|png|svg|webp|gif|woff2?|ttf)(?:[?#]|$)/i,r=>r.abort());
 const p=await c.newPage();
 try{
  const r=await p.goto(page92,{waitUntil:'domcontentloaded',timeout:45000});
  output.pageMetadata=await p.evaluate(()=>({
   title:document.title,
   meta:[...document.querySelectorAll('meta')].map(x=>({name:x.getAttribute('name')||x.getAttribute('property')||x.getAttribute('itemprop'),content:x.getAttribute('content')})).filter(x=>/date|publish|modif|time|created/i.test(x.name||'')).slice(0,20),
   times:[...document.querySelectorAll('time,[itemprop*=date],.published,.created,.article-info,.article-info-term')].map(x=>({tag:x.tagName,cls:x.className,text:(x.textContent||'').trim().slice(0,200),dateTime:x.getAttribute('datetime')})).slice(0,25),
   ldjson:[...document.querySelectorAll('script[type="application/ld+json"]')].map(x=>(x.textContent||'').slice(0,1500)).slice(0,3)
  }));
  output.pageMetadata.http=r?.status()||null;
 }catch(e){output.pageMetadata={error:String(e).slice(0,160)}}
 for(const url of queries){
  const row={url};
  try{
   const res=await c.request.get(url,{timeout:30000,failOnStatusCode:false});
   row.http=res.status();
   const body=await res.text();
   row.type=res.headers()['content-type']||'';
   row.isXML=/<(?:rss\b|feed\b|\?xml)/i.test(body.slice(0,900));
   row.bytes=body.length;
   if(row.isXML){
    const items=[...body.matchAll(/<item\b[^>]*>[\s\S]*?<\/item>|<entry\b[^>]*>[\s\S]*?<\/entry>/gi)].map(m=>{
     const block=m[0],find=(k)=>block.match(new RegExp('<'+k+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+k+'>','i'))?.[1]?.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').trim()||null;
     const links=[...block.matchAll(/(?:<link\b[^>]*href=["']([^"']+)["']|<link>([^<]+)<\/link>|<guid[^>]*>([^<]+)<\/guid>)/gi)].map(x=>(x[1]||x[2]||x[3]||'').replace(/&amp;/g,'&'));
     const id=links.find(x=>/\/(?:90|91|92)-[^/]+\.html/i.test(x))?.match(/\/(90|91|92)-/)?.[1]||null;
     return {id,title:find('title'),link:links[0]||null,pubDate:find('pubDate'),published:find('published'),updated:find('updated')};
    });
    row.itemCount=items.length;
    row.matched=items.filter(x=>x.id);
    row.firstTitles=items.slice(0,2).map(x=>x.title);
    const hit=items.find(x=>x.id==='92'&&(x.pubDate||x.published));
    if(hit)output.evidence={url,id:92,...hit};
   }else{row.sample=body.slice(0,130).replace(/\s+/g,' ')}
  }catch(e){row.error=String(e).slice(0,200)}
  output.feeds.push(row);
  console.log('PSE_GOV_FEED_CHECK='+JSON.stringify(row));
 }
 console.log('PSE_GOV_92_METADATA='+JSON.stringify(output.pageMetadata));
 console.log('PSE_GOV_92_FEED_EVIDENCE='+JSON.stringify(output.evidence));
}finally{
 await mkdir('artifacts/pse-governance-feed',{recursive:true});
 await writeFile('artifacts/pse-governance-feed/report.json',JSON.stringify(output,null,2)+'\n');
 await b.close();
}
