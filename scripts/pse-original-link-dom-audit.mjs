/** Read-only public Joomla homepage audit: dropdown/module and requested external domains. */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const hosts = ['vietfood.org.vn','giacaphe.com','dashsu.vn','thitruongphanbon.com','agromonitor.vn'];
const startUrls = ['https://www.pse.vn/','https://pse.vn/'];
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1440,height:900}});
page.setDefaultTimeout(20000);
await page.route(/\.(png|jpe?g|gif|webp|woff2?|svg|ico|ttf)(\?|$)/i,r=>r.abort());
const visited = [];
try {
  let working = false;
  for(const url of startUrls) {
    try {
      const response = await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
      if(response && response.status()===200) {working=true;break}
    } catch(err) {console.log('PSE_SOURCE_NAV_ATTEMPT='+JSON.stringify({origin:new URL(url).origin,error:err.name}));}
  }
  if(!working)throw Error('Joomla source homepage cannot be reached by Chromium');
  const homeUrl = page.url();
  const anchors = await page.locator('a[href]').evaluateAll(items=>items.map(a=>({text:(a.textContent||'').trim().replace(/\s+/g,' ').slice(0,90),href:a.href})));
  const marketCandidates = anchors.filter(a=>/mùa vụ|thị trường/i.test(a.text)&&new URL(a.href).hostname.endsWith('pse.vn'));
  const candidates = [homeUrl];
  if(marketCandidates.length)candidates.push(marketCandidates[0].href);
  for(const url of candidates) {
    let resp;
    try{resp=await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000})}
    catch(err){visited.push({url,http:null,error:err.name});continue}
    const payload=await page.evaluate(({hosts})=>{
      const clean=s=>String(s||'').replace(/\s+/g,' ').trim().slice(0,220);
      const identify=n=>n?{tag:n.tagName.toLowerCase(),id:n.id||null,className:typeof n.className==='string'?clean(n.className):null}:null;
      const context=n=>{
        const parents=[];let cur=n;
        for(let k=0;cur&&k<6;k++,cur=cur.parentElement)parents.push(identify(cur));
        const container=n.closest('.moduletable,.module,[id^="mod-"],aside,section,.footer,.footer-links')||n.parentElement;
        const heading=container?.querySelector('h1,h2,h3,h4,.module-title,.title')?.textContent||'';
        return {parents,module:identify(container),moduleHeading:clean(heading),moduleText:clean(container?.textContent),visible:!!(n.getClientRects().length)};
      };
      const selects=[...document.querySelectorAll('select')].map(s=>({
        selector:{id:s.id||null,name:s.name||null,className:s.className||null,onchange:s.getAttribute('onchange')?.slice(0,160)||null},
        context:context(s),
        options:[...s.options].slice(0,100).map((o,i)=>({index:i,text:clean(o.text),value:clean(o.value),selected:o.selected,externalDomain:hosts.find(h=>(o.value||'').toLowerCase().includes(h))||null}))
      }));
      const links=[...document.querySelectorAll('a[href]')].filter(a=>hosts.some(h=>(a.href||'').toLowerCase().includes(h))).map(a=>({text:clean(a.textContent),href:a.href,context:context(a)})).slice(0,60);
      const html=document.documentElement.outerHTML;
      const domainHits=hosts.map(domain=>{
        const indices=[];let at=-1;
        while((at=html.toLowerCase().indexOf(domain,at+1))!==-1&&indices.length<8)indices.push(at);
        return {domain,occurrences:indices.length,contexts:indices.map(i=>clean(html.slice(Math.max(0,i-110),Math.min(html.length,i+domain.length+130))))};
      });
      return {title:document.title,selects,links,domainHits,metaGenerator:document.querySelector('meta[name="generator"]')?.content||null};
    },{hosts});
    visited.push({url:page.url(),http:resp?.status()||null,...payload});
  }
  const report={source:'public Joomla rendered DOM (not database)',checkedAt:new Date().toISOString(),requestedDomains:hosts,marketCandidates,visited};
  await mkdir('artifacts/pse-original-link-dom',{recursive:true});
  await writeFile('artifacts/pse-original-link-dom/report.json',JSON.stringify(report,null,2)+'\n');
  console.log('PSE_JOOMLA_LINK_DOM='+JSON.stringify(report));
  console.log('PSE_JOOMLA_LINK_DOM_PASS pages='+visited.length+' links='+visited.reduce((n,p)=>n+(p.links?.length||0),0)+' selects='+visited.reduce((n,p)=>n+(p.selects?.length||0),0)+' no_mutations=true');
}finally{await browser.close()}
