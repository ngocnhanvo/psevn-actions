#!/usr/bin/env node
// Read-only post-CMS retirement check. No WP auth, no chat, no build.
import assert from "node:assert/strict";
const values={};
for(const line of String(process.env.ENV_FILE??"").split(/\r?\n/)){
  const m=line.trim().replace(/^export\s+/,"").match(/^(WC_URL|WC_URL_CLIENT)=(.*)$/);
  if(m)values[m[1]]=m[2].trim().replace(/^["']|["']$/g,"");
}
function check(s, expected){
  const u=new URL(s??"");
  assert.equal(u.protocol,"https:");
  assert.equal(u.hostname,expected);
  assert.ok(["","/"].includes(u.pathname));
  assert.ok(!u.search && !u.hash && !u.username && !u.password);
  return u.origin;
}
const wp=check(values.WC_URL,"admin-pse.webnvn.com"), frontend=check(values.WC_URL_CLIENT,"pse.webnvn.com");
async function get(url){
  const response=await fetch(url,{redirect:"manual",signal:AbortSignal.timeout(45000),headers:{"Accept":"text/html,application/json","User-Agent":"PSE-Old-Source-Postretirement-QA/1"}});
  return response;
}
const published=await get(wp+"/wp-json/wp/v2/pages/53390");
console.log("PSE_OLD_PAGE_PUBLIC_REST_HTTP="+published.status);
assert.notEqual(published.status,200,"Orphan WP Page is still public");
const pages=await get(wp+"/wp-json/wp/v2/pages?status=publish&per_page=100&_fields=id,slug");
assert.equal(pages.status,200);
const arr=await pages.json();
assert(Array.isArray(arr)&&arr.length>=20);
assert(!arr.some(p=>p.id===53390||p.slug==="ve-chung-toi"));
console.log("PSE_OLD_PAGE_PUBLISHED_INDEX=PASS pages="+arr.length);
const home=await get(frontend+"/");
assert.equal(home.status,200);
const html=await home.text();
assert(!/href=["'][^"']*\/ve-chung-toi/i.test(html),"Frontend homepage still links retired page");
console.log("PSE_OLD_PAGE_PUBLIC_MENU=PASS");
const old=await get(frontend+"/ve-chung-toi");
const to=String(old.headers.get("location")??"");
console.log("PSE_OLD_FRONTEND_ROUTE_HTTP="+old.status);
if(old.status>=300&&old.status<400){
  assert(to,"Unexpected empty redirect");
  const destination=new URL(to,frontend);
  assert.equal(destination.hostname,"pse.webnvn.com");
  assert.notEqual(destination.pathname.replace(/\/$/,""),"/ve-chung-toi");
}else{
  assert([404,410].includes(old.status),"Legacy /ve-chung-toi is still served by Astro (rebuild via WP required)");
}
console.log("PSE_OLD_SOURCE_PUBLIC_RETIREMENT=PASS");
