#!/usr/bin/env python3
"""Original Joomla account FTP backup metadata only; NO file retrieval or writes."""
import collections,ftplib,importlib.util,json,os,sys
from pathlib import Path
P=Path("scripts/pse-original-ftp-readonly.py")
spec=importlib.util.spec_from_file_location("original_ftp",P)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
ROOT="/domains/pse.vn/public_html"
OUT=Path("artifacts/pse-original-ftp-backup-metadata/summary.json")
MAX_DIRS=55
MAX_ENTRIES=1800
BACKUP_SUFFIXES=tuple(sorted(mod.BACKUP_EXT,key=len,reverse=True))
# Do not enumerate arbitrary site content. Only webroot and native backup paths.
STARTS=["", "backup","backups","administrator/components/com_akeeba/backup"]

def scan(client):
    root=client.listdir(ROOT)
    names={n.casefold() for n,_,_ in root}
    if not all(x in names for x in ("configuration.php","administrator","components")) or not ("images" in names or "media" in names):
        raise ValueError("not_original_joomla_root")
    candidates=[]
    queue=collections.deque((p,0) for p in STARTS)
    visited=set()
    entries=0
    errors=collections.Counter()
    while queue and len(visited)<MAX_DIRS and entries<MAX_ENTRIES:
        part,depth=queue.popleft()
        if part in visited:continue
        visited.add(part)
        if part:
            segments=part.split("/")
            if segments[0] not in ("backup","backups") and not part.startswith("administrator/components/com_akeeba/backup"):
                raise ValueError("unsafe_backup_scope")
        try:
            rows=client.listdir(ROOT+("/"+part if part else ""))
        except (ftplib.error_perm,ftplib.error_temp,ftplib.error_proto,ftplib.error_reply,OSError) as e:
            errors[e.__class__.__name__]+=1
            continue
        entries+=len(rows)
        for name,typ,size in rows:
            if not name or name in (".","..") or any(ch in name for ch in ("/","\\","\x00")):continue
            if typ=="file":
                suffix=next((ext for ext in BACKUP_SUFFIXES if name.casefold().endswith(ext)),None)
                if suffix:
                    candidates.append({"format":suffix,"size_bytes":size if size>=0 else None,"source":("root" if not part else "backup_directory")})
            elif typ=="dir" and depth<3 and part and segments_backup(part):
                queue.append((part+"/"+name,depth+1))
    return {"schema":"pse-original-ftp-backup-metadata-v1",
      "source_joomla_root_verified":True,"read_only":True,
      "candidate_count":len(candidates),
      "candidate_formats":dict(collections.Counter(x["format"] for x in candidates)),
      "candidates":sorted(candidates,key=lambda x:(x["size_bytes"] or 0,x["format"])),
      "directories_visited":len(visited),"entries_seen":entries,
      "truncated":bool(queue) or entries>=MAX_ENTRIES,
      "errors_by_type":dict(errors),
      "files_downloaded":0,"files_modified":0,"files_deleted":0}

def segments_backup(path):
    return path.startswith(("backup/","backups/","administrator/components/com_akeeba/backup/")) or path in STARTS[1:]

def main():
    if os.getenv("GITHUB_REPOSITORY")!="ngocnhanvo/psevn-actions":
        raise ValueError("wrong_repository")
    protocol=mod.env("PSE_SOURCE_FTP_PROTOCOL")
    if protocol not in ("ftps","sftp"):raise ValueError("invalid_protocol")
    host,port=mod.validated_host(protocol)
    user,password=mod.env("PSE_SOURCE_FTP_USERNAME"),mod.env("PSE_SOURCE_FTP_PASSWORD")
    client=None
    try:
        client=mod.FTPS(host,port,user,password) if protocol=="ftps" else mod.SFTP(host,port,user,password)
        result=scan(client)
        OUT.parent.mkdir(parents=True,exist_ok=True)
        OUT.write_text(json.dumps(result,indent=2,ensure_ascii=False)+"\n",encoding="utf8")
        print("PSE_SOURCE_BACKUP_METADATA="+json.dumps(result,ensure_ascii=False))
    finally:
        if client:client.close()

if __name__=="__main__":
    try:main()
    except Exception as e:
        # No server response, file names, hostnames, login or paths in logs.
        print("PSE_SOURCE_BACKUP_METADATA_ERROR="+
              ("ROOT_MISMATCH" if str(e)=="not_original_joomla_root"
               else "BACKUP_SCOPE_DENIED" if str(e)=="unsafe_backup_scope"
               else e.__class__.__name__),file=sys.stderr)
        sys.exit(1)
