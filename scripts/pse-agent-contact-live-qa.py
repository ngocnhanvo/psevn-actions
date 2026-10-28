#!/usr/bin/env python3
"""Live synthetic contact source QA after one-file Agent ContactSkill FTPS release.
No logs of private content, prompts, credentials or sessions; clears all sessions.
"""
import json,os,re,uuid
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from urllib.parse import urlsplit
env={}
for line in os.getenv("ENV_FILE","").splitlines():
    line=line.strip().removeprefix("export ").strip()
    if "=" not in line:continue
    key,val=line.split("=",1)
    if key in ("WC_URL","WOO_KEY","WOO_SECRET"):env[key]=val.strip().strip("'\"")
wp=urlsplit(env.get("WC_URL",""))
assert wp.scheme=="https" and wp.hostname=="admin-pse.webnvn.com" and wp.port in (None,443) and wp.path in ("","/") and not wp.username and not wp.password and not wp.query and not wp.fragment
assert env.get("WOO_KEY") and env.get("WOO_SECRET")
base=wp.geturl().rstrip("/")
def request(path,method="GET",payload=None):
    headers={"Accept":"application/json","User-Agent":"PSE-Contact-Synthetic-QA",
       "Authorization":"Bearer "+env["WOO_SECRET"],"X-ESC-Woo-Key":env["WOO_KEY"]}
    data=None
    if payload is not None:
        data=json.dumps(payload,ensure_ascii=False).encode("utf-8")
        headers["Content-Type"]="application/json"
    req=Request(base+path,method=method,headers=headers,data=data)
    try:
        with urlopen(req,timeout=60) as resp:return resp.status,resp.read(160000)
    except HTTPError as ex:return ex.code,ex.read(2000)
old=re.compile(r"blue[\s-]?sea|xuongmunonbaohiem|(?:mũ|nón) bảo hiểm|sản xuất mũ",re.I)
failed=[]
for label,question in [
    ("EMAIL","Email liên hệ chính thức của PSE là gì?"),
    ("HOTLINE","Cách liên hệ và số điện thoại chính thức của PSE là gì?"),
]:
    session=str(uuid.uuid4())
    try:
        status,content=request("/wp-json/esc-agent/v1/chat","POST",{"sessionId":session,"message":question})
        print("PSE_CONTACT_LIVE_"+label+"_HTTP="+str(status))
        if status!=200:failed.append(label+":http_"+str(status));continue
        row=json.loads(content.decode("utf-8"))
        reply=str(row.get("message") or "")
        steps=row.get("data") or {}
        data=json.dumps(steps,ensure_ascii=False,default=str)
        names=[str(x.get("skill"))+":"+str(x.get("action")) for x in steps.values() if isinstance(x,dict)] if isinstance(steps,dict) else []
        flags={"old_reply":bool(old.search(reply)),"old_skill_data":bool(old.search(data)),
           "admin_link":("admin-pse.webnvn.com" in reply),"has_current_source":("/lien-he" in data or "info@pse.vn" in data or "Trang Liên hệ PSE" in data),
           "skill_names":names}
        print("PSE_CONTACT_LIVE_"+label+"_FLAGS="+json.dumps(flags,ensure_ascii=False))
        if flags["old_reply"] or flags["old_skill_data"] or flags["admin_link"] or not flags["has_current_source"]:
            failed.append(label+":source")
    finally:
        status,_=request("/wp-json/esc/v1/clear-chat-history?session_id="+session,"POST",{})
        if status!=200:failed.append(label+":cleanup_"+str(status))
print("PSE_CONTACT_LIVE_CASES=2 failed="+str(len(failed)))
if failed:
    print("PSE_CONTACT_CURRENT_SOURCE_LIVE=FAIL labels="+",".join(failed))
    raise SystemExit(1)
print("PSE_CONTACT_CURRENT_SOURCE_LIVE=PASS")
