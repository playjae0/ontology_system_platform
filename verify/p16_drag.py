# -*- coding: utf-8 -*-
"""P1.6 완료판정 ⓐ~ⓔ — 끌기 평형(B-01): 앞선 끌기가 남긴 힘이 다음 끌기에서 풀리지 않는다.

    # 착수 전(지금 코드): ⓐ를 돌리고(FAIL이어야 잣대가 현상을 잡는다) 「다시 배치」 뒤 쉰 좌표를 레포 밖에 저장
    python verify/p16_drag.py --save-ref /tmp/p16_layout_ref.json
    # 바꾼 뒤: ⓐ~ⓔ — ⓒ는 저장한 좌표와 비교
    python verify/p16_drag.py --ref /tmp/p16_layout_ref.json

측정 함수는 p15_drag.py · p1_screen.py의 것을 불러 쓴다. 수치 문턱은 동작 확인용이다 — mock 표본의 개수는 세지 않는다.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DEFAULT_SYSTEM, ROOT, Platform, Report  # noqa: E402
from p1_screen import GL_ARGS, JS_POSITIONS, screen_xy, wait_rest  # noqa: E402
from p15_drag import JS_DEGREE, JS_HOPS, dist, drag, fmt, hop_ratios  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

P15 = "1홉 71 · 2홉 45 · 3홉 12 · 4홉 이상 5%"       # P1.5 마감 보고의 값(mock)


def nudge(page, node: str, hold: float = 2.0) -> float:
    """쉰 상태에서 `node`를 2px 끌어 `hold`초 머문 뒤 놓고 쉴 때까지 — 끈 노드를 뺀 평균 이동 / 그래프 반경(RMS)."""
    wait_rest(page)
    before = page.evaluate(JS_POSITIONS)
    x0, y0 = screen_xy(page, node)
    page.mouse.move(x0, y0)
    page.mouse.down()
    page.mouse.move(x0 + 2, y0, steps=1)
    time.sleep(hold)
    page.mouse.up()
    wait_rest(page)
    after = page.evaluate(JS_POSITIONS)
    cx = sum(p[0] for p in before.values()) / len(before)
    cy = sum(p[1] for p in before.values()) / len(before)
    radius = math.sqrt(sum((p[0] - cx) ** 2 + (p[1] - cy) ** 2 for p in before.values()) / len(before))
    others = [n for n in before if n != node]
    return sum(dist(after[n], before[n]) for n in others) / len(others) / radius


def relayout_rest(page) -> dict:
    """「다시 배치」를 누르고 쉰 좌표."""
    page.click("[data-testid=relayout]")
    page.wait_for_function("window.__platform.layout.iterations > 0 && window.__platform.layout.kind === 'layout'")
    wait_rest(page)
    return page.evaluate(JS_POSITIONS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--system", type=Path, default=DEFAULT_SYSTEM)
    ap.add_argument("--chromium", default=None)
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--save-ref", type=Path, help="착수 전: 「다시 배치」 뒤 쉰 좌표를 이 파일에 저장(레포 밖)")
    mode.add_argument("--ref", type=Path, help="바꾼 뒤: 저장해 둔 좌표와 비교(ⓒ)")
    args = ap.parse_args()
    rep = Report()

    plat = Platform(args.system, "--allow-mock", "--no-browser")
    url = plat.wait_url()
    if not url:
        print(plat.output())
        return 1
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=GL_ARGS, executable_path=args.chromium)
            page = browser.new_page(viewport={"width": 1500, "height": 900})
            page.goto(url)
            page.wait_for_function("window.__platform && window.__platform.layout.iterations > 0", timeout=30000)
            wait_rest(page)

            # ⓒ 전체 배치는 그대로 — 「다시 배치」 뒤 쉰 좌표
            rest = relayout_rest(page)
            if args.save_ref:
                args.save_ref.write_text(json.dumps(rest), encoding="utf-8")
                print(f"전제 7 — 「다시 배치」 뒤 쉰 좌표 {len(rest)}개를 저장했다: {args.save_ref}")
            else:
                ref = json.loads(args.ref.read_text(encoding="utf-8"))
                diff = [n for n in ref if rest.get(n) != ref[n]]
                worst = max((dist(rest[n], ref[n]) for n in ref if n in rest), default=0.0)
                rep.item("ⓒ", set(rest) == set(ref) and not diff,
                         f"「다시 배치」 뒤 쉰 좌표 {len(rest)}개 — 저장한 좌표와 다른 노드 {len(diff)}개 · 가장 큰 차이 {worst:.2e}")

            degree = page.evaluate(JS_DEGREE)
            order = sorted(degree, key=lambda i: (-degree[i], i))
            hub = order[0]

            # ⓑ 따라오는 정도는 그대로 — 쉰 상태에서 허브를 폭의 25% 끌어 놓고 쉴 때까지(P1.5 ⓐ와 같은 손짓·판정)
            hops = page.evaluate(JS_HOPS, hub)
            before, _drop = drag(page, hub)
            wait_rest(page)
            after = page.evaluate(JS_POSITIONS)
            moved, r = hop_ratios(before, after, hops, hub)
            far = r["4+"] if r["4+"][0] is not None else r["3"]
            ok = (r["1"][0] >= 0.30 and r["2"][0] is not None and r["1"][0] > r["2"][0] > far[0] and far[0] <= 0.20)
            rep.item("ⓑ", ok, f"허브 {hub[-6:]} 끈 거리 {moved:.2f} — 1홉 {fmt(r['1'])} · 2홉 {fmt(r['2'])} · "
                              f"3홉 {fmt(r['3'])} · 4홉 이상 {fmt(r['4+'])} (P1.5: {P15})")

            # ⓐ 앞선 끌기가 남긴 힘이 풀리지 않는다 — 허브를 끈 뒤 다른 노드 넷을 차례로 2px · 2초
            ratios = [(n, nudge(page, n)) for n in order[1:5]]
            rep.item("ⓐ", all(v < 0.01 for _n, v in ratios),
                     "허브를 끌어 놓고 쉰 뒤 2px · 2초 끌기 네 번 — 끈 노드를 뺀 평균 이동 / 그래프 반경: "
                     + " → ".join(f"{n[-6:]} {v:.3%}" for n, v in ratios) + " (매번 < 1%)")
            browser.close()
    finally:
        plat.stop()

    if args.save_ref:
        return rep.finish()

    # ⓓ 회귀 — p15_drag.py ⓐ~ⓙ(그 안의 ⓘ가 P1 확인 셋을 돌린다 · 쓰기 0 · 외부 요청 0 포함)
    run = subprocess.run([sys.executable, str(ROOT / "verify" / "p15_drag.py"), "--system", str(args.system)],
                         cwd=ROOT, capture_output=True, text=True)
    block = run.stdout[run.stdout.rfind("== 결과 =="):]
    print(f"--- p15_drag.py (종료 코드 {run.returncode})\n{block}")
    rep.item("ⓓ", run.returncode == 0, f"p15_drag.py 종료 코드 {run.returncode} — P1.5 ⓐ~ⓙ · 그 안의 ⓘ로 P1 확인 셋")

    # ⓔ README 사내 절 — 「개발 세션 전용」 절 앞까지 doctor 글자 0
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    cut = readme.find("## 개발 세션 전용")
    head = readme[:cut] if cut >= 0 else readme
    hits = len(re.findall("doctor", head, re.IGNORECASE))
    rep.item("ⓔ", cut >= 0 and hits == 0, f"「## 개발 세션 전용」 앞 {len(head.splitlines())}줄에서 doctor {hits}개")
    return rep.finish()


if __name__ == "__main__":
    sys.exit(main())
