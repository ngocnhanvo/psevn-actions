#!/usr/bin/env python3
"""PSE source audit: publicly published WordPress records, no CMS modifications."""
import json,os,re
from urllib.parse import urlsplit,quote
from urllib.request import Request,urlopen
from urllib.error import HTTPError
env={}
for line in os.environ.get("ENV_FILE","").splitlines():
    line=line.strip().removeprefix("export ").strip()
    if "=" in line:
        k,v=line.split("=",1)
        if k in ("WC_URL","WC_URL_CLIENT"):env[k]=v.strip().strip("'\"")
url=urlsplit(env.get("WC_URL",""))
assert url.scheme=="https" and url.hostname=="admin-pse.webnvn.com" and url.path in ("","/")
base=url.geturl().rstrip("/")
def get(path):
    req=Request(base+path,headers={"Accept":"application/json","User-Agent":"PSE-Source-Audit/1.0"})
    try:
        with urlopen(req,timeout=25) as r:return r.status,json.loads(r.read(1500000).decode("utf8")),int(r.headers.get("X-WP-Total","0"))
    except HTTPError as e:return e.code,{},0
status,types,_=get("/wp-json/wp/v2/types")
print("PSE_SOURCE_TYPES_HTTP="+str(status))
if isinstance(types,dict):print("PSE_SOURCE_PUBLIC_TYPES="+json.dumps(sorted(x for x in types if x not in ("attachment","revision","nav_menu_item")),ensure_ascii=False))
bad=re.compile(r"blue[ -]?sea|bluesea|xuongmunonbaohiem|mũ bảo hiểm|nón bảo hiểm|helmet",re.I)
about=re.compile(r"ve[-_ ]?chung[-_ ]?toi|about|gioi[-_ ]?thieu|pse|pvfcco",re.I)
for typ in ("pages","posts"):
    all_rows=[]
    for n in range(1,6):
        c,rows,total=get(f"/wp-json/wp/v2/{typ}?per_page=100&page={n}&_fields=id,slug,title,link,status")
        if c!=200 or not isinstance(rows,list):break
        all_rows.extend(rows)
        if len(rows)<100:break
    print(f"PSE_SOURCE_{typ.upper()}_COUNT="+str(len(all_rows)))
    print(f"PSE_SOURCE_{typ.upper()}_LEGACY_BRAND_COUNT="+str(sum(bool(bad.search(json.dumps(row,ensure_ascii=False))) for row in all_rows)))
    matches=[{"id":row.get("id"),"slug":row.get("slug"),"title":re.sub(r"<[^>]+>","",row.get("title",{}).get("rendered",""))[:110]} for row in all_rows if about.search(json.dumps(row,ensure_ascii=False))]
    print(f"PSE_SOURCE_{typ.upper()}_ABOUT_MATCHES="+json.dumps(matches[:40],ensure_ascii=False))
    bad_matches=[{"id":row.get("id"),"slug":row.get("slug")} for row in all_rows if bad.search(json.dumps(row,ensure_ascii=False))]
    print(f"PSE_SOURCE_{typ.upper()}_OLD_MATCHES="+json.dumps(bad_matches[:15],ensure_ascii=False))
for term in ("Về chúng tôi","giới thiệu","báo cáo thường niên","Blue Sea"):
    status,rows,total=get("/wp-json/wp/v2/search?search="+quote(term)+"&per_page=100")
    sample=[{"id":row.get("id"),"title":re.sub(r"<[^>]+>","",row.get("title",""))[:90],"type":row.get("subtype")} for row in rows[:20]] if isinstance(rows,list) else []
    print("PSE_SOURCE_PUBLIC_SEARCH="+json.dumps({"term":term,"http":status,"total":total,"sample":sample},ensure_ascii=False))

print("PSE_SOURCE_SELECTED_PAGE_DETAIL_BEGIN")
for pageid in (53390,79301,79279,79303,79270,248):
    st,data,_=get(f"/wp-json/wp/v2/pages/{pageid}?_fields=id,slug,title,link,content,status")
    if st != 200 or not isinstance(data,dict):
        print("PSE_SOURCE_PAGE_DETAIL="+json.dumps({"id":pageid,"http":st}))
        continue
    content=data.get("content",{}).get("rendered","")
    title=data.get("title",{}).get("rendered","")
    print("PSE_SOURCE_PAGE_DETAIL="+json.dumps({
        "id":pageid,"slug":data.get("slug"),"status":data.get("status"),
        "title":re.sub(r"<[^>]+>","",title)[:90],
        "link":data.get("link","")[:160],
        "content_chars":len(content),
        "has_blue_sea":bool(bad.search(content)),
        "has_pse":bool(re.search(r"pse|pvfcco|đông nam bộ|phú mỹ",content,re.I)),
        "mentions_founding_year":bool(re.search(r"(?:19|20)\\d{2}",content)),
    },ensure_ascii=False))
for key in ("thong-tin-chung","thong_tin_chung"):
    st,rows,total=get("/wp-json/wp/v2/"+key+"?per_page=50&_fields=id,slug,title,status")
    print("PSE_SOURCE_LEGACY_CPT="+json.dumps({"type":key,"http":st,"total":total,
        "rows":[{"id":x.get("id"),"slug":x.get("slug"),"title":re.sub(r"<[^>]+>","",x.get("title",{}).get("rendered",""))[:90]} for x in rows[:20]] if isinstance(rows,list) else []},ensure_ascii=False))
