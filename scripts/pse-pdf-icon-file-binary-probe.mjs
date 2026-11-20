/** Read-only binary HTTP provenance for a Joomla PDF icon and the public PSE PDF hyperlink. */
import {mkdir,writeFile} from 'node:fs/promises';
const wp='https://admin-pse.webnvn.com',front='https://pse.webnvn.com',name='pse-legacy-9d0398eade66fb17',pdf='pse-legacy-84b86d569d20e69b.pdf';
const q=[
 ['joomla_icon','https://www.pse.vn/media/jce/icons/pdf.png'],
 ['wordpress_icon',wp+'/wp-content/uploads/2026/10/'+name+'.png'],
 ['astro_file_icon',front+'/api/files/wp-content/uploads/2026/10/'+name+'.png'],
 ['astro_image_1024',front+'/api/images/1024/png/wp-content/uploads/2026/10/'+name+'.webp'],
 ['astro_image_96',front+'/api/images/96/png/wp-content/uploads/2026/10/'+name+'.webp'],
 ['wordpress_pdf',wp+'/wp-content/uploads/2026/10/'+pdf],
 ['astro_pdf_raw',front+'/wp-content/uploads/2026/10/'+pdf],
 ['astro_pdf_file_api',front+'/api/files/wp-content/uploads/2026/10/'+pdf],
];
const report={schema:'pse-pdf-icon-file-link-http-binary-probe-v1',readOnly:true,checks:[],errors:[]};
for(const [key,url] of q){
 try{
  const headers=key.includes('pdf')?{Range:'bytes=0-31'}:{};
  const response=await fetch(url,{redirect:'follow',headers,signal:AbortSignal.timeout(30000)});
  const chunks=[];let len=0;
  if(response.body){
   const reader=response.body.getReader();
   try{while(len<10240){const {value,done}=await reader.read();if(done)break;chunks.push(value);len+=value?.length||0}}
   finally{await reader.cancel().catch(()=>{})}
  }
  const b=Buffer.concat(chunks.map(x=>Buffer.from(x)));
  const item={key,url,http:response.status,finalUrl:response.url,type:response.headers.get('content-type'),
   contentLength:response.headers.get('content-length'),contentRange:response.headers.get('content-range'),
   dataPrefix:b.subarray(0,16).toString('hex'),sampleBytes:b.length,
   imageSignature:b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))?'PNG':
    b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'?'WEBP':
    b.subarray(0,4).toString()==='%PDF'?'PDF':'OTHER',
   diagnostic:response.ok?'ok':b.toString('utf8',0,120)};
  report.checks.push(item);console.log('PSE_PDF_HTTP_PROBE='+JSON.stringify(item));
 }catch(e){const entry={key,url,error:String(e).slice(0,170)};report.errors.push(entry);console.error('PSE_PDF_HTTP_PROBE_ERROR='+JSON.stringify(entry))}
}
await mkdir('artifacts/pse-pdf-binary',{recursive:true});
await writeFile('artifacts/pse-pdf-binary/report.json',JSON.stringify(report,null,2)+'\n');
console.log('PSE_PDF_HTTP_SUMMARY='+JSON.stringify({statuses:Object.fromEntries(report.checks.map(x=>[x.key,x.http])),errors:report.errors}));
