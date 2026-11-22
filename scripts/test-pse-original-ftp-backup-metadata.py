#!/usr/bin/env python3
"""Test original Joomla backup listing without external network or file retrieval."""
import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location("ftp_backup_metadata",Path("scripts/pse-original-ftp-backup-metadata.py"))
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class Fixture:
    def __init__(self):
        root=mod.ROOT
        self.calls=[]
        self.lists={
           root:[("configuration.php","file",400),("administrator","dir",-1),("components","dir",-1),
                 ("images","dir",-1),("media","dir",-1),("backup","dir",-1),("other-tenant","dir",-1),
                 ("small.sql.gz","file",6500)],
           root+"/backup":[("site-old.jpa","file",16000),("foo.sql","file",950),("archive","dir",-1)],
           root+"/backup/archive":[("part.zip","file",40000)],
           root+"/backups":[],
           root+"/administrator/components/com_akeeba/backup":[]
        }
    def listdir(self,path):
        self.calls.append(path)
        return self.lists.get(path,[])

class T(unittest.TestCase):
    def test_scoped_backup_metadata_without_download(self):
        f=Fixture()
        r=mod.scan(f)
        self.assertTrue(r["source_joomla_root_verified"])
        self.assertEqual(r["candidate_count"],4)
        self.assertEqual(r["candidate_formats"],{".sql.gz":1,".jpa":1,".sql":1,".zip":1})
        self.assertFalse(any("other-tenant" in p for p in f.calls))
        self.assertFalse(any("/images" in p for p in f.calls))
        self.assertEqual(r["files_downloaded"],0)
        self.assertEqual(r["files_deleted"],0)
        self.assertEqual(r["files_modified"],0)
    def test_wrong_tenant_not_a_joomla_root(self):
        f=Fixture();f.lists[mod.ROOT]=[("images","dir",-1),("media","dir",-1)]
        with self.assertRaisesRegex(ValueError,"not_original_joomla_root"):
            mod.scan(f)

if __name__=="__main__":
    unittest.main(verbosity=2)
