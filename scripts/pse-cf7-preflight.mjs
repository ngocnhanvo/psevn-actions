/** Read-only native WordPress CF7 registry and safe malformed API responses. Never send a real complaint. */
import {request} from "playwright";
const entries=String(process.env.ENV_FILE||"").split(/\r?\n/).map(x=>x.trim().replace(/^export\s+/,""));
const get=key=>{
 const pair=entries.filter(x=>x.startsWith(key+"="));
 if(pair.length!==1)throw Error("Missing configured origin");
 const url=new URL(pair[0].slice(key.length+1).replace(/^['"]|['"]$/g,""));
 if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||!["","/"].includes(url.pathname))throw Error("Invalid configured origin");
 return url.origin;
};
const wp=get("WC_URL"),front=get("WC_URL_CLIENT");
if(wp===front)throw Error("Private/public origin collision");
const browser=await request.newContext({timeout:30000});
try{
 const form=await browser.get(wp+"/wp-json/pse/v1/contact-form-id");
 const config=await form.json().catch(()=>({}));
 const id=Number(config?.id);
 const unique=form.status()===200&&Number.isSafeInteger(id)&&id>0&&Object.keys(config).length===1;
 console.log("PSE_CF7_REGISTRY="+JSON.stringify({status:form.status(),uniqueId:unique,noConfigValuesExposed:true}));
 if(!unique)throw Error("Native published CF7 form ID is not resolvable");
 const invalid=await browser.post(front+"/api/contact",{
  data:"{broken-json",headers:{"Content-Type":"application/json"},timeout:30000
 });
 const body=await invalid.json().catch(()=>null);
 const rejected=invalid.status()===400&&body&&typeof body==="object"&&body.ok!==true;
 console.log("PSE_CONTACT_MALFORMED_INPUT="+JSON.stringify({http:invalid.status(),rejected,formSubmission:false}));
 if(!rejected)throw Error("Contact endpoint failed safe malformed-input check");
 const wrong=await browser.post(front+"/api/contact",{data:"{}",headers:{"Content-Type":"text/plain"}});
 const contentTypeBlocked=wrong.status()===415;
 console.log("PSE_CONTACT_CONTENT_TYPE="+JSON.stringify({status:wrong.status(),rejected:contentTypeBlocked}));
 if(!contentTypeBlocked)throw Error("Contact endpoint did not reject unsupported media type");
 console.log("PSE_CF7_SAFE_PREFLIGHT=PASS; noEmail=true; noPrivateOriginLogged=true; noAstroBuild=true");
}finally{await browser.dispose()}
