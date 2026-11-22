"""Target ONLY the seven ambiguous original JPEGs skipped by prior >15-image guard.
No CMS writes; exact historical URL capture verification and visual review artifacts.
"""
import hashlib,io,json,os,re,time,urllib.request,urllib.error,urllib.parse
from pathlib import Path
from PIL import Image,ImageOps,ImageDraw
if os.environ.get("GITHUB_REPOSITORY")!="ngocnhanvo/psevn-actions":raise RuntimeError("Wrong repository")
proof=json.loads(Path("inputs/pse1090/report.json").read_text())
names=["5.JPG","2(1).JPG","3.JPG","4.JPG","6.JPG","7.JPG","8.jpg"]
if proof["sourceId"]!=1090 or proof["priorArtifact"]!=14739743038 or proof["source"]["bodySha256"]!="ec7491b318f521d4b5c49ffc2dd13eca6d2df797691fa89e047915716a150e5a" or proof["summary"]["decoded"]!=24:raise RuntimeError("Unexpected pinned source proof")
rows=[x for x in proof["rows"] if x["filename"] in names]
if [x["filename"] for x in rows]!=names or any(x["originalUrl"]!="http://www.dpm.vn/media/images/"+x["filename"] for x in rows):raise RuntimeError("Exact source URLs differ")
out=Path("artifacts/pse-1090-ambiguous-original-archive-proof");out.mkdir(parents=True,exist_ok=True)
report={"schema":"pse-1090-ambiguous-exact-archive-v1","sourceId":1090,"priorRun":44986757822,"priorArtifact":14740132540,"rows":[],"stopped":False,"readOnly":True,"noCMSWrites":True}
class NR(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None
opener=urllib.request.build_opener(NR)
def get(url,accept,cap):
    if urllib.parse.urlsplit(url).netloc!="web.archive.org" or not url.startswith("https://"):raise RuntimeError("Untrusted archive origin")
    time.sleep(2.2)
    try:
        req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (compatible; historical article source verification)","Accept":accept})
        with opener.open(req,timeout=22) as r:
            raw=r.read(cap+1)
            if len(raw)>cap:raise RuntimeError("Bound exceeded")
            return r.status,r.headers.get_content_type(),raw
    except urllib.error.HTTPError as e:
        if e.code in (403,429,502,503,504):report["stopped"]=True
        return e.code,None,b""
    except (TimeoutError,urllib.error.URLError):
        report["stopped"]=True
        return None,None,b""
def exact(a,b):
    aa,bb=urllib.parse.urlsplit(a),urllib.parse.urlsplit(b)
    return aa.scheme==bb.scheme and aa.netloc==bb.netloc and urllib.parse.unquote(aa.path)==urllib.parse.unquote(bb.path) and not aa.query and not bb.query and not aa.fragment and not bb.fragment
try:
    for x in rows:
        if report["stopped"]:break
        row={"filename":x["filename"],"originalUrl":x["originalUrl"],"relocatedSha256":x["sha256"],"captures":[]};report["rows"].append(row)
        query=urllib.parse.urlencode({"url":x["originalUrl"],"output":"json","from":"2015","to":"2019","fl":"timestamp,original,statuscode,mimetype,digest","filter":"statuscode:200","collapse":"digest","limit":"8"})
        code,typ,raw=get("https://web.archive.org/cdx/search/cdx?"+query,"application/json,text/plain;q=0.8",160000)
        row["indexHTTP"]=code
        if code==200:
            try:idx=json.loads(raw)
            except ValueError:idx=None
            row["indexRows"]=idx if isinstance(idx,list) else []
            valid=[q for q in row["indexRows"][1:] if len(q)==5 and re.fullmatch(r"\d{14}",str(q[0])) and q[0]>="20150308000000" and exact(q[1],x["originalUrl"]) and str(q[2])=="200" and q[3] in ("image/jpeg","image/jpg","application/octet-stream")]
            valid.sort(key=lambda q:q[0])
            for t,original,status,mime,digest in valid[:2]:
                if report["stopped"]:break
                u="https://web.archive.org/web/"+t+"id_/"+urllib.parse.quote(original,safe=":/%()")
                code,typ,raw=get(u,"image/jpeg,image/*;q=0.8",16_000_000)
                c={"capture":t,"original":original,"indexDigest":digest,"http":code,"mime":typ,"bytes":len(raw),"decoded":False};row["captures"].append(c)
                if code==200 and typ in ("image/jpeg","image/jpg","application/octet-stream") and raw[:2]==b"\xff\xd8" and raw[-2:]==b"\xff\xd9":
                    try:
                        with Image.open(io.BytesIO(raw)) as im:
                            if im.format!="JPEG" or not 0<im.width*im.height<=40_000_000:raise RuntimeError("Unexpected dimensions")
                            im.load();exif=im.getexif()
                            try:dt=exif.get_ifd(34665).get(36867) or exif.get(36867)
                            except Exception:dt=exif.get(36867)
                            sha=hashlib.sha256(raw).hexdigest()
                            p=t+"-"+x["filename"]
                            c.update(decoded=True,sha256=sha,width=im.width,height=im.height,dateTimeOriginal=str(dt) if dt else None,equalsRelocated=sha==x["sha256"],file=p)
                            (out/p).write_bytes(raw)
                    except Exception as e:c["decodeError"]=type(e).__name__
        print("PSE_1090_AMBIGUOUS_ARCHIVE_ROW="+json.dumps(row,ensure_ascii=False),flush=True)
    found=[(r,c) for r in report["rows"] for c in r["captures"] if c["decoded"]]
    for start in range(0,len(found),8):
        sheet=Image.new("RGB",(1280,720),"white");draw=ImageDraw.Draw(sheet)
        for i,(row,c) in enumerate(found[start:start+8]):
            with Image.open(out/c["file"]) as im:
                thumb=ImageOps.contain(ImageOps.exif_transpose(im).convert("RGB"),(306,310));x,y=i%4*320,i//4*360
                sheet.paste(thumb,(x+(320-thumb.width)//2,y+(320-thumb.height)//2))
                draw.text((x+6,y+322),c["file"],fill="black")
                draw.text((x+6,y+338),str(c["dateTimeOriginal"] or "No EXIF"),fill="black")
        sheet.save(out/("contact-sheet-"+str(start//8+1)+".jpg"),quality=90)
finally:
    report["summary"]={"requested":7,"attempted":len(report["rows"]),"exactCaptureFiles":sum(c["decoded"] for r in report["rows"] for c in r["captures"]),"recoveredNames":[r["filename"] for r in report["rows"] if any(c["decoded"] and not c["equalsRelocated"] for c in r["captures"])],"stopped":report["stopped"],"noCMSWrites":True}
    (out/"report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    print("PSE_1090_AMBIGUOUS_ARCHIVE_SUMMARY="+json.dumps(report["summary"],ensure_ascii=False),flush=True)
