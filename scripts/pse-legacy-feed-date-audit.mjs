/** Read-only check for original PSE Joomla RSS publication dates.
 * Does not authorize publication without an article URL+date match.
 * Never writes CMS, builds Astro, or alters credentials.
 */
const targets=[
  {slug:'1736-pvfcco-pse-to-chuc-thanh-cong-giai-pickleball-pse-open-2026',label:'PSE Open 2026'},
  {slug:'369-diem-tin-nganh-nong-nghiep-tren-cac-bao-ra-ngay-1462013',label:'Agriculture June 2013'},
  {slug:'1737-20261019-cbtt-bao-cao-tai-chinh-q3-2026',label:'Q3 2026 disclosure'}
];
const feeds=[
 'https://www.pse.vn/21-tin-tuc-su-kien/tin-cong-ty.html?format=feed&type=rss',
 'https://www.pse.vn/hoat-dong-kinh-doanh/thong-tin-thi-truong.html?format=feed&type=rss',
 'https://www.pse.vn/quan-he-nha-dau-tu/bao-cao-tai-chinh.html?format=feed&type=rss',
 'https://www.pse.vn/21-tin-tuc-su-kien/tin-cong-ty.html?format=feed&type=atom'
];
const decode=s=>String(s||'').replace(/&(?:amp|lt|gt|quot|apos|#39);/g,m=>({
 '&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'"
}[m]||m)).replace(/<!\[CDATA\[|\]\]>/g,'');
const grab=(s,tag)=>{
 const m=s.match(new RegExp('<(?:[a-z0-9_]+:)?'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-z0-9_]+:)?'+tag+'>','i'));
 return m?decode(m[1]).trim():'';
};
const output=[];
for(const url of feeds){
 const u=new URL(url);
 if(u.protocol!=='https:'||u.hostname!=='www.pse.vn')throw Error('Untrusted legacy host');
 let status=0,body='',error='';
 try{
  const r=await fetch(url,{signal:AbortSignal.timeout(18000),headers:{'Accept':'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8'}});
  status=r.status;body=(await r.text()).slice(0,1024*1024);
 }catch(e){error=String(e?.message||e).slice(0,140)}
 const isFeed=/<(?:rss|feed|rdf:RDF)(?:\s|>)/i.test(body.slice(0,1500));
 const items=isFeed?(body.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>|<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi)||[]):[];
 const records=items.map(raw=>({
   title:grab(raw,'title').replace(/<[^>]*>/g,'').slice(0,170),
   link:grab(raw,'link')||raw.match(/<link\s+[^>]*href=["']([^"']+)["']/i)?.[1]||'',
   date:grab(raw,'pubDate')||grab(raw,'published')||grab(raw,'updated')||''
 }));
 const matches=records.filter(row=>targets.some(t=>row.link.includes(t.slug))).map(row=>({
  title:row.title,
  sourcePath:(()=>{try{return new URL(row.link).pathname}catch{return row.link.slice(0,120)}})(),
  originalDate:row.date
 }));
 const detail={path:u.pathname,query:u.search,status,isFeed,itemCount:records.length,matches,error};
 output.push(detail);
 console.log('PSE_LEGACY_RSS_DATE_AUDIT='+JSON.stringify(detail));
}
const matched=new Set(output.flatMap(f=>f.matches).map(m=>targets.find(t=>m.sourcePath.includes(t.slug))?.slug).filter(Boolean));
for(const t of targets)console.log('PSE_ORIGINAL_ARTICLE_DATE_STATUS='+JSON.stringify({
 label:t.label,slug:t.slug,result:matched.has(t.slug)?'CANDIDATE_NEEDS_SOURCE_REVIEW':'DATE_NOT_VERIFIED'
}));
console.log('PSE_LEGACY_FEED_AUDIT=COMPLETE; read_only=true; publication_changes=false; build=false');
