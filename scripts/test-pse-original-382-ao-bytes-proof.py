#!/usr/bin/env python3
import importlib.util,unittest,struct
from pathlib import Path
spec=importlib.util.spec_from_file_location("x",Path("scripts/pse-original-382-ao-bytes-proof.py"))
x=importlib.util.module_from_spec(spec);spec.loader.exec_module(x)
class Tests(unittest.TestCase):
 def test_jpeg_sof(self):
  image=b"\xff\xd8\xff\xe0\x00\x04ab\xff\xc0\x00\x11\x08"+struct.pack(">HH",308,543)+b"\x03\x01\x11\x00\x02\x11\x00\x03\x11\x00"+b"\xff\xd9"
  self.assertEqual(x.jpeg_dimensions(image),(543,308))
 def test_invalid(self):
  with self.assertRaisesRegex(ValueError,"not_valid_jpeg_markers"):
   x.jpeg_dimensions(b"wrong")
if __name__=="__main__":unittest.main(verbosity=2)
