/** PSE missing historical Posts: source-only evidence handoff. No WordPress writes, build, or retries. */
import {readFile,mkdir,writeFile} from "node:fs/promises";
const expected={
 "tin-tong-hop":[186,196,198,202,204,205,226,227,229,237,240,379,382,1090],
 "hoat-dong-cong-doan":[230,321],
 "tin-cong-ty":[1640],
 "tin-tuc-co-dong":[338,1085],
 "thong-tin-thi-truong":[341],
 "huong-dan-su-dung-phan-bon":[114,121,127,178],
 "kien-thuc-nong-nghiep":[344,348,370]
};
const state=JSON.parse(await readFile("docs/pse-legacy-migration-state.json","utf8"));
const dates=JSON.parse(await readFile("docs/pse-legacy-date-backfill-state.json","utf8"));
if(state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified||
 process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions")throw Error("PSE source provenance invalid");
const rows=[];
for(const [family,ids] of Object.entries(expected))for(const id of ids){
 const r=state.articles[String(id)],date=dates.records?.[String(id)]||null;
 if(!r||!r.source_url?.startsWith("https://www.pse.vn/")||
    r.source_url.includes("/thu-vien/anh/")||r.source_url.includes("/san-pham/"))
   throw Error("Unrecognized historical Post source identity "+id);
 rows.push({id,family,source_url:r.source_url,source_status:r.status,
    wordpress_id:r.wp_id||null,source_blocker:r.reason||null,
    media_attempted:r.broken_image_recovery_attempted||false,
    date_status:date?.status||null,date_reason:date?.reason||null,
    date_attempts:date?.attempts??null});
}
if(rows.length!==27||new Set(rows.map(r=>r.id)).size!==27)throw Error("Historical Post evidence set changed");
const groups=Object.entries(expected).map(([family,ids])=>({family,missing:ids.length}));
const report={schema:"pse-unresolved-historical-post-provenance-v1",
 readOnly:true,createdAt:new Date().toISOString(),count:rows.length,groups,rows,
 caveat:"Source migration state is not public publication status; based on independent last live WP parity #44852599527. Do not auto publish without original media and created-day proof."};
await mkdir("artifacts/pse-unresolved-source-evidence",{recursive:true});
await writeFile("artifacts/pse-unresolved-source-evidence/report.json",JSON.stringify(report,null,2)+"\n");
console.log("PSE_UNRESOLVED_ORIGINAL_POSTS="+JSON.stringify({count:rows.length,groups,
 byReason:rows.reduce((a,r)=>(a[r.source_blocker||r.date_reason||"unclassified"]=(a[r.source_blocker||r.date_reason||"unclassified"]||0)+1,a),{})}));
console.log("PSE_UNRESOLVED_ORIGINALS=READ_ONLY; wordpress_write=0; build=0");
