"""Bounded public publisher-list discovery, no CMS writes or build.
Use verified DPM current news archive structure and source Joomla article identity.
"""
import hashlib, json, os, re, time, unicodedata, urllib.request, urllib.error, urllib.parse
from datetime import date, datetime
from pathlib import Path
from bs4 import BeautifulSoup
if os.environ.get("GITHUB_REPOSITORY")!="ngocnhanvo/psevn-actions":raise RuntimeError("Wrong repository")
state=json.loads(Path("docs/pse-legacy-migration-state.json").read_text())
targets={
 1090:{"day":"2015-03-14","earliest":"2015-03-07","latest":"2015-03-16","title":"PVFCCo tổ chức thành công chương trình “Hội mùa Phú Mỹ” và chăm sóc khách hàng khu vực Tây Nguyên","tokens":["hoi mua phu my","tay nguyen"],"pages":[133,134,135,136,137]},
 237:{"day":"2012-01-20","earliest":"2012-01-05","latest":"2012-01-22","title":"PVFCCo SE Tặng quà tết cho hộ nghèo tại Lâm Đồng và Đắk Nông","tokens":["qua tet","lam dong","dak nong"],"pages":[]}
}
if state["schema"]!="pse-legacy-article-migration-v1" or not state["backup_verified"] or any(state["articles"][str(i)]["status"]!="quarantined" for i in targets):raise RuntimeError("Unexpected source state")
out=Path("artifacts/pse-dpm-1090-237-relocation-discovery");out.mkdir(parents=True,exist_ok=True)
report={"schema":"pse-dpm-archive-dated-discovery-v1","readOnly":True,"noCMSWrites":True,"noBuild":True,"rows":{},"lists":[],"stopped":False}
base="https://dpm.vn"
def fold(s):
    s=unicodedata.normalize("NFKD",str(s).lower().replace("đ","d"))
    return re.sub(r"[^a-z0-9]+"," ","".join(c for c in s if not unicodedata.combining(c))).strip()
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None
opener=urllib.request.build_opener(NoRedirect)
def get(url):
    u=urllib.parse.urlsplit(url)
    if u.scheme!="https" or u.hostname not in ("dpm.vn","www.pse.vn") or u.username or u.password:raise RuntimeError("Untrusted source")
    time.sleep(1.4)
    req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (compatible; PSE source migration verification)","Accept":"text/html"})
    try:
        with opener.open(req,timeout=16) as r:
            raw=r.read(4500001)
            if len(raw)>4500000:raise RuntimeError("HTML too large")
            return r.status,raw
    except urllib.error.HTTPError as e:
        if e.code in (403,429,502,503,504):report["stopped"]=True
        return e.code,b""
    except (TimeoutError,urllib.error.URLError):
        report["stopped"]=True
        return None,b""
def list_page(p):
    url=base+"/danh-muc/world-1?page="+str(p)
    http,raw=get(url)
    row={"page":p,"http":http,"items":[],"minDate":None,"maxDate":None};report["lists"].append(row)
    if http==200:
        soup=BeautifulSoup(raw,"html.parser")
        for a in soup.select("a[href]"):
            u=urllib.parse.urlsplit(urllib.parse.urljoin(url,a["href"]))
            if u.hostname!="dpm.vn" or not u.path.startswith("/tin-tuc/"):continue
            txt=" ".join(a.stripped_strings)
            m=re.search(r"\b(\d{2}/\d{2}/\d{4})\b",txt)
            if not m:continue
            try:day=datetime.strptime(m[1],"%d/%m/%Y").date().isoformat()
            except ValueError:continue
            if not any(x["url"]==u.geturl() for x in row["items"]):row["items"].append({"url":u.geturl(),"day":day,"title":txt[:400]})
        days=[x["day"] for x in row["items"]]
        if days:row["minDate"],row["maxDate"]=min(days),max(days)
    print("PSE_DPM_LIST="+json.dumps({"page":p,"http":http,"items":len(row["items"]),"min":row["minDate"],"max":row["maxDate"]}),flush=True)
    return row
def inspect_source(i,t):
    url=state["articles"][str(i)]["source_url"]
    row={"id":i,"source":url,"sourceHttp":None,"title":None,"bodyChars":0,"sourceImages":[],"publisherCandidates":[],"publisherDetails":[]}
    report["rows"][str(i)]=row
    u=urllib.parse.urlsplit(url)
    if u.hostname!="www.pse.vn" or "/"+str(i)+"-" not in u.path:raise RuntimeError("Source path mismatch")
    code,raw=get(url)
    row["sourceHttp"]=code
    if code==200:
        soup=BeautifulSoup(raw,"html.parser")
        for x in soup.select("script,style,noscript,.extranews_box,.extranews_separator"):x.decompose()
        root=soup.select_one("[itemprop=articleBody]")
        h=soup.select_one(".item-page h1,.item-page h2,h1")
        row["title"]=" ".join(h.stripped_strings) if h else ""
        if root and fold(row["title"])==fold(t["title"]):
            txt=" ".join(root.stripped_strings)
            row["bodyChars"]=len(txt);row["bodySha256"]=hashlib.sha256(txt.encode()).hexdigest()
            row["sourceImages"]=[urllib.parse.urljoin(url,x["src"]) for x in root.select("img[src]")]
    return row
def check_matches(i,t,rows):
    row=report["rows"][str(i)]
    for item in rows:
        if t["earliest"]<=item["day"]<=t["latest"] and all(k in fold(item["title"]) for k in t["tokens"]) and not any(x["url"]==item["url"] for x in row["publisherCandidates"]):
            row["publisherCandidates"].append(item)
def details(row):
    for item in row["publisherCandidates"][:2]:
        if report["stopped"]:break
        code,raw=get(item["url"]);d=dict(item,http=code,images=[],matchedFilenames=[])
        row["publisherDetails"].append(d)
        if code!=200:continue
        soup=BeautifulSoup(raw,"html.parser")
        expected={urllib.parse.unquote(urllib.parse.urlsplit(x).path.rsplit("/",1)[-1]) for x in row["sourceImages"]}
        for node in soup.select("img[src],a[href]"):
            src=node.get("src") or node.get("href")
            u=urllib.parse.urlsplit(urllib.parse.urljoin(item["url"],src))
            if u.hostname!="dpm.vn" or "/static/upload/" not in u.path or not re.search(r"\.(?:jpe?g|png|webp)$",u.path,re.I):continue
            if u.geturl() not in d["images"]:d["images"].append(u.geturl())
        d["matchedFilenames"]=[x for x in d["images"] if urllib.parse.unquote(urllib.parse.urlsplit(x).path.rsplit("/",1)[-1]) in expected]
try:
    # Source extraction is independently best effort. Stop on rate or connectivity failure.
    for i,t in targets.items():
        if report["stopped"]:break
        inspect_source(i,t)
    for p in targets[1090]["pages"]:
        if report["stopped"] or "1090" not in report["rows"]:break
        row=list_page(p);check_matches(1090,targets[1090],row["items"])
        if report["rows"]["1090"]["publisherCandidates"] or (row["maxDate"] and row["maxDate"]<targets[1090]["earliest"]):break
    if "1090" in report["rows"]:details(report["rows"]["1090"])
    # Seek Jan 2012 using monotone date-page ranges, capped at five requests.
    lo,hi=137,215
    if "237" in report["rows"]:
        for _ in range(5):
            if report["stopped"] or lo>hi:break
            p=(lo+hi)//2;row=list_page(p);check_matches(237,targets[237],row["items"])
            if report["rows"]["237"]["publisherCandidates"]:break
            if not row["minDate"]:break
            if row["minDate"]>targets[237]["latest"]:lo=p+1
            elif row["maxDate"]<targets[237]["earliest"]:hi=p-1
            else:break
        details(report["rows"]["237"])
finally:
    (out/"report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    for k,row in report["rows"].items():
        print("PSE_DPM_DISCOVERY_ROW="+json.dumps(row,ensure_ascii=False),flush=True)
    print("PSE_DPM_DISCOVERY_SUMMARY="+json.dumps({"pages":len(report["lists"]),"stopped":report["stopped"],"candidateCounts":{k:len(v["publisherCandidates"]) for k,v in report["rows"].items()},"readOnly":True,"noCMSWrites":True}),flush=True)
