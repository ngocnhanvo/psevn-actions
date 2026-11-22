#!/usr/bin/env python3
"""Offline fixtures for bounded, no-source-write Joomla ZIP photo inventory."""
import importlib.util,io,unittest,zipfile
from pathlib import Path
spec=importlib.util.spec_from_file_location("pse_archive_images",Path("scripts/pse-original-ftp-joomla-image-basename-map.py"))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Test(unittest.TestCase):
 def test_real_public_source_ids_are_whitelisted(self):
  import json
  doc=json.loads(m.SOURCES.read_text(encoding="utf8"))
  rows=m.verified_source_catalog(doc)
  self.assertEqual(list(rows),list(m.EXPECTED))
  self.assertEqual(sum(map(len,rows.values())),59)
  self.assertEqual(len(rows[382]),3)
 def test_zip_directory_photo_basename_matches_do_not_imply_byte_proof(self):
  rows={382:[
   {"source_id":382,"media_order":1,"original_basename":m.norm("Áo_2.JPG"),
    "exact_old_joomla_path":m.norm("images/web/Áo_2.JPG"),
    "archive_matches":0,"matches_in_images":0,"matches_exact_path":0,"archive_file_metadata":[]}
  ]}
  b=io.BytesIO()
  with zipfile.ZipFile(b,"w") as z:
   z.writestr("pse/images/web/Áo_2.JPG","mock jpeg")
   z.writestr("unrelated/Áo_2.JPG","other same basename")
  buf=b.getvalue()
  e=m.base.central_directory_location(buf[-min(len(buf),65557):],len(buf))
  r=m.parse_zip_directory(buf[e["cd_offset"]:e["cd_offset"]+e["cd_size"]],e["entries"],rows)
  self.assertEqual(r["matched_occurrences"],1)
  self.assertEqual(r["unique_media_path_exact_matches"],1)
  self.assertEqual(r["images"][0]["archive_matches"],2)
  self.assertFalse(r["photo_bytes_read"])
 def test_invalid_count_rejected(self):
  with self.assertRaisesRegex(ValueError,"zip_count_mismatch"):
   m.parse_zip_directory(b"",1,{114:[]})
if __name__=="__main__":unittest.main(verbosity=2)
