#!/usr/bin/env python3
"""Offline tests: never connect, log credentials, or transfer original source files."""
import importlib.util
import pathlib
import unittest
from unittest.mock import patch

HERE=pathlib.Path(__file__).resolve()
MODULE=HERE.with_name("pse-original-ftp-readonly.py")
spec=importlib.util.spec_from_file_location("pse_original_ftp_readonly",MODULE)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class NoWriteFixture:
    def __init__(self,filenames):
        self.catalog={
          "/original":[
              ("configuration.php","file",300),
              ("administrator","dir",-1),
              ("components","dir",-1),
              ("images","dir",-1),
              ("media","dir",-1),
              ("backups","dir",-1),
          ],
          "/original/images":[(filenames[0],"file",15000),("Áo_2.JPG","file",10000),("unrelated.png","file",1300)],
          "/original/media":[],
          "/original/backups":[("joomla-archive.sql.gz","file",80000)]
        }
        self.calls=[]
    def listdir(self,path):
        self.calls.append(path)
        return self.catalog.get(path,[])

class SourceReadOnlyTests(unittest.TestCase):
    def test_bounded_root_and_filename_candidate_only(self):
        originals=mod.source_basename_oracle()
        self.assertEqual(len(originals[114]),2)
        self.assertEqual(len(originals[121]),3)
        self.assertEqual(len(originals[178]),5)
        self.assertEqual(len(originals[237]),11)
        self.assertEqual(len(originals[382]),3)
        self.assertEqual(len(originals[1090]),6)
        remote=NoWriteFixture([next(iter(originals[114]))])
        got=mod.discover(remote,"/original")
        self.assertTrue(got["source_webroot_probable"])
        self.assertTrue(got["joomla_configuration_php_present"])
        self.assertEqual(got["source_filename_candidate_matches"]["114"]["basenames_seen_on_source_ftp"],1)
        self.assertEqual(got["source_filename_candidate_matches"]["382"]["basenames_seen_on_source_ftp"],1)
        self.assertFalse(got["source_filename_candidate_matches"]["114"]["actual_image_bytes_verified"])
        self.assertEqual(got["categories"]["backup"],1)
        self.assertEqual(got["downloaded_files"],0)
        self.assertEqual(got["modified_files"],0)
        self.assertEqual(got["deleted_files"],0)
        self.assertEqual(len(remote.calls),4)
        self.assertNotIn("configuration.php",str(got.get("source_filename_candidate_matches")))
    def test_only_original_pse_domain_root_is_auto_scanned(self):
        fixture=NoWriteFixture(["unrelated.jpg"])
        fixture.catalog["/"]=[
            ("domains","dir",-1),("backups","dir",-1),
            ("unrelated-client","dir",-1),
        ]
        fixture.catalog["/domains/pse.vn/public_html"]=[
            ("configuration.php","file",100),
            ("administrator","dir",-1),("components","dir",-1),
            ("images","dir",-1),("media","dir",-1),
        ]
        fixture.catalog["/domains/pse.vn/public_html/images"]=[]
        result=mod.discover_with_candidate_roots(fixture,"/")
        self.assertTrue(result["source_webroot_probable"])
        self.assertEqual(result["root_candidate"],"domains_pse_public")
        self.assertGreaterEqual(result["root_candidates_attempted"],1)
        self.assertTrue(all("unrelated-client" not in path for path in fixture.calls))
        self.assertEqual(result["downloaded_files"],0)
        self.assertEqual(result["modified_files"],0)
        self.assertEqual(result["deleted_files"],0)

    def test_false_joomla_root_is_rejected(self):
        fixture=NoWriteFixture(["unrelated.jpg"])
        fixture.catalog["/"]=[("domains","dir",-1)]
        fixture.catalog["/domains/pse.vn/public_html"]=[
            ("images","dir",-1),("media","dir",-1),("components","dir",-1)
        ]
        result=mod.discover_with_candidate_roots(fixture,"/")
        self.assertFalse(result["source_webroot_probable"])
        self.assertTrue(result["known_root_layout_hints"]["domains"])

    def test_source_path_scope(self):
        self.assertEqual(mod.validated_root("/domains/pse.vn/public_html/"),"/domains/pse.vn/public_html")
        for value in ("/../private","/images/./config","relative","/a\\b","/file?q=1"):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):mod.validated_root(value)
        self.assertTrue(mod.allowed_dir("images/a"))
        self.assertTrue(mod.allowed_dir("administrator/components/com_akeeba/backup/a"))
        self.assertFalse(mod.allowed_dir("administrator/configuration.php"))
        self.assertFalse(mod.allowed_dir("plugins/extra"))
    def test_untrusted_ca_requires_explicit_valid_pem(self):
        # No socket is created when the trust anchor has invalid format.
        with patch.dict(mod.os.environ,{"PSE_SOURCE_FTP_CA_PEM":"not-a-pem-certificate"}):
            with self.assertRaisesRegex(ValueError,"source_ca_pem_invalid"):
                mod.FTPS("example.invalid",21,"test-user","dummy")

    def test_unconfigured_credentials_fail_closed(self):
        with patch.dict(mod.os.environ,{"PSE_SOURCE_FTP_HOST":"","PSE_SOURCE_FTP_USERNAME":""}):
            with self.assertRaises(ValueError):mod.env("PSE_SOURCE_FTP_HOST")
        with patch.dict(mod.os.environ,{"PSE_SOURCE_FTP_HOST":"ftp://example.com","PSE_SOURCE_FTP_PROTOCOL":"ftps"}):
            with self.assertRaises(ValueError):mod.validated_host("ftps")

if __name__=="__main__":
    unittest.main(verbosity=2)
