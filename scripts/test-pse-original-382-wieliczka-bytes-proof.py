#!/usr/bin/env python3
import importlib.util,unittest,hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location("z",Path("scripts/pse-original-382-wieliczka-bytes-proof.py"))
z=importlib.util.module_from_spec(spec);spec.loader.exec_module(z)
class T(unittest.TestCase):
 def test_expected_size(self):
  self.assertEqual(z.EXPECTED_SIZE,143031)
 def test_hash_bound_to_original_ftp_path(self):
  n="Má»\u008f_muá»‘i_Wieliczka_dÆ°á»›i_máº·t_Ä‘áº¥t_135m_-_Ba_lan.JPG"
  self.assertEqual(hashlib.sha256(("images/web/"+n).encode("utf8")).hexdigest(),z.EXPECTED_PATH_SHA)
if __name__=="__main__":unittest.main(verbosity=2)
