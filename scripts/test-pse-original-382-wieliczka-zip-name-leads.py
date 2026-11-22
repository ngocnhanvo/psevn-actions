#!/usr/bin/env python3
import importlib.util,io,zipfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location("m",Path("scripts/pse-original-382-wieliczka-zip-name-leads.py"))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class T(unittest.TestCase):
 def test_leads(self):
  output=io.BytesIO()
  with zipfile.ZipFile(output,"w") as f:
   f.writestr("site/images/web/Mo_muoi_Wieliczka_135m.JPG",b"example")
   f.writestr("site/private/images/web/Mo_muoi.JPG",b"example")
   f.writestr("site/images/web/other.JPG",b"example")
  buf=output.getvalue()
  d=m.base.central_directory_location(buf[-min(65557,len(buf)):],len(buf))
  x=m.map_toc(buf[d["cd_offset"]:d["cd_offset"]+d["cd_size"]],d["entries"])
  self.assertEqual(x["keyword_candidate_count"],2)
  self.assertFalse(x["source_media_identity_verified"])
 def test_norm(self):
  self.assertEqual(m.norm("Mỏ_muối"),"mo_muoi")
if __name__=="__main__":unittest.main(verbosity=2)
