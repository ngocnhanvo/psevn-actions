#!/usr/bin/env python3
"""Read-only inventory for converting an active PSE tri-repo project into a safe reusable template.

Never opens secrets, uploads, DB exports or FTP. Doesn't modify project sources.
Runs against exact checked-out repos. Reports names/paths only, not content.
"""
import argparse
import collections
import json
import pathlib
import re

P = argparse.ArgumentParser()
P.add_argument("--astro", type=pathlib.Path, required=True)
P.add_argument("--php", type=pathlib.Path, required=True)
P.add_argument("--actions", type=pathlib.Path, required=True)
a = P.parse_args()

checks = {
  "wrong_source_domain": re.compile(r"(?:api-)?nghiencuukhoahoc(?:\.webnvn\.com|\.id\.vn)", re.I),
  "wrong_source_repository": re.compile(r"ngocnhanvo/(?:nghiencuukhoahoc|xuongmunonbaohiem)-(?:astro|php|actions)", re.I),
  "old_brand_label": re.compile(r"EduResearch Hub|Blue Sea|xuongmunonbaohiem", re.I),
  "copied_source_db_guard": re.compile(r"nghiencuukhoahoc_181026"),
  "unrelated_template_slug": re.compile(r'"slug"\s*:\s*"picasso"', re.I),
}
checks["literal_site_url"] = re.compile(r"(?:https?://)?(?:[a-z0-9-]+\\.)+(?:webnvn\\.com|id\\.vn|io\\.vn)", re.I)

allowed_ext = {".ts",".tsx",".js",".mjs",".astro",".php",".json",".yml",".yaml",".md",".sh",".py",".html",".txt"}
hard_exclude = {"node_modules",".git","vendor",".cache","dist","build","upload","uploads","cache","tests/fixtures"}
inventory = {}
high_priority = []
for name, root in (("astro",a.astro),("php",a.php),("actions",a.actions)):
    counts = collections.Counter()
    samples = collections.defaultdict(list)
    total = 0
    for file in root.rglob("*"):
        if not file.is_file() or file.suffix.lower() not in allowed_ext:
            continue
        rel = file.relative_to(root).as_posix()
        if any(part in hard_exclude for part in file.relative_to(root).parts) or file.stat().st_size > 350_000:
            continue
        if name=="php" and not (rel.startswith(("wp-content/mu-plugins/","wp-content/plugins/github-trigger/","tests/","pse-unzip","README","AGENTS"))):
            continue
        total += 1
        try:
            contents = file.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        active = not ("/workflows-disabled/" in rel or rel.startswith("imported-eduresearch/"))
        for key, regex in checks.items():
            if regex.search(contents):
                counts[key] += 1
                tag = "active" if active else "archive"
                if len(samples[key]) < 30:
                    samples[key].append(tag+":"+rel)
                if active and key in ("wrong_source_domain","wrong_source_repository","unrelated_template_slug","literal_site_url") and not (rel.endswith((".test.ts",".spec.ts")) or rel.startswith(("docs/","README","tests/"))):
                    high_priority.append((name, key, rel))
    inventory[name]={"scanned_files":total,"counts":dict(counts),"examples":dict(samples)}
print("TEMPLATE_AUDIT_BEGIN")
print(json.dumps(inventory,ensure_ascii=False,indent=2))
print("TEMPLATE_AUDIT_HIGH_PRIORITY_FILES="+str(len(high_priority)))
for n,key,path in high_priority[:45]:
    print("TEMPLATE_LEAK "+n+" "+key+" "+path)
print("TEMPLATE_AUDIT_END")
