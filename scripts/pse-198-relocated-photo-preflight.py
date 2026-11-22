"""Read-only, exact artifact reuse: verify decoded images and Joomla article provenance."""
import hashlib, io, json, os, re, urllib.request, urllib.parse
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ExifTags
from bs4 import BeautifulSoup
from difflib import SequenceMatcher

if os.environ.get("GITHUB_REPOSITORY") != "ngocnhanvo/psevn-actions":
    raise RuntimeError("Wrong repository")
state=json.loads(Path("docs/pse-legacy-migration-state.json").read_text())
article=state["articles"]["198"]
source="https://www.pse.vn/tin-tuc-su-kien/tin-cong-ty/tin-tong-hop/198-nha-may-dam-phu-my-don-tan-san-pham-ure-thu-5-trieu.html"
publisher="https://dpm.vn/tin-tuc/nha-may-dam-phu-my-don-tan-san-pham-ure-thu-5-trieu-1954"
if state["schema"]!="pse-legacy-article-migration-v1" or not state["backup_verified"] or article["status"]!="quarantined" or article["source_url"]!=source:
    raise RuntimeError("Unexpected Joomla identity")
prior=Path("inputs/pse198")
manifest=json.loads((prior/"report.json").read_text())
files=["110814 "+x+".jpg" for x in ("E1","E2","E3","E4","E5","E5_1","E6","E7","E8","E9")]
if manifest["sourceId"]!=198 or manifest["publisher"]!=publisher or manifest["summary"]["validJpeg"]!=10 or [x["filename"] for x in manifest["rows"]]!=files:
    raise RuntimeError("Prior artifact identity or coverage mismatch")
out=Path("artifacts/pse-198-relocated-preflight")
out.mkdir(parents=True,exist_ok=True)
report={"schema":"pse-198-relocated-photo-preflight-v1","sourceId":198,"priorRun":44983863130,"priorArtifact":14739271441,"originalRssEvidence":{"run":44910276016,"published":"2011-08-15T02:32:18+07:00"},"images":[],"source":{},"publisher":{},"readOnly":True,"noCMSWrites":True,"noBuild":True,"originalByteParityNotVerified":True}
sheet=Image.new("RGB",(1200,900),"white")
draw=ImageDraw.Draw(sheet)
try:
    for i,row in enumerate(manifest["rows"]):
        p=prior/row["filename"]
        raw=p.read_bytes()
        sha=hashlib.sha256(raw).hexdigest()
        if sha!=row["sha256"] or len(raw)!=row["bytes"]:
            raise RuntimeError("Artifact SHA/length mismatch "+p.name)
        with Image.open(io.BytesIO(raw)) as im:
            if im.format!="JPEG" or im.width*im.height>40_000_000:
                raise RuntimeError("Invalid JPEG dimensions/format")
            exif=im.getexif()
            try:
                original=exif.get_ifd(34665).get(36867) or exif.get(36867)
            except Exception:
                original=exif.get(36867)
            im.load()
            report["images"].append({"filename":p.name,"sha256":sha,"width":im.width,"height":im.height,"dateTimeOriginal":str(original) if original else None,"dateTime":str(exif.get(306)) if exif.get(306) else None,"linkedByPublisherArticle":row["linkedByPublisherArticle"],"decoded":True})
            thumb=ImageOps.contain(ImageOps.exif_transpose(im).convert("RGB"),(224,388))
            col,rr=i%5,i//5
            sheet.paste(thumb,(col*240+(240-thumb.width)//2,rr*450+(405-thumb.height)//2))
            draw.text((col*240+12,rr*450+410),p.name,fill="black")
    if len({r["sha256"] for r in report["images"]})!=10:
        raise RuntimeError("Unexpected duplicate image bytes")
    sheet.save(out/"contact-sheet.jpg",quality=90)
    def get(url):
        # Only two exact approved article URLs; reject redirects to other hosts.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self,*args,**kwargs):
                return None
        if url not in (source,publisher): raise RuntimeError("Unexpected URL")
        req=urllib.request.Request(url,headers={"User-Agent":"PSE migration source verification/1.0","Accept":"text/html"})
        with urllib.request.build_opener(NoRedirect).open(req,timeout=22) as response:
            raw=response.read(4_000_001)
            if len(raw)>4_000_000: raise RuntimeError("Article too large")
            return raw
    texts={}
    for role,url in [("source",source),("publisher",publisher)]:
        item={"url":url,"status":"UNAVAILABLE"}
        report[role]=item
        try:
            raw=get(url)
            soup=BeautifulSoup(raw,"html.parser")
            for t in soup.select("script,style,noscript,.extranews_box,.extranews_separator"):t.decompose()
            if role=="source":
                root=soup.select_one('[itemprop="articleBody"]')
                heading=soup.select_one(".item-page h1,.item-page h2,h1")
            else:
                root=soup.select_one('[itemprop="articleBody"],article,.news-detail,.detail-news,.content-detail,.news-content')
                heading=soup.select_one("h1")
            title=" ".join(heading.stripped_strings) if heading else ""
            if not title and soup.title:title=" ".join(soup.title.stripped_strings)
            item["title"]=title[:240]
            item["titleMatched"]="nhà máy đạm phú mỹ đón tấn sản phẩm urê thứ 5 triệu" in title.lower()
            if root is None:
                item["status"]="BODY_SELECTOR_UNPROVEN"
                continue
            text=" ".join(root.stripped_strings)
            item["bodyChars"]=len(text)
            item["bodySha256"]=hashlib.sha256(text.encode()).hexdigest()
            item["imageNames"]=[urllib.parse.unquote(urllib.parse.urlparse(urllib.parse.urljoin(url,t.get("src",""))).path.rsplit("/",1)[-1]) for t in root.select("img[src]")]
            item["exactExpectedImageOrder"]=[x for x in item["imageNames"] if x in files]==files
            item["status"]="PARSED" if item["titleMatched"] and len(text)>200 and not re.search(r"Подробнее на сайте|ducauto\.ru|sedoauto\.ru|miratalk\.ru",text,re.I) else "BODY_NOT_PROVEN"
            if item["status"]=="PARSED":
                texts[role]=text
        except Exception as e:
            item["error"]=type(e).__name__
            if hasattr(e,"code"):item["http"]=e.code
    if len(texts)==2:
        report["bodySimilarity"]=round(SequenceMatcher(None,texts["source"],texts["publisher"],autojunk=True).ratio(),4)
finally:
    report["summary"]={"decoded":len(report["images"]),"distinctSha256":len({r["sha256"] for r in report["images"]}),"exifDates":sorted({r["dateTimeOriginal"][:10] for r in report["images"] if r["dateTimeOriginal"]}),"source":report["source"],"publisher":report["publisher"],"bodySimilarity":report.get("bodySimilarity"),"dateProvenFromPriorRss":True,"originalByteParityNotVerified":True,"noCMSWrites":True}
    (out/"report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    print("PSE_198_RELOCATED_PREFLIGHT_SUMMARY="+json.dumps(report["summary"],ensure_ascii=False))
