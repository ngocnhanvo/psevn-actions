"""Verify the exact #1090 publisher relocation candidate family, and page 207 for #237.
GET only; never upload CMS or substitute unrelated files."""
import hashlib, io, json, os, re, time, unicodedata, urllib.request, urllib.error, urllib.parse
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw
from bs4 import BeautifulSoup
if os.environ.get("GITHUB_REPOSITORY")!="ngocnhanvo/psevn-actions":raise RuntimeError("Wrong repository")
prior=json.loads(Path("inputs/dpm-discovery/report.json").read_text())
source=prior["rows"]["1090"]
pub="https://dpm.vn/tin-tuc/pvfcco-to-chuc-thanh-cong-chuong-trinh-hoi-mua-phu-my-va-cham-soc-khach-hang-khu-vuc-tay-nguyen-1172"
prefix="https://dpm.vn/static/upload/users/dpm.vn/2015/03-09/"
names=["NDK_0393.JPG","NDK_0441.JPG","5.JPG","1(1).JPG","2(1).JPG","3.JPG","4.JPG","6.JPG","7.JPG","8.jpg","DSC_2858.JPG","DSC_2888.JPG","DSC_2975(1).JPG","DSC_2986.JPG","DSC_2943(1).JPG","DSC_2951.JPG","DSC_2926.JPG","DSC_2914.JPG","DSC_2912.JPG","image001(254).jpg","DSC_3076(1).JPG","DSC_3071.JPG","DSC_3056.JPG","DSC_3040.JPG"]
def basename(url):return urllib.parse.unquote(urllib.parse.urlsplit(url).path.rsplit("/",1)[-1])
if source["id"]!=1090 or source["bodySha256"]!="ec7491b318f521d4b5c49ffc2dd13eca6d2df797691fa89e047915716a150e5a" or source["bodyChars"]!=5341 or source["sourceImages"]!=["http://www.dpm.vn/media/images/"+n for n in names]:raise RuntimeError("Pinned original source proof differs")
d=source["publisherDetails"][0]
if d["url"]!=pub or d["http"]!=200 or d["day"]!="2015-03-09" or d["matchedFilenames"]!=[prefix+n for n in names[:10]]:raise RuntimeError("Pinned official publisher listing differs")
state=json.loads(Path("docs/pse-legacy-migration-state.json").read_text())
if state["schema"]!="pse-legacy-article-migration-v1" or not state["backup_verified"] or state["articles"]["1090"]["status"]!="quarantined" or state["articles"]["1090"]["source_url"]!=source["source"]:raise RuntimeError("Unexpected source state")
out=Path("artifacts/pse-1090-relocated-proof");out.mkdir(parents=True,exist_ok=True)
report={"schema":"pse-1090-relocated-photo-proof-v1","sourceId":1090,"priorRun":44986504624,"priorArtifact":14739743038,"source":source,"publisher":pub,"originalRssEvidence":{"run":44910276016,"published":"2015-03-14T02:51:41+07:00"},"rows":[],"source237Page207":{},"readOnly":True,"noCMSWrites":True,"historicalUrlByteParityNotVerified":True,"stopped":False}
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None
opener=urllib.request.build_opener(NoRedirect)
def get(url,limit,accept):
    u=urllib.parse.urlsplit(url)
    if u.scheme!="https" or u.hostname!="dpm.vn" or u.username or u.password:raise RuntimeError("Wrong origin")
    time.sleep(1.5)
    try:
        req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (compatible; PSE migration verification)","Accept":accept})
        with opener.open(req,timeout=18) as rr:
            raw=rr.read(limit+1)
            if len(raw)>limit:raise RuntimeError("Response size exceeds bound")
            return rr.status,rr.headers.get_content_type(),raw
    except urllib.error.HTTPError as e:
        if e.code in (403,429,502,503,504):report["stopped"]=True
        return e.code,None,b""
    except (TimeoutError,urllib.error.URLError):
        report["stopped"]=True
        return None,None,b""
def fold(s):
    s=unicodedata.normalize("NFKD",s.lower().replace("đ","d"))
    return re.sub(r"[^a-z0-9]+"," ","".join(c for c in s if not unicodedata.combining(c))).strip()
try:
    # Inspect the only date-gap archive page that previous search did not reach.
    page="https://dpm.vn/danh-muc/world-1?page=207"
    code,typ,raw=get(page,4_500_000,"text/html")
    row={"url":page,"http":code,"matches":[],"titles":[]};report["source237Page207"]=row
    if code==200:
        soup=BeautifulSoup(raw,"html.parser")
        for a in soup.select("a[href]"):
            u=urllib.parse.urlsplit(urllib.parse.urljoin(page,a["href"]))
            if u.hostname!="dpm.vn" or not u.path.startswith("/tin-tuc/"):continue
            title=" ".join(a.stripped_strings)
            if not re.search(r"\d{2}/\d{2}/\d{4}",title):continue
            item={"url":u.geturl(),"title":title[:500]}
            if any(x["url"]==item["url"] for x in row["titles"]):continue
            row["titles"].append(item)
            if all(k in fold(title) for k in ["qua tet","lam dong","dak nong"]):row["matches"].append(item)
        for item in row["matches"][:2]:
            if report["stopped"]:break
            code,typ,raw=get(item["url"],4_500_000,"text/html")
            item["http"]=code;item["media"]=[]
            if code==200:
                soup=BeautifulSoup(raw,"html.parser")
                for n in soup.select("img[src],a[href]"):
                    u=urllib.parse.urlsplit(urllib.parse.urljoin(item["url"],n.get("src") or n.get("href")))
                    if u.hostname=="dpm.vn" and "/static/upload/" in u.path and re.search(r"\.(?:jpe?g|png)$",u.path,re.I) and u.geturl() not in item["media"]:item["media"].append(u.geturl())
    print("PSE_237_PAGE207="+json.dumps(row,ensure_ascii=False),flush=True)
    for i,n in enumerate(names):
        if report["stopped"]:break
        url=prefix+urllib.parse.quote(n,safe="()")
        r={"index":i,"filename":n,"originalUrl":source["sourceImages"][i],"publisherUrl":url,"linkedByPublisherArticle":i<10,"decoded":False}
        report["rows"].append(r)
        code,typ,raw=get(url,16_000_000,"image/jpeg,image/*;q=0.8")
        r.update(http=code,contentType=typ,bytes=len(raw))
        if code==200 and typ=="image/jpeg" and raw[:2]==b"\xff\xd8" and raw[-2:]==b"\xff\xd9":
            try:
                with Image.open(io.BytesIO(raw)) as im:
                    if im.format!="JPEG" or not 0<im.width*im.height<=40_000_000:raise RuntimeError("Unexpected image dimensions")
                    im.load()
                    exif=im.getexif()
                    try:original=exif.get_ifd(34665).get(36867) or exif.get(36867)
                    except Exception:original=exif.get(36867)
                    r.update(decoded=True,width=im.width,height=im.height,sha256=hashlib.sha256(raw).hexdigest(),dateTimeOriginal=str(original) if original else None,dateTime=str(exif.get(306)) if exif.get(306) else None)
                    (out/n).write_bytes(raw)
            except Exception as e:r["decodeError"]=type(e).__name__
        print("PSE_1090_RELOCATED_ROW="+json.dumps(r,ensure_ascii=False),flush=True)
    valid=[r for r in report["rows"] if r["decoded"]]
    for start in range(0,len(valid),12):
        batch=valid[start:start+12];sheet=Image.new("RGB",(1280,960),"white");draw=ImageDraw.Draw(sheet)
        for i,r in enumerate(batch):
            with Image.open(out/r["filename"]) as im:
                thumb=ImageOps.contain(ImageOps.exif_transpose(im).convert("RGB"),(306,274))
                x,y=i%4*320,i//4*320
                sheet.paste(thumb,(x+(320-thumb.width)//2,y+(280-thumb.height)//2))
                draw.text((x+8,y+282),r["filename"],fill="black")
                draw.text((x+8,y+299),str(r["dateTimeOriginal"] or "EXIF unavailable"),fill="black")
        sheet.save(out/("contact-sheet-"+str(start//12+1)+".jpg"),quality=90)
finally:
    valid=[r for r in report["rows"] if r["decoded"]]
    report["summary"]={"attempted":len(report["rows"]),"decoded":len(valid),"distinctSha256":len({r["sha256"] for r in valid}),"directArticleLinked":sum(r["linkedByPublisherArticle"] for r in valid),"exifDates":sorted({r["dateTimeOriginal"][:10] for r in valid if r["dateTimeOriginal"]}),"unrecovered":[n for n in names if n not in {r["filename"] for r in valid}],"stopped":report["stopped"],"source237Matches":len(report["source237Page207"].get("matches",[])),"noCMSWrites":True}
    (out/"report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    print("PSE_1090_RELOCATED_SUMMARY="+json.dumps(report["summary"],ensure_ascii=False),flush=True)
