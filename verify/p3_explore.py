# -*- coding: utf-8 -*-
"""P3 완료판정 ⓐ~ⓜ — 탐색(골격 먼저 · 카테고리별 깊이 · 펼치기 · 질의 끌어오기) · 연결 수 크기 · 그리기 부하.

    python verify/p3_explore.py --chromium /opt/pw-browsers/chromium              # ⓐ~ⓘ · ⓛ · ⓜ
    python verify/p3_explore.py --only c --chromium …                              # ⓒ만 — 걸음 수치와 평균(판정 없음)
    python verify/p3_explore.py --before 4.21 --chromium …                         # ⓒ도 재고 비교 수치를 함께 찍는다

P4에서 고쳤다(명세 §8 2026-11-18): ⓒ는 판정에서 빼고 수치만 · ⓔ는 새 노드 ≤ 기존 노드인 펼침에서 < 2% ·
많이 펼친 판(새 > 기존)은 「전체 배치였다」만 본다(ⓔ-많이).

ⓙ(회귀)는 P1 확인 셋 · `p2_query.py`를, ⓚ는 `p16_drag.py --ref`를 따로 돌린다(요청문 §3).
합성 그래프는 `p3_synth.py`가 레포 밖 임시 폴더에 만들고 끝나면 지운다 — 수는 **동작 확인용**이다(CLAUDE.md §3).
mock · 합성 표본의 개수를 세는 어서션은 없다 — 화면과 응답이 같은지, 동작이 일어나는지만 잰다.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DEFAULT_SYSTEM, ROOT, Platform, Report, get_json  # noqa: E402
from p1_screen import GL_ARGS, JS_POSITIONS, screen_xy, state_hashes, wait_rest  # noqa: E402
from p3_synth import synth_system  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

CAPTURES = ROOT / "verify" / "captures"
SKELETON_ONLY_SOFT = 500          # 소프트웨어 그리기 문턱 — 플랫폼 코드의 상수와 같은 값(요청문 §2-②)

# 그리기 한 번을 기다린다 — 「이 움직임이 반영된 다음 그리기」: 끌기 처리(mousemovebody) 뒤에 온 afterRender.
JS_ARM_INSTALL = """() => { if (window.__p3armed) return; window.__p3armed = true;
  const s = window.__platform.sigma;
  s.getMouseCaptor().on('mousemovebody', () => { window.__p3mv = true; });
  s.on('afterRender', () => { if (window.__p3mv) window.__p3r = true; }); }"""
JS_ARM = "() => { window.__p3mv = false; window.__p3r = false; }"
JS_DEGREE = "() => { const g = window.__platform.graph, o = {}; g.forEachNode((id) => { o[id] = g.degree(id); }); return o; }"


def has_explore(page) -> bool:
    return bool(page.evaluate("() => !!(window.__platform && window.__platform.explore)"))


def set_all(page):
    """「전체」 — 이번 회차 화면이면 누른다(지금 코드는 늘 전체를 그린다)."""
    if has_explore(page):
        page.click("[data-testid=depth-all]")
        page.wait_for_function("() => window.__platform.explore.mode === 'all'")


def drag_steps(page, node: str, steps: int = 10, px: float = 8) -> list[float]:
    """쉰 상태에서 `node`를 8px씩 `steps`걸음 끈다 — 걸음마다 그 움직임이 그려질 때까지 걸린 초."""
    wait_rest(page, timeout=600000)
    page.evaluate(JS_ARM_INSTALL)
    x, y = screen_xy(page, node)
    page.mouse.move(x, y)
    page.mouse.down()
    times = []
    for i in range(1, steps + 1):
        page.evaluate(JS_ARM)
        t0 = time.perf_counter()
        page.mouse.move(x + px * i, y)
        page.wait_for_function("() => window.__p3r === true", polling=5, timeout=120000)
        times.append(time.perf_counter() - t0)
    page.mouse.up()
    return times


def open_page(p, args, url: str):
    browser = p.chromium.launch(args=GL_ARGS, executable_path=args.chromium)
    ctx = browser.new_context(viewport={"width": 1500, "height": 900})
    requests: list[str] = []
    ctx.on("request", lambda r: requests.append(r.url))
    page = ctx.new_page()
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(url)
    page.wait_for_function("() => !!window.__platform", timeout=120000)
    return browser, page, requests, errors


def check_c(p, args, rep: Report):
    """ⓒ — 합성 2,000 · 「전체」 · 연결 수가 가장 많은 노드를 8px씩 10걸음."""
    with synth_system(2000) as (sysdir, info):
        plat = Platform(sysdir, "--allow-mock", "--no-browser")
        try:
            url = plat.wait_url()
            browser, page, _req, errors = open_page(p, args, url)
            set_all(page)
            wait_rest(page, timeout=600000)
            deg = page.evaluate(JS_DEGREE)
            hub = max(deg, key=lambda k: (deg[k], k))
            times = drag_steps(page, hub)
            avg = sum(times) / len(times)
            detail = (f"합성 {info['nodes']}노드(동작 확인용) · 허브 {hub[-6:]} 연결 {deg[hub]} · 걸음 "
                      + " ".join(f"{t:.2f}" for t in times) + f" · 평균 {avg:.2f}초")
            # 판정에서 뺐다 — 수치만 찍는다(명세 §8 2026-11-18 · 요청문 P4 ⑥). 판정은 사내 손맛.
            ref = f" · 비교 {args.before:.2f}초" if args.before else ""
            rep.item("ⓒ(수치)", True, f"{detail}{ref} — 동작 확인 · 판정은 사내 손맛")
            browser.close()
        finally:
            plat.stop()


# ── 따로 세는 잣대 — /api/graph로(화면 코드와 별개로) ────────────────────────────────

def expected_visible(g: dict, depths: dict, extra: set[str] = frozenset()) -> set[str]:
    """골격 ∪ {깊이에 드는 노드} ∪ extra, 그리고 그들의 골격까지의 길(anchor.host를 골격까지) — 명세 §5.4를 따로 셈."""
    anc, by = g["anchor"], {n["id"]: n for n in g["nodes"]}
    out: set[str] = set()

    def add(i):
        guard = 0
        while i and i in anc and i not in out and guard < 100000:
            out.add(i)
            if by[i].get("status") == "seed":
                return
            h = anc[i]["host"]
            i = None if h == i else h
            guard += 1
    for n in g["nodes"]:
        if n["id"] not in anc:
            continue
        if n.get("status") == "seed":
            add(n["id"])
            continue
        d = depths.get(n.get("category") or "—", 0)
        if d == "all" or (d and anc[n["id"]]["hops"] <= d):
            add(n["id"])
    for i in extra:
        add(i)
    return out


def anchored(g):
    return {n["id"] for n in g["nodes"] if n["id"] in g["anchor"]}


def skeleton(g):
    return {n["id"] for n in g["nodes"] if n["id"] in g["anchor"] and n.get("status") == "seed"}


def shown(page) -> set[str]:
    return set(page.evaluate("() => window.__platform.explore.shown"))


def drawn(page) -> set[str]:
    return set(page.evaluate("() => window.__platform.graph.nodes()"))


def wait_settle(page):
    """보이는 노드가 바뀐 뒤 — 그리는 그래프가 보이는 노드와 같아지고 배치가 쉴 때까지."""
    page.wait_for_function("""() => { const p = window.__platform; const s = new Set(p.explore.shown);
        const g = p.graph.nodes(); return g.length === s.size && g.every((x) => s.has(x)); }""", timeout=120000)
    page.wait_for_timeout(100)
    wait_rest(page, timeout=600000)


def label_synth(page, text: str):
    """화면 캡처에 「합성」을 적는다 — 플랫폼 코드가 아니라 확인 스크립트가 캡처 직전에 띠 하나를 얹는다(CLAUDE.md §3)."""
    page.evaluate("""(t) => { let d = document.getElementById('p3-synth-band');
        if (!d) { d = document.createElement('div'); d.id = 'p3-synth-band'; document.body.appendChild(d); }
        d.textContent = t; Object.assign(d.style, {position: 'fixed', left: '50%', top: '4px', transform: 'translateX(-50%)',
          background: '#7a4b00', color: '#fff', padding: '3px 10px', fontSize: '13px', zIndex: 9999, borderRadius: '4px'}); }""", text)


def rms_radius(pos: dict) -> float:
    cx = sum(p[0] for p in pos.values()) / len(pos)
    cy = sum(p[1] for p in pos.values()) / len(pos)
    return math.sqrt(sum((p[0] - cx) ** 2 + (p[1] - cy) ** 2 for p in pos.values()) / len(pos))


JS_EDGES = "() => window.__platform.graph.mapEdges((k, a, s, t) => [s, t])"
JS_HOPS = """(src) => { const g = window.__platform.graph, h = {[src]: 0}, q = [src];
  for (let i = 0; i < q.length; i++) { const u = q[i];
    g.forEachNeighbor(u, (v) => { if (!(v in h)) { h[v] = h[u] + 1; q.push(v); } }); }
  return h; }"""


# ── 판정 ────────────────────────────────────────────────────────────────────

def check_a_mock(p, args, rep: Report, sysdir: Path, label: str, expect: str, want_soft: bool = False):
    plat = Platform(sysdir, "--allow-mock", "--no-browser")
    try:
        url = plat.wait_url()
        _st, g = get_json(url + "api/graph")
        browser, page, _req, errors = open_page(p, args, url)
        page.wait_for_function("() => window.__platform.explore.mode !== null")
        mode = page.evaluate("() => window.__platform.explore.mode")
        want = anchored(g) if expect == "all" else skeleton(g)
        sh, dr = shown(page), drawn(page)
        ren = page.evaluate("() => window.__platform.renderer")
        head = page.inner_text("[data-testid=renderer]")
        title = page.get_attribute("[data-testid=renderer]", "title")
        ok = mode == expect and sh == want and dr == want and not errors
        if want_soft:
            ok = ok and ren.get("software") is True and "소프트웨어" in head
        rep.item("ⓐ", ok, f"{label} → 「{'전체' if mode == 'all' else '골격만' if mode == 'skeleton' else mode}」 · "
                 f"보이는 노드 = {'닻 있는 노드' if expect == 'all' else '골격 노드'} {sh == want} · 그린 노드 같음 {dr == want} · "
                 f"머리 줄 「{head}」 · 툴팁 「{title}」 · 오류 {len(errors)}")
        browser.close()
    finally:
        plat.stop()


def check_big(p, args, rep: Report, before: float | None):
    """합성 2,000 한 판에서 ⓑ ⓓ ⓔ ⓕ ⓖ ⓜ(+ⓒ)."""
    with synth_system(2000) as (sysdir, info):
        tag = f"합성 {info['nodes']}노드 · 동작 확인용"
        plat = Platform(sysdir, "--allow-mock", "--no-browser")
        try:
            url = plat.wait_url()
            _st, g = get_json(url + "api/graph")
            browser, page, requests, errors = open_page(p, args, url)
            page.wait_for_function("() => window.__platform.explore.mode === 'skeleton'", timeout=120000)
            wait_settle(page)
            sk = skeleton(g)
            by = {n["id"]: n for n in g["nodes"]}

            # ⓑ 깊이 표 — 골격 밖 노드가 가장 많은 카테고리를 1로
            cats: dict[str, int] = {}
            for n in g["nodes"]:
                if n["id"] in g["anchor"] and n.get("status") != "seed":
                    cats[n.get("category") or "—"] = cats.get(n.get("category") or "—", 0) + 1
            cat = max(cats, key=lambda c: (cats[c], c))
            page.click(f"[data-testid=depth-table] tr[data-cat='{cat}'] button[data-depth='1']")
            wait_settle(page)
            want = expected_visible(g, {cat: 1})
            sh, dr = shown(page), drawn(page)
            table = page.evaluate("""() => Object.fromEntries([...document.querySelectorAll('[data-testid=depth-table] tr')]
                .map((tr) => [tr.dataset.cat, tr.querySelector('[data-testid=depth-count]').textContent]))""")
            drawn_cat = {c: sum(1 for i in dr if by[i].get("status") != "seed" and (by[i].get("category") or "—") == c)
                         for c in cats}
            table_ok = all(table[c] == f"{drawn_cat[c]}/{cats[c]}" for c in cats)
            page.click("[data-testid=depth-all]")
            wait_settle(page)
            all_ok = shown(page) == anchored(g) and drawn(page) == anchored(g)
            page.click("[data-testid=depth-skeleton]")
            wait_settle(page)
            sk_ok = shown(page) == sk and drawn(page) == sk
            rep.item("ⓑ", sh == want and dr == want and table_ok and all_ok and sk_ok,
                     f"{tag} · 「{cat}」(골격 밖 {cats[cat]}) 깊이 1 → 보이는 노드 {len(sh)} = 따로 셈 {len(want)} "
                     f"{sh == want} · 그린 노드 같음 {dr == want} · 표의 수 = 그린 수 {table_ok} · 「전체」 {all_ok} · 「골격만」 {sk_ok}")

            # ⓓ 펼치기 — 이웃이 가장 많은 골격 노드를 두 번 누름
            nb = {i: get_json(url + "api/neighbors/" + urllib.parse.quote(i))[1].get("neighbors", []) for i in sk}
            hub = max(sk, key=lambda i: (len(nb[i]), i))
            before_set = shown(page)
            before_pos = page.evaluate(JS_POSITIONS)
            ratio0 = page.evaluate("() => window.__platform.sigma.getCamera().ratio")
            x, y = screen_xy(page, hub)
            n_req0 = len(requests)
            page.mouse.dblclick(x, y)
            page.wait_for_function("() => window.__platform.explore.chips.length === 1", timeout=60000)
            wait_settle(page)
            after = shown(page)
            added = after - before_set
            want_add = expected_visible(g, {}, {hub, *[i for i in nb[hub] if i in g["anchor"]]}) - before_set
            ratio1 = page.evaluate("() => window.__platform.sigma.getCamera().ratio")
            chip = page.inner_text("[data-testid=chip] .xchip-label")
            chip_n = int(chip.rsplit("+", 1)[1])
            after_pos = page.evaluate(JS_POSITIONS)

            # ⓔ-많이 — 많이 펼친 판의 배치 종류(이동·쌍 거리는 참고로만 찍는다)
            hops = page.evaluate(JS_HOPS, hub)
            far = [i for i in before_set if hops.get(i, 99) >= 4 and i in after_pos]
            rad = rms_radius({i: before_pos[i] for i in before_set})
            far_move = (sum(math.dist(after_pos[i], before_pos[i]) for i in far) / len(far) / rad) if far else 0.0
            edges = {tuple(sorted(e)) for e in page.evaluate(JS_EDGES) if e[0] != e[1]}
            ids = sorted(after_pos)
            con = [math.dist(after_pos[a], after_pos[b]) for a, b in edges]
            non = [math.dist(after_pos[a], after_pos[b]) for k, a in enumerate(ids) for b in ids[k + 1:]
                   if (a, b) not in edges]
            pair = (sum(con) / len(con)) / (sum(non) / len(non))
            # 많이 펼친 판(새 > 기존)은 「그림을 새로 잡는다」 — 배치 종류가 전체 배치였는지만 본다(명세 §5.1 · B-02 A).
            kind1 = page.evaluate("() => window.__platform.layout.kind")
            n_fresh, n_kept = len(added), len(before_set)
            rep.item("ⓔ-많이", kind1 == "layout" and n_fresh > n_kept,
                     f"{tag} · 새 {n_fresh} > 기존 {n_kept} → 배치 {kind1}(전체 배치여야 한다) · 참고: 4홉 이상 기존 노드 "
                     f"{len(far)}개 평균 이동 / 반경 {far_move:.3%} · 연결 ÷ 비연결 {pair:.3f}")

            # 캡처 ① — 「골격만」에서 하나 펼친 화면
            CAPTURES.mkdir(parents=True, exist_ok=True)
            label_synth(page, f"합성 그래프 {info['nodes']}노드 — 동작 확인용(품질 근거 아님) · 「골격만」에서 하나 펼침")
            cap1 = CAPTURES / "p3_expand_synth.png"
            page.screenshot(path=str(cap1))

            page.click("[data-testid=chip-x]")
            wait_settle(page)
            back = shown(page) == before_set

            # Enter 펼치기 — 숨은 노드 이름으로 찾기 → 「보임 0 · 숨김 k」 → Enter
            hidden = sorted(i for i in anchored(g) - shown(page) if by[i].get("status") != "seed")
            target = next(i for i in hidden
                          if not any(by[i]["name"].lower() in by[j]["name"].lower() for j in shown(page)))
            page.fill("[data-testid=search]", by[target]["name"])
            page.wait_for_function("() => (document.querySelector('[data-testid=search-hits]')||{}).textContent?.startsWith('보임')")
            hits_txt = page.inner_text("[data-testid=search-hits]")
            page.press("[data-testid=search]", "Enter")
            page.wait_for_function("() => window.__platform.explore.chips.length === 1", timeout=60000)
            wait_settle(page)
            tnb = {i for i in get_json(url + "api/neighbors/" + urllib.parse.quote(target))[1].get("neighbors", [])
                   if i in g["anchor"]}
            enter_ok = hits_txt.startswith("보임 0 · 숨김 ") and {target, *tnb} <= shown(page)
            page.fill("[data-testid=search]", "")
            page.click("[data-testid=depth-skeleton]")
            wait_settle(page)
            rep.item("ⓓ", added == want_add and chip_n == len(added) and ratio0 == ratio1 and back and enter_ok,
                     f"{tag} · 골격 {hub[-6:]}(이웃 {len(nb[hub])}) 두 번 누름 → 더해진 {len(added)} = 따로 셈 {len(want_add)} "
                     f"{added == want_add} · 칩 「{chip}」 · 카메라 비율 {ratio0:.4f}→{ratio1:.4f} · 칩 × → 펼치기 전 {back} · "
                     f"찾기 「{hits_txt}」 → Enter → 그 노드와 이웃 {len(tnb)} 보임 {enter_ok}")

            # ⓔ 새 노드 ≤ 기존 노드인 펼치기 — ⑤의 「자리 잡기」 갈래(제자리 용수철 + 식힘)를 잰다.
            #   ⓓ의 펼치기는 새 노드(이웃)가 기존(골격)보다 많아 ⑤ 규칙대로 전체 배치가 돈다 — 위 ⓔ-많이(B-02 A).
            page.click(f"[data-testid=depth-table] tr[data-cat='{cat}'] button[data-depth='1']")
            wait_settle(page)
            base2 = shown(page)
            pos2 = page.evaluate(JS_POSITIONS)
            # 펼칠 노드 — 보이는 노드 중 연결 수가 큰 40개에서 숨은 이웃(닻 있음)이 가장 많은 것(새 노드 ≤ 기존 노드가 되게)
            deg_g: dict[str, int] = {}
            for e in g["edges"]:
                deg_g[e["src"]] = deg_g.get(e["src"], 0) + 1
                deg_g[e["dst"]] = deg_g.get(e["dst"], 0) + 1
            cand = sorted(base2, key=lambda i: (-deg_g.get(i, 0), i))[:40]
            hidden_nb = {i: [j for j in get_json(url + "api/neighbors/" + urllib.parse.quote(i))[1].get("neighbors", [])
                             if j in g["anchor"] and j not in base2] for i in cand}
            src2 = max(cand, key=lambda i: (len(hidden_nb[i]), i))
            x, y = screen_xy(page, src2)
            page.mouse.dblclick(x, y)
            page.wait_for_function("() => window.__platform.explore.chips.length === 1", timeout=60000)
            wait_settle(page)
            kind2 = page.evaluate("() => window.__platform.layout.kind")
            fresh2 = shown(page) - base2
            pos3 = page.evaluate(JS_POSITIONS)
            hops2 = page.evaluate(JS_HOPS, src2)
            far2 = [i for i in base2 if hops2.get(i, 99) >= 4 and i in pos3]
            rad2 = rms_radius({i: pos2[i] for i in base2})
            mv2 = (sum(math.dist(pos3[i], pos2[i]) for i in far2) / len(far2) / rad2) if far2 else 0.0
            e2 = {tuple(sorted(e)) for e in page.evaluate(JS_EDGES) if e[0] != e[1]}
            ids2 = sorted(pos3)
            con2 = [math.dist(pos3[a], pos3[b]) for a, b in e2]
            non2 = [math.dist(pos3[a], pos3[b]) for k, a in enumerate(ids2) for b in ids2[k + 1:] if (a, b) not in e2]
            pair2 = (sum(con2) / len(con2)) / (sum(non2) / len(non2))
            # 판정 자리(명세 §8 2026-11-18): 새 노드 ≤ 기존 노드인 펼침에서 먼 기존 노드 < 반경의 2% · 연결 ÷ 비연결 < 0.5.
            rep.item("ⓔ", mv2 < 0.02 and pair2 < 0.5 and kind2 == "settle" and 0 < len(fresh2) <= len(base2),
                     f"{tag} · 「{cat}」 깊이 1(기존 {len(base2)})에서 {src2[-6:]}를 펼침 → 새 {len(fresh2)} · 배치 {kind2} · "
                     f"4홉 이상 기존 노드 {len(far2)}개 평균 이동 / 반경 {mv2:.3%} · 연결 ÷ 비연결 평균 거리 {pair2:.3f}")
            page.click("[data-testid=depth-skeleton]")
            wait_settle(page)

            # ⓕ 질의 끌어오기 — 시스템 queries.json 첫·둘째 문항
            qs = [q["q"] for q in json.loads((Path(args.system) / "tests/fixtures/queries.json").read_text(encoding="utf-8"))["queries"]]
            page.click("[data-testid=tab-query]")
            base = shown(page)
            n0 = len(requests)
            from p2_query import ask  # noqa: E402
            _s, body = ask(page, qs[0])
            wait_settle(page)
            tr = body["trace"]
            paint = {l["node_id"] for l in tr.get("linking", [])} | {n for h in tr.get("hops", []) for n in h.get("nodes", [])}
            want_paint = {i for i in paint if i in g["anchor"]}
            chips1 = page.evaluate("() => window.__platform.explore.chips")
            ok1 = want_paint <= shown(page) and len(chips1) == 1 and chips1[0]["kind"] == "query"
            page.click("[data-testid=tab-graph]")
            label_synth(page, f"합성 그래프 {info['nodes']}노드 — 동작 확인용(품질 근거 아님) · 질의를 끌어온 화면")
            cap2 = CAPTURES / "p3_query_synth.png"
            page.screenshot(path=str(cap2))
            page.click("[data-testid=tab-query]")
            _s, body2 = ask(page, qs[1])
            wait_settle(page)
            chips2 = page.evaluate("() => window.__platform.explore.chips")
            ok2 = len(chips2) == 1 and chips2[0]["label"] != chips1[0]["label"]
            page.click("text=겹쳐 보기 지우기")
            wait_settle(page)
            chips3 = page.evaluate("() => window.__platform.explore.chips")
            ok3 = not chips3 and shown(page) == base
            pulls = [u for u in requests[n0:] if "/api/neighbors" in u or "/api/graph" in u]
            rep.item("ⓕ", ok1 and ok2 and ok3 and not pulls,
                     f"{tag} · 첫 문항 「{qs[0]}」 칠할 노드(닻 있음) {len(want_paint)} 전부 보임 {ok1} · 칩 「{chips1[0]['label'] if chips1 else '—'} "
                     f"+{chips1[0]['added'] if chips1 else 0}」 · 둘째 → 칩 바뀜(하나) {ok2} · 지우기 → 칩 빠지고 질의 전 집합 {ok3} · "
                     f"끌어오는 동안 /api/neighbors·/api/graph 요청 {len(pulls)}")
            page.click("[data-testid=tab-graph]")

            # ⓖ 크기 — 연결 수가 큰 노드가 작게 그려지는 쌍 0 · 같은 수는 같은 크기 · 최소~최대 · 토글·깊이로 그대로
            page.click("[data-testid=depth-all]")
            wait_settle(page)
            deg: dict[str, int] = {}
            for e in g["edges"]:
                deg[e["src"]] = deg.get(e["src"], 0) + 1
                deg[e["dst"]] = deg.get(e["dst"], 0) + 1
            js_size = "() => { const g = window.__platform.graph, o = {}; g.forEachNode((id, a) => { o[id] = a.size; }); return o; }"
            size = page.evaluate(js_size)
            lo, hi = min(size.values()), max(size.values())
            ordered = sorted(size, key=lambda i: deg.get(i, 0))
            bad = sum(1 for a, b in zip(ordered, ordered[1:])
                      if (deg.get(a, 0) < deg.get(b, 0) and size[a] > size[b]) or (deg.get(a, 0) == deg.get(b, 0) and size[a] != size[b]))
            page.click("[data-testid=rels-none]")
            page.wait_for_timeout(200)
            size2 = page.evaluate(js_size)
            page.click("[data-testid=rels-all]")
            page.click(f"[data-testid=depth-table] tr[data-cat='{cat}'] button[data-depth='1']")
            wait_settle(page)
            size3 = page.evaluate(js_size)
            same = all(size2[i] == size[i] for i in size2) and all(size3[i] == size[i] for i in size3)
            px = page.evaluate("() => { const s = window.__platform.sigma; const g = window.__platform.graph; let lo = 1e9, hi = 0;"
                               " g.forEachNode((id) => { const d = s.getNodeDisplayData(id); if (d) { lo = Math.min(lo, d.size); hi = Math.max(hi, d.size); } });"
                               " return [lo, hi]; }")
            rep.item("ⓖ", bad == 0 and 3 <= lo and hi <= 18 and same,
                     f"{tag} · 연결 수 순으로 크기가 거꾸로이거나 같은 수에 다른 크기인 이웃 쌍 {bad} · 크기 {lo:.2f}~{hi:.2f}(상수 3~18 · 그린 픽셀 "
                     f"{px[0]:.2f}~{px[1]:.2f}) · 관계 전부 끄기·깊이 바꿈 뒤 노드마다 같음 {same}")

            # ⓒ 끌기 한 걸음 — 「전체」 · 연결 수가 가장 많은 노드
            if before is not None:
                set_all(page)
                wait_settle(page)
                dg = page.evaluate(JS_DEGREE)
                hubc = max(dg, key=lambda k: (dg[k], k))
                times = drag_steps(page, hubc)
                avg = sum(times) / len(times)
                rep.item("ⓒ(수치)", True,
                         f"{tag} · 허브 {hubc[-6:]} 연결 {dg[hubc]} · 걸음 " + " ".join(f"{t:.2f}" for t in times)
                         + f" · 평균 {avg:.2f}초 · 비교 {before:.2f}초 — 동작 확인 · 판정은 사내 손맛")
            rep.item("ⓜ", cap1.exists() and cap2.exists(), f"{cap1.relative_to(ROOT)} · {cap2.relative_to(ROOT)} (「합성」 띠)")
            rep.item("오류", not errors, f"페이지 오류 {len(errors)} {errors[:2]}")
            browser.close()
            ext = [u for u in requests if not u.startswith("http://127.0.0.1")]
            return ext
        finally:
            plat.stop()


def check_h(p, args, rep: Report):
    """ⓗ — /api/graph 응답을 가로채 엣지 하나를 복제해 넣는다."""
    plat = Platform(Path(args.system), "--allow-mock", "--no-browser")
    try:
        url = plat.wait_url()
        browser = p.chromium.launch(args=GL_ARGS, executable_path=args.chromium)
        page = browser.new_page(viewport={"width": 1500, "height": 900})
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        def dup(route):
            r = route.fetch()
            body = r.json()
            body["edges"].append(dict(body["edges"][0]))
            route.fulfill(response=r, json=body)
        page.route("**/api/graph", dup)
        page.goto(url)
        page.wait_for_function("() => !!window.__platform && window.__platform.graph.order > 0", timeout=120000)
        note = page.inner_text("[data-testid=dup-edges]")
        rep.item("ⓗ", "같은 엣지 1개는 한 번만 그렸다" in note and not errors,
                 f"엣지 하나를 복제해 넣음 → 그래프 그려짐(노드 {page.evaluate('() => window.__platform.graph.order')}) · 「{note}」 · 오류 {len(errors)}")
        browser.close()
    finally:
        plat.stop()


def check_i(rep: Report):
    """ⓘ — README 사내 절."""
    text = (ROOT / "README.md").read_text(encoding="utf-8")
    dev = text.find("## 개발 세션 전용")
    head = text[:dev if dev >= 0 else len(text)]
    alias_lines = [ln for ln in text.splitlines() if "alias onto-platform" in ln]
    ok = ("~/onto" not in head and alias_lines and all("--no-browser" in ln for ln in alias_lines)
          and "ssh -L" in head and "VS Code" in head and not re.search("mock", head, re.IGNORECASE))
    rep.item("ⓘ", bool(ok), f"사내 절 ~/onto {head.count('~/onto')} · 별칭 줄 {len(alias_lines)}개 전부 --no-browser "
             f"{all('--no-browser' in ln for ln in alias_lines)} · 포트 전달 VS Code {'VS Code' in head} · ssh -L {'ssh -L' in head} · "
             f"「## 개발 세션 전용」 앞 mock {len(re.findall('mock', head, re.IGNORECASE))}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chromium", default=None)
    ap.add_argument("--system", type=Path, default=DEFAULT_SYSTEM)
    ap.add_argument("--only", default=None, help="이 항목만(예: c)")
    ap.add_argument("--before", type=float, default=None, help="ⓒ 착수 전 평균(초) — 전제 12의 출력")
    args = ap.parse_args()
    rep = Report()
    status0 = subprocess.run(["git", "-C", str(args.system), "status", "--porcelain"], capture_output=True, text=True).stdout
    home = Path(args.system) / "state_mock"
    hash0 = state_hashes(home)
    with sync_playwright() as p:
        if args.only == "c":
            check_c(p, args, rep)
            sys.exit(rep.finish())
        check_i(rep)
        check_a_mock(p, args, rep, Path(args.system), "mock", "all")
        with synth_system(800) as (d800, info800):
            check_a_mock(p, args, rep, d800, f"합성 {info800['nodes']}노드(동작 확인용)", "skeleton", want_soft=True)
        check_h(p, args, rep)
        ext = check_big(p, args, rep, args.before)
    status1 = subprocess.run(["git", "-C", str(args.system), "status", "--porcelain"], capture_output=True, text=True).stdout
    left = list(Path("/tmp").glob("p3synth_*"))
    same_state = state_hashes(home) == hash0
    rep.item("ⓛ", not status0 and not status1 and not ext and not left and same_state,
             f"상태 폴더 data·registry·layers 해시 그대로 {same_state} · 시스템 폴더 git status 빈 출력 {not status1} · "
             f"외부(127.0.0.1 밖) 요청 {len(ext)} · 남은 합성 임시 폴더 {len(left)}")
    sys.exit(rep.finish())


if __name__ == "__main__":
    main()
