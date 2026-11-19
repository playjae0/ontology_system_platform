# -*- coding: utf-8 -*-
"""P5 완료판정 — 배치와 그림(d3-force 배치 · 원 겹침 막기 · 배치 좌표 기준 크기 · 직선 · 이름 자리).

    python verify/p5_layout.py --before <레포 밖 파일> --chromium …    # 전제 13 — 지금 판의 수치를 재서 저장(판정 없음)
    python verify/p5_layout.py --compare <그 파일> --chromium …        # 바꾼 판 — ⓐ ⓑ ⓔ ⓕ ⓖ ⓗ ⓙ ⓚ ⓛ(지금 판과 나란히)

ⓒ(자리 잡기)는 `p3_explore.py` ⓔ · ⓔ-많이와 `p4_filters.py` ⓑ, ⓓ(직선)는 `p1_screen.py` ⓖ, ⓘ(회귀)는 기존 스크립트들이 잰다(요청문 §3).
합성 그래프는 `p3_synth.py`가 레포 밖 임시 폴더에 만들고 지운다 — 수는 **동작 확인용**이다(CLAUDE.md §3).
mock · 합성 표본의 개수를 세는 어서션은 없다 — 성질(겹침 · 길이 비 · 따라오는 비 · 같음)과 동작만 잰다.
"""
from __future__ import annotations

import argparse
import json
import math
import statistics
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DEFAULT_SYSTEM, ROOT, Platform, Report  # noqa: E402
from p1_screen import GL_ARGS, JS_POSITIONS, screen_xy, state_hashes, wait_rest  # noqa: E402
from p15_drag import JS_DEGREE, JS_HOPS, drag, fmt, hop_ratios  # noqa: E402
from p16_drag import nudge  # noqa: E402
from p3_explore import JS_EDGES, drag_steps, label_synth, shown  # noqa: E402
from p3_synth import synth_system  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

CAPTURES = ROOT / "verify" / "captures"
N_SYNTH = 1500
OVERLAP_TOL = 0.05     # 반지름의 5% 넘게 겹친 쌍만 센다(요청문 ⓐ)

# 그린 원 — [id, 화면 x, 화면 y, 화면 반지름(px)] · 숨김 제외
JS_SCREEN = """() => { const p = window.__platform, s = p.sigma, g = p.graph, o = [];
  g.forEachNode((id, a) => { const d = s.getNodeDisplayData(id); if (!d || d.hidden) return;
    const v = s.graphToViewport({x: a.x, y: a.y}); o.push([id, v.x, v.y, s.scaleSize(d.size)]); });
  return o; }"""
# 프레임 간격 — 배치 중 그리기 사이의 가장 긴 간격을 잰다
JS_FRAMES_ON = """() => { window.__p5f = []; if (window.__p5fOn) return; window.__p5fOn = true;
  window.__platform.sigma.on('afterRender', () => { if (window.__p5f) window.__p5f.push(performance.now()); }); }"""
JS_FRAMES = "() => window.__p5f || []"


# ── 잣대 ────────────────────────────────────────────────────────────────────
def overlaps(items, scale: float = 1.0) -> int:
    """두 원 중심 거리가 rᵢ + rⱼ보다 작은 반지름의 5% 넘게 짧은 쌍의 수. items = [(id, x, y, r)]."""
    cell: dict[tuple[int, int], list] = {}
    rmax = max((it[3] for it in items), default=1.0) * scale
    size = max(2 * rmax, 1e-9)
    for it in items:
        cell.setdefault((int(it[1] // size), int(it[2] // size)), []).append(it)
    bad = 0
    for (cx, cy), lst in cell.items():
        near = [b for dx in (-1, 0, 1) for dy in (-1, 0, 1) for b in cell.get((cx + dx, cy + dy), [])]
        for a in lst:
            for b in near:
                if a[0] >= b[0]:
                    continue
                ra, rb = a[3] * scale, b[3] * scale
                if math.hypot(a[1] - b[1], a[2] - b[2]) < ra + rb - OVERLAP_TOL * min(ra, rb):
                    bad += 1
    return bad


def nn_gap_ratio(items) -> float:
    """가장 가까운 이웃까지의 중심 거리 ÷ 그린 원 지름 — 중앙값."""
    pts = [(it[1], it[2], it[3]) for it in items]
    out = []
    for i, (x, y, r) in enumerate(pts):
        d = min(math.hypot(x - x2, y - y2) for j, (x2, y2, _r) in enumerate(pts) if j != i)
        out.append(d / max(2 * r, 1e-9))
    return statistics.median(out)


def pair_ratio(pos: dict, edges) -> float:
    es = {tuple(sorted(e)) for e in edges if e[0] != e[1] and e[0] in pos and e[1] in pos}
    ids = sorted(pos)
    con = [math.dist(pos[a], pos[b]) for a, b in es]
    tot = 0.0
    cnt = 0
    for k, a in enumerate(ids):
        ax, ay = pos[a]
        for b in ids[k + 1:]:
            tot += math.hypot(ax - pos[b][0], ay - pos[b][1])
            cnt += 1
    non = (tot - sum(con)) / max(cnt - len(con), 1)
    return (sum(con) / len(con)) / non


def layout_info(page):
    """바꾼 판만 — 배치 단위 반지름과 쉬는 길이 상수(`window.__platform.layoutInfo`). 지금 판은 None."""
    return page.evaluate("() => window.__platform.layoutInfo ? window.__platform.layoutInfo() : null")


def edge_ratio_median(pos, edges, info) -> float:
    r, gap, sp = info["radius"], info["gap"], info["spacing"]
    out = [math.dist(pos[a], pos[b]) / ((r[a] + r[b] + gap) * sp) for a, b in edges if a != b and a in pos and b in pos]
    return statistics.median(out)


def edge_len_median(pos, edges) -> float:
    return statistics.median(math.dist(pos[a], pos[b]) for a, b in edges if a != b and a in pos and b in pos)


def hub_follow(page) -> tuple[str, float, dict]:
    """가장 연결이 많은 노드를 폭의 25% 끌어 놓고 쉴 때까지 — (허브, 끈 거리, 홉 칸별 비)."""
    deg = page.evaluate(JS_DEGREE)
    hub = max(deg, key=lambda k: (deg[k], k))
    hops = page.evaluate(JS_HOPS, hub)
    before, _ = drag(page, hub)
    wait_rest(page)
    moved, r = hop_ratios(before, page.evaluate(JS_POSITIONS), hops, hub)
    return hub, moved, r


def open_page(p, args, url):
    browser = p.chromium.launch(args=GL_ARGS, executable_path=args.chromium)
    ctx = browser.new_context(viewport={"width": 1500, "height": 900})
    requests: list[str] = []
    ctx.on("request", lambda r: requests.append(r.url))
    page = ctx.new_page()
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(url)
    page.wait_for_function("() => !!window.__platform && window.__platform.graph.order > 0", timeout=120000)
    wait_rest(page, timeout=600000)
    return browser, page, requests, errors


def set_camera(page, ratio: float, node: str | None = None):
    page.evaluate("""([ratio, id]) => { const s = window.__platform.sigma, c = s.getCamera();
        const st = {ratio}; if (id) { const d = s.getNodeDisplayData(id); st.x = d.x; st.y = d.y; } else { st.x = 0.5; st.y = 0.5; }
        c.setState(st); s.refresh(); }""", [ratio, node])
    page.evaluate("() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))")


# ── 재기 ────────────────────────────────────────────────────────────────────
def measure_synth(p, args, tag: str, rep: Report | None):
    """합성 1,500 한 판 — 수치 사전을 돌려준다. rep가 있으면(바꾼 판) 판정도 찍는다."""
    m: dict = {}
    with synth_system(N_SYNTH) as (sysdir, info):
        label = f"합성 {info['nodes']}노드 — 동작 확인용(품질 근거 아님)"
        plat = Platform(sysdir, "--allow-mock", "--no-browser")
        try:
            url = plat.wait_url()
            browser, page, requests, errors = open_page(p, args, url)
            edges_all = None

            # ⓙ 첫 배치 — 「전체」를 눌러 쉬기까지(초) · 그동안 가장 긴 프레임 간격
            page.evaluate(JS_FRAMES_ON)
            t0 = time.perf_counter()
            page.click("[data-testid=depth-all]")
            page.wait_for_function("() => window.__platform.explore.mode === 'all' && window.__platform.layout.running",
                                   timeout=120000)
            wait_rest(page, timeout=900000)
            m["first_layout_s"] = time.perf_counter() - t0
            fr = page.evaluate(JS_FRAMES)
            m["max_frame_gap_ms"] = max((b - a for a, b in zip(fr, fr[1:])), default=0.0)

            # ⓐ 배치의 성질
            pos = page.evaluate(JS_POSITIONS)
            edges_all = [tuple(e) for e in page.evaluate(JS_EDGES)]
            scr = page.evaluate(JS_SCREEN)
            m["screen_overlaps"] = overlaps(scr)
            m["nn_gap_ratio"] = nn_gap_ratio(scr)
            m["pair_ratio"] = pair_ratio(pos, edges_all)
            li = layout_info(page)
            if li:
                lay = [(i, pos[i][0], pos[i][1], li["radius"][i]) for i in pos]
                m["layout_overlaps"] = overlaps(lay)
                m["edge_ratio_median"] = edge_ratio_median(pos, edges_all, li)
            CAPTURES.mkdir(parents=True, exist_ok=True)
            label_synth(page, f"{label} · 「전체」")
            cap_full = CAPTURES / f"p5_{tag}_full_synth.png"
            page.screenshot(path=str(cap_full))
            if rep:
                rep.item("ⓐ", m["layout_overlaps"] == 0 and 0.8 <= m["edge_ratio_median"] <= 1.6 and m["pair_ratio"] < 0.5,
                         f"{label} · 「전체」 쉰 뒤 — 원 겹침(배치 단위) {m['layout_overlaps']} · 엣지 길이 ÷ 쉬는 길이 중앙값 "
                         f"{m['edge_ratio_median']:.2f}(0.8~1.6) · 연결 ÷ 비연결 평균 거리 {m['pair_ratio']:.3f}(< 0.5) · "
                         f"화면 맞춤 겹친 원 {m['screen_overlaps']} · 가까운 이웃 간격 ÷ 지름 {m['nn_gap_ratio']:.2f}")

            if rep and li:
                check_size_labels(page, rep, label)
                check_spacing(page, rep, label, edges_all)
                check_determinism(page, rep, label)

            # ⓑ 끌기(합성) — p15 ⓑ · p16 ⓑ(p15 ⓐ와 같은 판정) · p16 ⓐ와 같은 손짓 · 1홉 ≥ 50%
            deg = page.evaluate(JS_DEGREE)
            order = sorted(deg, key=lambda k: (-deg[k], k))
            still = nudge(page, order[1])
            hub, moved, r = hub_follow(page)
            far = r["4+"] if r["4+"][0] is not None else r["3"]
            m["synth_hub_1hop"] = r["1"][0]
            m["synth_hub"] = f"1홉 {fmt(r['1'])} · 2홉 {fmt(r['2'])} · 3홉 {fmt(r['3'])} · 4홉 이상 {fmt(r['4+'])}"
            after_hub = [nudge(page, n) for n in order[2:6]]
            m["synth_still"] = still
            m["synth_after_hub"] = after_hub
            if rep:
                ok = (r["1"][0] >= 0.50 and r["2"][0] is not None and r["1"][0] > r["2"][0] > far[0] and far[0] <= 0.20
                      and still < 0.01 and all(v < 0.01 for v in after_hub))
                rep.item("ⓑ-합성", ok,
                         f"{label} · 허브 {hub[-6:]}(연결 {deg[hub]}) 끈 거리 {moved:.1f} — {m['synth_hub']}(1홉 ≥ 50%) · "
                         f"쉰 뒤 2px {still:.3%} · 허브 뒤 2px 네 번 " + " → ".join(f"{v:.3%}" for v in after_hub) + " (매번 < 1%)")

            # ⓙ 끌기 한 걸음 평균(P3 ⓒ 방식)
            times = drag_steps(page, order[0])
            m["drag_step_s"] = sum(times) / len(times)

            # ⓛ 가장 큰 허브로 확대한 화면
            set_camera(page, 0.1, order[0])
            label_synth(page, f"{label} · 가장 큰 허브로 확대(비율 0.1)")
            cap_zoom = CAPTURES / f"p5_{tag}_zoom_synth.png"
            page.screenshot(path=str(cap_zoom))
            set_camera(page, 1.0)

            # ⓛ 골격에서 한 노드를 펼친 화면
            page.click("[data-testid=depth-skeleton]")
            page.wait_for_function("() => window.__platform.explore.mode === 'skeleton'")
            wait_rest(page, timeout=600000)
            page.wait_for_function("""() => { const p = window.__platform; return p.graph.order === p.explore.shown.length; }""")
            sk = shown(page)
            hub_sk = max(sk, key=lambda k: (deg.get(k, 0), k))
            wait_rest(page)
            x, y = screen_xy(page, hub_sk)
            page.mouse.dblclick(x, y)
            page.wait_for_function("() => window.__platform.explore.chips.length === 1", timeout=60000)
            page.wait_for_timeout(200)
            wait_rest(page, timeout=600000)
            label_synth(page, f"{label} · 「골격만」에서 {hub_sk[-6:]} 펼침")
            cap_exp = CAPTURES / f"p5_{tag}_expand_synth.png"
            page.screenshot(path=str(cap_exp))
            m["captures"] = [str(c.relative_to(ROOT)) for c in (cap_full, cap_exp, cap_zoom)]
            m["errors"] = errors
            m["external"] = [u for u in requests if not u.startswith("http://127.0.0.1")]
            browser.close()
        finally:
            plat.stop()
    return m


def measure_mock(p, args, tag: str, rep: Report | None):
    """mock — 허브를 끌었을 때 1홉 평균 이동(지금 판과 나란히)."""
    m = {}
    plat = Platform(Path(args.system), "--allow-mock", "--no-browser")
    try:
        url = plat.wait_url()
        browser, page, requests, errors = open_page(p, args, url)
        hub, moved, r = hub_follow(page)
        m["mock_hub_1hop"] = r["1"][0]
        m["mock_hub"] = f"1홉 {fmt(r['1'])} · 2홉 {fmt(r['2'])} · 3홉 {fmt(r['3'])} · 4홉 이상 {fmt(r['4+'])}"
        m["external"] = [u for u in requests if not u.startswith("http://127.0.0.1")]
        m["errors"] = errors
        browser.close()
    finally:
        plat.stop()
    return m


# ── 바꾼 판만 재는 것 ─────────────────────────────────────────────────────────
def check_size_labels(page, rep: Report, label: str):
    """ⓔ 크기 · ⓕ 이름 자리."""
    deg = page.evaluate(JS_DEGREE)
    hub = max(deg, key=lambda k: (deg[k], k))
    set_camera(page, 1.0)
    s1 = {it[0]: it[3] for it in page.evaluate(JS_SCREEN)}
    set_camera(page, 0.5)
    scr_half = page.evaluate(JS_SCREEN)
    s2 = {it[0]: it[3] for it in scr_half}
    ratio = s2[hub] / s1[hub]
    ids = sorted(deg, key=lambda k: deg[k])
    order_bad = sum(1 for a, b in zip(ids, ids[1:]) if deg[a] < deg[b] and s1[a] > s1[b] + 1e-9)
    ov_half = overlaps(scr_half)
    li = layout_info(page)
    rmin, rmax = li["rmin"], li["rmax"]
    lo, hi = min(li["radius"].values()), max(li["radius"].values())
    rep.item("ⓔ", 1.9 <= ratio <= 2.1 and order_bad == 0 and rmin <= lo and hi <= rmax and ov_half == 0,
             f"{label} · 비율 1 → 0.5에서 허브 {hub[-6:]} 그린 반지름 {s1[hub]:.1f} → {s2[hub]:.1f}px = {ratio:.2f}배(1.9~2.1) · "
             f"연결 수 순으로 거꾸로인 쌍 {order_bad} · 반지름 {lo:.1f}~{hi:.1f}(R_MIN {rmin}~R_MAX {rmax}) · 확대에서 겹친 원 {ov_half}")

    set_camera(page, 1.0)
    lab1 = page.evaluate("() => window.__platform.labels")
    bad_in = [x for x in lab1["items"] if x["inside"] and not (x["r"] >= 12 and x["w"] + 8 <= 2 * x["r"])]
    set_camera(page, 0.1, hub)
    lab2 = page.evaluate("() => window.__platform.labels")
    hub_item = next((x for x in lab2["items"] if x["id"] == hub), None)
    bad_in2 = [x for x in lab2["items"] if x["inside"] and not (x["r"] >= 12 and x["w"] + 8 <= 2 * x["r"])]
    rep.item("ⓕ", not bad_in and not bad_in2 and hub_item is not None and hub_item["inside"],
             f"{label} · 비율 1: 원 안 {lab1['inside']} · 원 옆 {lab1['outside']} · 조건 어긋난 원 안 {len(bad_in)} · "
             f"허브로 비율 0.1: 원 안 {lab2['inside']} · 원 옆 {lab2['outside']} · 허브 이름 원 안 {bool(hub_item and hub_item['inside'])} "
             f"(반지름 {hub_item['r'] if hub_item else 0:.0f}px · 글자 폭 {hub_item['w'] if hub_item else 0:.0f}px) · 조건 어긋난 원 안 {len(bad_in2)}")
    set_camera(page, 1.0)


def check_spacing(page, rep: Report, label: str, edges):
    """ⓖ 간격 ×2 → 엣지 길이 중앙값 1.8~2.2배 · 전체 배치."""
    wait_rest(page)
    l1 = edge_len_median(page.evaluate(JS_POSITIONS), edges)
    slider = page.locator("[data-testid=spacing]")
    slider.focus()
    page.keyboard.press("ArrowRight")
    page.keyboard.press("ArrowRight")
    page.wait_for_function("() => window.__platform.layout.running", timeout=30000)
    kind = page.evaluate("() => window.__platform.layout.kind")
    wait_rest(page, timeout=900000)
    l2 = edge_len_median(page.evaluate(JS_POSITIONS), edges)
    spacing = layout_info(page)["spacing"]
    page.keyboard.press("ArrowLeft")
    page.keyboard.press("ArrowLeft")
    page.wait_for_function("() => window.__platform.layout.running", timeout=30000)
    wait_rest(page, timeout=900000)
    rep.item("ⓖ", spacing == 2 and 1.8 <= l2 / l1 <= 2.2 and kind == "layout",
             f"{label} · 간격 ×{spacing} → 엣지 길이 중앙값 {l1:.1f} → {l2:.1f} = {l2 / l1:.2f}배(1.8~2.2) · 배치 {kind}")


def check_determinism(page, rep: Report, label: str):
    """ⓗ 「다시 배치」 두 번 → 같은 좌표 · 같은 반복 수."""
    res = []
    for _ in range(2):
        page.click("[data-testid=relayout]")
        page.wait_for_function("() => window.__platform.layout.running", timeout=30000)
        wait_rest(page, timeout=900000)
        res.append((page.evaluate(JS_POSITIONS), page.evaluate("() => window.__platform.layout.iterations")))
    (a, ia), (b, ib) = res
    diff = sum(1 for k in a if a[k] != b.get(k))
    rep.item("ⓗ", diff == 0 and ia == ib and set(a) == set(b),
             f"{label} · 「다시 배치」 두 번 — 좌표 다른 노드 {diff} · 반복 수 {ia} = {ib}")


# ── 실행 ────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chromium", default=None)
    ap.add_argument("--system", type=Path, default=DEFAULT_SYSTEM)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--before", type=Path, help="지금 판 — 재서 이 파일에 저장(레포 밖 · 판정 없음)")
    g.add_argument("--compare", type=Path, help="바꾼 판 — 판정하고 이 파일(지금 판)과 나란히 찍는다")
    args = ap.parse_args()
    status0 = subprocess.run(["git", "-C", str(args.system), "status", "--porcelain"], capture_output=True, text=True).stdout
    home = Path(args.system) / "state_mock"
    hash0 = state_hashes(home)

    if args.before:
        with sync_playwright() as p:
            m = measure_synth(p, args, "before", None)
            m.update({k: v for k, v in measure_mock(p, args, "before", None).items() if k.startswith("mock")})
        args.before.write_text(json.dumps(m, ensure_ascii=False, indent=1), encoding="utf-8")
        print(json.dumps(m, ensure_ascii=False, indent=1))
        print(f"전제 13 — 지금 판의 수치를 저장했다: {args.before}")
        return 0

    before = json.loads(args.compare.read_text(encoding="utf-8"))
    rep = Report()
    with sync_playwright() as p:
        m = measure_synth(p, args, "after", rep)
        mm = measure_mock(p, args, "after", rep)
    rep.item("ⓑ-mock", mm["mock_hub_1hop"] >= 0.50,
             f"mock 허브 끌기 — {mm['mock_hub']}(1홉 ≥ 50%) · 지금 판 {before.get('mock_hub')}")

    def row(name, key, fmt_):
        b, a = before.get(key), m.get(key, mm.get(key))
        return f"  {name}: 지금 판 {fmt_(b) if b is not None else '—'} → 바꾼 판 {fmt_(a) if a is not None else '—'}"
    print("\n== 지금 판 ↔ 바꾼 판 (합성 1,500 · mock — 동작 확인용) ==")
    for line in (row("화면 맞춤 겹친 원(쌍)", "screen_overlaps", str),
                 row("가까운 이웃 간격 ÷ 그린 지름(중앙값)", "nn_gap_ratio", lambda v: f"{v:.2f}"),
                 row("연결 ÷ 비연결 평균 거리", "pair_ratio", lambda v: f"{v:.3f}"),
                 row("허브 끌기 1홉 평균 이동(합성)", "synth_hub_1hop", lambda v: f"{v:.0%}"),
                 row("허브 끌기 1홉 평균 이동(mock)", "mock_hub_1hop", lambda v: f"{v:.0%}"),
                 row("첫 배치가 쉬기까지(초)", "first_layout_s", lambda v: f"{v:.1f}"),
                 row("배치 중 가장 긴 프레임 간격(ms)", "max_frame_gap_ms", lambda v: f"{v:.0f}"),
                 row("끌기 한 걸음 평균(초)", "drag_step_s", lambda v: f"{v:.2f}")):
        print(line)
    rep.item("ⓙ", True, f"첫 배치 {before.get('first_layout_s', 0):.1f} → {m['first_layout_s']:.1f}초 · 가장 긴 프레임 간격 "
                        f"{before.get('max_frame_gap_ms', 0):.0f} → {m['max_frame_gap_ms']:.0f}ms · 끌기 한 걸음 "
                        f"{before.get('drag_step_s', 0):.2f} → {m['drag_step_s']:.2f}초 (판정 아님 · 동작 확인용)")
    rep.item("ⓛ", all((ROOT / c).exists() for c in m["captures"] + before.get("captures", [])),
             "지금 판 " + " · ".join(before.get("captures", [])) + " / 바꾼 판 " + " · ".join(m["captures"]) + " (「합성」 띠)")
    rep.item("오류", not m["errors"] and not mm["errors"], f"페이지 오류 {m['errors'][:1] + mm['errors'][:1]}")
    status1 = subprocess.run(["git", "-C", str(args.system), "status", "--porcelain"], capture_output=True, text=True).stdout
    same = state_hashes(home) == hash0
    ext = m["external"] + mm["external"]
    left = list(Path("/tmp").glob("p3synth_*"))
    rep.item("ⓚ", not status0 and not status1 and same and not ext and not left,
             f"상태 폴더 해시 그대로 {same} · 시스템 git status 빈 출력 {not status1} · 외부 요청 {len(ext)} · 남은 합성 임시 폴더 {len(left)}")
    return rep.finish()


if __name__ == "__main__":
    sys.exit(main())
