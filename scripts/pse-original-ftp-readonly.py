#!/usr/bin/env python3
"""Bounded READ-ONLY original Joomla source FTP/SFTP inventory, no private data exfiltration."""
import ftplib,hashlib,json,os,re,ssl,stat,sys,tempfile
from pathlib import Path
from urllib.parse import urlsplit
from collections import Counter,deque

OUT=Path("artifacts/pse-original-ftp-readonly")
MAX_ENTRIES=6000
MAX_DIRS=450
BACKUP_EXT=(".sql",".sql.gz",".sql.zip",".jpa",".jps",".zip",".tar",".tar.gz",".tgz",".7z")
MEDIA_EXT=(".jpg",".jpeg",".png",".gif",".webp",".svg",".pdf")
ROOT_MARKERS={"configuration.php","administrator","components","images","media"}
PENDING_POST_IDS=[114,121,127,178,186,196,202,237,341,382,1090]

def env(name):
    value=os.getenv(name,"").strip()
    if not value or any(ch in value for ch in ("\x00","\r","\n")):
        raise ValueError("missing_or_invalid_"+name)
    return value

def validated_root(value):
    value=value.strip()
    if not value.startswith("/") or "\\" in value or "?" in value or "#" in value:
        raise ValueError("source_root_not_absolute")
    if any(p in (".","..") for p in value.split("/")) or not re.fullmatch(r"/[A-Za-z0-9_./-]*",value):
        raise ValueError("source_root_unsafe")
    return value.rstrip("/") or "/"

def validated_host(scheme):
    raw=env("PSE_SOURCE_FTP_HOST")
    u=urlsplit(raw if "://" in raw else scheme+"://"+raw)
    if u.scheme!=scheme or not u.hostname or u.username or u.password or u.path not in ("","/") or u.query or u.fragment or not re.fullmatch(r"[A-Za-z0-9.-]+",u.hostname):
        raise ValueError("source_host_unsafe")
    return u.hostname,u.port or (21 if scheme=="ftps" else 22)

class FTPS:
    def __init__(self,host,port,user,password):
        self.c=ftplib.FTP_TLS(context=ssl.create_default_context(),timeout=35)
        self.c.connect(host,port,timeout=35)
        self.c.auth()
        self.c.login(user,password)
        self.c.prot_p()
        self.c.set_pasv(True)
    def listdir(self,path):
        self.c.cwd(path)
        rows=[]
        for name,facts in self.c.mlsd():
            kind=facts.get("type","").lower()
            if kind in ("file","dir"):
                rows.append((name,kind,int(facts.get("size","-1")) if kind=="file" else -1))
        return rows
    def close(self):
        try:self.c.quit()
        except ftplib.all_errors:self.c.close()

class SFTP:
    def __init__(self,host,port,user,password):
        import paramiko
        with tempfile.NamedTemporaryFile(mode="w",encoding="utf8") as f:
            f.write(env("PSE_SOURCE_SFTP_KNOWN_HOSTS")+"\n")
            f.flush()
            self.c=paramiko.SSHClient()
            self.c.load_host_keys(f.name)
            self.c.set_missing_host_key_policy(paramiko.RejectPolicy())
            self.c.connect(host,port=port,username=user,password=password,timeout=35,auth_timeout=35,banner_timeout=35,allow_agent=False,look_for_keys=False)
        self.s=self.c.open_sftp()
    def listdir(self,path):
        items=[]
        for entry in self.s.listdir_attr(path):
            if stat.S_ISDIR(entry.st_mode):items.append((entry.filename,"dir",-1))
            elif stat.S_ISREG(entry.st_mode):items.append((entry.filename,"file",int(entry.st_size)))
        return items
    def close(self):
        self.s.close()
        self.c.close()

def allowed_dir(path):
    parts=path.split("/")
    if parts[0]!="administrator":return parts[0] in ("images","media","backup","backups")
    return len(parts)>1 and parts[1]=="components" and (len(parts)==2 or parts[2]=="com_akeeba" and (len(parts)==3 or parts[3]=="backup"))

def discover(client,root):
    pending=deque([("",0)])
    seen=set()
    files=[]
    entries=0
    root_names=set()
    errors=Counter()
    truncated=False
    while pending:
        rel,depth=pending.popleft()
        if rel in seen:continue
        if len(seen)>=MAX_DIRS or entries>=MAX_ENTRIES:
            truncated=True
            break
        seen.add(rel)
        path=root.rstrip("/")+"/"+rel if rel else root
        try:listing=client.listdir(path)
        except Exception as e:
            errors[e.__class__.__name__]+=1
            continue
        entries+=len(listing)
        if entries>MAX_ENTRIES:truncated=True
        for name,kind,size in listing:
            if not name or name in (".","..") or any(ch in name for ch in ("/","\\","\x00")):continue
            if not rel:root_names.add(name.lower())
            child=(rel+"/"+name).lstrip("/")
            if kind=="dir":
                if depth<6 and allowed_dir(child):pending.append((child,depth+1))
            else:
                low=name.lower()
                typ="backup" if low.endswith(BACKUP_EXT) else ("media" if low.endswith(MEDIA_EXT) else "other")
                files.append({"sha256_path":hashlib.sha256(child.encode("utf8")).hexdigest(),"size":size if size>=0 else None,"kind":typ,"area":rel.split("/")[0] if rel else "root"})
    return {
        "joomla_configuration_php_present":"configuration.php" in root_names,
        "joomla_root_markers":sorted(root_names & ROOT_MARKERS),
        "source_webroot_probable":len(root_names & ROOT_MARKERS)>=3,
        "truncated":truncated,
        "directories_inspected":len(seen),
        "entries_encountered":entries,
        "categories":dict(Counter(x["kind"] for x in files)),
        "areas":dict(Counter(x["area"] for x in files)),
        "backup_candidate_sizes":sorted([x["size"] for x in files if x["kind"]=="backup" and x["size"] is not None])[:100],
        "hashed_backup_paths":[x["sha256_path"] for x in files if x["kind"]=="backup"][:100],
        "directory_errors_by_type":dict(errors),
        "pending_original_post_ids":PENDING_POST_IDS,
        "downloaded_files":0,"modified_files":0,"deleted_files":0
    }

def main():
    if os.getenv("GITHUB_REPOSITORY")!="ngocnhanvo/psevn-actions":
        raise ValueError("wrong_repository")
    scheme=env("PSE_SOURCE_FTP_PROTOCOL").lower()
    if scheme not in ("ftps","sftp"):raise ValueError("secure_transport_required")
    host,port=validated_host(scheme)
    root=validated_root(env("PSE_SOURCE_FTP_ROOT"))
    user,password=env("PSE_SOURCE_FTP_USERNAME"),env("PSE_SOURCE_FTP_PASSWORD")
    client=None
    try:
        client=FTPS(host,port,user,password) if scheme=="ftps" else SFTP(host,port,user,password)
        result=discover(client,root)
        result.update(schema="pse-original-ftp-readonly-v1",protocol=scheme,certificate_or_hostkey_verified=True,no_credentials_or_server_path_in_artifact=True)
        OUT.mkdir(parents=True,exist_ok=True)
        (OUT/"summary.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
        minimal={x:result[x] for x in ("source_webroot_probable","joomla_configuration_php_present","joomla_root_markers","truncated","directories_inspected","entries_encountered","categories","backup_candidate_sizes","directory_errors_by_type","downloaded_files","modified_files","deleted_files")}
        print("PSE_ORIGINAL_FTP_READONLY="+json.dumps(minimal,ensure_ascii=False))
        if not result["source_webroot_probable"]:raise ValueError("original_joomla_root_not_verified")
    finally:
        if client:client.close()

if __name__=="__main__":
    try:main()
    except Exception as e:
        print("PSE_ORIGINAL_FTP_READONLY_ERROR="+e.__class__.__name__,file=sys.stderr)
        sys.exit(1)
