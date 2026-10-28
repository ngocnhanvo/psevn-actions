#!/usr/bin/env python3
"""10 independent live company prompts, synthetic chat sessions; no raw answer or secret logging."""
import json, os, re, sys, uuid, time, unicodedata
from urllib.parse import urlsplit
from urllib.request import Request,urlopen
from urllib.error import HTTPError

CASES=[
 ("01-identity","PSE là công ty gì?","identity"),
 ("02-full-name","PSE là viết tắt của tên công ty nào?","full"),
 ("03-founded","Công ty PSE được thành lập khi nào?","founded"),
 ("04-age","PSE thành lập được bao nhiêu năm rồi?","age"),
 ("05-operations","PSE bắt đầu hoạt động từ năm nào?","operations"),
 ("06-not-2011","PSE có phải được thành lập năm 2011 không?","correction"),
 ("07-two-dates","Tại sao lịch sử PSE có cả mốc 2008 và 2011?","distinction"),
 ("08-timeline","Hãy tóm tắt quá trình hình thành và phát triển của PSE.","timeline"),
 ("09-industries","PSE hiện đang kinh doanh trong những lĩnh vực nào?","industry"),
 ("10-advantages","PSE có những lợi thế gì so với các doanh nghiệp khác?","advantage"),
]
def norm(s):
 return "".join(x for x in unicodedata.normalize("NFKD",str(s).casefold()) if not unicodedata.combining(x))
def assess(reply,source,skills,kind):
 text=norm(reply); raw=norm(json.dumps(source,ensure_ascii=False,default=str))
 # Classify actual production fallback text; an HTTP 200 with this text is NOT
 # a valid factual answer. The same string length alone cannot distinguish
 # Planner failure from failed LLM synthesis.
 planner_unavailable=text==norm("Hệ thống đang gặp sự cố khi xử lý yêu cầu. Vui lòng thử lại sau.")
 synthesis_unavailable=text==norm("Hiện chưa thể tổng hợp dữ liệu đã tra cứu. Vui lòng thử lại sau.")
 service_error=planner_unavailable or synthesis_unavailable or not text.strip()
 legacy=bool(re.search(r"blue sea|xuongmunonbaohiem|mu bao hiem|non bao hiem",text+" "+raw))
 date=bool(re.search(r"0?7\s*[/.-]\s*0?8\s*[/.-]\s*2008|ngay\s+0?7\s+thang\s+0?8\s+nam\s+2008",text))
 operations=bool(re.search(r"0?1\s*[/.-]\s*0?9\s*[/.-]\s*2008|thang\s+0?9\s+nam\s+2008",text))
 stock=bool(re.search(r"co phan|chuyen doi|chuyen thanh|mo hinh",text))
 company=bool(re.search(r"cong ty|doanh nghiep|co phan",text))
 fertil="phan bon" in text
 have2008="2008" in text; have2011="2011" in text
 full="phan bon va hoa chat dau khi dong nam bo" in text
 age=bool(re.search(r"\b18\s*(?:nam|tuoi)\b",text))
 advantage=bool(re.search(r"loi the|uu diem|diem manh|he thong|phan phoi|kinh nghiem|uy tin|doi ngu|hop tac|thi truong",text))
 unknown=bool(re.search(r"chua (co|tim thay|xac minh)|khong (co|tim thay|duoc)|khong the xac minh",text))
 matches={
 "identity":company and fertil,"full":full,"founded":have2008 and date,
 "age":have2008 and age,
 # The question asks which YEAR operations began. A reply may correctly say
 # "năm 2008" without spelling the date 01/09; check operation semantics.
 "operations":have2008 and bool(re.search(r"hoat dong|bat dau|di vao",text)),
 "correction":have2008 and have2011 and stock,
 "distinction":have2008 and have2011 and stock,
 "timeline":have2008 and have2011 and (date or operations),
 "industry":fertil and (company or "kinh doanh" in text or "hoa chat" in text),
 "advantage":advantage and not unknown,
 }
 routes={
 "identity":["company:get","contact:get"],"full":["company:get","contact:get","knowledge:search"],
 "founded":["company:about","knowledge:search"],"age":["company:about","knowledge:search"],
 "operations":["company:about","knowledge:search"],"correction":["company:about","knowledge:search"],
 "distinction":["company:about","knowledge:search"],"timeline":["company:about","knowledge:search"],
 "industry":["company:get","company:about","knowledge:search"],"advantage":["company:advantages","knowledge:search"],
 }
 route=any(s in routes[kind] for s in skills)
 flags={"answer_matches":bool(matches[kind]) and not service_error,
 "route_matches":route,"legacy_tenant":legacy,
 "planner_unavailable":planner_unavailable,"synthesis_unavailable":synthesis_unavailable,
 "source_has_2008":"2008" in raw,"source_has_2011":"2011" in raw,
 "reply_has_2008":have2008,"reply_has_2011":have2011,"founding_date":date,
 "operation_date":operations,"full_name":full,"fertilizer":fertil,"advantages":advantage,
 "unknown_claim":unknown}
 return bool(matches[kind] and route and not legacy and not service_error), flags

env={}
for line in os.getenv("ENV_FILE","").splitlines():
 line=line.strip().removeprefix("export ").strip()
 if "=" in line:
  k,v=line.split("=",1)
  if k in ("WC_URL","WOO_KEY","WOO_SECRET"):env[k]=v.strip().strip("'\"")
url=urlsplit(env.get("WC_URL",""))
assert url.scheme=="https" and url.hostname=="admin-pse.webnvn.com" and url.port in (None,443) and url.path in ("","/") and not url.username and not url.password and not url.query and not url.fragment
assert env.get("WOO_KEY") and env.get("WOO_SECRET")
base=url.geturl().rstrip("/")
def req(path,method="GET",data=None,extra_headers=None):
 headers={"Accept":"application/json","User-Agent":"PSE-company-QA",
 "Authorization":"Bearer "+env["WOO_SECRET"],"X-ESC-Woo-Key":env["WOO_KEY"]}
 if extra_headers:
  headers.update(extra_headers)
 payload=None if data is None else json.dumps(data,ensure_ascii=False).encode()
 if payload is not None:headers["Content-Type"]="application/json"
 request=Request(base+path,data=payload,headers=headers,method=method)
 try:
  with urlopen(request,timeout=65) as response:return response.status,response.read(180000)
 except HTTPError as error:return error.code,error.read(1000)

failed=[]
for idx,(case,question,kind) in enumerate(CASES):
 session=str(uuid.uuid4()); diagnostic={"case":case}
 try:
  status,body=req("/wp-json/esc-agent/v1/chat","POST",
      {"sessionId":session,"message":question},
      {"X-ESC-Debug":"regression",
       "X-ESC-Run-Id":str(os.getenv("GITHUB_RUN_ID","manual"))[:70],
       "X-ESC-Test-Case":case,"X-ESC-Test-Turn":"1"})
  diagnostic["http"]=status
  if status!=200: diagnostic["result"]="FAIL";diagnostic["reason"]="http"
  else:
   response=json.loads(body.decode("utf8")); reply=response.get("message") or ""
   source=response.get("data")
   steps=list(source.values()) if isinstance(source,dict) else []
   skills=[str(s.get("skill",""))+":"+str(s.get("action","")) for s in steps[:6] if isinstance(s,dict)]
   passed,flags=assess(reply,source,skills,kind)
   reason=("planner_unavailable" if flags["planner_unavailable"] else
           "synthesis_unavailable" if flags["synthesis_unavailable"] else
           "legacy_tenant" if flags["legacy_tenant"] else
           "wrong_or_missing_answer" if not flags["answer_matches"] else
           "skill_routing" if not flags["route_matches"] else "ok")
   diagnostic.update({"result":"PASS" if passed else "REVIEW","reason":reason,
                      "chars":len(reply),"skills":skills,"flags":flags})
   # The PHP Agent adds diagnostics only to authenticated regression requests
   # after the diagnostic PHP change has been deployed. Defensively allowlist
   # every logged field again; never emit raw answers, prompts, session IDs,
   # request IDs, provider error messages or credentials in CI output.
   server_diagnostics=response.get("diagnostics")
   if isinstance(server_diagnostics,dict):
    events=server_diagnostics.get("events")
    if isinstance(events,list):
     safe_str={"event","stage","provider","model","resource_id","from","to",
               "from_model","to_model","reason","error_type","finish_reason",
               "result","skill","action"}
     safe_int={"attempt","http_status","latency_ms","cooldown_until"}
     diagnostic["llm_events"]=[]
     for event in events[:64]:
      if not isinstance(event,dict):continue
      clean={k:v for k,v in event.items()
             if ((k in safe_str and isinstance(v,str) and
                  len(v)<=100 and re.fullmatch(r"[A-Za-z0-9_.:/@-]+",v))
                 or (k in safe_int and type(v) is int))}
      diagnostic["llm_events"].append(clean)
   else:
    diagnostic["llm_diagnostics"]="UNAVAILABLE_PHP_NOT_DEPLOYED_OR_DISABLED"
 except Exception as error: diagnostic.update({"result":"FAIL","reason":type(error).__name__})
 finally:
  try: cleared,_=req("/wp-json/esc/v1/clear-chat-history?session_id="+session,"POST",{})
  except Exception:cleared=0
  diagnostic["cleared"]=cleared==200
  if not diagnostic["cleared"]:diagnostic["result"]="FAIL";diagnostic["reason"]="cleanup"
 if diagnostic["result"]!="PASS":failed.append(case)
 print("PSE_COMPANY_QA_CASE="+json.dumps(diagnostic,ensure_ascii=False),flush=True)
 if idx<9:time.sleep(1)
print("PSE_COMPANY_QA_RESULT="+json.dumps({"pass":10-len(failed),"total":10,"review":failed,"no_raw_answers":True,"no_cms_writes":True}),flush=True)
if "--strict" in sys.argv and failed:sys.exit(1)
