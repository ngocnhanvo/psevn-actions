#!/usr/bin/env python3
"""Read-only PSE ContactSkill input audit; never display source content or secrets."""
import json, os, re
from html import unescape
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
env={}
for line in os.environ.get("ENV_FILE","").splitlines():
    line=line.strip()
    if line.startswith("export "):line=line[7:].strip()
    if "=" in line:
        k,v=line.split("=",1)
        if k in ("WC_URL","WC_URL_CLIENT"):env[k]=v.strip().strip("'\"")
wp=urlsplit(env["WC_URL"])
front=urlsplit(env["WC_URL_CLIENT"])
assert wp.scheme=="https" and wp.hostname=="admin-pse.webnvn.com" and wp.path in ("","/") and wp.port in (None,443)
assert front.scheme=="https" and front.hostname=="pse.webnvn.com" and front.path in ("","/") and front.port in (None,443)
def get(url):
    with urlopen(Request(url,headers={"User-Agent":"PSE-Published-Contact-Audit/1","Accept":"application/json"}),timeout=30) as r:
        return r.status,r.read(700000)
status,data=get(wp.geturl().rstrip("/")+"/wp-json/wp/v2/pages?slug=lien-he&status=publish&_fields=id,slug,title,content,status")
print("PSE_CONTACT_CURRENT_PUBLISHED_HTTP="+str(status))
rows=json.loads(data)
assert isinstance(rows,list) and len(rows)==1,"Expected exactly one current PSE published Contact page"
row=rows[0]
value=str(row.get("content",{}).get("rendered",""))
# Aggregate evidence only. Do not print company names, raw WordPress HTML or PII.
published_text=unescape(re.sub(r"<[^>]*>", " ", value))
legal_name_present=bool(re.search(
    r"công\s+ty\s+cổ\s+phần\s+phân\s+bón\s+và\s+hóa\s+chất\s+dầu\s+khí\s+đông\s+nam\s+bộ",
    published_text, re.I))
print("PSE_CONTACT_PUBLISHED_LEGAL_NAME_PRESENT="+str(legal_name_present).lower())
print("PSE_CONTACT_CURRENT_PAGE_META="+json.dumps({
  "id":row.get("id"),"slug":row.get("slug"),"status":row.get("status"),
  "content_chars":len(value),
  "mentions_pse":bool(re.search(r"pse|pvfcco|phân bón|dầu khí",value,re.I)),
  "mentions_contact":bool(re.search(r"liên hệ|email|hotline|điện thoại|@pse[.]vn|84-028",value,re.I)),
  "mentions_legacy":bool(re.search(r"blue[ -]?sea|xuongmunonbaohiem|mũ bảo hiểm|nón bảo hiểm|helmet",value,re.I)),
},ensure_ascii=False))
assert row.get("slug")=="lien-he" and row.get("status")=="publish"
assert len(value)>20 and re.search(r"pse|pvfcco|phân bón|dầu khí",value,re.I)
assert not re.search(r"blue[ -]?sea|xuongmunonbaohiem|mũ bảo hiểm|nón bảo hiểm|helmet",value,re.I)
status2,html=get(front.geturl().rstrip("/")+"/lien-he")
print("PSE_CONTACT_CURRENT_FRONTEND_HTTP="+str(status2))
assert status2==200
print("PSE_CONTACT_CURRENT_LIVE_SOURCE=PASS")
