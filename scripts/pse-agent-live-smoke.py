#!/usr/bin/env python3
"""One bounded synthetic PSE Agent live smoke (uses existing WP public REST, no deploy).

Never print tokens, session IDs, prompts, answers, customer data, or raw response bodies.
May write only short-lived synthetic conversation rows using a fresh random UUID.
"""
from __future__ import annotations

import json
import os
import re
import uuid
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

def error(message: str) -> None:
    print("PSE_AGENT_LIVE_SMOKE=FAIL reason=" + message)
    raise SystemExit(1)

config={}
for line in os.environ.get("ENV_FILE","").splitlines():
    line=line.strip()
    if line.startswith("export "):line=line[7:].strip()
    if "=" not in line:continue
    key,value=line.split("=",1)
    if key in ("WC_URL","WOO_KEY","WOO_SECRET"):
        config[key]=value.strip().strip("\"'")
wp=urlsplit(config.get("WC_URL",""))
if not (wp.scheme=="https" and wp.hostname=="admin-pse.webnvn.com"
        and wp.port in (None,443) and wp.path in ("","/")
        and not wp.username and not wp.password and not wp.query and not wp.fragment):
    error("invalid_wp_origin")
if not config.get("WOO_SECRET") or not config.get("WOO_KEY"):
    error("missing_agent_auth_config")
base=wp.geturl().rstrip("/")
session=str(uuid.uuid4())

def request(path, method="GET", json_body=None, credentials=False, timeout=40, omit_key=False):
    headers={"User-Agent":"PSE-Agent-Synthetic-Smoke/1.0","Accept":"application/json"}
    if credentials:
        headers["Authorization"]="Bearer "+config["WOO_SECRET"]
        if not omit_key:
            headers["X-ESC-Woo-Key"]=config["WOO_KEY"]
    data=None
    if json_body is not None:
        data=json.dumps(json_body,ensure_ascii=False).encode("utf-8")
        headers["Content-Type"]="application/json"
    req=Request(base+path,headers=headers,data=data,method=method)
    try:
        with urlopen(req,timeout=timeout) as resp:
            return resp.status,resp.read(65536)
    except HTTPError as resp:
        return resp.code,resp.read(4096)

history="/wp-json/esc/v1/chat-history?session_id="+session
status,_=request(history)
print("PSE_AGENT_UNAUTH_HISTORY_HTTP="+str(status))
if status not in (401,403):
    error("history_exposes_unauthed_endpoint")

status,_=request("/wp-json/esc/v1/clear-chat-history?session_id="+session)
print("PSE_AGENT_GET_CLEAR_HTTP="+str(status))
if status not in (404,405):
    error("clear_get_is_not_blocked")

keyed_status,_=request(history,credentials=True)
legacy_status,_=request(history,credentials=True,omit_key=True)
print("PSE_AGENT_AUTH_KEYED_HISTORY_HTTP="+str(keyed_status))
print("PSE_AGENT_AUTH_LEGACY_HISTORY_HTTP="+str(legacy_status))
if keyed_status!=200:
    error("woo_consumer_key_and_secret_not_authorized_on_live_backend")

bad=re.compile(r"xuongmunonbaohiem|nghiencuukhoahoc|blue[ -]?sea|mũ bảo hiểm|nongshim",re.I)
questions=(
    "PSE đang có những sản phẩm phân bón nào? Chỉ nêu dữ liệu đã công bố.",
    "Báo cáo thường niên PSE và thông tin cổ đông có thể xem ở đâu? Cho nguồn công khai.",
    "Báo cáo đó có tài liệu gốc nào đã được công bố không? Chỉ dùng nguồn xác minh."
)
for index,question in enumerate(questions,1):
    code,body=request("/wp-json/esc-agent/v1/chat","POST",
                      {"message":question,"sessionId":session},True,timeout=55)
    print("PSE_AGENT_CHAT_TURN_"+str(index)+"_HTTP="+str(code))
    if code!=200:error("chat_turn_"+str(index)+"_http_"+str(code))
    try:payload=json.loads(body.decode("utf-8"))
    except (UnicodeError,ValueError):error("chat_invalid_json")
    reply=payload.get("message") or payload.get("reply") or ""
    if not isinstance(reply,str) or len(reply.strip())<45:
        error("empty_or_short_chat_response")
    if bad.search(reply):
        error("legacy_tenant_brand_in_reply")
    print("PSE_AGENT_CHAT_TURN_"+str(index)+"_PASS chars="+str(len(reply)))
# Verify the same random session retained all three turns across unrelated topics,
# while never exposing user prompts/responses in logs.
history_status,history_body=request(history,credentials=True)
print("PSE_AGENT_PERSISTED_HISTORY_HTTP="+str(history_status))
if history_status!=200:error("history_after_chat_http_"+str(history_status))
try:records=json.loads(history_body.decode("utf-8"))
except (UnicodeError,ValueError):error("history_invalid_json")
if not isinstance(records,list):error("history_not_list")
user_turns=[row.get("message") for row in records if isinstance(row,dict) and row.get("sender")=="user"]
bot_turns=[row.get("message") for row in records if isinstance(row,dict) and row.get("sender")=="bot"]
if user_turns!=list(questions) or len(bot_turns)!=len(questions):
    error("cross_topic_session_history_mismatch")
print("PSE_AGENT_CROSS_TOPIC_HISTORY=PASS turns="+str(len(user_turns))+" persisted=PASS")

# Deletion must require the configured Bearer credential; avoid touching any
# customer session (this test creates and clears only a fresh random UUID).
clear_path="/wp-json/esc/v1/clear-chat-history?session_id="+session
status,_=request(clear_path,"POST",json_body={},credentials=False)
print("PSE_AGENT_UNAUTH_POST_CLEAR_HTTP="+str(status))
if status not in (401,403):error("clear_allowed_without_auth")
status,_=request(clear_path,"POST",json_body={},credentials=True)
print("PSE_AGENT_AUTH_POST_CLEAR_HTTP="+str(status))
if status!=200:error("authorized_clear_failed")
status,body=request(history,credentials=True)
if status!=200:error("post_clear_history_unavailable")
try:cleared=json.loads(body.decode("utf-8"))
except (UnicodeError,ValueError):error("post_clear_history_invalid_json")
if cleared!=[]:error("post_clear_history_not_empty")
print("PSE_AGENT_CLEAR_HISTORY=PASS synthetic_session_only=PASS")
print("PSE_AGENT_LIVE_SMOKE=PASS auth_history_clear_cross_topic; KNOWLEDGE_GROUNDING_REQUIRES_SOURCE_REVIEW=TRUE")
