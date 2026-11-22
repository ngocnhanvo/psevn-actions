#!/usr/bin/env python3
"""Get exactly one ORIGINAL owner FTP JPEG into private runner /tmp, never Github artifacts."""
import hashlib,importlib.util,json,os,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location("pseftp",Path("scripts/pse-original-ftp-readonly.py"))
base=importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
SOURCE="/domains/pse.vn/public_html/images/web"
BASENAME="Ba_Lan.JPG"
EXPECTED_SHA256="f2587f776be8f888ae78cae1de5c0c5767855d2e01309245182d62cb1d3c1fe3"
EXPECTED_BYTES=163574
OUT=Path("/tmp/pse-382-original-Ba_Lan.JPG")
def main():
    if os.getenv("GITHUB_REPOSITORY")!="ngocnhanvo/psevn-actions" or os.getenv("PSE_382_BACKUP_READY")!="yes":
        raise ValueError("not_authorized")
    if base.env("PSE_SOURCE_FTP_PROTOCOL")!="ftps":raise ValueError("ftps_required")
    host,port=base.validated_host("ftps")
    ftp=None
    try:
        ftp=base.FTPS(host,port,base.env("PSE_SOURCE_FTP_USERNAME"),base.env("PSE_SOURCE_FTP_PASSWORD"))
        root=ftp.listdir("/domains/pse.vn/public_html")
        names={name.casefold() for name,_,_ in root}
        if not {"configuration.php","administrator","components","images"}.issubset(names):
            raise ValueError("root_not_verified")
        listing=ftp.listdir(SOURCE)
        matches=[(name,size) for name,t,size in listing if t=="file" and name==BASENAME]
        if len(matches)!=1 or matches[0][1]!=EXPECTED_BYTES:
            raise ValueError("original_file_identity_changed")
        b=bytearray()
        def recv(chunk):
            if len(b)+len(chunk)>EXPECTED_BYTES:raise ValueError("bounded_file_length_changed")
            b.extend(chunk)
        ftp.c.cwd(SOURCE)
        ftp.c.retrbinary("RETR "+BASENAME,recv,blocksize=65536)
        content=bytes(b)
        if len(content)!=EXPECTED_BYTES or hashlib.sha256(content).hexdigest()!=EXPECTED_SHA256 or not content.startswith(b"\xff\xd8\xff") or not content.endswith(b"\xff\xd9"):
            raise ValueError("original_image_checksum_changed")
        fd=os.open(OUT,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
        with os.fdopen(fd,"wb") as w:w.write(content)
        print("PSE_382_SOURCE_IMAGE_PRIVATE_EXPORT="+json.dumps({
            "source_id":382,"image":"Ba_Lan.JPG","bytes":len(content),
            "sha256":EXPECTED_SHA256,"no_source_writes":True,
            "no_github_artifact_image":True}))
    finally:
        if ftp:ftp.close()
if __name__=="__main__":
    try:main()
    except Exception as e:
        try:OUT.unlink(missing_ok=True)
        except OSError:pass
        allow={"not_authorized","ftps_required","root_not_verified","original_file_identity_changed",
               "bounded_file_length_changed","original_image_checksum_changed"}
        print("PSE_382_SOURCE_IMAGE_EXPORT_ERROR="+(str(e) if str(e) in allow else e.__class__.__name__),file=sys.stderr)
        sys.exit(1)
