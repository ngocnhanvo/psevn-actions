#!/usr/bin/env python3
"""Incremental public Joomla article discovery; writes local checkpoint ONLY.
No WordPress writes, secrets, background agents or unbounded crawl.
"""
import json,os,re,time,sys
from html.parser import HTMLParser
from urllib.parse import urljoin,urlsplit,urlunsplit,quote,unquote,parse_qs
from urllib.request import Request,urlopen
from urllib.error import HTTPError,URLError

STATE="docs/pse-legacy-migration-state.json"
ROOT="https://www.pse.vn/"
EXCLUDES=(".png",".jpg",".jpeg",".gif",".webp",".svg",".ico",".pdf",".doc",".docx",".xls",".xlsx",".js",".css",".zip",".feed",".mp4")
ARTICLE=re.compile(r"/(\d{3,6})-[^/]+\.html$",re.I)
SKIP=("/lien-he","/san-pham","/sitemap","/tim-kiem","/dang-nhap","/gioi-thieu","/user","/component","/administrator")
MAX_PAGES=12
MAX_SECONDS=155
MAX_URLS=13000
UA="Mozilla/5.0 (compatible; PSE-Archive-Migration/1.0; +https://pse.vn)"
class Links(HTMLParser):
 def __init__(self):
  super().__init__(convert_charrefs=True);self.links=[];self.canonical=None
 def handle_starttag(self,tag,attrs):
  d=dict(attrs)
  if tag=="a" and d.get("href"):self.links.append(d["href"])
  if tag=="link" and "canonical" in (d.get("rel") or "").lower():self.canonical=d.get("href")
def clean(link,base=ROOT):
 try:
  p=urlsplit(urljoin(base,link))
  if p.scheme not in ("http","https") or p.hostname not in ("pse.vn","www.pse.vn") or p.username or p.password:return None
  path=quote(unquote(re.sub(r"/{2,}","/",p.path or "/")),safe="/-._~")
  if path.lower().endswith(EXCLUDES) or any(path.lower().startswith(x) for x in SKIP):return None
  query=parse_qs(p.query)
  normalized=""
  if query and set(query)=={"start"} and len(query["start"])==1 and re.fullmatch(r"\d{1,5}",query["start"][0]):
   normalized="start="+query["start"][0]
  return urlunsplit(("https","www.pse.vn",path,normalized,""))
 except (ValueError,TypeError):return None
def group(url):
 p=urlsplit(url).path.lower()
 if "quan-he-nha-dau-tu" in p:return "shareholder"
 if "thong-tin-thi-truong" in p or "nong-nghiep" in p or "mua-vu" in p:return "agriculture-market"
 if "tin-cong-ty" in p or "tin-tuc-su-kien" in p:return "company"
 return "unmapped"
def read(url):
 req=Request(url,headers={"User-Agent":UA,"Accept":"text/html"})
 with urlopen(req,timeout=13) as r:
  if r.status!=200:raise ValueError("HTTP "+str(r.status))
  final=clean(r.geturl())
  if not final:raise ValueError("Offsite redirect")
  typ=r.headers.get("Content-Type","")
  if "text/html" not in typ:raise ValueError("Non HTML")
  raw=r.read(1900000)
  if len(raw)>=1900000:raise ValueError("Page too large")
  enc=r.headers.get_content_charset() or "utf-8"
  parser=Links();parser.feed(raw.decode(enc,errors="replace"))
  return final,parser
state=json.load(open(STATE,encoding="utf-8"))
if state.get("schema")!="pse-legacy-article-migration-v1":raise SystemExit("Unknown migration schema")
state.setdefault("seen",[]);state.setdefault("queue",[]);state.setdefault("errors",[]);state.setdefault("articles",{})
seen=set(state["seen"]);pending=set(state["queue"]);started=time.monotonic();visited=0;found=0;failed=0
while state["queue"] and visited<MAX_PAGES and time.monotonic()-started<MAX_SECONDS:
 url=state["queue"].pop(0);pending.discard(url)
 url=clean(url)
 if not url or url in seen:continue
 seen.add(url);state["seen"].append(url);visited+=1
 try:
  resolved,parser=read(url)
  if ARTICLE.search(urlsplit(resolved).path):
   match=ARTICLE.search(urlsplit(resolved).path);key=match.group(1)
   if key not in state["articles"]:
    state["articles"][key]={"source_url":resolved,"group_hint":group(resolved),"status":"pending","attempts":0}
    found+=1
   continue
  for raw in parser.links:
   cand=clean(raw,resolved)
   if not cand:continue
   match=ARTICLE.search(urlsplit(cand).path)
   if match:
    key=match.group(1)
    if key not in state["articles"]:
     state["articles"][key]={"source_url":cand,"group_hint":group(cand),"status":"pending","attempts":0}
     found+=1
    continue
   if len(state["queue"])+len(seen)>=MAX_URLS:continue
   if cand not in seen and cand not in pending:
    state["queue"].append(cand);pending.add(cand)
 except (HTTPError,URLError,TimeoutError,OSError,UnicodeError,ValueError) as exc:
  failed+=1
  state["errors"].append({"type":"crawl","url":url,"reason":str(exc)[:160]})
state["discovered_complete"]=len(state["queue"])==0
state["runs"]=int(state.get("runs",0))+1
state["phase"]="import" if state["discovered_complete"] else "discover-and-import"
state["errors"]=state["errors"][-500:]
with open(STATE,"w",encoding="utf-8") as f:json.dump(state,f,ensure_ascii=False,indent=2,sort_keys=True);f.write("\n")
statuses={}
for a in state["articles"].values():statuses[a["status"]]=statuses.get(a["status"],0)+1
print("PSE_LEGACY_CRAWL=PASS; pages_this_run="+str(visited)+"; articles_new="+str(found)+"; crawl_errors="+str(failed)+
 "; article_total="+str(len(state["articles"]))+"; pending_source_pages="+str(len(state["queue"]))+
 "; discovery_complete="+str(state["discovered_complete"]))
print("PSE_LEGACY_ARTICLE_STATES="+json.dumps(statuses,sort_keys=True))
