#!/usr/bin/env python3
"""Read-only public site identity + isolated synthetic PSE chat diagnosis.
Never log raw content, credentials or session IDs; clear the synthetic session.
"""
import json, os, re, uuid
from urllib.parse import urlsplit, quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError

vals={}
for line in os.environ.get("ENV_FILE","").splitlines():
    line=line.strip().removeprefix("export ").strip()
    if "=" not in line:continue
    k,v=line.split("=",1)
    if k in {"WC_URL","WOO_KEY","WOO_SECRET"}: vals[k]=v.strip().strip("\\\"'")
wp=urlsplit(vals.get("WC_URL",""))
assert wp.scheme=="https" and wp.hostname=="admin-pse.webnvn.com" and wp.port in (None,443) and wp.path in ("","/") and not wp.username and not wp.password
assert vals.get("WOO_KEY") and vals.get("WOO_SECRET")
base=wp.geturl().rstrip("/")
def request(path, method="GET", data=None, auth=False):
    headers={"Accept":"application/json","User-Agent":"PSE-Identity-Audit/1.0"}
    if auth:
        headers["Authorization"]="Bearer "+vals["WOO_SECRET"]
        headers["X-ESC-Woo-Key"]=vals["WOO_KEY"]
    body=None
    if data is not None:
        body=json.dumps(data,ensure_ascii=False).encode("utf-8")
        headers["Content-Type"]="application/json"
    req=Request(base+path, data=body,headers=headers,method=method)
    try:
        with urlopen(req,timeout=60) as resp:return resp.status,resp.read(2000000)
    except HTTPError as exc:return exc.code,exc.read(6000)
def flags(value):
    s=str(value).casefold()
    return {"old_brand":bool(re.search(r"blue[ -]?sea|xuongmunonbaohiem|nón bảo hiểm|mũ bảo hiểm",s)),
            "pse":("pse" in s),"fertilizer":("phân bón" in s or "npk" in s)}
code,body=request("/wp-json/")
print("PSE_TENANT_WP_ROOT_HTTP="+str(code))
if code==200:
    data=json.loads(body.decode("utf-8"))
    print("PSE_TENANT_WP_SITE_FLAGS="+json.dumps(flags(data.get("name","")+" "+data.get("description","")),ensure_ascii=False))
code,body=request("/wp-json/wp/v2/search?search="+quote("Blue Sea")+"&per_page=5")
print("PSE_TENANT_PUBLIC_OLD_CONTENT_SEARCH_HTTP="+str(code))
if code==200:
    data=json.loads(body.decode("utf-8"))
    print("PSE_TENANT_PUBLIC_OLD_CONTENT_SEARCH_MATCHES="+str(len(data) if isinstance(data,list) else -1))
session=str(uuid.uuid4())
try:
    code,body=request("/wp-json/esc-agent/v1/chat","POST",{"message":"công ty làm về gì","sessionId":session},True)
    print("PSE_TENANT_CHAT_HTTP="+str(code))
    if code!=200:raise SystemExit(1)
    data=json.loads(body.decode("utf-8"))
    answer=data.get("message") or data.get("reply") or ""
    print("PSE_TENANT_CHAT_FLAGS="+json.dumps(flags(answer),ensure_ascii=False))
    results=data.get("data") or []
    print("PSE_TENANT_SKILL_COUNT="+str(len(results) if isinstance(results,list) else -1))
    if isinstance(results,list):
        for i,result in enumerate(results[:5]):
            if not isinstance(result,dict):continue
            skill=str(result.get("skill") or "")
            action=str(result.get("action") or "")
            value=result.get("data") or result.get("output") or result.get("result") or ""
            print("PSE_TENANT_SKILL="+json.dumps({"skill":skill,"action":action,"flags":flags(json.dumps(value,ensure_ascii=False,default=str))},ensure_ascii=False))
    if flags(answer)["old_brand"]:
        print("PSE_TENANT_ISOLATION=FAIL legacy_brand_in_fresh_answer")
        raise SystemExit(2)
    print("PSE_TENANT_ISOLATION=PASS")
finally:
    code,_=request("/wp-json/esc/v1/clear-chat-history?session_id="+session,"POST",{},True)
    print("PSE_TENANT_SYNTHETIC_CLEAR_HTTP="+str(code))
