#!/usr/bin/env python3
"""Offline ZIP table-of-contents safety test; no site connection or passwords."""
import importlib.util,io,unittest,zipfile
from pathlib import Path
spec=importlib.util.spec_from_file_location("ziptoc",Path("scripts/pse-original-ftp-zip-toc-readonly.py"))
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class Tests(unittest.TestCase):
    def test_zip_toc_hides_paths(self):
        b=io.BytesIO()
        with zipfile.ZipFile(b,"w",compression=zipfile.ZIP_DEFLATED) as z:
            z.writestr("old-pse/administrator/index.php","test")
            z.writestr("old-pse/configuration.php","redacted")
            z.writestr("old-pse/images/product.jpg","img")
            z.writestr("old-pse/backup/joomla.sql","INSERT")
        data=b.getvalue()
        meta=m.central_directory_location(data[-min(len(data),65557):],len(data))
        assert meta["entries"]==4
        r=m.summarize_directory(data[meta["cd_offset"]:meta["cd_offset"]+meta["cd_size"]],meta["entries"])
        self.assertEqual(r["declared_entries"],4)
        self.assertEqual(r["file_suffix_counts"][".sql"],1)
        self.assertEqual(r["joomla_archive_indicators"]["joomla_config_basename"],1)
        self.assertNotIn("joomla.sql",str(r))
        self.assertFalse(r["raw_paths_logged"])
        self.assertFalse(r["zip_archive_fully_downloaded"])
    def test_untrusted_directory_rejected(self):
        with self.assertRaisesRegex(ValueError,"zip_eocd_unavailable"):
            m.central_directory_location(b"not a ZIP",200)
        with self.assertRaisesRegex(ValueError,"invalid_zip_central_directory"):
            m.summarize_directory(b"INVALID",1)

if __name__=="__main__":
    unittest.main(verbosity=2)
