import importlib.util,json,unittest
from pathlib import Path
s=importlib.util.spec_from_file_location("module",Path("scripts/pse-original-live-ftps-name-scan.py"))
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Fake:
 def listdir(self,p):
  if p==m.ROOT:return [(n,"dir",-1) for n in ("administrator","components","images","media")]+[("configuration.php","file",10)]
  if p==m.ROOT+"/images":return [("web","dir",-1)]
  if p==m.ROOT+"/images/web":return [("Ba_Lan.JPG","file",163574),("Áo_2.JPG","file",2048)]
  return []
class Tests(unittest.TestCase):
 def test_fixture(self):self.assertEqual(len(m.images()),59)
 def test_source_scope_and_readonly(self):
  r=m.inspect(Fake())
  self.assertEqual(r["original_images"],59)
  self.assertEqual(r["source_path_exact"],2)
  self.assertFalse(r["image_bytes_verified"])
  self.assertFalse(r["truncated"])
  self.assertTrue(r["no_ftp_writes"])
 def test_filename_alternates(self):
  self.assertEqual(m.similar("Áo_2.JPG"),m.similar("A_o 2.jpg"))
  self.assertNotEqual(m.exact("Áo_2.JPG"),m.exact("A_o 2.jpg"))
if __name__=="__main__":unittest.main(verbosity=2)
