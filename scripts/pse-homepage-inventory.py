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
    return re.sub(r"\s+"," ",unescape(re.sub(r"<[^>]+>"," ",str(v or "")))).strip()[:150]

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
            row["shortcodes"]=list(dict.fromkeys(re.findall(r"\[table\s+id=([\w-]+)",html,re.I)))
            row["title"]=label((item.get("title") or {}).get("rendered"))
        print(("WP_HOME=" if ishome else "WP_PAGE=")+json.dumps(row,ensure_ascii=False))
    for item in collections["categories"]:
        print("WP_CATEGORY="+json.dumps({"id":item.get("id"),"name":label(item.get("name")),"slug":item.get("slug")},ensure_ascii=False))
    for item in collections["posts"][:20]:
        print("WP_POST="+json.dumps({"id":item.get("id"),"title":label((item.get("title") or {}).get("rendered")),"categories":item.get("categories"),"date":item.get("date")},ensure_ascii=False))
    # Public branding/Menu Manager check; only print non-sensitive public fields.
    try:
        with urlopen(Request(base+"/wp-json/wp/v2/thong-tin-chung?status=publish&per_page=20&_fields=id,acf",headers={"Accept":"application/json"}),timeout=25) as res:
            infos=json.loads(res.read(1_000_000))
        print("WP_INFO_ITEMS="+str(len(infos)))
        for entry in infos[:5]:
            acf=entry.get("acf") or {}
            print("WP_INFO="+json.dumps({"id":entry.get("id"),"company":label(acf.get("tencongty")),"logo":bool((acf.get("logo") or {}).get("url")),"hotline":bool(acf.get("hotline")),"email":bool(acf.get("emailhcm"))},ensure_ascii=False))
    except Exception as error:
        print("WP_INFO=BLOCKED type="+type(error).__name__)
    try:
        with urlopen(Request(base+"/wp-json/esc-api/v1/menus",headers={"Accept":"application/json"}),timeout=25) as res:
            menus=json.loads(res.read(2_000_000))
        collection=menus.get("menus") if isinstance(menus,dict) else {}
        if not isinstance(collection,dict): collection={}
        print("WP_MENU_CODES="+json.dumps(sorted(collection.keys())))
        for code,languages in collection.items():
            if not isinstance(languages,dict): continue
            for lang,data in languages.items():
                rows=data.get("items") or []
                print("WP_MENU="+json.dumps({"code":code,"lang":lang,"count":len(rows),"top":[label(item.get("label")) for item in rows[:20]]},ensure_ascii=False))
    except Exception as error:
        print("WP_MENU=BLOCKED type="+type(error).__name__)
    if not pages: raise RuntimeError("No public WordPress page data; authenticated mapping required")
    print("G0=PARTIAL; mapping must be verified before write")

if __name__=="__main__":
    try: main()
    except Exception as error:
        print("G0=BLOCKED cause="+type(error).__name__,file=sys.stderr)
        sys.exit(1)
