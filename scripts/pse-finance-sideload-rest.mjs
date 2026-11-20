/** One-off owner-authorized PSE financial report PDF migration. No front-end build. */
import {chromium} from "playwright";
import {readFile,writeFile,appendFile} from "node:fs/promises";
const filename="docs/pse-legacy-migration-state.json";
const state=JSON.parse(await readFile(filename,"utf8"));
if(process.env.GITHUB_REPOSITORY!=="ngocnhanvo/psevn-actions"||state.schema!=="pse-legacy-article-migration-v1"||!state.backup_verified)throw Error("PSE checkpoint missing");
const allowed=[
 ["1738",0,"https://www.pse.vn/images/20261104-CV-26-83-%C4%90NB-H%C4%90QT-%C4%90%C3%ADnh_ch%C3%ADnh_th%C3%B4ng_tin_%C4%91%C3%A3_c%C3%B4ng_b%E1%BB%91_trong_BCTC_qu%C3%BD_3.2026.pdf"],
 ["1666",0,"https://www.pse.vn/images/20260320-CV-26-16-%C4%90NB-H%C4%90QT-CBTT_BCTC_%C4%91%C3%A3_ki%E1%BB%83m_to%C3%A1n_n%C4%83m_2025.pdf"],
 ["1666",1,"https://www.pse.vn/images/20260320-CV-26-17-%C4%90NB-H%C4%90QT-gi%E1%BA%A3i_tr%C3%ACnh_l%E1%BB%A3i_nhu%E1%BA%ADn_sau_thu%E1%BA%BF_ch%C3%AAnh_l%E1%BB%87ch_so_v%E1%BB%9Bi_th%E1%BB%B1c_hi%E1%BB%87n_c%C3%B9ng_k%E1%BB%B3.pdf"],
 ["1650",0,"https://www.pse.vn/images/CBTT_BCTC_ban_nien.pdf"],
 ["1650",1,"https://www.pse.vn/images/CV-69-DNB-HDQT-giai-trinh-loi-nhuan-sau-thue-chenh-lech.pdf"]
];
for(const [id] of allowed)if(!state.articles[id]?.source_url?.includes("/bao-cao-tai-chinh/"+id+"-"))throw Error("Source provenance mismatch "+id);
const v=String(process.env.ENV_FILE||"").split(/\r?\n/).find(x=>x.trim().startsWith("WC_URL="));
if(!v||v.split("=",2)[1].replace(/['"]/g,"").trim().replace(/\/$/,"")!=="https://admin-pse.webnvn.com")throw Error("Wrong WordPress environment");
const root="https://admin-pse.webnvn.com";
const browser=await chromium.launch({headless:true}),p=await browser.newPage();
let changed=0;const errors=[];
try{
 await p.goto(root+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:50000});
 if(await p.locator("#user_login").count()){
  await p.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
  await p.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
  const m=(await p.locator("#loginform").innerText()).match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/);
  if(m){const a=+m[1],b=+m[3],ans=m[2]==="+"?a+b:m[2]==="-"?a-b:a*b;
   const field=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[type="number"]').first();
   if(await field.count())await field.fill(String(ans));
  }
  await p.locator("#wp-submit").click();
 }
 await p.goto(root+"/wp-admin/post.php?post=248&action=edit",{waitUntil:"domcontentloaded",timeout:60000});
 if(!await p.locator("#adminmenu").count())throw Error("PSE administrator session not verified");
 const nonce=await p.evaluate(async()=>{
  if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
  const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
  return r.ok()?(await r.text()).trim():"";
 });
 if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("No WP API nonce");
 for(const [id,index,source] of allowed){
  const entry=state.media[source];
  if(entry?.url){
   const check=await p.request.head(entry.url,{timeout:30000}).catch(()=>null);
   if(check?.status()===200){console.log("PSE_FINANCE_SIDELOAD_ALREADY="+id+"-"+index);continue}
  }
  try{
   const r=await p.evaluate(async({id,index,nonce})=>{
    const res=await fetch("/wp-json/pse-finance/v1/source-attachment",{method:"POST",credentials:"same-origin",
     headers:{"Content-Type":"application/json","X-WP-Nonce":nonce},
     body:JSON.stringify({source_id:Number(id),asset_index:index})});
    return{http:res.status,body:await res.json()};
   },{id,index,nonce});
   const a=r.body,u=new URL(a.url||"/",root);
   if(r.http!==200||a.source_url!==source||!Number.isSafeInteger(a.id)||!Number.isSafeInteger(a.bytes)||
      !/^[0-9a-f]{64}$/i.test(a.sha256||"")||u.origin!==root||!u.pathname.startsWith("/wp-content/uploads/"))
    throw Error("Sideload readback rejected HTTP "+r.http+" code "+(a.code||"unknown"));
   state.media[source]={id:a.id,url:u.href,sha256:a.sha256,source_filename:a.source_filename,source_bytes:a.bytes};
   changed++;
   console.log("PSE_FINANCE_SIDELOAD_OK="+JSON.stringify({id,index,mediaId:a.id,bytes:a.bytes,reused:a.status==="reused"}));
  }catch(e){errors.push({id,index,error:String(e).slice(0,170)})}
 }
}finally{
 if(changed){
  // Media is already source-verified: reset only the exact nine financial
  // source IDs for a post-only importer pass; never reopen unrelated records.
  const mediaById={
   "1738":[allowed[0][2]],"1666":[allowed[1][2],allowed[2][2]],
   "1650":[allowed[3][2],allowed[4][2]],"1480":[allowed[3][2]]
  };
  for(const [id,urls] of Object.entries(mediaById)){
   const rec=state.articles[id];
   if(rec&&!rec.wp_id&&urls.every(url=>state.media[url]?.url)){
    rec.attempts=0;rec.status="pending";delete rec.reason;
    delete rec.finance_scope_terminal;
    console.log("PSE_FINANCE_POST_RETRY_READY="+id);
   }
  }
  for(const id of ["1137","298"]){
   const rec=state.articles[id];
   if(rec&&!rec.wp_id&&!rec.finance_exception_attempted){
    rec.attempts=0;rec.status="pending";delete rec.reason;
    delete rec.finance_scope_terminal;
    console.log("PSE_FINANCE_ORIGINAL_EXCEPTION_READY="+id);
   }
  }
  state.runs=Number(state.runs||0)+1;
  await writeFile(filename,JSON.stringify(state,null,2)+"\n");
 }
 if(process.env.GITHUB_ENV)await appendFile(process.env.GITHUB_ENV,"PSE_FINANCE_MEDIA_CHECKPOINT_CHANGED="+(changed?"yes":"no")+"\n");
 await writeFile("pse-finance-sideload-report.json",JSON.stringify({changed,errors},null,2)+"\n");
 await browser.close();
}
console.log("PSE_FINANCE_SIDELOAD_SUMMARY="+JSON.stringify({changed,errors}));
if(errors.length)process.exitCode=1;
