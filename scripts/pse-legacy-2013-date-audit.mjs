/** Read-only legacy PSE market Joomla RSS/Atom alternative routes; no CMS writes. */
const target='369-diem-tin-nganh-nong-nghiep-tren-cac-bao-ra-ngay-1462013';
const feeds=[
 'https://www.pse.vn/hoat-dong-kinh-doanh/thong-tin-thi-truong.html?format=feed&type=atom',
 'https://pse.vn/hoat-dong-kinh-doanh/thong-tin-thi-truong.html?format=feed&type=rss',
 'https://www.pse.vn/hoat-dong-kinh-doanh/thong-tin-thi-truong?format=feed&type=rss',
 'https://www.pse.vn/hoat-dong-kinh-doanh/thong-tin-thi-truong.html?format=feed&type=rss&start=10'
];
const get=(s,t)=>{
 const pattern=new RegExp('<(?:[a-z0-9_]+:)?'+t+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-z0-9_]+:)?'+t+'>','i');
 return String(s.match(pattern)?.[1]||'').replace(/<!\[CDATA\[|\]\]>/g,'').trim();
};
const result=[];
for(const value of feeds){
 const u=new URL(value);
 if(u.protocol!=='https:'||!['pse.vn','www.pse.vn'].includes(u.hostname))throw Error('Untrusted original news origin');
 let code=0,body='',reason='';
 try{const response=await fetch(value,{signal:AbortSignal.timeout(17000)});
   code=response.status;body=(await response.text()).slice(0,1024*1024);
 }catch(e){reason=String(e?.message||e).slice(0,140)}
 const feed=/<(?:rss|feed|rdf:RDF)(?:\s|>)/i.test(body.slice(0,1500));
 const elements=feed?(body.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>|<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi)||[]):[];
 const candidates=elements.map(s=>({
   name:get(s,'title').slice(0,140),date:get(s,'pubDate')||get(s,'published')||get(s,'updated'),
   href:get(s,'link')||s.match(/<link\s+[^>]*href=["']([^"']+)["']/i)?.[1]||''
 })).filter(x=>x.href.includes(target));
 const audit={host:u.hostname,path:u.pathname,query:u.search,status:code,isFeed:feed,items:elements.length,candidates,error:reason};
 result.push(audit);console.log('PSE_2013_MARKET_RSS_AUDIT='+JSON.stringify(audit));
}
console.log('PSE_2013_ORIGINAL_PUBLISH_DATE='+JSON.stringify({
 status:result.some(x=>x.candidates.some(c=>c.date))?'RSS_DATE_CANDIDATE_NEEDS_REVIEW':'STILL_UNVERIFIED',
 draftId:76976,readOnly:true,wpDraftUnchanged:true
}));
