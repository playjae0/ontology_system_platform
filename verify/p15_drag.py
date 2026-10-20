# -*- coding: utf-8 -*-
"""P1.5 완료판정 ⓐ~ⓙ — 끌기 배치 · 거부 문면 · README · 회귀.

    python verify/p15_drag.py [--system ../ontology_system] [--chromium /opt/pw-browsers/chromium] [--skip-p1]

홉 수는 `window.__platform.graph`에서 끄는 노드부터 넓이 우선으로 센다 — 엣지 방향은 보지 않는다(graphology `forEachNeighbor`).
「이동」은 끌기 직전 좌표와 쉰 뒤 좌표의 거리, 비율은 끈 노드의 이동 대비다.
수치 문턱은 동작 확인용이다(요청문 P1.5 §3 ⓪) — mock 표본의 개수는 세지 않는다.
"""
from __future__ import annotations

import argparse
import math
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DEFAULT_SYSTEM, ROOT, Platform, Report, get_json  # noqa: E402
from p1_screen import (CAPTURES, GL_ARGS, JS_POSITIONS, drag_target, press_relayout_move,  # noqa: E402
                       screen_xy, wait_rest)

from playwright.sync_api import sync_playwright  # noqa: E402

JS_HOPS = """(src) => { const g = window.__platform.graph, h = {[src]: 0}, q = [src];
  for (let i = 0; i < q.length; i++) { const u = q[i];
    g.forEachNeighbor(u, (v) => { if (!(v in h)) { h[v] = h[u] + 1; q.push(v); } }); }
  return h; }"""
JS_STATE = "() => { const l = window.__platform.layout; return [l.kind, l.running, l.iterations]; }"
JS_DEGREE = "() => { const g = window.__platform.graph, o = {}; g.forEachNode((id) => { o[id] = g.degree(id); }); return o; }"


def dist(a, b) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def drag(page, node: str, frac: float = 0.25, steps: int = 25, hold: float = 0.0):
    """쉰 상태에서 `node`를 캔버스 가운데 쪽으로 (짧은 변의 frac만큼) 끌어 놓는다. 돌려주는 값 — (끌기 직전 좌표, 놓은 자리)."""
    wait_rest(page)
    before = page.evaluate(JS_POSITIONS)
    x0, y0 = screen_xy(page, node)
    x1, y1 = drag_target(page, x0, y0)
    x1, y1 = x0 + (x1 - x0) * frac / 0.25, y0 + (y1 - y0) * frac / 0.25
    page.mouse.move(x0, y0)
    page.mouse.down()
    page.mouse.move(x1, y1, steps=steps)
    if hold:
        time.sleep(hold)
    dropped = page.evaluate(JS_POSITIONS)[node]
    page.mouse.up()
    return before, dropped


def hop_ratios(before, after, hops, node):
    """홉 칸(1 · 2 · 3 · 4 이상)마다 평균 이동 / 끈 노드 이동."""
    moved = dist(after[node], before[node])
    groups: dict[str, list[float]] = {"1": [], "2": [], "3": [], "4+": []}
    for n, h in hops.items():
        if h == 0:
            continue
        key = str(h) if h <= 3 else "4+"
        groups[key].append(dist(after[n], before[n]) / moved)
    return moved, {k: (sum(v) / len(v) if v else None, len(v)) for k, v in groups.items()}


def fmt(r):
    return "—" if r[0] is None else f"{r[0]:.0%}({r[1]})"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--system", type=Path, default=DEFAULT_SYSTEM)
    ap.add_argument("--chromium", default=None)
    ap.add_argument("--skip-p1", action="store_true", help="ⓘ 회귀(P1 스크립트 셋)를 건너뛴다")
    args = ap.parse_args()
    rep = Report()
    CAPTURES.mkdir(parents=True, exist_ok=True)

    plat = Platform(args.system, "--allow-mock", "--no-browser")
    url = plat.wait_url()
    if not url:
        print(plat.output())
        return 1
    _c, data = get_json(url + "api/graph")
    full_iter = (data.get("force") or {}).get("iterations") or 1500
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=GL_ARGS, executable_path=args.chromium)
            page = browser.new_page(viewport={"width": 1500, "height": 900})
            errors: list[str] = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(url)
            page.wait_for_function("window.__platform && window.__platform.layout.iterations > 0", timeout=30000)
            wait_rest(page)
            degree = page.evaluate(JS_DEGREE)
            order = sorted(degree, key=lambda i: (-degree[i], i))
            hub = order[0]
            still = order[1]

            # ⓑ 끌지 않으면 흐르지 않는다 — 전체 배치가 쉰 뒤 2px만 움직여 2초 머문 뒤 놓고 쉴 때까지
            #    (다른 끌기 뒤에 재면 그 끌기가 남긴 용수철 힘이 풀리며 흐른다 — BLOCKERS B-01. 여기서는 명세대로 「쉰 뒤」만 잰다.)
            wait_rest(page)
            before = page.evaluate(JS_POSITIONS)
            x0, y0 = screen_xy(page, still)
            page.mouse.move(x0, y0)
            page.mouse.down()
            page.mouse.move(x0 + 2, y0, steps=1)
            st_hold = page.evaluate(JS_STATE)
            time.sleep(2.0)
            page.mouse.up()
            wait_rest(page)
            after = page.evaluate(JS_POSITIONS)
            others = [n for n in before if n != still]
            cx = sum(before[n][0] for n in before) / len(before)
            cy = sum(before[n][1] for n in before) / len(before)
            radius = math.sqrt(sum((before[n][0] - cx) ** 2 + (before[n][1] - cy) ** 2 for n in before) / len(before))
            mean_move = sum(dist(after[n], before[n]) for n in others) / len(others)
            rep.item("ⓑ", st_hold[0] == "drag" and mean_move < 0.01 * radius,
                     f"노드 {still[-6:]} 2px · 2초 머묾(그동안 kind={st_hold[0]}) → 다른 노드 평균 이동 {mean_move:.4f} "
                     f"= 그래프 반경(RMS) {radius:.2f}의 {mean_move / radius:.3%} (< 1%)")

            # ⓐ 연결된 노드가 따라온다 — 허브를 폭의 25% 끌어 놓고 쉴 때까지
            hops = page.evaluate(JS_HOPS, hub)
            before, drop_hub = drag(page, hub)
            wait_rest(page)
            after = page.evaluate(JS_POSITIONS)
            moved, r = hop_ratios(before, after, hops, hub)
            far = r["4+"] if r["4+"][0] is not None else r["3"]
            far_name = "4홉 이상" if r["4+"][0] is not None else "3홉 이상(4홉 이상 없음)"
            ok = (r["1"][0] >= 0.30 and r["2"][0] is not None and r["1"][0] > r["2"][0] > far[0] and far[0] <= 0.20)
            rep.item("ⓐ", ok, f"허브 {hub[-6:]}(연결 {degree[hub]}) 끈 거리 {moved:.2f} · 끈 거리 대비 평균 이동(노드 수) — "
                              f"1홉 {fmt(r['1'])} · 2홉 {fmt(r['2'])} · 3홉 {fmt(r['3'])} · 4홉 이상 {fmt(r['4+'])} · "
                              f"판정 1홉 ≥ 30% · 1홉 > 2홉 > {far_name} · {far_name} ≤ 20%")
            # ⓙ 화면 캡처 — 허브를 끌어 놓은 뒤(mock)
            shot = CAPTURES / "p15_hub_drag_mock.png"
            page.screenshot(path=str(shot))
            rep.item("ⓙ", shot.is_file(), f"{shot.relative_to(ROOT)} (mock 표본 — 허브를 끌어 놓고 쉰 뒤)")

            # ⓒ 누르는 동안 계속 돈다 · ⓓ 놓으면 쉰다 — 셋째 노드를 끌고 3초 머문 뒤 놓는다
            third = order[2]
            wait_rest(page)
            settled = page.evaluate(JS_POSITIONS)
            x0, y0 = screen_xy(page, third)
            x1, y1 = drag_target(page, x0, y0)
            page.mouse.move(x0, y0)
            page.mouse.down()
            page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, steps=10)
            samples = []
            for _ in range(3):
                samples.append(page.evaluate(JS_STATE))
                time.sleep(1.0)
            samples.append(page.evaluate(JS_STATE))
            drop_third = page.evaluate(JS_POSITIONS)[third]
            page.mouse.up()
            t_up = time.monotonic()
            all_drag = all(s[0] == "drag" and s[1] is True for s in samples)
            grows = all(samples[i + 1][2] > samples[i][2] for i in range(len(samples) - 1))
            rep.item("ⓒ", all_drag and grows,
                     f"끈 채 3초 — 1초마다 [kind, running, iterations] = {samples}")
            page.wait_for_function("!window.__platform.layout.running", timeout=10000)
            t_rest = time.monotonic() - t_up
            final = page.evaluate(JS_POSITIONS)
            off_third = dist(final[third], drop_third)
            off_prev = {n[-6:]: dist(final[n], settled[n]) for n in (still, hub)}
            st_end = page.evaluate(JS_STATE)
            rep.item("ⓓ", t_rest <= 10 and off_third == 0 and all(v == 0 for v in off_prev.values()),
                     f"놓은 뒤 {t_rest:.2f}초에 running=False(끝 상태 {st_end}) · 끈 노드 어긋남 {off_third:.2e} · "
                     f"그 전에 놓아 둔 노드 어긋남 {off_prev}")

            # ⓔ 전체 배치 중 끌기는 그대로 — 누른 채 「다시 배치」 → 곧바로 움직임
            caught = press_relayout_move(page, hub)
            if caught is None:
                rep.item("ⓔ", False, "다섯 번 모두 첫 움직임 직후 전체 배치가 돌고 있지 않았다")
            else:
                attempt, (x0, y0) = caught
                x1, y1 = drag_target(page, x0, y0)
                page.mouse.move(x1, y1, steps=2)
                st_moved = page.evaluate(JS_STATE)
                # 누른 채 가만히 — 움직이지 않으면 끌기 배치가 시작되지 않는다. 전체 배치가 상한까지 돌고 쉬는지 본다.
                page.wait_for_function("!window.__platform.layout.running", timeout=20000)
                st_hold = page.evaluate(JS_STATE)
                drop_e = page.evaluate(JS_POSITIONS)[hub]
                page.mouse.up()
                wait_rest(page)
                st_rest = page.evaluate(JS_STATE)
                off_e = dist(page.evaluate(JS_POSITIONS)[hub], drop_e)
                ok = (st_moved[0] == "layout" and st_hold == ["layout", False, full_iter]
                      and st_rest == ["layout", False, full_iter] and off_e == 0)
                rep.item("ⓔ", ok, f"{attempt}번째에 잡음 · 다 끈 뒤 {st_moved} → 누른 채 쉼 {st_hold} → 놓은 뒤 {st_rest} — "
                                  f"끈 점만 고정된 채 전체 배치가 force.iterations {full_iter}까지 돔(끌기 배치로 안 바뀜) · "
                                  f"끈 노드 어긋남 {off_e:.2e}")

            # ⓕ 밀대가 듣는다 — 같은 시작(다시 배치)에서 좁게 · 넓게로 같은 노드를 같은 거리만큼
            results = {}
            rest_ref = None
            for word, key in (("좁게", "Home"), ("넓게", "End")):
                page.click("[data-testid=relayout]")
                page.wait_for_function("window.__platform.layout.iterations > 0 && window.__platform.layout.kind === 'layout'")
                wait_rest(page)
                rest = page.evaluate(JS_POSITIONS)
                same_start = rest_ref is None or all(rest[n] == rest_ref[n] for n in rest)
                rest_ref = rest_ref or rest
                page.focus("[data-testid=follow]")
                page.keyboard.press(key)
                k_label = page.inner_text("label:has([data-testid=follow])")
                before, _drop = drag(page, hub)
                wait_rest(page)
                after = page.evaluate(JS_POSITIONS)
                moved, r = hop_ratios(before, after, page.evaluate(JS_HOPS, hub), hub)
                results[word] = (r["1"][0], moved, same_start, k_label.strip().splitlines()[0])
            narrow, wide = results["좁게"], results["넓게"]
            rep.item("ⓕ", wide[0] > narrow[0] and wide[2] and abs(wide[1] - narrow[1]) < 1e-9,
                     f"1홉 평균 이동 — 「{narrow[3]}」 {narrow[0]:.0%} < 「{wide[3]}」 {wide[0]:.0%} · "
                     f"끈 거리 {narrow[1]:.3f} / {wide[1]:.3f} · 두 번째 다시 배치가 같은 자리에서 쉼={wide[2]}")
            if errors:
                print("페이지 오류:", errors)
            browser.close()
    finally:
        plat.stop()

    # ⓖ 거부 문면 — --allow-mock 없이 · --help
    refuse = Platform(args.system, "--no-browser")
    code = refuse.wait_exit()
    out = refuse.output()
    has_home = any(re.search(r"\[platform\]\s+이 셸의 ONTO_HOME: ", ln) for ln in refuse.lines)
    has_state = any(re.search(r"\[platform\]\s+시스템이 읽은 상태 폴더: ", ln) for ln in refuse.lines)
    helptext = subprocess.run([sys.executable, "run.py", "--help"], cwd=ROOT, capture_output=True, text=True).stdout
    rep.item("ⓖ", code == 2 and has_home and has_state and "--allow-mock" not in out and "allow-mock" not in helptext,
             f"종료 코드 {code} · ONTO_HOME 줄 {has_home} · 상태 폴더 줄 {has_state} · 출력에 「--allow-mock」 "
             f"{'있음' if '--allow-mock' in out else '없음'} · --help에 「allow-mock」 "
             f"{'있음' if 'allow-mock' in helptext else '없음'}")

    # ⓗ README 사내 절 — 「개발 세션 전용」 절 앞까지 mock 글자 0
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    cut = readme.find("## 개발 세션 전용")
    head = readme[:cut] if cut >= 0 else readme
    hits = len(re.findall("mock", head, re.IGNORECASE))
    rep.item("ⓗ", cut >= 0 and hits == 0, f"「## 개발 세션 전용」 앞 {len(head.splitlines())}줄에서 mock(대소문자 무관) {hits}개")

    # ⓘ 회귀 — 고친 P1 확인 스크립트 셋
    if not args.skip_p1:
        codes = {}
        for script in ("p1_contract.py", "p1_process.py", "p1_screen.py"):
            # 브라우저를 쓰는 p1_screen에만 --chromium을 넘긴다(p1_contract · p1_process는 쓰지 않는다)
            browser_arg = ["--chromium", args.chromium] if args.chromium and script == "p1_screen.py" else []
            run = subprocess.run([sys.executable, str(ROOT / "verify" / script), "--system", str(args.system),
                                  *browser_arg], cwd=ROOT, capture_output=True, text=True)
            codes[script] = run.returncode
            tail = run.stdout[run.stdout.find("== 결과 =="):] if "== 결과 ==" in run.stdout else run.stdout[-800:]
            print(f"--- {script} (종료 코드 {run.returncode})\n{tail}")
        rep.item("ⓘ", all(c == 0 for c in codes.values()), f"P1 확인 스크립트 종료 코드 {codes} (쓰기 0 ⓙ · 외부 요청 0 ⓚ 포함)")
    return rep.finish()


if __name__ == "__main__":
    sys.exit(main())
