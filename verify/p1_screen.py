# -*- coding: utf-8 -*-
"""P1 완료판정 ⓓ~ⓛ — 화면을 Playwright(Chromium)로 열어 동작을 잰다.

    python verify/p1_screen.py [--system ../ontology_system] [--chromium /opt/pw-browsers/chromium]

플랫폼을 `--allow-mock --no-browser`로 띄우고, 화면의 확인용 손잡이(`window.__platform`)로 좌표와 수를 읽는다.
mock 표본의 개수는 세지 않는다 — 화면과 서버 응답이 같은지, 동작이 일어나는지만 잰다(CLAUDE.md §5).
수치 문턱(ⓔ 0.5 · ⓕ 10%)은 동작 확인용이다(요청문 P1 §3 ⓪).
"""
from __future__ import annotations

import argparse
import hashlib
import math
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DEFAULT_SYSTEM, ROOT, Platform, Report, get_json  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

CAPTURES = ROOT / "verify" / "captures"
CROSS_COLOR = "#7b3fa8"
GL_ARGS = ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"]  # 머리 없는 Chromium의 WebGL

JS_POSITIONS = "() => { const g = window.__platform.graph; const o = {}; " \
               "g.forEachNode((id, a) => { o[id] = [a.x, a.y]; }); return o; }"
JS_REST = "() => window.__platform && !window.__platform.layout.running && window.__platform.layout.iterations > 0"


def state_hashes(home: Path) -> dict[str, str]:
    """상태 폴더 data/·registry/·layers/ 아래 파일의 sha256(ⓙ — work/는 시스템 서버가 만드는 파생물이라 대상 밖)."""
    out = {}
    for sub in ("data", "registry", "layers"):
        for p in sorted((home / sub).rglob("*")):
            if p.is_file():
                out[str(p.relative_to(home))] = hashlib.sha256(p.read_bytes()).hexdigest()
    return out


def wait_rest(page, timeout=60000):
    """배치가 쉴 때까지 + 화면이 두 번 더 그려질 때까지 — sigma는 노드 집기를 다음 그리기에서 고친 집기 버퍼로 하므로,
    쉰 바로 그 순간에 누르면 한 프레임 전 자리로 집는다(사람 손은 그보다 느리다)."""
    page.wait_for_function(JS_REST, timeout=timeout)
    page.evaluate("() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))")


def screen_xy(page, node_id: str) -> tuple[float, float]:
    """노드의 화면(페이지) 좌표 — sigma의 그래프→화면 변환 + 캔버스 자리."""
    return tuple(page.evaluate("""(id) => {
        const p = window.__platform, a = p.graph.getNodeAttributes(id);
        const v = p.sigma.graphToViewport({x: a.x, y: a.y});
        const r = document.getElementById('canvas').getBoundingClientRect();
        return [r.left + v.x, r.top + v.y]; }""", node_id))


def drag_target(page, x0: float, y0: float) -> tuple[float, float]:
    """끌 곳 — 캔버스 가운데 쪽으로 캔버스 폭(짧은 변)의 25%(가장자리 밖으로 나가 「놓기」가 되지 않게)."""
    box = page.locator("#canvas").bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    dx, dy = cx - x0, cy - y0
    norm = math.hypot(dx, dy) or 1.0
    length = 0.25 * min(box["width"], box["height"])
    return x0 + dx / norm * length, y0 + dy / norm * length


def press_relayout_move(page, node_id: str, tries: int = 5):
    """전체 배치가 도는 중에 끌기를 잡는다 — 노드를 누른 채(아직 움직이지 않고) 「다시 배치」를 키보드로 누르고(포커스 + Enter)
    곧바로 움직인다. 첫 움직임 직후 `kind === "layout"`이고 running일 때만 잡은 것으로 본다 — 아니면 놓고 다시(`tries`번까지).
    잡으면 마우스를 누른 채로 `(몇 번째, 첫 움직임 뒤 마우스 자리)`, 못 잡으면 None."""
    for attempt in range(1, tries + 1):
        wait_rest(page)
        x0, y0 = screen_xy(page, node_id)
        page.mouse.move(x0, y0)
        page.mouse.down()
        page.focus("[data-testid=relayout]")
        page.keyboard.press("Enter")
        page.mouse.move(x0 + 2, y0 + 2)
        st = page.evaluate("() => [window.__platform.layout.kind, window.__platform.layout.running]")
        if st == ["layout", True]:
            return attempt, (x0 + 2, y0 + 2)
        page.mouse.up()
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--system", type=Path, default=DEFAULT_SYSTEM)
    ap.add_argument("--chromium", default=None, help="Chromium 실행 파일(없으면 Playwright 기본)")
    args = ap.parse_args()
    rep = Report()
    CAPTURES.mkdir(parents=True, exist_ok=True)

    plat = Platform(args.system, "--allow-mock", "--no-browser")
    url = plat.wait_url()
    if not url:
        print(plat.output())
        return 1
    origin = url.rstrip("/")
    _c, health = get_json(origin + "/api/health")
    home = Path(health["home"])
    hashes_before = state_hashes(home)
    _c, data = get_json(origin + "/api/graph")
    print(f"플랫폼 {url} · 상태 폴더 {home} (mock) · 해시 대상 파일 {len(hashes_before)}개")

    requests: list[str] = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=GL_ARGS, executable_path=args.chromium)
            ctx = browser.new_context(viewport={"width": 1500, "height": 900})
            ctx.on("request", lambda r: requests.append(r.url))
            page = ctx.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(url)
            page.wait_for_function("window.__platform && window.__platform.layout.iterations > 0", timeout=30000)
            wait_rest(page)

            # ⓛ 화면 캡처 — 배치가 쉰 전체 그래프(개발 표본 · mock)
            shot = CAPTURES / "p1_graph_mock.png"
            page.screenshot(path=str(shot))
            rep.item("ⓛ", shot.is_file(), f"{shot.relative_to(ROOT)} (mock 표본 — 배치가 쉰 전체 그래프)")

            # ⓓ 화면 = 서버 — 보이는 노드 = 닻에 있는 노드 · 보이는 엣지 = 양 끝이 다 보이는 엣지(관계 전부 켬)
            vis = page.evaluate("() => window.__platform.visible()")
            want_nodes = {n["id"] for n in data["nodes"] if n["id"] in data["anchor"]}
            want_edges = {e["id"] for e in data["edges"] if e["src"] in want_nodes and e["dst"] in want_nodes}
            ok = set(vis["nodes"]) == want_nodes and set(vis["edges"]) == want_edges
            rep.item("ⓓ", ok, f"visible 노드 {len(vis['nodes'])} = 서버 anchor 노드 {len(want_nodes)} · "
                              f"visible 엣지 {len(vis['edges'])} = 양 끝 보이는 엣지 {len(want_edges)} · "
                              f"(서버 전체 노드 {len(data['nodes'])} · 엣지 {len(data['edges'])})")

            # ⓔ 퍼진다 — 연결된 쌍의 평균 거리 < 연결 안 된 쌍의 평균 거리 × 0.5
            pos = page.evaluate(JS_POSITIONS)
            ids = sorted(pos)
            linked = {tuple(sorted((e["src"], e["dst"]))) for e in data["edges"]
                      if e["src"] in pos and e["dst"] in pos and e["src"] != e["dst"]}
            d = lambda a, b: math.hypot(pos[a][0] - pos[b][0], pos[a][1] - pos[b][1])  # noqa: E731
            lk = [d(a, b) for a, b in linked]
            un = [d(ids[i], ids[j]) for i in range(len(ids)) for j in range(i + 1, len(ids))
                  if (ids[i], ids[j]) not in linked]
            r = (sum(lk) / len(lk)) / (sum(un) / len(un))
            rep.item("ⓔ", r < 0.5, f"연결 쌍 평균 / 비연결 쌍 평균 = {r:.3f} (< 0.5) · 연결 쌍 {len(lk)} · "
                                   f"비연결 쌍 {len(un)}")

            # ⓗ 찾기는 강조만 — 걸린 노드가 강조되고 모든 좌표가 그대로
            target = max(data["nodes"], key=lambda n: (n["id"] in pos, n["tier"] == "main", n["name"]))
            q = target["name"].split("::")[-1]
            before = page.evaluate(JS_POSITIONS)
            iters = page.evaluate("() => window.__platform.layout.iterations")
            page.fill("[data-testid=search]", q)
            page.wait_for_selector("[data-testid=search-hits]")
            time.sleep(0.5)
            disp = page.evaluate("""(q) => { const p = window.__platform, s = p.sigma, out = {hit: [], miss: []};
                p.graph.forEachNode((id, a) => { const d = s.getNodeDisplayData(id);
                  const isHit = a.node.name.toLowerCase().includes(q.toLowerCase());
                  (isHit ? out.hit : out.miss).push([id, d.highlighted === true, d.color]); });
                return out; }""", q)
            after = page.evaluate(JS_POSITIONS)
            same = all(before[k] == after[k] for k in before)
            hits_ok = disp["hit"] and all(h for _id, h, _c in disp["hit"]) and \
                not any(h for _id, h, _c in disp["miss"])
            iters2 = page.evaluate("() => window.__platform.layout.iterations")
            running = page.evaluate("() => window.__platform.layout.running")
            rep.item("ⓗ", bool(hits_ok and same and iters == iters2 and not running),
                     f"찾기 「{q}」 → 걸린 노드 {len(disp['hit'])}개 강조(highlighted) · 나머지 {len(disp['miss'])}개 흐림 · "
                     f"좌표 바뀐 노드 {sum(before[k] != after[k] for k in before)}개 · 반복 수 {iters}→{iters2} · "
                     f"배치 running={running}")
            page.screenshot(path=str(CAPTURES / "p1_search_mock.png"))
            page.fill("[data-testid=search]", "")
            time.sleep(0.4)

            # ⓘ 노드 상세 — 인접 엣지 수 = 서버에서 그 노드를 끝으로 가진 엣지 수 · 칸 값 = 응답 값
            deg = {}
            for e in data["edges"]:
                deg[e["src"]] = deg.get(e["src"], 0) + 1
                if e["dst"] != e["src"]:
                    deg[e["dst"]] = deg.get(e["dst"], 0) + 1
            pick = max((n for n in data["nodes"] if n["id"] in pos), key=lambda n: (deg.get(n["id"], 0), n["id"]))
            page.mouse.click(*screen_xy(page, pick["id"]))
            page.wait_for_selector("[data-testid=detail]")
            shown_id = page.inner_text("[data-field=id]")
            node = next(n for n in data["nodes"] if n["id"] == shown_id)
            server_adj = sum(1 for e in data["edges"] if node["id"] in (e["src"], e["dst"]))
            adj = int(page.inner_text("[data-testid=adjacent-count]"))
            adj_rows = page.locator("[data-testid=adjacent]").count()
            fields = ["layer", "category", "status", "tier", "polarity", "made_by", "aliases", "attrs", "queue",
                      "id", "prov"]
            show = lambda v: "—" if v is None or v == "" else str(v)  # noqa: E731
            diff = {f: (page.inner_text(f"[data-field={f}]"), show(node[f])) for f in fields
                    if page.inner_text(f"[data-field={f}]") != show(node[f])}
            rep.item("ⓘ", shown_id == pick["id"] and adj == server_adj == adj_rows and not diff,
                     f"누른 노드 {pick['id'][-6:]} → 상세 id {shown_id[-6:]} · 인접 엣지 화면 {adj}(줄 {adj_rows}) = "
                     f"서버 {server_adj} · 칸 {len(fields)}개 중 다른 값 {diff or '없음'}")
            page.screenshot(path=str(CAPTURES / "p1_detail_mock.png"))

            # ⓖ 층 건너는 엣지 — 관계 토글을 전부 꺼도 cross 엣지는 보이고, 다른 선(곡선 · 다른 색)
            page.click("[data-testid=rels-none]")
            time.sleep(0.3)
            vis = page.evaluate("() => window.__platform.visible()")
            cross = {e["id"] for e in data["edges"] if e["cross"] and e["id"] in want_edges}
            looks = page.evaluate("""(ids) => { const g = window.__platform.graph, s = window.__platform.sigma;
                const out = {}; g.forEachEdge((id, a) => { const d = s.getEdgeDisplayData(id);
                  out[id] = [a.type, a.color, d ? d.hidden : null]; }); return out; }""")
            cross_look = {tuple(looks[i][:2]) for i in cross}
            plain_look = {tuple(v[:2]) for k, v in looks.items() if k not in cross}
            ok = (set(vis["edges"]) == cross and bool(cross)
                  and cross_look == {("curvedArrow", CROSS_COLOR)} and not (cross_look & plain_look)
                  and all(looks[i][2] is False for i in cross)
                  and all(v[2] is True for k, v in looks.items() if k not in cross))
            rep.item("ⓖ", ok, f"관계 토글 {len(data['rels'])}개 전부 끔 → 보이는 엣지 {len(vis['edges'])} = cross {len(cross)} · "
                              f"cross 모양 {sorted(cross_look)} · 나머지 모양 {sorted(plain_look)}")
            page.screenshot(path=str(CAPTURES / "p1_cross_only_mock.png"))
            page.click("[data-testid=rels-all]")
            time.sleep(0.3)

            # ⓕ 당기면 따라온다 — 전체 배치가 도는 중의 끌기(P1.5에서 쉰 뒤의 끌기는 끌기 배치라 p15_drag.py가 잰다)
            nbrs_of = {}
            for e in data["edges"]:
                if e["src"] in pos and e["dst"] in pos and e["src"] != e["dst"]:
                    nbrs_of.setdefault(e["src"], set()).add(e["dst"])
                    nbrs_of.setdefault(e["dst"], set()).add(e["src"])
            a_id = sorted(nbrs_of, key=lambda i: (-len(nbrs_of[i]), i))[0]
            caught = press_relayout_move(page, a_id)
            if caught is None:
                rep.item("ⓕ-도는 중", False, "다섯 번 모두 첫 움직임 직후 전체 배치가 돌고 있지 않았다")
            else:
                attempt, (x0, y0) = caught
                t0 = time.monotonic()
                # 기준 = 처음 전체 배치가 쉰 좌표(ⓔ의 pos). 「다시 배치」는 같은 시작에서 결정적으로 같은 곳에 쉬므로
                # 끌지 않았다면 이 좌표로 돌아온다 — 차이가 곧 끌기의 효과다(다시 배치 직후 좌표는 시작 자리라 기준이 못 된다).
                before = pos
                x1, y1 = drag_target(page, x0, y0)
                page.mouse.move(x1, y1, steps=25)
                drop_a = page.evaluate(JS_POSITIONS)[a_id]
                kind_up = page.evaluate("() => window.__platform.layout.kind")
                page.mouse.up()
                time.sleep(max(0.0, 2.0 - (time.monotonic() - t0)))  # 2초 안에
                after = page.evaluate(JS_POSITIONS)
                mx, my = after[a_id][0] - before[a_id][0], after[a_id][1] - before[a_id][1]
                moved = math.hypot(mx, my)
                nbrs = sorted(nbrs_of[a_id])
                vecs = [(after[n][0] - before[n][0], after[n][1] - before[n][1]) for n in nbrs]
                mean_move = sum(math.hypot(*v) for v in vecs) / len(vecs)
                avg = (sum(v[0] for v in vecs) / len(vecs), sum(v[1] for v in vecs) / len(vecs))
                dot = avg[0] * mx + avg[1] * my
                ratio = mean_move / moved if moved else 0.0
                stays = math.hypot(after[a_id][0] - drop_a[0], after[a_id][1] - drop_a[1])
                rep.item("ⓕ-도는 중", moved > 0 and ratio >= 0.10 and dot > 0 and stays < 1e-9,
                         f"{attempt}번째에 잡음(첫 움직임 직후 kind=layout · running=True) · 놓을 때 kind={kind_up} · "
                         f"기준 = 끌지 않은 전체 배치의 쉰 좌표 · "
                         f"노드 {a_id[-6:]} 이웃 {len(nbrs)} · 끈 거리 {moved:.3f} · 이웃 평균 이동 {mean_move:.3f} = "
                         f"{ratio:.0%} · 내적 {dot:+.4f} · 놓은 자리에서 2초 뒤 어긋남 {stays:.2e}")
                wait_rest(page)
                final = page.evaluate(JS_POSITIONS)
                off_a = math.hypot(final[a_id][0] - drop_a[0], final[a_id][1] - drop_a[1])
                rep.item("ⓕ-고정", off_a < 1e-9, f"배치가 쉬었을 때 놓은 자리에서 어긋남 {off_a:.2e}")
            page.screenshot(path=str(CAPTURES / "p1_after_drag_mock.png"))
            if errors:
                print("페이지 오류:", errors)
            browser.close()
    finally:
        plat.stop()

    # ⓚ 외부 요청 0 — 브라우저가 보낸 요청이 전부 플랫폼 주소로
    port_origin = urlparse(url).netloc
    outside = [u for u in requests if urlparse(u).netloc != port_origin]
    paths = sorted({urlparse(u).path if not urlparse(u).path.startswith("/assets/") else "/assets/…" for u in requests})
    rep.item("ⓚ", not outside, f"요청 {len(requests)}건 전부 {port_origin} · 밖으로 {outside or '0건'} · 경로 {paths}")

    # ⓙ 쓰기 0 — 상태 폴더 data/·registry/·layers/ 해시 그대로 · 시스템 폴더 git status 빈 출력
    hashes_after = state_hashes(home)
    changed = sorted(k for k in set(hashes_before) | set(hashes_after) if hashes_before.get(k) != hashes_after.get(k))
    porcelain = subprocess.run(["git", "-C", str(args.system), "status", "--porcelain"],
                               capture_output=True, text=True).stdout
    rep.item("ⓙ", not changed and porcelain == "",
             f"해시 대상 {len(hashes_before)}개 중 바뀐 것 {changed or '0개'} · 시스템 git status --porcelain "
             f"{'빈 출력' if porcelain == '' else repr(porcelain)}")
    return rep.finish()


if __name__ == "__main__":
    sys.exit(main())
