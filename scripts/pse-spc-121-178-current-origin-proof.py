"""Bounded official SPC domain relocation check for source article #121 and #178.
 GET only, exact original paths, no CMS writes; filename match alone is not proof.
"""
import hashlib,io,json,os,time,urllib.request,urllib.error,urllib.parse
from pathlib import Path
from PIL import Image,ImageOps,ImageDraw
from bs4 import BeautifulSoup
if os.environ.get("GITHUB_REPOSITORY")!="ngocnhanvo/psevn-actions":raise RuntimeError("Wrong repository")
state=json.loads(Path("docs/pse-legacy-migration-state.json").read_text())
assert state["schema"]=="pse-legacy-article-migration-v1" and state["backup_verified"]
spec={
 "121":{"title":"Nguyên nhân và biện pháp khắc phục bệnh vàng và rụng lá cà phê","names":["cafe2.jpg","cafe3.jpg","cafe4.jpg"]},
 "178":{"title":"Kỹ thuật trồng và thâm canh điều","names":["kythuat1.jpg","kythuat2.jpg","kythuat3.jpg","kythuat4.jpg","kythuat55.jpg"]}
}
old="http://www.spchcmc.com.vn/upload/images/vn/TTNN/"
new="https://www.spchcmc.vn/upload/images/vn/TTNN/"
out=Path("artifacts/pse-spc-current-origin-proof");out.mkdir(parents=True,exist_ok=True)
report={"readOnly":True,"noCMSWrites":True,"noBuild":True,"publisherHome":"https://www.spchcmc.vn/VN/Default.aspx","sources":{},"rows":[],"stopped":False}
class NR(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None
opener=urllib.request.build_opener(NR)
def get(url,accept,cap):
    u=urllib.parse.urlsplit(url)
    if u.scheme!="https" or u.netloc not in ("www.pse.vn","www.spchcmc.vn","spchcmc.vn") or u.username or u.password:raise RuntimeError("Unexpected URL")
    time.sleep(2)
    try:
        with opener.open(urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (compatible; PSE historical source verification)","Accept":accept}),timeout=22) as r:
            b=r.read(cap+1)
            if len(b)>cap:raise RuntimeError("Response size exceeds bound")
            return r.status,r.headers.get_content_type(),b
    except urllib.error.HTTPError as e:
        if e.code in (403,429,502,503,504):report["stopped"]=True
        return e.code,None,b""
    except (TimeoutError,urllib.error.URLError):
        report["stopped"]=True;return None,None,b""
try:
    for sid,t in spec.items():
        if report["stopped"]:break
        a=state["articles"][sid]
        url=a["source_url"]
        if a["status"]!="quarantined" or not url.startswith("https://www.pse.vn/") or "/"+sid+"-" not in url:raise RuntimeError("Unexpected source identity")
        code,mime,raw=get(url,"text/html",4_500_000)
        r={"http":code,"source":url};report["sources"][sid]=r
        if code!=200:continue
        soup=BeautifulSoup(raw,"html.parser")
        for x in soup.select("script,style,noscript,.extranews_box,.extranews_separator"):x.decompose()
        h=soup.select_one(".item-page h1,.item-page h2,h1")
        root=soup.select_one("[itemprop=articleBody]")
        if h is None or root is None:raise RuntimeError("Missing article")
        title=" ".join(h.stripped_strings);body=" ".join(root.stripped_strings)
        imgs=[urllib.parse.urljoin(url,n["src"]) for n in root.select("img[src]")]
        r.update(title=title,bodyChars=len(body),bodySha256=hashlib.sha256(body.encode()).hexdigest(),images=imgs)
        if title!=t["title"] or len(body)<500 or imgs!=[old+n for n in t["names"]]:raise RuntimeError("Source content or image identity changed")
    print("PSE_SPC_SOURCE="+json.dumps(report["sources"],ensure_ascii=False),flush=True)
    if len(report["sources"])!=2 or any(not x.get("bodySha256") for x in report["sources"].values()):raise RuntimeError("Incomplete source proof")
    code,mime,raw=get(report["publisherHome"],"text/html",4_500_000)
    report["publisherHTTP"]=code
    if code!=200:raise RuntimeError("Official relocated publisher unavailable")
    soup=BeautifulSoup(raw,"html.parser")
    if "bảo vệ thực vật sài gòn" not in " ".join(soup.stripped_strings).lower():raise RuntimeError("Official publisher identity not established")
    for sid,t in spec.items():
        for name in t["names"]:
            if report["stopped"]:break
            url=new+name
            code,mime,raw=get(url,"image/jpeg,image/*;q=0.8",16_000_000)
            r={"sourceId":sid,"filename":name,"sourceUrl":old+name,"candidate":url,"http":code,"mime":mime,"bytes":len(raw),"decoded":False};report["rows"].append(r)
            if code==200 and mime=="image/jpeg" and raw[:2]==b"\xff\xd8" and raw[-2:]==b"\xff\xd9":
                with Image.open(io.BytesIO(raw)) as im:
                    if im.format!="JPEG" or not 0<im.width*im.height<=40_000_000:raise RuntimeError("Unexpected JPEG")
                    im.load();exif=im.getexif()
                    try:dt=exif.get_ifd(34665).get(36867) or exif.get(36867)
                    except Exception:dt=exif.get(36867)
                    r.update(decoded=True,width=im.width,height=im.height,sha256=hashlib.sha256(raw).hexdigest(),dateTimeOriginal=str(dt) if dt else None)
                    (out/(sid+"-"+name)).write_bytes(raw)
            print("PSE_SPC_RELOCATED_ROW="+json.dumps(r,ensure_ascii=False),flush=True)
finally:
    report["summary"]={"attempted":len(report["rows"]),"decoded":sum(x["decoded"] for x in report["rows"]),"stopped":report["stopped"],"noCMSWrites":True}
    (out/"report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    print("PSE_SPC_SUMMARY="+json.dumps(report["summary"]),flush=True)
