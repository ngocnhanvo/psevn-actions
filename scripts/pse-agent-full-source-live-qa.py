#!/usr/bin/env python3
"""PSE multi-topic Agent fact audit. Synthetic sessions, no raw prompts/replies in logs."""
import json,os,re,uuid
from urllib.parse import urlsplit
from urllib.request import Request,urlopen
from urllib.error import HTTPError
config={}
for line in os.environ.get("ENV_FILE","").splitlines():
    line=line.strip().removeprefix("export ").strip()
    if "=" not in line:continue
    k,v=line.split("=",1)
    if k in ("WC_URL","WOO_KEY","WOO_SECRET"):config[k]=v.strip().strip("'\"")
u=urlsplit(config.get("WC_URL",""))
assert u.scheme=="https" and u.hostname=="admin-pse.webnvn.com" and u.path in ("","/")
assert config.get("WOO_KEY") and config.get("WOO_SECRET")
base=u.geturl().rstrip("/")
def request(path,method="GET",payload=None):
    headers={"User-Agent":"PSE-Full-Source-Synthetic-Audit/1.0","Accept":"application/json",
             "Authorization":"Bearer "+config["WOO_SECRET"],"X-ESC-Woo-Key":config["WOO_KEY"]}
    data=None
    if payload is not None:
        data=json.dumps(payload,ensure_ascii=False).encode("utf8")
        headers["Content-Type"]="application/json"
    req=Request(base+path,method=method,data=data,headers=headers)
    try:
        with urlopen(req,timeout=60) as resp:return resp.status,resp.read(150000)
    except HTTPError as exc:return exc.code,exc.read(2000)
cases=[
 ("history","PSE thành lập bao lâu rồi? Hãy tra cứu nội dung Quá trình hình thành - phát triển của PSE."),
 ("business","Ngành nghề kinh doanh của PSE là gì?"),
 ("contact","Số điện thoại và email liên hệ chính thức PSE là gì?"),
 ("policy","PSE có chính sách đổi trả hàng không? Cho nguồn nếu có."),
 ("payment","Ngân hàng và số tài khoản nhận thanh toán của PSE là gì? Chỉ cung cấp nếu có nguồn."),
 ("investor","Báo cáo thường niên năm 2025 của PSE xem ở đâu?"),
 ("fertilizer","PSE đang công bố những dòng phân bón Phú Mỹ nào?"),
 ("shareholder","Tài liệu công bố thông tin và cổ đông của PSE ở đâu?"),
]
old=re.compile(r"blue[ -]?sea|bluesea|xuongmunonbaohiem|(?:mũ|nón) bảo hiểm|mũ quảng cáo|in logo",re.I)
failed=[]
for key,question in cases:
    session=str(uuid.uuid4())
    try:
        code,body=request("/wp-json/esc-agent/v1/chat","POST",{"sessionId":session,"message":question})
        print("PSE_CURRENT_QA_"+key.upper()+"_HTTP="+str(code))
        if code != 200:
            failed.append(key+":http_"+str(code))
            continue
        try:obj=json.loads(body.decode("utf8"))
        except Exception:failed.append(key+":invalid_json");continue
        answer=obj.get("message") or ""
        records=obj.get("data")
        serialized=json.dumps(records,ensure_ascii=False,default=str) if records is not None else ""
        meta={
          "reply_chars":len(answer),
          "reply_legacy":bool(old.search(answer)),
          "data_legacy":bool(old.search(serialized)),
          "mentions_admin":("admin-pse.webnvn.com" in answer.casefold()),
          "mentions_retired_about":("trang về chúng tôi" in answer.casefold()),
          "mentions_pse":bool(re.search(r"pse|pvfcco|phú mỹ|phu my",answer,re.I)),
          "skill_names":[str(row.get("skill",""))+":"+str(row.get("action",""))
              for row in list(records.values())[:3] if isinstance(row,dict)] if isinstance(records,dict) else []
        }
        print("PSE_CURRENT_QA_"+key.upper()+"_META="+json.dumps(meta,ensure_ascii=False))
        if len(answer)<35 or meta["reply_legacy"] or meta["data_legacy"] or meta["mentions_admin"]:
            failed.append(key+":source_isolation")
        if key=="history" and meta["mentions_retired_about"]:
            failed.append(key+":nonexistent_about")
    finally:
        status,_=request("/wp-json/esc/v1/clear-chat-history?session_id="+session,"POST",{})
        if status!=200:failed.append(key+":cleanup_"+str(status))
print("PSE_CURRENT_QA_CASES="+str(len(cases))+" failed="+str(len(failed)))
if failed:
    print("PSE_CURRENT_SITE_SOURCE_QA=FAIL cases="+",".join(failed))
    raise SystemExit(1)
print("PSE_CURRENT_SITE_SOURCE_QA=PASS")
