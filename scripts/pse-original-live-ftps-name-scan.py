#!/usr/bin/env python3
"""Bounded read-only ORIGINAL Joomla FTPS filename inventory for SQL image references.
Matching filename is NOT proof of original image identity. No FTP or WP writes.
"""
import collections,hashlib,importlib.util,json,os,re,sys,time,unicodedata
from pathlib import Path
from urllib.parse import urlsplit,unquote
spec=importlib.util.spec_from_file_location("ftp",Path("scripts/pse-original-ftp-readonly.py"))
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
ROOT="/domains/pse.vn/public_html"
DOC=Path("docs/source/pse-original-public-articles-11-2026-11-22.json")
OUT=Path("artifacts/pse-original-live-ftps-name-scan/report.json")
IDS=[114,121,127,178,186,196,202,237,341,382,1090]
def exact(s):return unicodedata.normalize("NFC",s).casefold()
def similar(s):
 s=unicodedata.normalize("NFKD",exact(s)).replace("đ","d")
 return re.sub("[^a-z0-9]","", "".join(c for c in s if not unicodedata.combining(c)))
def images():
 doc=json.loads(DOC.read_text(encoding="utf8"))
 if doc.get("schema")!="pse-original-joomla-selected-public-articles-v1" or doc.get("source_ids")!=IDS or len(doc.get("entries",[]))!=11:
  raise ValueError("public_fixture_changed")
 rows=[]
 for item in doc["entries"]:
  for order,url in enumerate(item["inline_image_src"],1):
   parsed=urlsplit(url);name=unquote(parsed.path.split("/")[-1])
   if not name or len(name)>200 or "/" in name or chr(92) in name or not name.lower().endswith((".jpg",".jpeg",".png",".gif",".webp")):
    raise ValueError("untrusted_public_image")
   rows.append(dict(id=item["source_id"],order=order,key=exact(name),fuzzy=similar(name),own=parsed.hostname in (None,"pse.vn","www.pse.vn"),sourcepath=exact(parsed.path.lstrip("/")),matches=[]))
 if len(rows)!=59:raise ValueError("public_image_count_changed")
 return rows
def inspect(ftp,now=time.monotonic):
 listing=ftp.listdir(ROOT);roots={n.casefold():n for n,t,_ in listing if t=="dir"};markers={n.casefold() for n,_,_ in listing}
 if not all(x in markers for x in ("configuration.php","administrator","components","images")):
  raise ValueError("source_root_wrong")
 records=images();byname=collections.defaultdict(list);byfuzzy=collections.defaultdict(list)
 for r in records:byname[r["key"]].append(r);byfuzzy[r["fuzzy"]].append(r)
 q=collections.deque([(roots[k],0) for k in ("images","media","backup","backups") if k in roots])
 seen=set();error=collections.Counter();stats=collections.Counter();start=now()
 while q:
  if len(seen)>=900 or stats["entries"]>=90000 or now()-start>480:
   stats["bounded_stop"]+=1;break
  rel,depth=q.popleft()
  if rel in seen:continue
  seen.add(rel)
  try:entries=ftp.listdir(ROOT+"/"+rel)
  except Exception as e:error[e.__class__.__name__]+=1;continue
  stats["directories"]+=1;stats["entries"]+=len(entries)
  for n,t,size in entries:
   if not n or n in (".","..") or "/" in n or chr(92) in n or chr(0) in n:continue
   if t=="dir":
    if depth<10:q.append((rel+"/"+n,depth+1))
    else:stats["depth_limited"]+=1
   elif t=="file":
    stats["files"]+=1
    if exact(n).endswith((".jpg",".jpeg",".png",".gif",".webp")):
     stats["media_files"]+=1
     matching=byname.get(exact(n),[])
     typ="EXACT_BASENAME"
     if not matching:matching=byfuzzy.get(similar(n),[]);typ="SIMILAR_BASENAME_ONLY"
     for r in matching:
      if len(r["matches"])>=12:stats["candidate_overflow"]+=1;continue
      path=rel+"/"+n
      r["matches"].append(dict(type=typ,path_sha256=hashlib.sha256(path.encode()).hexdigest(),
       bytes=size if 0<size<=20*1024*1024 else None,
       source_path_exact=r["own"] and exact(path)==r["sourcepath"]))
      stats["filename_matches"]+=1
 return dict(schema="pse-original-live-ftps-name-scan-v1",original_images=59,
  directories=stats["directories"],entries=stats["entries"],media_files=stats["media_files"],
  truncated=bool(q or error or stats["depth_limited"] or stats["candidate_overflow"] or stats["bounded_stop"]),
  remaining_dirs=len(q),directory_errors=dict(error),filename_matches=stats["filename_matches"],
  source_path_exact=sum(any(m["source_path_exact"] for m in r["matches"]) for r in records),
  occurrences_with_candidates=sum(bool(r["matches"]) for r in records),
  images=[dict(id=r["id"],order=r["order"],own_site=r["own"],matches=r["matches"]) for r in records],
  no_ftp_writes=True,no_wp_writes=True,no_media_downloads=True,image_bytes_verified=False)
def main():
 if os.environ.get("GITHUB_REPOSITORY")!="ngocnhanvo/psevn-actions":raise ValueError("wrong_repo")
 if base.env("PSE_SOURCE_FTP_PROTOCOL")!="ftps":raise ValueError("ftps_only")
 host,port=base.validated_host("ftps");ftp=None
 try:
  ftp=base.FTPS(host,port,base.env("PSE_SOURCE_FTP_USERNAME"),base.env("PSE_SOURCE_FTP_PASSWORD"))
  r=inspect(ftp);OUT.parent.mkdir(parents=True,exist_ok=True)
  OUT.write_text(json.dumps(r,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
  print("PSE_ORIGINAL_LIVE_FTPS_NAME_AUDIT="+json.dumps({k:v for k,v in r.items() if k!="images"},ensure_ascii=False),flush=True)
 finally:
  if ftp:ftp.close()
if __name__=="__main__":
 try:main()
 except Exception as e:
  safe={"wrong_repo","ftps_only","source_root_wrong","public_fixture_changed","untrusted_public_image","public_image_count_changed"}
  print("PSE_ORIGINAL_LIVE_FTPS_NAME_AUDIT_ERROR="+(str(e) if str(e) in safe else e.__class__.__name__),file=sys.stderr)
  sys.exit(1)
