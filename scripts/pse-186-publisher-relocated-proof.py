"""Exact official Dan Viet article provenance and two publisher-linked JPEG URLs.
Bounded public GET only. No CMS writes, no build.
"""
import base64,hashlib,io,json,os,re,time,urllib.error,urllib.parse,urllib.request
from pathlib import Path
from difflib import SequenceMatcher
from bs4 import BeautifulSoup
from PIL import Image
if os.environ.get("GITHUB_REPOSITORY")!="ngocnhanvo/psevn-actions":raise RuntimeError("Wrong repo")
source="https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/186-npk-phu-my-se-day-lui-hang-kem-chat-luong.html"
publisher="https://danviet.vn/npk-phu-my-se-day-lui-hang-kem-chat-luong-777764602-d214903.html"
title="NPK Phú Mỹ sẽ đẩy lùi hàng kém chất lượng"
expected=["http://images.danviet.vn/CMSImage/Resources/Uploaded/baogiay2/162_13_bon-phan-NPK-cho-lua.jpg","http://images.danviet.vn/CMSImage/Resources/Uploaded/baogiay2/162_13_ong-Nguyen-Hong-Vinh.jpg"]
relocated=["https://danviet.ex-cdn.com/files/f1/upload/3-2011/images/2011-07-08/1436323923-162_13_bon-phan-npk-cho-lua.jpg","https://danviet.ex-cdn.com/files/f1/upload/3-2011/images/2011-07-08/1436323924-162_13_ong-nguyen-hong-vinh.jpg"]
state=json.loads(Path("docs/pse-legacy-migration-state.json").read_text())
if state["schema"]!="pse-legacy-article-migration-v1" or not state["backup_verified"] or state["articles"]["186"]["status"]!="quarantined" or state["articles"]["186"]["source_url"]!=source:raise RuntimeError("Unexpected source identity")
out=Path("artifacts/pse-186-publisher-relocated-proof");out.mkdir(parents=True,exist_ok=True)
report={"sourceId":186,"source":source,"publisher":publisher,"readOnly":True,"noCMSWrites":True,"noBuild":True,"stopped":False,"rows":[]}
class NR(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None
opener=urllib.request.build_opener(NR)
def get(url,accept,cap,timeout=22):
    u=urllib.parse.urlsplit(url)
    if u.scheme!="https" or u.netloc not in ("www.pse.vn","danviet.vn","danviet.ex-cdn.com","web.archive.org"):raise RuntimeError("Unexpected host")
    time.sleep(2)
    try:
        with opener.open(urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (compatible; historical migration verification)","Accept":accept}),timeout=timeout) as r:
            b=r.read(cap+1)
            if len(b)>cap:raise RuntimeError("Response size exceeds bound")
            return r.status,r.headers.get_content_type(),b
    except urllib.error.HTTPError as e:
        if e.code in (403,429,502,503,504):report["stopped"]=True
        return e.code,None,b""
    except (TimeoutError,urllib.error.URLError) as e:
        report["stopped"]=True;report["networkError"]=type(e).__name__
        return None,None,b""
def txt(n):return " ".join(n.stripped_strings) if n else ""
def filename(u):return urllib.parse.unquote(urllib.parse.urlsplit(u).path.rsplit("/",1)[-1])
def jpeg(row,raw,filename,index_digest=None):
    if row["http"]!=200 or row["mime"] not in ("image/jpeg","image/jpg","application/octet-stream") or raw[:2]!=b"\xff\xd8" or raw[-2:]!=b"\xff\xd9":return
    with Image.open(io.BytesIO(raw)) as im:
        if im.format!="JPEG" or not 0<im.width*im.height<=40_000_000:raise RuntimeError("Unexpected JPEG format or dimensions")
        im.load();h=base64.b32encode(hashlib.sha1(raw).digest()).decode()
        row.update(decoded=True,width=im.width,height=im.height,sha256=hashlib.sha256(raw).hexdigest(),sha1Base32=h,indexDigestMatch=h==index_digest if index_digest else None)
        if not index_digest or h==index_digest:(out/filename).write_bytes(raw)
try:
    texts={}
    for role,url in (("sourceArticle",source),("publisherArticle",publisher)):
        if report["stopped"]:break
        code,mime,raw=get(url,"text/html",6_000_000)
        row={"http":code,"title":None,"bodyChars":0,"images":[]};report[role]=row
        if code!=200:continue
        soup=BeautifulSoup(raw,"html.parser")
        for n in soup.select("script,style,noscript,.extranews_box,.extranews_separator"):n.decompose()
        h=soup.select_one(".item-page h1,.item-page h2,h1") if role=="sourceArticle" else soup.select_one("h1")
        row["title"]=txt(h)
        if role=="sourceArticle":
            root=soup.select_one("[itemprop=articleBody]")
        else:
            # Identify the smallest common block containing both exact linked URLs.
            imgs=[n for n in soup.select("img") if any(urllib.parse.urljoin(url,str(n.get(a,"")))==v for a in ("src","data-src","data-original") for v in relocated)]
            root=None
            if len(imgs)>=2:
                for parent in imgs[0].parents:
                    if imgs[1] in list(parent.descendants) and "Lưu Phan" in txt(parent) and "Sau rất nhiều năm" in txt(parent):
                        root=parent;break
            row["linkedMedia"]=[v for v in relocated if any(urllib.parse.urljoin(url,str(n.get(a,"")))==v for n in soup.select("img") for a in ("src","data-src","data-original"))]
        if root is not None:
            text=txt(root);texts[role]=text;row["bodyChars"]=len(text);row["bodySha256"]=hashlib.sha256(text.encode()).hexdigest()
            row["images"]=[urllib.parse.urljoin(url,n.get("src") or n.get("data-src") or "") for n in root.select("img")]
        if role=="sourceArticle" and (row["title"]!=title or row["images"]!=expected or row["bodyChars"]<500):raise RuntimeError("Original body/image identity mismatch")
    if len(texts)==2:report["bodySimilarity"]=round(SequenceMatcher(None,texts["sourceArticle"],texts["publisherArticle"],autojunk=False).ratio(),4)
    print("PSE_186_PUBLISHER_ARTICLE="+json.dumps({k:v for k,v in report.items() if k!="rows"},ensure_ascii=False),flush=True)
    if report.get("sourceArticle",{}).get("title")!=title or report.get("publisherArticle",{}).get("title")!=title or report.get("publisherArticle",{}).get("linkedMedia")!=relocated:raise RuntimeError("Exact linked publisher proof not established")
    for i,url in enumerate(relocated):
        if report["stopped"]:break
        if not filename(url).lower().endswith("-"+filename(expected[i]).lower()):raise RuntimeError("Publisher filename identity differs")
        row={"index":i,"original":expected[i],"publisherMedia":url,"archive":[]};report["rows"].append(row)
        code,mime,raw=get(url,"image/jpeg,image/*;q=0.8",16_000_000)
        direct={"http":code,"mime":mime,"bytes":len(raw),"decoded":False};row["direct"]=direct;jpeg(direct,raw,"relocated-"+str(i)+".jpg")
        if not direct["decoded"] and not report["stopped"]:
            query=urllib.parse.urlencode({"url":url,"output":"json","fl":"timestamp,original,statuscode,mimetype,digest","filter":"statuscode:200","collapse":"digest","limit":"6"})
            code,mime,raw=get("https://web.archive.org/cdx/search/cdx?"+query,"application/json,text/plain;q=0.8",160000)
            try:idx=json.loads(raw) if code==200 else []
            except ValueError:idx=[]
            row["indexHTTP"]=code;row["indexRows"]=idx
            for t,original,status,kind,digest in [v for v in idx[1:] if len(v)==5 and re.fullmatch(r"\d{14}",str(v[0])) and v[1]==url and str(v[2])=="200" and v[3] in ("image/jpeg","image/jpg","application/octet-stream")][:1]:
                if report["stopped"]:break
                code,mime,raw=get("https://web.archive.org/web/"+t+"id_/"+original,"image/jpeg,image/*;q=0.8",16_000_000,70)
                c={"capture":t,"indexDigest":digest,"http":code,"mime":mime,"bytes":len(raw),"decoded":False};row["archive"].append(c)
                jpeg(c,raw,"archive-"+str(i)+".jpg",digest)
        print("PSE_186_PUBLISHER_IMAGE="+json.dumps(row,ensure_ascii=False),flush=True)
finally:
    report["summary"]={"attempted":len(report["rows"]),"verifiedPublisherMedia":sum(r.get("direct",{}).get("decoded") or any(c.get("indexDigestMatch") for c in r["archive"]) for r in report["rows"]),"stopped":report["stopped"],"noCMSWrites":True}
    (out/"report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    print("PSE_186_PUBLISHER_SUMMARY="+json.dumps(report["summary"]),flush=True)
