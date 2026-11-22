#!/usr/bin/env python3
"""Offline scope/no-write test for three exact source Joomla images."""
import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location("pse382",Path("scripts/pse-original-ftp-382-media-readonly.py"))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class FakeFTPS:
    def __init__(self):
        self.cwd_paths=[];self.retrieved=[]
        self.bin=b"\xff\xd8\xff"+(b"testjpeg"+b"x"*100)*8+b"\xff\xd9"
    def cwd(self,p):self.cwd_paths.append(p)
    def retrbinary(self,command,callback,blocksize=65536):
        self.retrieved.append(command);callback(self.bin)
class Fake:
    def __init__(self,files):
        self.c=FakeFTPS();self.files=files;self.paths=[]
    def listdir(self,p):
        self.paths.append(p)
        if p==m.ROOT:
            return [(name,"dir",-1) for name in ("administrator","components","images")]+[("configuration.php","file",255)]
        if p==m.SOURCE_DIR:
            return [(name,"file",len(self.c.bin)) for name in self.files]
        raise AssertionError("Not original 382 scoped location")
class Tests(unittest.TestCase):
    def test_source_only_exact_three(self):
        f=Fake(list(m.NAMES))
        r=m.inspect(f)
        self.assertEqual(r["verified_original_images"],3)
        self.assertEqual(r["exact_matches"],3)
        self.assertEqual(r["files_read"],3)
        self.assertEqual(r["modified_files"],0)
        self.assertEqual(r["deleted_files"],0)
        self.assertEqual(len(f.c.retrieved),3)
        self.assertEqual(f.paths,[m.ROOT,m.SOURCE_DIR])
        self.assertTrue(all(x["status"]=="EXACT_ORIGINAL_PATH_AND_BYTES_VERIFIED" for x in r["results"]))
    def test_missing_image_is_not_filled_with_similar_name(self):
        f=Fake(["Áo_2.JPG","Ba_Lan.JPG","not-a-real-original.jpg"])
        r=m.inspect(f)
        self.assertEqual(r["verified_original_images"],2)
        self.assertEqual(r["results"][2]["status"],"NOT_EXACT_UNIQUE_MATCH")
        self.assertEqual(len(f.c.retrieved),2)
if __name__=="__main__":unittest.main(verbosity=2)
