# -*- coding: utf-8 -*-
"""화면이 쓰는 칸 — 목록과 확인 함수가 이 한 자리에 있다(명세 §4).

시스템 데이터가 바뀌어 화면이 깨지는 것을 판 번호 대신 「칸 확인」으로 잡는다(명세 §8 2026-10-19).
- 켤 때: `/api/health`·`/api/graph`를 확인한다 — 빠지면 `run.py`가 그 목록을 찍고 멈춘다.
- 쓰는 중: 중계 응답마다 확인한다 — 빠지면 `app.py`가 응답 헤더 `X-Platform-Missing`으로 화면에 알린다.
- 시스템이 새로 더한 칸은 보지 않는다(깨지지 않는다).
- 오류 응답(HTTP ≥ 400 또는 본문에 `error`)은 확인하지 않는다 — 서버 문면이 그대로 화면에 가야 한다.
"""
from __future__ import annotations

import json

# 주소 → {자리: [칸…]}.
#   ""        응답 맨 위
#   "이름[]"  맨 위 「이름」 목록의 원소마다
#   "이름"    맨 위 「이름」 객체 안
# 칸 이름은 명세 §4 표 그대로다. `/raw/<경로>`는 원본 파일이라 칸이 없다.
FIELDS: dict[str, dict[str, list[str]]] = {
    "/api/health": {
        "": ["home", "mode", "layers", "docs", "doc_types"],
    },
    "/api/graph": {
        "": ["nodes", "edges", "layers", "rels", "anchor", "detached", "roots",
             "explore_threshold", "force"],
        "nodes[]": ["id", "name", "category", "layer", "status", "tier", "polarity",
                    "made_by", "aliases", "attrs", "docs", "prov", "queue"],
        "edges[]": ["id", "src", "dst", "rel", "layer", "status", "prov", "cross"],
    },
    "/api/node/<id>": {
        "": ["id", "name", "anchor_path", "evidence", "evidence_total", "landed"],
    },
    "/api/neighbors/<id>": {
        "": ["id", "neighbors"],
    },
    "/api/doc/<doc_id>": {
        "": ["doc_id", "registry", "raw_rel", "rows", "tally", "sheet_roles", "nodes", "chunks"],
    },
    "/api/funnel": {
        "": ["keys", "rows", "total", "orphans", "정의"],
    },
    "/api/status": {
        "": ["query", "vectors", "stages", "line"],
    },
    "/api/query": {
        # `related`는 「관련 원문」 청크가 있을 때만 온다 — 확인하지 않는다(명세 §4).
        "": ["question", "path", "linked_nodes", "facts", "chunks", "doc_search", "records",
             "records_total", "truncated", "note", "trace"],
        "trace": ["intent", "linking", "link_stage", "hops", "facts", "collection",
                  "doc_search", "answer", "miss"],
    },
}

# 요청 경로의 앞부분 → 위 표의 주소. 정확히 같아야 하는 것과 앞이 같으면 되는 것을 가른다.
_EXACT = {"/api/health", "/api/graph", "/api/funnel", "/api/status", "/api/query"}
_PREFIX = {
    "/api/node/": "/api/node/<id>",
    "/api/neighbors/": "/api/neighbors/<id>",
    "/api/doc/": "/api/doc/<doc_id>",
}


def address_of(path: str) -> str | None:
    """요청 경로(쿼리 제외) → 칸 목록의 주소. 칸이 없는 주소(`/raw/…`·모르는 주소)는 None."""
    if path in _EXACT:
        return path
    for head, address in _PREFIX.items():
        if path.startswith(head) and len(path) > len(head):
            return address
    return None


def is_error(body, status: int = 200) -> bool:
    """오류 응답인가 — HTTP ≥ 400 또는 본문(객체)에 `error`."""
    return status >= 400 or (isinstance(body, dict) and "error" in body)


def check(address: str, body, status: int = 200) -> list[str]:
    """빠진 칸 목록. 다 있으면 빈 목록이다.

    `body`는 JSON을 푼 값(dict) 또는 응답 바이트다. 오류 응답이면 확인하지 않고 빈 목록을 낸다.
    빠진 칸은 `칸` · `목록[].칸` · `객체.칸` 꼴로 낸다(목록은 원소 하나라도 빠지면 그 칸을 한 번 적는다).
    """
    if isinstance(body, (bytes, bytearray, str)):
        try:
            body = json.loads(body)
        except ValueError:
            return [] if status >= 400 else ["(응답이 JSON이 아니다)"]
    if is_error(body, status):
        return []
    if not isinstance(body, dict):
        return ["(응답이 JSON 객체가 아니다)"]

    missing: list[str] = []
    for place, names in FIELDS[address].items():
        if place == "":
            missing += [k for k in names if k not in body]
        elif place.endswith("[]"):
            items = body.get(place[:-2])
            if not isinstance(items, list):
                continue                      # 목록 자체가 빠졌으면 맨 위에서 이미 적었다
            for k in names:
                if any(isinstance(it, dict) and k not in it for it in items):
                    missing.append(f"{place}.{k}")
        else:
            inner = body.get(place)
            if not isinstance(inner, dict):
                continue
            missing += [f"{place}.{k}" for k in names if k not in inner]
    return missing
