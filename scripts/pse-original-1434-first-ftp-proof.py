#!/usr/bin/env python3
"""Read one exact original PSE-owned #1434 image from old source FTPS, without writes."""
import hashlib, importlib.util, json, os, sys, unicodedata
from pathlib import Path
mod=importlib.util.spec_from_file_location("ftp",Path("scripts/pse-original-ftp-readonly.py"))
base=importlib.util.module_from_spec(mod);mod.loader.exec_module(base)
ROOT="/domains/pse.vn/public_html"
IMAGES=ROOT+"/images"
PARENT="23_mẫu_sản_phẩm_mới"
ORIGINAL="6-05372.png"
OUT=Path("artifacts/pse-original-1434-first-ftp")
def nfc(s):return unicodedata.normalize("NFC",s).casefold()
def variants(s):
    values=[s]
    for coding in ("latin1","cp1252"):
        try:
            decoded=s.encode(coding).decode("utf-8")
            if decoded not in values:values.append(decoded)
        except (UnicodeError,LookupError):pass
    return values
def main():
    if os.getenv("GITHUB_REPOSITORY")!="ngocnhanvo/psevn-actions":
        raise ValueError("wrong_repository")
    if base.env("PSE_SOURCE_FTP_PROTOCOL")!="ftps":
        raise ValueError("ftps_required")
    host,port=base.validated_host("ftps")
    conn=None
    result={"schema":"pse-original-1434-pse-owned-first-png-source-ftps-v1",
        "sourceOriginal":"pse.vn","sourceUrlPath":"/images/23_mẫu_sản_phẩm_mới/6-05372.png",
        "expectedOriginalImage":"6-05372.png","readOnly":True,
        "noFTPWrites":True,"noWordPressWrites":True,"noBuild":True,
        "verifiedOriginalByteIdentity":False,"result":"NOT_TESTED",
        "sourceFolderOnly":True,"sourceImageArtifacts":[]}
    try:
        conn=base.FTPS(host,port,base.env("PSE_SOURCE_FTP_USERNAME"),base.env("PSE_SOURCE_FTP_PASSWORD"))
        root=conn.listdir(ROOT)
        names={x.casefold() for x,typ,_ in root if typ=="dir"}
        if not {"administrator","components","images"}.issubset(names):
            raise ValueError("source_joomla_root_mismatch")
        candidates=[x for x,typ,_ in conn.listdir(IMAGES) if typ=="dir" and
            any(nfc(v)==nfc(PARENT) for v in variants(x))]
        result["exactFolderCandidateCount"]=len(candidates)
        if len(candidates)!=1:
            result["result"]="MISSING_OR_AMBIGUOUS_SOURCE_FOLDER"
            return
        dirname=candidates[0]
        folder=IMAGES+"/"+dirname
        matches=[(name,size) for name,typ,size in conn.listdir(folder) if
            typ=="file" and nfc(name)==nfc(ORIGINAL)]
        result["originalFilenameMatches"]=len(matches)
        if len(matches)!=1:
            result["result"]="MISSING_OR_AMBIGUOUS_ORIGINAL_FILENAME"
            return
        name,size=matches[0]
        if size<200 or size>6000000:
            result["result"]="ORIGINAL_FILE_SIZE_UNSAFE"
            return
        data=bytearray()
        def receive(block):
            if len(data)+len(block)>6000000:raise ValueError("bounded_png_limit")
            data.extend(block)
        conn.c.cwd(folder)
        conn.c.retrbinary("RETR "+name,receive,blocksize=65536)
        raw=bytes(data)
        if len(raw)!=size or raw[:8]!=bytes.fromhex("89504e470d0a1a0a"):
            result["result"]="PNG_BINARY_INVALID"
            return
        digest=hashlib.sha256(raw).hexdigest()
        OUT.mkdir(parents=True,exist_ok=True)
        asset=OUT/"original-1434-6-05372.png"
        asset.write_bytes(raw)
        result.update(result="EXACT_JOOMLA_DIRECTORY_AND_FILENAME_PNG_BYTES_VERIFIED",
            verifiedOriginalByteIdentity=True,sha256=digest,originalBytes=len(raw),
            sourceImageArtifacts=[asset.name])
    finally:
        if conn:conn.close()
        OUT.mkdir(parents=True,exist_ok=True)
        (OUT/"report.json").write_text(json.dumps(result,indent=2,ensure_ascii=False)+"\n",encoding="utf8")
        print("PSE_1434_ORIGINAL_FIRST_FTP_RESULT="+json.dumps(result,ensure_ascii=False))
if __name__=="__main__":
    try:main()
    except Exception as e:
        print("PSE_1434_ORIGINAL_FIRST_FTP_ERROR="+
            (str(e) if str(e) in {"wrong_repository","ftps_required","source_joomla_root_mismatch","bounded_png_limit"} else e.__class__.__name__),file=sys.stderr)
        sys.exit(1)
