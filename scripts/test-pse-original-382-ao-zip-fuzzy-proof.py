#!/usr/bin/env python3
import importlib.util,io,zipfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location("z",Path("scripts/pse-original-382-ao-zip-fuzzy-proof.py"))
z=importlib.util.module_from_spec(spec);spec.loader.exec_module(z)
class T(unittest.TestCase):
 def test_relaxed_name(self):
  self.assertEqual(z.similar("Áo_2.JPG"),z.similar("Ao 2.jpg"))
 def test_relative_path_hash(self):
  self.assertIn("images/web/Ao_2.JPG",z.candidate_relative_path("joomla/images/web/Ao_2.JPG"))
 def test_bounded_zip_toc(self):
  b=io.BytesIO()
  with zipfile.ZipFile(b,"w") as f:f.writestr("archive/images/web/Ao_2.JPG","test")
  data=b.getvalue()
  meta=z.base.central_directory_location(data[-min(len(data),65557):],len(data))
  r=z.parse_toc(data[meta["cd_offset"]:meta["cd_offset"]+meta["cd_size"]],meta["entries"])
  self.assertEqual(len(r["candidate_zip_variants"]),1)
  self.assertEqual(r["same_size"],0)
  self.assertFalse(r["candidate_zip_variants"][0]["matches_live_path_hash"])
  self.assertTrue(r["no_photo_bodies_read"])
if __name__=="__main__":unittest.main(verbosity=2)
