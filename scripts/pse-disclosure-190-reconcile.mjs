/** Reconcile immutable PSE disclosure audits:
 * full 190-source/media audit #44705310926
 * targeted four timeouts + broken source PDF + ZIP #44708531929
 * final CMS/SSR/source chronology #44705981776
 * READ ONLY. An audit FAIL may not be silently rewritten as PASS.
 */
import {readFile,mkdir,writeFile} from "node:fs/promises";
const read=async x=>JSON.parse(await readFile(x,"utf8"));
const all=await read("artifacts/pse-reconcile/full/report.json");
const targeted=await read("artifacts/pse-reconcile/targeted/report.json");
const final=await read("artifacts/pse-reconcile/final/report.json");
const expected4=["1362","1468","1477","1504"];
const equal=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
const failed4=all.sourceFailed.map(x=>x.sourceId);
const target4=targeted.articles.map(x=>x.id);
const errors=[];
function requireProof(condition,message){if(!condition)errors.push(message)}
requireProof(all.schema==="pse-disclosure-190-media-parity-v1","Full audit schema mismatch");
requireProof(all.sourceRecords===190&&all.wordpressPublished===190,"Full count not 190");
requireProof(all.results.length===190&&new Set(all.results.map(x=>x.sourceId)).size===190,"Full audit did not inspect unique 190 sources");
requireProof(all.checked===186&&equal(failed4,expected4),"Full audit did not isolate exact four transient source navigation failures");
requireProof(targeted.schema==="pse-disclosure-media-targeted-v1"&&targeted.errors.length===0,"Targeted audit errors");
requireProof(equal(target4,expected4)&&targeted.articles.every(x=>{
 const r=all.results.find(y=>y.sourceId===x.id);
 return x.sourceHttp===200&&x.mediaPass===true&&x.wpId===r?.wpId&&
 x.mediaCounts.sourceDocs<=x.mediaCounts.wpDocs&&x.mediaCounts.sourceImgs<=x.mediaCounts.wpImgs;
}),"Four timed-out source articles were not each revalidated");
requireProof(all.brokenWordpressFiles.length===0&&all.errors.length===0&&all.wordpressFilesChecked===271,
 "271 WordPress source media links were not checked cleanly");
const discrepancy=all.mediaCountMismatch;
requireProof(discrepancy.length===1&&discrepancy[0].sourceId==="1670"&&
 discrepancy[0].sourceDocs===5&&discrepancy[0].wpDocs===4&&
 discrepancy[0].sourceFiles.some(x=>x.url==="https://www.pse.vn/images/uy_quyen.pdf"),"PDF exception scope drift");
const broken=targeted.alias?.["https://www.pse.vn/images/uy_quyen.pdf"];
const valid=targeted.alias?.["https://www.pse.vn/images/Uy-Quyen.pdf"];
requireProof(broken?.head?.http===404&&valid?.head?.http===200&&valid?.get?.http===200&&
 String(valid?.get?.signature||"").startsWith("25504446"),
 "Original source PDF alias not independently proven broken, or legitimate PDF not validated");
requireProof(all.legacyMediaLinks.length===1&&all.legacyMediaLinks[0].sourceId==="1213"&&
 targeted.post1213.wpId===79397&&targeted.post1213.http===200&&
 targeted.post1213.localZip===true&&targeted.post1213.oldZip===false,
 "Original ZIP pre-fix snapshot not fully resolved by WordPress readback");
requireProof(final.schema==="pse-disclosure-final-parity-v1"&&final.sourceUnique===190&&
 final.checkpoint===190&&final.cmsTotal===190&&final.cmsFetched===190&&
 ["cmsExtra","missing","wrongCategory","wrongSlugs","unpublished","empty","oldLinks","errors","unapprovedDateDifferences"].every(k=>Array.isArray(final[k])&&final[k].length===0),
 "Final disclosure CMS parity proof missing");
requireProof(final.frontend?.page1?.http===200&&final.frontend?.page16?.http===200&&
 final.frontend?.page1?.sourceChronologyCorrect===true&&final.sourceChronology?.verified===true&&
 final.restoredDetails?.length===19&&final.restoredDetails.every(x=>x.http===200&&!x.empty&&!x.error),
 "Original archive ordering or 19 SSR details not validated");
requireProof(final.approvedDateExceptions?.length===1&&final.approvedDateExceptions[0].id==="1742","Date exception outside source-verified 1742");
const report={schema:"pse-disclosure-190-reconciled-parity-v1",auditRuns:{
 full:44705310926,targeted:44708531929,final:44705981776
 },sourceUnique:190,wpPublished:final.cmsTotal,
 inspectedInFirstPass:all.checked,recoveredTimeouts:targeted.articles.length,
 totalSourceDetailsVerified:all.checked+targeted.articles.length,
 localWordpressFilesChecked:all.wordpressFilesChecked,missingArticles:final.missing.length,
 missingValidMedia:errors.length===0?0:null,
 invalidOriginalSourcePdfAlias:"https://www.pse.vn/images/uy_quyen.pdf (HTTP 404, deliberately not copied)",
 repairedZipSourceId:"1213",repairVerified:targeted.post1213.localZip&&!targeted.post1213.oldZip,
 frontSourceChronologyPass:final.frontend.page1.sourceChronologyCorrect,
 dateException:"1742: explicitly published as 2026-08-13 per original title/archive order",
 errors,status:errors.length?"FAIL":"PASS"};
await mkdir("artifacts/pse-reconcile/summary",{recursive:true});
await writeFile("artifacts/pse-reconcile/summary/report.json",JSON.stringify(report,null,2)+"\n");
console.log("PSE_DISCLOSURE_190_RECONCILED="+JSON.stringify(report));
if(errors.length)process.exitCode=1;
