# -*- coding: utf-8 -*-
"""P2 완료판정 ⓐ~ⓚ — 질의 · 겹쳐 보기 · 상태 줄 · 오류 · 미스 · 노드 근거 · 문서 · 연결 현황 · 이 노드로 질문 · 쓰기 0 · 캡처.

    python verify/p2_query.py [--system ../ontology_system] [--chromium /opt/pw-browsers/chromium]

화면이 받은 바로 그 응답(브라우저가 받은 `/api/query` 등)과 화면의 칸을 비교한다 — mock 표본의 개수는 세지 않는다(CLAUDE.md §5).
시험 문항은 시스템 `tests/fixtures/queries.json`(읽기만)에서 읽는다.
"""
from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DEFAULT_SYSTEM, ROOT, Platform, Report, get_json, ps_table  # noqa: E402
from p1_screen import CAPTURES, GL_ARGS, JS_POSITIONS, screen_xy, state_hashes, wait_rest  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

# 겹쳐 보기 색 — 화면 `graph/style.ts`의 COLOR와 같은 값(링킹 · LLM 선별 · 확장 · 경로 엣지)
COLOR = {"link": "#ff8000", "pick": "#cc00cc", "reach": "#0066ff"}
PATH_COLOR = "#ff8000"
PICK = "embed+llm"

JS_PAINT = """() => { const p = window.__platform, s = p.sigma, nodes = {}, edges = [];
  p.graph.forEachNode((id) => { const d = s.getNodeDisplayData(id); nodes[id] = d ? d.color : null; });
  p.graph.forEachEdge((id, a) => { const d = s.getEdgeDisplayData(id);
    if (d && !d.hidden && d.size === 3) edges.push([a.edge.src, a.edge.rel, a.edge.dst, d.color]); });
  return { nodes, edges }; }"""


def count(page, sel: str) -> int:
    return page.locator(sel).count()


def ask(page, q: str):
    """질문을 넣고 보낸다 — 화면이 받은 `/api/query` 응답(상태 · JSON)을 돌려준다. 끝날 때까지(버튼이 다시 풀릴 때까지) 기다린다."""
    page.fill("[data-testid=q-input]", q)
    with page.expect_response(lambda r: "/api/query" in r.url) as info:
        page.click("[data-testid=q-send]")
    resp = info.value
    page.wait_for_function("() => !document.querySelector('[data-testid=q-send]').disabled")
    page.wait_for_timeout(150)
    try:
        body = resp.json()
    except Exception:  # noqa: BLE001
        body = None
    return resp.status, body


def screen_counts(page) -> dict:
    return {
        "linking": count(page, "[data-testid=q-linking] [data-item]"),
        "hops": count(page, "[data-testid=q-hops] [data-item]")
                + int(page.get_attribute("[data-testid=q-hops]", "data-more") or 0),
        "facts": count(page, "[data-testid=q-facts] [data-item]"),
        "facts_used": count(page, "[data-testid=q-facts] [data-item].used"),
        "collection": count(page, "[data-testid=q-collection] [data-item]"),
        "collection_used": count(page, "[data-testid=q-collection] [data-item].used"),
        "doc_search": count(page, "[data-testid=q-docsearch] [data-item]"),
        "doc_search_used": count(page, "[data-testid=q-docsearch] [data-item].used"),
        "records": count(page, "[data-testid=q-records] [data-item]"),
    }


def response_counts(body: dict) -> dict:
    tr = body["trace"]
    return {
        "linking": len(tr["linking"]),
        "hops": sum(len(h.get("edges") or []) for h in tr["hops"]),
        "facts": len(tr["facts"]), "facts_used": sum(1 for f in tr["facts"] if f.get("used") is True),
        "collection": len(tr["collection"]),
        "collection_used": sum(1 for c in tr["collection"] if c.get("used") is True),
        "doc_search": len(tr["doc_search"]), "doc_search_used": sum(1 for c in tr["doc_search"] if c.get("used") is True),
        "records": len(body["records"]),
    }


def paint_check(page, body: dict, drawn: set[str]) -> tuple[bool, str]:
    """칠한 노드 = linking ∪ hops.nodes(그린 것만) · 둘 다에 있으면 링킹 색 · 굵은 엣지 = hops.edges."""
    tr = body["trace"]
    want: dict[str, str] = {}
    for l in tr["linking"]:
        want[l["node_id"]] = "pick" if l.get("method") == PICK else "link"
    for h in tr["hops"]:
        for n in h.get("nodes") or []:
            want.setdefault(n, "reach")
    want_drawn = {n: k for n, k in want.items() if n in drawn}
    paint = page.evaluate(JS_PAINT)
    inv = {v: k for k, v in COLOR.items()}
    got = {n: inv[c] for n, c in paint["nodes"].items() if c in inv}
    want_edges = {f"{e['src']}|{e['rel']}|{e['dst']}" for h in tr["hops"] for e in (h.get("edges") or [])}
    got_edges = {f"{s}|{r}|{d}" for s, r, d, c in paint["edges"] if c == PATH_COLOR}
    drawn_edges = page.evaluate("() => { const o = []; window.__platform.graph.forEachEdge((id, a) =>"
                                " o.push(`${a.edge.src}|${a.edge.rel}|${a.edge.dst}`)); return o; }")
    want_edges_drawn = want_edges & set(drawn_edges)
    both = [n for n in want_drawn if any(l["node_id"] == n for l in tr["linking"])
            and any(n in (h.get("nodes") or []) for h in tr["hops"])]
    ok = got == want_drawn and got_edges == want_edges_drawn
    return ok, (f"칠한 노드 {len(got)} = 기대 {len(want_drawn)}(화면에 없는 것 {len(want) - len(want_drawn)}) · "
                f"링킹∩확장 {len(both)}개 링킹 색 · 굵은 엣지 {len(got_edges)} = 기대 {len(want_edges_drawn)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--system", type=Path, default=DEFAULT_SYSTEM)
    ap.add_argument("--chromium", default=None)
    args = ap.parse_args()
    rep = Report()
    CAPTURES.mkdir(parents=True, exist_ok=True)
    questions = [q["q"] for q in json.loads((args.system / "tests" / "fixtures" / "queries.json")
                                            .read_text(encoding="utf-8"))["queries"]]

    plat = Platform(args.system, "--allow-mock", "--no-browser")
    url = plat.wait_url()
    if not url:
        print(plat.output())
        return 1
    _c, health = get_json(url + "api/health")
    home = Path(health["home"])
    hashes_before = state_hashes(home)
    _c, pstatus = get_json(url + "platform/status")
    query_requests: list[str] = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=GL_ARGS, executable_path=args.chromium)
            page = browser.new_page(viewport={"width": 1500, "height": 900})
            errors: list[str] = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("request", lambda r: query_requests.append(r.url) if "/api/query" in r.url else None)
            page.goto(url)
            page.wait_for_function("window.__platform && window.__platform.layout.iterations > 0", timeout=30000)
            wait_rest(page)
            drawn = set(page.evaluate("() => window.__platform.graph.nodes()"))
            page.click("[data-testid=tab-query]")
            page.wait_for_timeout(300)
            rest = page.evaluate(JS_POSITIONS)

            # ⓐ 화면 = 응답 · ⓑ 겹쳐 보기 — 시험 문항 12개 각각
            bad_a, bad_b, miss_q = [], [], None
            for i, q in enumerate(questions):
                status, body = ask(page, q)
                if status != 200 or not body:
                    bad_a.append(f"{i}: HTTP {status}")
                    continue
                s, r = screen_counts(page), response_counts(body)
                if s != r:
                    bad_a.append(f"{i}: 화면 {s} ≠ 응답 {r}")
                ok, why = paint_check(page, body, drawn)
                if not ok:
                    bad_b.append(f"{i}: {why}")
                if i == 0:
                    rep_first = (r, why)
                    page.screenshot(path=str(CAPTURES / "p2_query_mock.png"))
                if not body["trace"]["linking"]:
                    miss_q = (i, q, body)
            moved = page.evaluate(JS_POSITIONS)
            same = all(moved[n] == rest[n] for n in rest)
            rep.item("ⓐ", not bad_a, f"문항 {len(questions)}개 — 칸 항목 수 = 응답 목록 길이(ⓐ·ⓑ·ⓒ·ⓓ·ⓔ·ⓖ · 쓴 것 표시 = used 수)"
                                     f" · 첫 문항 응답 {rep_first[0]}" + (f" · 어긋남 {bad_a}" if bad_a else ""))
            rep.item("ⓑ", not bad_b and same,
                     f"문항 {len(questions)}개 모두 칠한 노드·굵은 엣지 = trace · 첫 문항: {rep_first[1]} · "
                     f"12번 질의 전후 좌표 바뀐 노드 {sum(moved[n] != rest[n] for n in rest)}개"
                     + (f" · 어긋남 {bad_b}" if bad_b else ""))

            # ⓔ 미스 — trace.linking이 빈 문항(위 반복의 마지막 미스 문항이 지금 화면에 있다)
            if miss_q is None:
                rep.item("ⓔ", False, "링킹이 빈 문항이 없다")
            else:
                i, q, body = miss_q
                if questions[-1] != q:
                    ask(page, q)
                paint = page.evaluate(JS_PAINT)
                painted = sum(1 for c in paint["nodes"].values() if c in COLOR.values())
                bold = len(paint["edges"])
                miss_text = page.inner_text("[data-testid=q-miss]")
                ok = (count(page, "[data-testid=q-linking] [data-item]") == 0 and "미스" in miss_text
                      and painted == 0 and bold == 0)
                rep.item("ⓔ", ok, f"문항 {i + 1} 「{q}」 — 링킹 칸 {count(page, '[data-testid=q-linking] [data-item]')}개 · "
                                  f"미스 알림 「{miss_text.splitlines()[0] if miss_text else ''}」 · 칠한 노드 {painted} · 굵은 엣지 {bold}")

            # ⓒ 상태 줄 — 묻는 동안 상태 줄이 뜨고(버튼이 막힌 동안의 화면을 MutationObserver로 모두 적어 둔다),
            #    끝나면 지난 단계(query.seen)와 「끝」. mock 질의는 수십 ms라 중간 단계는 잡히지 않아도 된다(요청문 P2 ⓒ).
            page.evaluate("""() => { window.__qseen = []; const root = document.querySelector('.query');
              window.__qobs = new MutationObserver(() => { const st = document.querySelector('[data-testid=q-status]');
                const b = document.querySelector('[data-testid=q-send]');
                window.__qseen.push([st ? st.innerText : null, b ? b.disabled : null]); });
              window.__qobs.observe(root, { subtree: true, childList: true, characterData: true, attributes: true }); }""")
            ask(page, questions[0])
            states = page.evaluate("() => { window.__qobs.disconnect(); return window.__qseen; }")
            during = [t for t, dis in states if dis and t]
            _s, st = get_json(url + "api/status")
            line = page.inner_text("[data-testid=q-status]")
            stage = page.get_attribute("[data-testid=q-status]", "data-stage")
            seen_marks = count(page, "[data-testid=q-status] [data-seen]")
            ok = stage == "끝" and "질의 끝" in line and seen_marks == len(st["query"]["seen"]) and bool(during)
            rep.item("ⓒ", ok, f"묻는 동안(버튼 막힘) 상태 줄 {len(during)}번 바뀜 — 처음 「{during[0].splitlines()[0] if during else ''}」 · "
                              f"끝난 뒤 「{line.splitlines()[0]}」 · data-stage={stage} · ✓ {seen_marks}개 = query.seen {st['query']['seen']}")

            # ⓕ 노드 상세의 근거 — 근거가 있는 노드를 캔버스에서 누른다
            cands = []
            for n in sorted(drawn):
                _c, ev = get_json(url + f"api/node/{n}")
                if ev.get("evidence") and ev.get("anchor_path") and ev["anchor_path"]["steps"]:
                    cands.append((len(ev["evidence"]), n, ev))
            cands.sort(key=lambda t: (-t[0], t[1]))
            _k, nid, ev = cands[0]
            page.mouse.click(*screen_xy(page, nid))
            page.wait_for_selector("[data-testid=evidence]")
            shown_id = page.inner_text("[data-field=id]")
            evc = int(page.inner_text("[data-testid=evidence-count]"))
            steps = int(page.inner_text("[data-testid=anchor-steps]"))
            items = count(page, "[data-testid=evidence-item]")
            rep.item("ⓕ", shown_id == nid and evc == items == len(ev["evidence"]) and steps == len(ev["anchor_path"]["steps"]),
                     f"누른 노드 {nid[-6:]} → 상세 {shown_id[-6:]} · 근거 청크 화면 {evc}(카드 {items}) = 응답 evidence {len(ev['evidence'])} · "
                     f"닻까지의 길 {steps}단계 = anchor_path.steps {len(ev['anchor_path']['steps'])}")

            # ⓖ 문서 — 나온 문서를 누르면 문서 패널 · tally·rows·노드 수 = /api/doc · raw_rel 없으면 안내 · /raw 404 문면 그대로
            doc_id = page.inner_text("[data-testid=node-doc] >> nth=0")
            page.click("[data-testid=node-doc] >> nth=0")
            page.wait_for_selector("[data-testid=doc-rows]")
            _c, doc = get_json(url + f"api/doc/{doc_id}")
            tally = {page.get_attribute(f"[data-testid=doc-tally] tr >> nth={i}", "data-tally-key"):
                     int(page.inner_text(f"[data-testid=doc-tally] tr >> nth={i} >> td >> nth=1"))
                     for i in range(count(page, "[data-testid=doc-tally] tr"))}
            rows = int(page.inner_text("[data-testid=doc-rows]"))
            nodes = int(page.inner_text("[data-testid=doc-nodes]"))
            note_ok = (doc["raw_rel"] is None) == (count(page, "[data-testid=doc-raw-note]") == 1)
            raw_path = "raw/%EC%97%86%EB%8A%94/%ED%8C%8C%EC%9D%BC.xlsx"     # /raw/없는/파일.xlsx
            try:
                urllib.request.urlopen(url + raw_path)
                pl = (200, b"")
            except urllib.error.HTTPError as e:
                pl = (e.code, e.read())
            try:
                urllib.request.urlopen(pstatus["system_url"] + raw_path)
                sy = (200, b"")
            except urllib.error.HTTPError as e:
                sy = (e.code, e.read())
            ok = tally == doc["tally"] and rows == doc["rows"] and nodes == len(doc["nodes"]) and note_ok and pl == sy and pl[0] == 404
            rep.item("ⓖ", ok, f"문서 {doc_id} — tally 화면 {tally} = 응답 · 대장 {rows}행 = {doc['rows']} · 노드 {nodes} = {len(doc['nodes'])} · "
                              f"raw_rel={doc['raw_rel']} → 안내 문장 {'있음' if count(page, '[data-testid=doc-raw-note]') else '없음'} · "
                              f"/raw/없는/파일.xlsx 플랫폼 {pl[0]} 「{pl[1].decode('utf-8', 'replace')}」 = 시스템 {sy[0]}")
            page.screenshot(path=str(CAPTURES / "p2_doc_mock.png"))

            # ⓘ 이 노드로 질문 — 질문 칸에 이름이 들어가고 전송은 되지 않는다
            page.click("text=← 노드 상세로")
            page.wait_for_selector("[data-testid=ask-node]")
            name = page.inner_text("[data-testid=detail-name]")
            before_q = len(query_requests)
            page.click("[data-testid=ask-node]")
            page.wait_for_timeout(1000)
            value = page.input_value("[data-testid=q-input]")
            rep.item("ⓘ", value == name and len(query_requests) == before_q,
                     f"노드 「{name}」 → 질문 칸 「{value}」 · 누른 뒤 1초 동안 /api/query 요청 {len(query_requests) - before_q}건")

            # ⓗ 연결 현황 — 행 수 · 합계 · orphan 카드 · 정의가 표 위
            page.click("[data-testid=tab-funnel]")
            page.wait_for_selector("[data-testid=funnel-def]")
            _c, fun = get_json(url + "api/funnel")
            total = {page.get_attribute(f"[data-testid=funnel-total] th[data-key] >> nth={i}", "data-key"):
                     page.inner_text(f"[data-testid=funnel-total] th[data-key] >> nth={i}")
                     for i in range(count(page, "[data-testid=funnel-total] th[data-key]"))}
            def_y = page.locator("[data-testid=funnel-def]").bounding_box()["y"]
            table_y = page.locator("[data-testid=funnel] table").bounding_box()["y"]
            ok = (count(page, "[data-testid=funnel-row]") == len(fun["rows"])
                  and total == {k: str(v) for k, v in fun["total"].items() if k in fun["keys"]}
                  and count(page, "[data-testid=funnel-orphan]") == len(fun["orphans"])
                  and page.inner_text("[data-testid=funnel-def]") == fun["정의"] and def_y < table_y)
            rep.item("ⓗ", ok, f"행 {count(page, '[data-testid=funnel-row]')} = rows {len(fun['rows'])} · 합계 줄 = total · "
                              f"orphan 카드 {count(page, '[data-testid=funnel-orphan]')} = {len(fun['orphans'])} · 정의 문장이 표 위(y {def_y:.0f} < {table_y:.0f})")
            page.screenshot(path=str(CAPTURES / "p2_funnel_mock.png"))

            # ⓓ 오류 — 빈 질문(서버 문면 그대로) · 시스템 서버를 끈 뒤(중계 502 문면 그대로)
            page.click("[data-testid=tab-query]")
            ask(page, "")
            empty = page.inner_text("[data-testid=q-error]") if count(page, "[data-testid=q-error]") else ""
            kids = [pid for pid, pp, _s2, a in ps_table() if pp == plat.proc.pid and "run.py viewer" in a]
            for k in kids:
                os.kill(k, signal.SIGKILL)
            time.sleep(0.5)
            ask(page, questions[0])
            dead = page.inner_text("[data-testid=q-error]") if count(page, "[data-testid=q-error]") else ""
            ok = "q가 비었다" in empty and "400" in empty and "시스템 서버가 꺼졌다 — 플랫폼을 다시 켜라" in dead and "502" in dead
            rep.item("ⓓ", ok, f"빈 질문 → 「{empty}」 · 시스템 서버(pid {kids}) 끈 뒤 → 「{dead}」")
            if errors:
                print("페이지 오류:", errors)
            browser.close()
    finally:
        plat.stop()

    # ⓙ 쓰기 0
    hashes_after = state_hashes(home)
    changed = sorted(k for k in set(hashes_before) | set(hashes_after) if hashes_before.get(k) != hashes_after.get(k))
    porcelain = subprocess.run(["git", "-C", str(args.system), "status", "--porcelain"],
                               capture_output=True, text=True).stdout
    rep.item("ⓙ", not changed and porcelain == "",
             f"해시 대상 {len(hashes_before)}개 중 바뀐 것 {changed or '0개'} · 시스템 git status --porcelain "
             f"{'빈 출력' if porcelain == '' else repr(porcelain)}")
    # ⓚ 캡처 둘
    shots = [CAPTURES / "p2_query_mock.png", CAPTURES / "p2_funnel_mock.png"]
    rep.item("ⓚ", all(s.is_file() for s in shots), " · ".join(str(s.relative_to(ROOT)) for s in shots) + " (mock 표본)")
    return rep.finish()


if __name__ == "__main__":
    sys.exit(main())
