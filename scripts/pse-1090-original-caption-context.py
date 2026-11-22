"""GET-only original article figure context; resolve ambiguous same-name relocated media."""
import hashlib,json,os,re,time,urllib.request,urllib.parse
from pathlib import Path
from bs4 import BeautifulSoup
if os.environ.get("GITHUB_REPOSITORY")!="ngocnhanvo/psevn-actions":raise RuntimeError("Wrong repo")
proof=json.loads(Path("inputs/pse1090/report.json").read_text())
source=proof["source"]["source"];publisher=proof["publisher"]
if proof["sourceId"]!=1090 or proof["priorArtifact"]!=14739743038 or proof["summary"]["decoded"]!=24 or proof["source"]["bodySha256"]!="ec7491b318f521d4b5c49ffc2dd13eca6d2df797691fa89e047915716a150e5a":raise RuntimeError("Wrong pinned evidence")
out=Path("artifacts/pse-1090-caption-context");out.mkdir(parents=True,exist_ok=True)
report={"sourceId":1090,"source":source,"publisher":publisher,"noCMSWrites":True,"rows":[]}
class NR(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None
def get(url):
    if url not in (source,publisher):raise RuntimeError("Wrong source")
    req=urllib.request.Request(url,headers={"User-Agent":"PSE source migration verification","Accept":"text/html"})
    with urllib.request.build_opener(NR).open(req,timeout=22) as r:
        buf=r.read(4500001)
        if len(buf)>4500000:raise RuntimeError("Unexpected size")
        return BeautifulSoup(buf,"html.parser")
def text(n):return " ".join(n.stripped_strings) if n else ""
def context(img):
    block=img
    while block.parent and block.name not in ("p","div","figure","td","li","body"):block=block.parent
    prev=block.find_previous_sibling();nxt=block.find_next_sibling()
    return {"alt":img.get("alt"),"title":img.get("title"),"parent":text(block)[:1200],"previous":text(prev)[-1200:],"next":text(nxt)[:1200],"html":str(block)[:2500]}
try:
    soup=get(source)
    for x in soup.select("script,style,noscript,.extranews_box,.extranews_separator"):x.decompose()
    root=soup.select_one("[itemprop=articleBody]")
    if not root or hashlib.sha256(text(root).encode()).hexdigest()!=proof["source"]["bodySha256"]:raise RuntimeError("Original source body hash differs")
    imgs=root.select("img[src]")
    if [urllib.parse.urljoin(source,x["src"]) for x in imgs]!=proof["source"]["sourceImages"]:raise RuntimeError("Source media order differs")
    (out/"original-body.html").write_text(str(root),encoding="utf8")
    report["sourceText"]=text(root)
    for i,img in enumerate(imgs):
        row={"index":i,"filename":proof["rows"][i]["filename"],"original":context(img),"publisher":[]}
        report["rows"].append(row)
    time.sleep(2)
    soup=get(publisher)
    for x in soup.select("script,style,noscript"):x.decompose()
    for img in soup.select("img[src]"):
        url=urllib.parse.urljoin(publisher,img["src"])
        for row in report["rows"]:
            if urllib.parse.unquote(urllib.parse.urlsplit(url).path.rsplit("/",1)[-1])==row["filename"]:
                row["publisher"].append(dict(context(img),url=url))
    for row in report["rows"]:
        print("PSE_1090_CAPTION="+json.dumps({k:v for k,v in row.items() if k!="publisher"}|{"publisher":[{k:v for k,v in p.items() if k!="html"} for p in row["publisher"]]},ensure_ascii=False),flush=True)
finally:
    (out/"report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    print("PSE_1090_CAPTION_SUMMARY="+json.dumps({"rows":len(report["rows"]),"noCMSWrites":True}),flush=True)
