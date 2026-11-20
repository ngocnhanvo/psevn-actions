/** Prepare only the 19 source-verified missing PSE disclosures for existing migration importer.
 * No WP writes here. Must run AFTER fresh verified WP backup.
 * Source: 190 original archive IDs, 171 verified published WP IDs (20-Nov-2026).
 */
import {readFile,writeFile} from "node:fs/promises";
const file="docs/pse-legacy-migration-state.json";
const s=JSON.parse(await readFile(file,"utf8"));
if(s.schema!=="pse-legacy-article-migration-v1"||!s.backup_verified)
 throw Error("PSE original migration and rollback proof required");
if(s.disclosure_restore_prepared){
 console.log("PSE_DISCLOSURE_PREPARE=ALREADY_DONE; no duplicate requeue");
 process.exit(0);
}
const base="https://www.pse.vn/quan-he-nha-dau-tu/tin-tuc-co-dong/ban-cong-bo-thong-tin/";
const quarantinedIds=new Set(["208","302","319","320","330","1013","1026","1044","1045","1047","1058","1121","1127","1149","1533","1670"]);
const newSources=Object.freeze({"75":"https://www.pse.vn/quan-he-nha-dau-tu/tin-tuc-co-dong/ban-cong-bo-thong-tin/75-ngay-dang-ky-cuoi-cung-thuc-hien-quyen-tra-co-tuc.html","1740":"https://www.pse.vn/quan-he-nha-dau-tu/tin-tuc-co-dong/ban-cong-bo-thong-tin/1740-20261112-cbtt-tiep-nhan-va-bo-nhiem-can-bo.html","1742":"https://www.pse.vn/quan-he-nha-dau-tu/tin-tuc-co-dong/ban-cong-bo-thong-tin/1742-20260813-cbtt-bao-cao-tai-chinh-ban-nien-2026.html"});
let repaired=0,seeded=0,already=0;
for(const id of quarantinedIds){
 const r=s.articles[id];
 if(!r||r.group_hint!=="shareholder"||
    !String(r.source_url||"").startsWith(base+id+"-"))
  throw Error("Missing exact verified source ID "+id);
 if(r.wp_id){already++;continue}
 if(r.status!=="quarantined"||r.disclosure_restore_prepared)
  throw Error("Unexpected disclosure checkpoint status "+id);
 if(!r.reason || !(
   r.reason==="Source content incomplete or oversized" ||
   r.reason.includes("Timeout 45000ms") ||
   (id==="1670"&&r.reason==="Original media size unsafe; bytes=36078003; ext=pdf")))
  throw Error("Unapproved disclosure restore reason "+id);
 r.disclosure_restore_prepared=true;
 r.status="pending";r.attempts=0;
 repaired++;
}
for(const [id,url] of Object.entries(newSources)){
 const r=s.articles[id];
 if(r){
  if(r.source_url!==url||r.group_hint!=="shareholder")throw Error("Seed collision "+id);
  already++;
 }else{
  s.articles[id]={source_url:url,group_hint:"shareholder",status:"pending",attempts:0};
  seeded++;
 }
}
s.disclosure_restore_prepared=true;
await writeFile(file,JSON.stringify(s,null,2)+"\n","utf8");
console.log("PSE_DISCLOSURE_PREPARE=PASS; image_pdf_records="+repaired+"; archive_new="+seeded+"; existing="+already+"; no_wp_write=true");
