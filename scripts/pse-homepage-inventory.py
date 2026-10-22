#!/usr/bin/env python3
"""PSE homepage G0: read-only WordPress public REST inventory."""
import json, os, re, sys
from html import unescape
from urllib.parse import urlencode,urlsplit
from urllib.request import Request,urlopen
from urllib.error import HTTPError,URLError

def origin(name):
    found=[]
    for raw in os.environ.get("ENV_FILE","").splitlines():
        line=raw.strip().removeprefix("export ").strip()
        if line.startswith(name+"="):
            found.append(line.split("=",1)[1].strip().strip("'\""))
    if len(found)!=1: raise ValueError("Missing/duplicate "+name)
    u=urlsplit(found[0])
    if u.scheme!="https" or not u.hostname or u.username or u.password or u.port not in (None,443) or u.path not in ("","/") or u.query or u.fragment:
        raise ValueError("Invalid configured HTTPS origin")
    return "https://"+u.hostname

def fetch(base,resource):
    params=urlencode({"per_page":100,"page":1,"_fields":"id,slug,link,title,name,date,acf,content,categories"})
    with urlopen(Request(base+"/wp-json/wp/v2/"+resource+"?"+params,
            headers={"Accept":"application/json","User-Agent":"PSE-G0-readonly/1"}),timeout=25) as res:
        raw=res.read(4_000_001)
        if len(raw)>4_000_000: raise ValueError("Response too large")
        data=json.loads(raw)
        if not isinstance(data,list): raise ValueError("Expected collection")
        return data,res.headers.get("X-WP-Total","unknown")

def label(v):
    return re.sub(r"\\s+"," ",unescape(re.sub(r"<[^>]+>"," ",str(v or "")))).strip()[:150]

def main():
    base=origin("WC_URL")
    origin("WC_URL_CLIENT")
    print("G0=READ_ONLY WordPress origin from ENV_FILE; credentials not used")
    collections={}
    for key in ("pages","categories","posts"):
        try:
            items,total=fetch(base,key)
            collections[key]=items
            print(f"WP_{key.upper()}=PASS visible={len(items)} total={total}")
        except (HTTPError,URLError,TimeoutError,ValueError) as error:
            collections[key]=[]
            print(f"WP_{key.upper()}=BLOCKED type={type(error).__name__}")
    pages=collections["pages"]
    for item in pages[:100]:
        acf=item.get("acf") or {}
        row={"id":item.get("id"),"slug":item.get("slug"),
             "key":acf.get("key"),"action":acf.get("action")}
        ishome=row["key"]=="home" or row["slug"] in ("home","trang-chu")
        if ishome:
            html=(item.get("content") or {}).get("rendered","")
            row["shortcodes"]=list(dict.fromkeys(re.findall(r"\\[table\\s+id=([\\w-]+)",html,re.I)))
            row["title"]=label((item.get("title") or {}).get("rendered"))
        print(("WP_HOME=" if ishome else "WP_PAGE=")+json.dumps(row,ensure_ascii=False))
    for item in collections["categories"]:
        print("WP_CATEGORY="+json.dumps({"id":item.get("id"),"name":label(item.get("name")),"slug":item.get("slug")},ensure_ascii=False))
    for item in collections["posts"][:20]:
        print("WP_POST="+json.dumps({"id":item.get("id"),"title":label((item.get("title") or {}).get("rendered")),"categories":item.get("categories"),"date":item.get("date")},ensure_ascii=False))
    if not pages: raise RuntimeError("No public WordPress page data; authenticated mapping required")
    print("G0=PARTIAL; mapping must be verified before write")

if __name__=="__main__":
    try: main()
    except Exception as error:
        print("G0=BLOCKED cause="+type(error).__name__,file=sys.stderr)
        sys.exit(1)
