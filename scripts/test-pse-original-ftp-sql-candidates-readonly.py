#!/usr/bin/env python3
"""No network, no source secrets; test bounded metadata classification."""
import importlib.util,io,unittest,zipfile
from pathlib import Path
spec=importlib.util.spec_from_file_location("sqlcand",Path("scripts/pse-original-ftp-sql-candidates-readonly.py"))
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
class Tests(unittest.TestCase):
    def test_database_dump_ranked_over_installers_with_no_paths_leaked(self):
        stream=io.BytesIO()
        with zipfile.ZipFile(stream,"w",compression=zipfile.ZIP_DEFLATED) as z:
            z.writestr("website/administrator/components/com_blog/install.sql","CREATE TABLE t;\n")
            z.writestr("website/database/backups/site-dump.sql","INSERT INTO joomla_content VALUES (1);\n"*40000)
            z.writestr("website/images/img.jpg","image bytes")
            z.writestr("website/images/web/Áo_2.JPG","original source photo")
            z.writestr("website/other/Ba_Lan.JPG","not exact source directory")
        data=stream.getvalue()
        e=m.base.central_directory_location(data[-min(len(data),65557):],len(data))
        report=m.classify(data[e["cd_offset"]:e["cd_offset"]+e["cd_size"]],e["entries"])
        self.assertEqual(report["sql_like_entry_count"],2)
        self.assertEqual(report["sql_installer_pattern_count"],1)
        self.assertGreaterEqual(report["plausible_database_dump_candidates"],1)
        self.assertTrue(report["top_bounded_sql_candidates"][0]["plausible_database_dump"])
        self.assertTrue(report["raw_archive_paths_logged"] is False)
        self.assertNotIn("site-dump.sql",str(report))
        self.assertFalse(report["sql_body_accessed"])
        imgs=report["original_382_image_candidates_in_zip"]
        self.assertEqual(imgs[1]["basename_count"],1)
        self.assertEqual(imgs[1]["source_path_count"],1)
        self.assertEqual(imgs[2]["basename_count"],1)
        self.assertEqual(imgs[2]["source_path_count"],0)
        self.assertEqual(imgs[3]["basename_count"],0)
        self.assertNotIn("Áo_2.JPG",str(imgs))
    def test_wrong_count_is_not_silently_accepted(self):
        with self.assertRaisesRegex(ValueError,"zip_entry_count_mismatch"):
            m.classify(b"",1)
if __name__=="__main__":
    unittest.main(verbosity=2)
