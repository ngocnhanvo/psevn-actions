"""Replay the newly documented exact Wayback image capture once, and query the
one remaining unexamined original name. Read-only; no substitute images.
"""
import base64,hashlib,io,json,os,re,time,urllib.request,urllib.error,urllib.parse
from pathlib import Path
from PIL import Image
if os.environ.get("GITHUB_REPOSITORY")!="ngocnhanvo/psevn-actions":raise RuntimeError("Wrong repository")
prior=Path("inputs/pse1090")
proof=json.loads((prior/"report.json").read_text())
if proof["sourceId"]!=1090 or proof["summary"]["decoded"]!=24 or proof["source"]["bodySha256"]!="ec7491b318f521d4b5c49ffc2dd13eca6d2df797691fa89e047915716a150e5a":raise RuntimeError("Wrong pinned artifact")
names={r["filename"]:r for r in proof["rows"]}
def sha1(b):return base64.b32encode(hashlib.sha1(b).digest()).decode()
def sha256(b):return hashlib.sha256(b).hexdigest()
current=(prior/"7.JPG").read_bytes()
expected="XQIE5GRV6YMDJEWLPLRQHDPDXATBLTFH"
if sha256(current)!="9eb6571d5999862d2421e72fe505cbe86aa4d325a16cec2bfd182e5cf3cdcf55" or sha1(current)!="L3GI6EFBV5ENNYWZNIXLDB7TDL7RHUOE" or names["7.JPG"]["originalUrl"]!="http://www.dpm.vn/media/images/7.JPG" or names["8.jpg"]["originalUrl"]!="http://www.dpm.vn/media/images/8.jpg":raise RuntimeError("Artifact or source identity mismatch")
out=Path("artifacts/pse-1090-exact-2015-replay");out.mkdir(parents=True,exist_ok=True)
report={"sourceId":1090,"readOnly":True,"noCMSWrites":True,"priorArchiveRun":44987354006,"current7Sha1Base32":sha1(current),"archive7Digest":expected,"digestMatches":sha1(current)==expected,"index8":None,"replays":[],"stopped":False}
class NR(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None
opener=urllib.request.build_opener(NR)
def get(url,accept,cap,timeout):
    u=urllib.parse.urlsplit(url)
    if u.scheme!="https" or u.netloc!="web.archive.org":raise RuntimeError("Unexpected archive origin")
    time.sleep(2.5)
    try:
        req=urllib.request.Request(url,headers={"User-Agent":"PSE historical content migration verification","Accept":accept})
        with opener.open(req,timeout=timeout) as res:
            b=res.read(cap+1)
            if len(b)>cap:raise RuntimeError("Response too large")
            return res.status,res.headers.get_content_type(),b
    except urllib.error.HTTPError as e:
        if e.code in (403,429,502,503,504):report["stopped"]=True
        return e.code,None,b""
    except (TimeoutError,urllib.error.URLError) as e:
        report["stopped"]=True;report["networkError"]=type(e).__name__
        return None,None,b""
def replay(name,t,original,digest):
    if original!=names[name]["originalUrl"] or not re.fullmatch(r"\d{14}",t):raise RuntimeError("Wrong archived identity")
    code,mime,raw=get("https://web.archive.org/web/"+t+"id_/"+original,"image/jpeg,image/*;q=0.8",16_000_000,70)
    row={"filename":name,"capture":t,"original":original,"indexDigest":digest,"http":code,"mime":mime,"bytes":len(raw),"decoded":False}
    report["replays"].append(row)
    if code==200 and mime in ("image/jpeg","image/jpg","application/octet-stream") and raw[:2]==b"\xff\xd8" and raw[-2:]==b"\xff\xd9":
        with Image.open(io.BytesIO(raw)) as im:
            if im.format!="JPEG" or not 0<im.width*im.height<=40_000_000:raise RuntimeError("Invalid dimensions")
            im.load();row.update(decoded=True,sha256=sha256(raw),sha1Base32=sha1(raw),indexDigestMatch=sha1(raw)==digest,width=im.width,height=im.height)
            if row["indexDigestMatch"]:(out/(t+"-"+name)).write_bytes(raw)
    print("PSE_1090_EXACT_REPLAY="+json.dumps(row),flush=True)
try:
    # #8 was never attempted by previous stop-on-timeout workflow.
    query=urllib.parse.urlencode({"url":names["8.jpg"]["originalUrl"],"output":"json","from":"2015","to":"2019","fl":"timestamp,original,statuscode,mimetype,digest","filter":"statuscode:200","collapse":"digest","limit":"8"})
    code,mime,raw=get("https://web.archive.org/cdx/search/cdx?"+query,"application/json,text/plain;q=0.8",160000,22)
    try:idx=json.loads(raw) if code==200 else []
    except ValueError:idx=[]
    valid=[v for v in idx[1:] if isinstance(v,list) and len(v)==5 and re.fullmatch(r"\d{14}",str(v[0])) and v[0]>="20150308000000" and v[1]==names["8.jpg"]["originalUrl"] and str(v[2])=="200" and v[3] in ("image/jpeg","image/jpg","application/octet-stream")]
    report["index8"]={"http":code,"rows":valid}
    print("PSE_1090_INDEX8="+json.dumps(report["index8"]),flush=True)
    if not report["stopped"]:
        replay("7.JPG","20150419091957",names["7.JPG"]["originalUrl"],expected)
    if valid and not report["stopped"]:
        t,u,status,mime,digest=sorted(valid,key=lambda v:v[0])[0]
        replay("8.jpg",t,u,digest)
finally:
    (out/"report.json").write_text(json.dumps(report,indent=2)+"\n")
    print("PSE_1090_EXACT_REPLAY_SUMMARY="+json.dumps(report),flush=True)
