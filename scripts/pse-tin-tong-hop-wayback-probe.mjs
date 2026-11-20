/** Read-only provenance recovery: archived original URLs, never replacement images. */
import {mkdir,writeFile} from 'node:fs/promises';
const sources=[
 ['226','https://www.pse.vn/images/web/gallery/MAU_BAO_BI/0002.jpg'],
 ['240','https://www.pse.vn/images/web/gallery/HOC_VAN_HOA_DOANH_NGHIEP/img_0667.jpg'],
 ['382','https://www.pse.vn/images/web/%C3%81o_2.JPG'],
 ['1090','http://www.dpm.vn/media/images/NDK_0393.JPG'],
 ['186','http://images.danviet.vn/CMSImage/Resources/Uploaded/baogiay2/162_13_bon-phan-NPK-cho-lua.jpg'],
 ['196','http://library.petrotimes.vn/petrotimes_cdn/wp-content/uploads/2011/08/muahexanh_1.jpg'],
 ['202','http://baobinhphuoc.com.vn/resources/newsimg/Nam%202011/8-2011/14/congty.jpg']
];
const rows=[];
for(const [id,url] of sources){
 const endpoint='https://archive.org/wayback/available?url='+encodeURIComponent(url);
 try{
  const res=await fetch(endpoint,{signal:AbortSignal.timeout(18000),headers:{Accept:'application/json'}});
  const data=await res.json().catch(()=>null);
  const snap=data?.archived_snapshots?.closest;
  const row={id,sourceUrl:url,http:res.status,available:res.ok&&snap?.available===true&&snap?.status==='200',
   archivedAt:snap?.timestamp||null,archivedUrl:snap?.url||null};
  rows.push(row);
 }catch(e){rows.push({id,sourceUrl:url,available:false,error:String(e?.message||e).slice(0,140)})}
 console.log('PSE_WAYBACK_ORIGINAL_ASSET='+JSON.stringify(rows.at(-1)));
}
await mkdir('artifacts/pse-tin-tong-hop-wayback-probe',{recursive:true});
await writeFile('artifacts/pse-tin-tong-hop-wayback-probe/report.json',JSON.stringify({schema:'pse-original-asset-wayback-availability-v1',readOnly:true,rows},null,2)+'\n');
console.log('PSE_WAYBACK_PROBE=COMPLETE; tested='+rows.length+'; available='+rows.filter(x=>x.available).length);
