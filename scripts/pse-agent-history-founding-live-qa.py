#!/usr/bin/env python3
"""Bounded current PSE founding-answer QA; synthetic sessions only, no raw replies in logs."""
import argparse
import json
import os
import re
import uuid
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError

parser=argparse.ArgumentParser()
parser.add_argument("--audit-only",action="store_true")
parser.add_argument("--only-founding-date",action="store_true")
args=parser.parse_args()
config={}
for line in os.environ.get("ENV_FILE","").splitlines():
    line=line.strip().removeprefix("export ").strip()
    if "=" not in line:continue
    k,v=line.split("=",1)
    if k in ("WC_URL","WOO_KEY","WOO_SECRET"):config[k]=v.strip().strip("'\"")
wp=urlsplit(config.get("WC_URL",""))
assert (wp.scheme=="https" and wp.hostname=="admin-pse.webnvn.com" and wp.port in (None,443)
        and wp.path in ("","/") and not wp.username and not wp.password
        and not wp.query and not wp.fragment)
assert config.get("WOO_KEY") and config.get("WOO_SECRET")
base=wp.geturl().rstrip("/")
def request(path,method="GET",payload=None):
    h={"User-Agent":"PSE-Agent-History-Evidence-QA/1.0","Accept":"application/json",
       "Authorization":"Bearer "+config["WOO_SECRET"],"X-ESC-Woo-Key":config["WOO_KEY"]}
    data=None
    if payload is not None:
        data=json.dumps(payload,ensure_ascii=False).encode("utf8")
        h["Content-Type"]="application/json"
    req=Request(base+path,data=data,headers=h,method=method)
    try:
        with urlopen(req,timeout=65) as resp:return resp.status,resp.read(140000)
    except HTTPError as err:return err.code,err.read(3000)

questions=[
    ("duration","pse thành lập bao lâu rồi"),
    ("founding_date","PSE được thành lập ngày nào?"),
]
if args.only_founding_date:questions=[item for item in questions if item[0]=="founding_date"]
failures=[]
for label,question in questions:
    session=str(uuid.uuid4())
    try:
        code,body=request("/wp-json/esc-agent/v1/chat","POST",{"sessionId":session,"message":question})
        if code!=200:
            print("PSE_HISTORY_"+label.upper()+"_HTTP="+str(code))
            failures.append(label+":http")
            continue
        data=json.loads(body.decode("utf8"))
        reply=data.get("message") or ""
        source=data.get("data")
        raw=json.dumps(source,ensure_ascii=False,default=str) if source is not None else ""
        s=reply.casefold()
        founded=("2008" in s)
        age=bool(re.search(r"\b18\s*năm\b",s))
        date=bool(re.search(r"07\s*[/.-]\s*08\s*[/.-]\s*2008|ngày\s*0?7\s+tháng\s*0?8\s+năm\s+2008",s))
        bad=bool(re.search(r"blue\s*sea|về chúng tôi|không\s+(?:nêu|có|thể xác minh)|chưa\s+(?:nêu|xác minh|có)|không\s+tìm\s+thấy",s))
        old=bool(re.search(r"blue\s*sea|xuongmunonbaohiem",s+" "+raw,re.I))
        steps=list(source.values()) if isinstance(source,dict) else []
        actions=[str(x.get("skill",""))+":"+str(x.get("action",""))
                 for x in steps[:4] if isinstance(x,dict)]
        payload={"http":code,"chars":len(reply),"skills":actions,
                 "source_has_2008":("2008" in raw),"has_2008":founded,"has_18_years":age,
                 "has_day_07_08_2008":date,"missing_or_retired_source":bad,"legacy_tenant":old}
        print("PSE_HISTORY_"+label.upper()+"_QA="+json.dumps(payload,ensure_ascii=False))
        if bad or old or not (founded or age) or (label=="founding_date" and not date):
            failures.append(label+":ungrounded")
    except (ValueError,UnicodeError) as exc:
        print("PSE_HISTORY_"+label.upper()+"_PARSE_ERROR="+type(exc).__name__)
        failures.append(label+":invalid_json")
    finally:
        status,_=request("/wp-json/esc/v1/clear-chat-history?session_id="+session,"POST",{})
        if status!=200:failures.append(label+":cleanup_"+str(status))
print("PSE_AGENT_HISTORY_LIVE_QA="+("PASS" if not failures else "FAIL")+
      " audit_only="+str(args.audit_only).lower()+" failed="+",".join(failures))
if failures and not args.audit_only:raise SystemExit(1)
