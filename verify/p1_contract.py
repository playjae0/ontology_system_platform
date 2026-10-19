# -*- coding: utf-8 -*-
"""P1 완료판정 ⓒ 칸 확인 — `contract.check`를 시험 안의 dict로 잰다.

    python verify/p1_contract.py

- 정상 응답 → 빈 목록. 칸 하나를 빼면 → 정확히 그 칸 하나.
- 시스템이 새로 더한 칸은 무시한다(빈 목록).
- 오류 응답(`{"error": …}` · 상태 400)은 확인하지 않는다(빈 목록).

아래 표본은 명세 §4의 칸 이름을 손으로 옮겨 적은 것이다(`contract.FIELDS`에서 만들지 않는다 — 같은 목록끼리 대면 아무것도 안 잰다).
"""
from __future__ import annotations

import copy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from backend.contract import address_of, check  # noqa: E402
from common import Report  # noqa: E402

NODE = {"id": "N1", "name": "a::b", "category": "C", "layer": "L", "status": "seed", "tier": "main",
        "polarity": "none", "made_by": "seed", "aliases": 2, "attrs": 0, "docs": ["seed"], "prov": "seed",
        "queue": None}
EDGE = {"id": "N1|r|N2", "src": "N1", "dst": "N2", "rel": "r", "layer": "L", "status": "seed", "prov": "seed",
        "cross": False}
SAMPLES = {
    "/api/health": {"home": "/h", "mode": "mock", "layers": ["L"], "docs": 1, "doc_types": 1},
    "/api/graph": {"nodes": [NODE, dict(NODE, id="N2")], "edges": [EDGE], "layers": ["L"], "rels": ["r"],
                   "anchor": {}, "detached": {"edgeless": [], "island": []}, "roots": ["N1"],
                   "explore_threshold": 1500, "force": {"scaling": 2}},
    "/api/node/<id>": {"id": "N1", "name": "a", "anchor_path": [], "evidence": [], "evidence_total": 0,
                       "landed": []},
    "/api/neighbors/<id>": {"id": "N1", "neighbors": []},
    "/api/doc/<doc_id>": {"doc_id": "D", "registry": {}, "raw_rel": None, "rows": 0, "tally": {},
                          "sheet_roles": {}, "nodes": [], "chunks": []},
    "/api/funnel": {"keys": [], "rows": [], "total": {}, "orphans": [], "정의": "…"},
    "/api/status": {"query": {}, "vectors": {}, "stages": [], "line": ""},
    "/api/query": {"question": "q", "path": "p", "linked_nodes": [], "facts": [], "chunks": [], "doc_search": [],
                   "records": [], "records_total": 0, "truncated": False, "note": "", "trace": {
                       "intent": "", "linking": [], "link_stage": "", "hops": [], "facts": [], "collection": {},
                       "doc_search": [], "answer": {}, "miss": []}},
}
PATHS = {"/api/health": "/api/health", "/api/graph": "/api/graph", "/api/node/<id>": "/api/node/01ABC",
         "/api/neighbors/<id>": "/api/neighbors/01ABC", "/api/doc/<doc_id>": "/api/doc/CP01",
         "/api/funnel": "/api/funnel", "/api/status": "/api/status", "/api/query": "/api/query"}


def main():
    rep = Report()
    wrong: list[str] = []
    cases = 0

    for address, full in SAMPLES.items():
        # 주소 읽기 — 요청 경로 → 칸 목록의 주소
        if address_of(PATHS[address]) != address:
            wrong.append(f"address_of({PATHS[address]}) = {address_of(PATHS[address])}")
        cases += 1
        if check(address, full) != []:
            wrong.append(f"{address} 정상 → {check(address, full)}")
        cases += 1
        if check(address, dict(full, 새칸="x")) != []:
            wrong.append(f"{address} 새 칸 → {check(address, dict(full, 새칸='x'))}")
        for key in full:                                   # 맨 위 칸 하나씩 빼기
            cases += 1
            body = {k: v for k, v in full.items() if k != key}
            got = check(address, body)
            if got != [key]:
                wrong.append(f"{address} -{key} → {got}")

    # 안쪽 칸 — 목록 원소 하나에서 · 객체 안에서
    for key in NODE:
        cases += 1
        g = copy.deepcopy(SAMPLES["/api/graph"])
        del g["nodes"][1][key]
        if check("/api/graph", g) != [f"nodes[].{key}"]:
            wrong.append(f"graph nodes[1]-{key} → {check('/api/graph', g)}")
    for key in EDGE:
        cases += 1
        g = copy.deepcopy(SAMPLES["/api/graph"])
        del g["edges"][0][key]
        if check("/api/graph", g) != [f"edges[].{key}"]:
            wrong.append(f"graph edges[0]-{key} → {check('/api/graph', g)}")
    for key in SAMPLES["/api/query"]["trace"]:
        cases += 1
        q = copy.deepcopy(SAMPLES["/api/query"])
        del q["trace"][key]
        if check("/api/query", q) != [f"trace.{key}"]:
            wrong.append(f"query trace-{key} → {check('/api/query', q)}")

    # 응답 바이트도 받는다(중계가 쓰는 꼴)
    cases += 1
    if check("/api/health", b'{"home": "/h", "mode": "mock", "layers": [], "docs": 0}') != ["doc_types"]:
        wrong.append("바이트 응답")
    rep.item("ⓒ-빠진 칸", not wrong, f"{cases}건 — 정상 → [] · 칸 하나 뺌 → 정확히 그 칸 · 새 칸 무시"
             + ("" if not wrong else f" · 어긋남 {wrong}"))

    # 오류 응답은 확인하지 않는다
    errs = [
        ("/api/node/<id>", {"error": "그 id는 지금 그래프에 없다"}, 404),
        ("/api/graph", {"error": "x"}, 400),
        ("/api/query", {"error": "q가 비었다"}, 400),
        ("/api/graph", {}, 400),                                   # 상태만 오류
        ("/api/health", {"error": "x"}, 200),                      # 본문만 오류
        ("/api/graph", b"502 Bad Gateway", 502),                   # JSON이 아닌 오류
    ]
    got = [check(a, b, s) for a, b, s in errs]
    rep.item("ⓒ-오류 응답", all(g == [] for g in got), f"{len(errs)}건 — 전부 확인하지 않음(빈 목록): {got}")
    return rep.finish()


if __name__ == "__main__":
    sys.exit(main())
