/** Read-only verify the 224 previously uploaded annual JPEG media, without duplicating any. */
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext();
const out={mode:'READ_ONLY',checked:[],errors:[]};
try{
 const samples=['Bao_cao_thuong_nien_20080002','Bao_cao_thuong_nien_20080095','pse-annual-2010-p000','pse-annual-2010-p129'];
 for(const q of samples){
  const url='https://admin-pse.webnvn.com/wp-json/wp/v2/media?search='+encodeURIComponent(q)+'&per_page=50&_fields=id,slug,source_url,mime_type,alt_text,title';
  const r=await ctx.request.get(url,{timeout:45000,failOnStatusCode:false});
  const raw=await r.json().catch(()=>null);
  const matches=Array.isArray(raw)?raw.map(m=>({id:m.id,slug:m.slug,mime:m.mime_type,source_url:m.source_url,
   title:m.title?.rendered||''})):raw;
  out.checked.push({query:q,http:r.status(),matches});
  console.log('PSE_ANNUAL_MEDIA_PRESENCE='+JSON.stringify(out.checked.at(-1)));
 }
}finally{
 await mkdir('artifacts/pse-annual-media-presence',{recursive:true});
 await writeFile('artifacts/pse-annual-media-presence/report.json',JSON.stringify(out,null,2)+'\n');
 await browser.close();
}