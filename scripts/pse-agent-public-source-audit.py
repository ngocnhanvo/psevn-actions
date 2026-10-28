#!/usr/bin/env python3
"""PSE public WordPress content identity audit (READ ONLY, NO CHAT, NO WRITES).

Samples all published pages/posts via public WP REST up to a bounded cap.
Reports only aggregate counts and possible inherited-tenant marker counts.
This cannot prove the internal Agent knowledge index has no stale rows.
"""
from __future__ import annotations
import json, os, re, sys
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError

def fail(reason):
    print("PSE_AGENT_PUBLIC_SOURCE_AUDIT=FAIL reason=" + reason)
    raise SystemExit(1)

values=[]
for line in os.environ.get("ENV_FILE","").splitlines():
    line=line.strip()
    if line.startswith("export "):line=line[7:].strip()
    if line.startswith("WC_URL="):values.append(line.split("=",1)[1].strip().strip("\"'"))
if len(values)!=1:fail("missing_wordpress_origin")
base=urlsplit(values[0])
if not (base.scheme=="https" and base.hostname=="admin-pse.webnvn.com" and
        base.port in (None,443) and base.path in ("","/") and
        not base.query and not base.fragment and not base.username and not base.password):
    fail("incorrect_wordpress_identity")
origin=base.geturl().rstrip("/")
legacy=re.compile(r"xuongmunonbaohiem|nghiencuukhoahoc|blue[ -]?sea|mũ bảo hiểm",re.I)
totals={}
suspects={}
for kind in ("pages","posts"):
    found=0
    hits=0
    pages=0
    while pages<12:
        query=urlencode({"status":"publish","per_page":100,"page":pages+1,
                         "_fields":"id,slug,status,title,content,excerpt,link"})
        url=origin+"/wp-json/wp/v2/"+kind+"?"+query
        try:
            with urlopen(Request(url,headers={"User-Agent":"PSE-Agent-ReadOnly-Audit/1.0","Accept":"application/json"}),timeout=40) as response:
                if response.status!=200:fail(kind+"_http_non200")
                records=json.loads(response.read(12_000_000).decode("utf-8"))
                totalpages=int(response.headers.get("X-WP-TotalPages","1"))
        except HTTPError as e:
            fail(kind+"_http_"+str(e.code))
        except Exception as e:
            fail(kind+"_fetch_"+type(e).__name__)
        if not isinstance(records,list):fail(kind+"_not_array")
        pages+=1
        for item in records:
            if item.get("status")!="publish":fail(kind+"_unpublished_record")
            found+=1
            text=" ".join(str(item.get(field,{}).get("rendered","")) for field in ("title","content","excerpt"))
            if legacy.search(text):hits+=1
        if pages>=totalpages:break
    totals[kind]=found
    suspects[kind]=hits
    if pages<totalpages:fail(kind+"_pagination_incomplete")
    if found==0:fail(kind+"_no_published_content")
    print("PSE_AGENT_PUBLIC_"+kind.upper()+"_COUNT="+str(found)+" legacy_marker_matches="+str(hits))
if sum(suspects.values())>0:
    fail("legacy_tenant_markers_in_published_content")
# Read-only published WooCommerce catalog check, with secrets never logged.
# Catalog is independent of which Astro page the visitor is currently reading.
import base64
settings={}
for line in os.environ.get("ENV_FILE","").splitlines():
    line=line.strip()
    if line.startswith("export "):line=line[7:].strip()
    if "=" in line:
        k,v=line.split("=",1)
        if k in ("WOO_KEY","WOO_SECRET"):
            settings[k]=v.strip().strip("\\\"'")
if not settings.get("WOO_KEY") or not settings.get("WOO_SECRET"):
    fail("missing_woo_catalog_credentials")
credential=(settings["WOO_KEY"]+":"+settings["WOO_SECRET"]).encode()
auth="Basic "+base64.b64encode(credential).decode()
seen=0
legacy_products=0
fertilizer_terms=0
for page in range(1,13):
    query=urlencode({"status":"publish","per_page":100,"page":page})
    url=origin+"/wp-json/wc/v3/products?"+query
    try:
        with urlopen(Request(url,headers={"Authorization":auth,"User-Agent":"PSE-Agent-ReadOnly-Audit/1.0","Accept":"application/json"}),timeout=40) as resp:
            if resp.status!=200:fail("products_http_non200")
            items=json.loads(resp.read(12_000_000).decode("utf-8"))
            totalpages=int(resp.headers.get("X-WP-TotalPages","1"))
    except HTTPError as e:
        fail("products_http_"+str(e.code))
    except Exception as e:
        fail("products_fetch_"+type(e).__name__)
    if not isinstance(items,list):fail("products_not_array")
    for item in items:
        if item.get("status")!="publish":fail("products_unpublished_record")
        seen+=1
        raw=" ".join(str(item.get(k,"")) for k in ("name","description","short_description","slug"))
        if legacy.search(raw):legacy_products+=1
        if re.search(r"phân bón|\bnpk\b|\bdap\b|\bkali\b|\burea\b",raw,re.I):fertilizer_terms+=1
    if page>=totalpages:break
else:
    fail("products_pagination_incomplete")
print("PSE_AGENT_PUBLIC_PRODUCTS_COUNT="+str(seen)+" legacy_marker_matches="+str(legacy_products)+" fertilizer_term_matches="+str(fertilizer_terms))
if seen==0 or legacy_products>0:
    fail("invalid_public_catalog")
print("PSE_AGENT_PUBLIC_SOURCE_AUDIT=PASS published_pages_posts_products_only; AGENT_INDEX_NOT_VERIFIED=TRUE")
