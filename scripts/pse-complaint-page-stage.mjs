/** Stage PSE native complaint Page as a DRAFT. No cutover, no email.
 * Apply only on exact owner-authorized commit command after dry preflight.
 */
import {chromium} from "playwright";
import {readFile} from "node:fs/promises";

const evt=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const apply=String(evt.head_commit?.message||"").trim()==="cms(pse): stage complaint form Page draft";
const name="Xử lý khiếu nại - Ý kiến khách hàng",slug="xu-ly-khieu-nai-y-kien-khach-hang";
const action="PseComplaintPage",key="pse-complaint",menuId=77020;
const vars=String(process.env.ENV_FILE||"").split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,""));
const items=vars.filter(s=>s.startsWith("WC_URL="));
if(items.length!==1)throw Error("PSE WordPress origin missing or duplicated");
const u=new URL(items[0].slice(7).replace(/^['"]|['"]$/g,""));
if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||!["","/"].includes(u.pathname))throw Error("Untrusted WP origin");
const cms=u.origin;
const browser=await chromium.launch({headless:true});
const p=await browser.newPage({viewport:{width:1350,height:900}});
try {
  await p.goto(cms+"/wp-admin/",{waitUntil:"domcontentloaded",timeout:60000});
  if(await p.locator("#user_login").count()){
    await p.locator("#user_login").fill(process.env.WP_ADMIN_USERNAME||"");
    await p.locator("#user_pass").fill(process.env.WP_ADMIN_PASSWORD||"");
    const t=await p.locator("body").innerText();
    const m=t.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||t.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if(m){
      const a=+m[1],b=+m[3],answer=({"+":a+b,"-":a-b,x:a*b,"×":a*b,"*":a*b})[m[2]];
      const input=p.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if(!await input.count())throw Error("Authentication challenge not found");
      await input.fill(String(answer));
    }
    await Promise.all([p.waitForLoadState("domcontentloaded"),p.locator("#wp-submit").click()]);
  }
  if(p.url().includes("wp-login"))throw Error("WordPress admin authentication failed");
  const nonce=await p.evaluate(async()=>{
    if(window.wpApiSettings?.nonce)return window.wpApiSettings.nonce;
    const r=await fetch("/wp-admin/admin-ajax.php?action=rest-nonce",{credentials:"same-origin"});
    if(!r.ok)throw Error("REST nonce unavailable");
    return (await r.text()).trim();
  });
  if(!/^[a-z0-9]{8,24}$/i.test(nonce))throw Error("Invalid WordPress nonce");
  const api=(path,method="GET",body)=>p.evaluate(async ({path,method,body,nonce})=>{
    const response=await fetch(path,{method,credentials:"same-origin",headers:{"X-WP-Nonce":nonce,Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
    return{http:response.status,data:await response.json().catch(()=>({}))};
  },{path,method,body,nonce});
  const [pages,menu]=await Promise.all([
    api("/wp-json/wp/v2/pages?context=edit&slug="+encodeURIComponent(slug)+"&status=publish,draft,private,pending&per_page=10&_fields=id,slug,status,acf,title,content"),
    api("/wp-json/wp/v2/menu-items/"+menuId+"?context=edit")
  ]);
  if(pages.http!==200||!Array.isArray(pages.data)||pages.data.length>1||menu.http!==200)throw Error("CMS Page/menu inventory invalid");
  const old=pages.data[0]||null;
  const m=menu.data||{};
  if(Number(m.id)!==menuId||Number(m.parent)!==77004||
       !String(m.title?.raw||m.title?.rendered||"").includes("Xử lý khiếu nại"))throw Error("Complaint source menu identity changed");
  // Preserve original Joomla navigation while server delivery is not ready.
  if(m.type!=="custom"||!/\/hoat-dong-kinh-doanh\/xu-ly-khieu-nai-y-kien-khach-hang\.html/.test(String(m.url||"")))
    throw Error("Menu already cut over; inspect real publication before any staging");
  if(old&&(old.acf?.action!==action||old.acf?.key!==key))throw Error("Collision with other WordPress Page");
  const cfId=(vars.find(x=>x.startsWith("CONTACT_FORM_7_ID="))||"").split("=").slice(1).join("=").replace(/^['"]|['"]$/g,"");
  const ready=Boolean(/^[1-9]\d*$/.test(cfId));
  console.log("PSE_COMPLAINT_STAGE_PREFLIGHT="+JSON.stringify({mode:apply?"stage-draft":"dry",hasExistingPage:!!old,existingStatus:old?.status||null,menuUnchanged:true,formIdConfigured:ready}));
  if(old?.status==="publish")throw Error("Existing published Page requires live form test; no edits");
  if(old){
    if(old.status!=="draft")throw Error("Existing Page not draft");
    console.log("PSE_COMPLAINT_DRAFT=ALREADY_EXISTS; id="+old.id+"; noCmsWrites=true; noMenuCutover=true; noMail=true");
    process.exit(0);
  }
  if(!apply){console.log("PSE_COMPLAINT_DRAFT=DRY_PASS; noCmsWrites=true; noBuild=true");process.exit(0)}
  const payload={title:name,slug,status:"draft",content:"",acf:{action,key}};
  const created=await api("/wp-json/wp/v2/pages","POST",payload);
  if(created.http!==201||!Number.isSafeInteger(Number(created.data?.id)))throw Error("Native complaint Page draft creation rejected");
  const id=Number(created.data.id);
  const read=await api("/wp-json/wp/v2/pages/"+id+"?context=edit&_fields=id,slug,status,acf,title");
  const saved=read.data||{};
  if(read.http!==200||Number(saved.id)!==id||saved.status!=="draft"||saved.slug!==slug||saved.acf?.action!==action||saved.acf?.key!==key)
    throw Error("Complaint draft identity/readback mismatch");
  const menuAfter=await api("/wp-json/wp/v2/menu-items/"+menuId+"?context=edit");
  if(menuAfter.http!==200||menuAfter.data.type!=="custom"||menuAfter.data.url!==m.url)
    throw Error("Complaint legacy menu changed unexpectedly");
  console.log("PSE_COMPLAINT_DRAFT=PASS id="+id+"; action="+action+"; key="+key+"; menuPreserved=true; noFormSubmission=true; noBuild=true");
}finally{await browser.close()}
