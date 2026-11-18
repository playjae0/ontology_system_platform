# -*- coding: utf-8 -*-
"""P4 완료판정 ⓐ~ⓚ — 거르기(문서 · 축 값 · 연결 없는 노드)와 노드 상세(값 줄 · 원 레코드). mock 하나로 잰다.

    python verify/p4_filters.py --chromium /opt/pw-browsers/chromium     # ⓐ~ⓖ · ⓙ · ⓚ

ⓗ(P3 확인 고침)는 `p3_explore.py`를, ⓘ(회귀)는 P1 확인 셋 · `p2_query.py` · `p16_drag.py --ref`를 따로 돌린다(요청문 §3).
「따로 셈」은 `/api/graph` 응답으로 이 스크립트가 센 것이다 — 화면 코드와 별개로 같은 규칙(명세 §5.3)을 다시 적어 대조한다.
mock 표본의 개수를 세는 어서션은 없다 — 화면과 응답(따로 셈)이 같은지, 동작이 일어나는지만 잰다.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DEFAULT_SYSTEM, ROOT, Platform, Report, get_json  # noqa: E402
from p1_screen import GL_ARGS, JS_POSITIONS, screen_xy, state_hashes, wait_rest  # noqa: E402
from p3_explore import drawn, shown, wait_settle  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

CAPTURES = ROOT / "verify" / "captures"
SEED = "seed"
AXES = ["layer", "status", "tier", "polarity"]     # 명세 §5.3의 축 이름(칸 이름이다 — 값은 데이터에서 읽는다)


# ── 따로 셈 — /api/graph로(명세 §5.3의 규칙을 다시 적는다) ─────────────────────────
def is_skel(n) -> bool:
    return n.get("status") == SEED


def docs_of(n) -> list[str]:
    return [d for d in (n.get("docs") or []) if d != SEED]


def axis_value(n, ax) -> str:
    v = n.get(ax)
    return "—" if v is None or v == "" else str(v)


def expected(g, docs_off=frozenset(), values_off=None, extra=frozenset()) -> set[str]:
    """「전체」(mock의 첫 화면)에서의 보이는 노드 = 닻 있는 노드 ∪ extra − 거른 골격 밖 노드."""
    values_off = values_off or {}
    out = set()
    for n in g["nodes"]:
        if n["id"] not in g["anchor"] and n["id"] not in extra:
            continue
        if not is_skel(n):
            ds = docs_of(n)
            if docs_off and ds and all(d in docs_off for d in ds):
                continue
            if any(axis_value(n, ax) in values_off.get(ax, ()) for ax in AXES):
                continue
        out.add(n["id"])
    return out


def doc_counts(g) -> dict[str, int]:
    cnt: dict[str, int] = {}
    for n in g["nodes"]:
        if is_skel(n):
            continue
        for d in set(docs_of(n)):
            cnt[d] = cnt.get(d, 0) + 1
    return cnt


# ── 화면 ───────────────────────────────────────────────────────────────────
def open_page(p, args, url, route=None):
    browser = p.chromium.launch(args=GL_ARGS, executable_path=args.chromium)
    ctx = browser.new_context(viewport={"width": 1500, "height": 900})
    requests: list[str] = []
    ctx.on("request", lambda r: requests.append(r.url))
    page = ctx.new_page()
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    if route:
        page.route("**/api/graph", route)
    page.goto(url)
    page.wait_for_function("() => !!window.__platform && window.__platform.graph.order > 0", timeout=120000)
    wait_settle(page)
    return browser, page, requests, errors


def doc_check(page, doc: str):
    return page.locator(f"[data-testid=doc-list] [data-doc='{doc}'] [data-testid=doc-check]")


def same_pos(before: dict, after: dict, ids) -> float:
    return max((abs(after[i][0] - before[i][0]) + abs(after[i][1] - before[i][1]) for i in ids), default=0.0)


def check_main(p, args, rep: Report, url: str):
    st, g = get_json(url + "api/graph")
    assert st == 200, st
    by = {n["id"]: n for n in g["nodes"]}
    browser, page, requests, errors = open_page(p, args, url)
    base = shown(page)

    # ⓐ 문서 목록 = 따로 센 것(골격 밖 노드의 docs 기준)
    rows = page.evaluate("""() => [...document.querySelectorAll('[data-testid=doc-list] [data-doc]')].map((r) =>
        [r.dataset.doc, Number(r.querySelector('[data-testid=doc-count]').textContent)])""")
    want = sorted(doc_counts(g).items())
    rep.item("ⓐ", rows == [list(x) for x in want] and len(rows) > 0,
             f"목록 {rows} = 따로 셈 {want} → {rows == [list(x) for x in want]} (mock)")

    # ⓑ 문서 끄기 — 노드가 가장 많은 문서
    big = max(want, key=lambda kv: (kv[1], kv[0]))[0]
    pos0 = page.evaluate(JS_POSITIONS)
    doc_check(page, big).uncheck()
    wait_settle(page)
    s1 = shown(page)
    want1 = expected(g, {big})
    pos1 = page.evaluate(JS_POSITIONS)
    moved = same_pos(pos0, pos1, s1)
    kind1 = page.evaluate("() => window.__platform.layout.kind")
    ok_off = s1 == want1 and drawn(page) == s1 and moved == 0 and s1 < base

    # ⓕ 수가 같다(문서 하나를 끈 상태) — 머리 줄 · 깊이 표 · 범례
    head = page.inner_text("[data-testid=counts]")
    head_n = int(head.split("노드 ")[1].split("/")[0])
    table = page.evaluate("""() => [...document.querySelectorAll('[data-testid=depth-table] tr[data-cat]')].map((r) =>
        [r.dataset.cat, Number(r.querySelector('[data-testid=depth-count]').textContent.split('/')[0])])""")
    cat_cnt: dict[str, int] = {}
    for i in s1:
        n = by[i]
        if not is_skel(n):
            c = n.get("category") or "—"
            cat_cnt[c] = cat_cnt.get(c, 0) + 1
    table_ok = all(cat_cnt.get(c, 0) == k for c, k in table)
    legend_sum = page.evaluate("""() => [...document.querySelectorAll('[data-testid=legend] .row .muted')]
        .reduce((a, el) => a + Number(el.textContent), 0)""")
    rep.item("ⓕ", head_n == len(s1) and table_ok and legend_sum == len(s1),
             f"문서 {big} 끔 — 머리 줄 「{head}」 노드 {head_n} = 보이는 {len(s1)} · 깊이 표 {table} = 그린 수 {table_ok} · "
             f"범례 합 {legend_sum} = {len(s1)}")

    # ⓚ 캡처 — 문서 하나를 끈 화면(화면 맨 위 mock 띠는 플랫폼이 띄운다)
    CAPTURES.mkdir(parents=True, exist_ok=True)
    cap = CAPTURES / "p4_doc_off_mock.png"
    page.screenshot(path=str(cap))
    band = page.locator(".mock-band").count() > 0

    doc_check(page, big).check()
    wait_settle(page)
    back = shown(page) == base
    page.click("[data-testid=docs-none]")
    wait_settle(page)
    s_none = shown(page)
    skel = {n["id"] for n in g["nodes"] if n["id"] in g["anchor"] and is_skel(n)}
    want_none = expected(g, set(doc_counts(g)))
    page.click("[data-testid=docs-all]")
    wait_settle(page)
    back2 = shown(page) == base
    rep.item("ⓑ", ok_off and back and s_none == want_none and back2,
             f"「{big}」 끔 → 보이는 {len(s1)} = 따로 셈 {len(want1)} {s1 == want1} · 그린 노드 같음 {drawn(page) == shown(page)} · "
             f"남은 노드 좌표 변화 최대 {moved:.1e} · 배치 {kind1} · 다시 켬 → 이전 집합 {back} · 「전부 끄기」 → {len(s_none)} = 따로 셈 "
             f"{s_none == want_none}(골격 {len(skel)} · 문서 없는 골격 밖 노드는 남음 — P-47) · 「전부 켜기」 → 이전 집합 {back2} (mock)")
    rep.item("ⓚ", cap.exists() and band, f"{cap.relative_to(ROOT)} (mock 띠 {band})")

    # ⓒ 문서 이름 누르기 → 문서 패널이 그 doc_id로
    with page.expect_response(lambda r: r.url.endswith(f"/api/doc/{big}")) as resp:
        page.click(f"[data-testid=doc-list] [data-doc='{big}'] [data-testid=doc-name]")
    page.wait_for_selector("[data-testid=doc-panel] [data-testid=doc-rows]", timeout=30000)
    title = page.inner_text("[data-testid=doc-panel] h2")
    rep.item("ⓒ", title == f"문서 {big}" and resp.value.status == 200,
             f"「{big}」 누름 → 문서 패널 「{title}」 · /api/doc/{big} {resp.value.status}")
    page.click("[data-testid=doc-panel] >> text=← 노드 상세로")

    # ⓓ 축 값 — layer 축에서 값 하나를 끈다(골격 밖 노드가 가장 많은 값)
    lay = {}
    for n in g["nodes"]:
        if not is_skel(n):
            lay[axis_value(n, "layer")] = lay.get(axis_value(n, "layer"), 0) + 1
    val = max(lay, key=lambda v: (lay[v], v))
    box = page.locator(f"[data-axis=layer] [data-value='{val}'] [data-testid=value-check]")
    box.uncheck()
    wait_settle(page)
    s2 = shown(page)
    want2 = expected(g, values_off={"layer": {val}})
    box.check()
    wait_settle(page)
    back3 = shown(page) == base
    rep.item("ⓓ", s2 == want2 and s2 < base and back3,
             f"layer 「{val}」 끔 → 보이는 {len(s2)} = 따로 셈 {len(want2)} {s2 == want2} · 다시 켬 → 이전 집합 {back3} (mock)")

    # ⓖ 상세 — values가 있는 노드 · 없는 노드
    with_v = sorted(i for i in base if by[i].get("values"))
    no_v = sorted(i for i in base if not by[i].get("values"))
    wait_rest(page)
    target = with_v[0]
    with page.expect_response(lambda r: r.url.endswith(f"/api/node/{target}")) as nresp:
        page.mouse.click(*screen_xy(page, target))
    page.wait_for_selector("[data-testid=evidence]", timeout=30000)
    picked = page.evaluate("() => document.querySelector('[data-field=id]')?.textContent")
    # textContent — inner_text는 겹친 공백을 하나로 줄여 글자 그대로를 볼 수 없다
    lines = page.evaluate("() => [...document.querySelectorAll('[data-testid=value-line]')].map((e) => e.textContent)")
    rec = nresp.value.json().get("record")
    page.click("[data-testid=record] summary")
    shown_rec = json.loads(page.inner_text("[data-testid=record-json]"))
    ok_v = picked == target and lines == by[target]["values"] and shown_rec == rec
    # values가 없는 이웃 — 상세의 인접 엣지 링크로 고른다(캔버스에서는 겹친 노드를 집을 수 있다)
    nbr = [e["dst"] if e["src"] == target else e["src"] for e in g["edges"] if target in (e["src"], e["dst"])]
    other = next(i for i in nbr if i in no_v)
    page.click(f"[data-testid=adjacent] a >> text={by[other]['name']}")
    page.wait_for_function(f"() => document.querySelector('[data-field=id]')?.textContent === '{other}'")
    no_box = page.locator("[data-testid=values]").count() == 0
    rep.item("ⓖ", ok_v and no_box,
             f"{target[-6:]} 누름 → 값 줄 {len(lines)} = values {len(by[target]['values'])} 그대로 {lines == by[target]['values']} · "
             f"원 레코드 펼친 JSON = /api/node record {shown_rec == rec} · values 없는 {other[-6:]} → 값 칸 없음 {no_box} (mock)")

    rep.item("오류", not errors, f"페이지 오류 {len(errors)} {errors[:2]}")
    browser.close()
    return [u for u in requests if not u.startswith("http://127.0.0.1")]


def check_e(p, args, rep: Report, url: str):
    """ⓔ — /api/graph를 가로채 엣지 없는 노드 하나를 nodes와 detached.edgeless에 넣는다."""
    new_id = "P4DETACHEDNODE000000000000"           # 26자 — 응답에 없는 id

    def add(route):
        r = route.fetch()
        body = r.json()
        src = next(n for n in body["nodes"] if n.get("status") != SEED)
        body["nodes"].append({**src, "id": new_id, "name": f"{src['name']}·연결없음"})
        body["detached"]["edgeless"] = [*body["detached"].get("edgeless", []), new_id]
        route.fulfill(response=r, json=body)

    browser, page, requests, errors = open_page(p, args, url, route=add)
    label = page.inner_text("[data-testid=detached-label]")
    hidden0 = new_id not in shown(page)
    page.check("[data-testid=detached-toggle]")
    wait_settle(page)
    on = new_id in shown(page) and new_id in drawn(page)
    page.uncheck("[data-testid=detached-toggle]")
    wait_settle(page)
    off = new_id not in shown(page) and new_id not in drawn(page)
    rep.item("ⓔ", label == "연결 없는 노드 1개 보이기" and hidden0 and on and off and not errors,
             f"가로채 넣음 → 「{label}」 · 처음 숨김 {hidden0} · 켬 → 보이고 그려짐 {on} · 끔 → 빠짐 {off} · 오류 {len(errors)}")
    browser.close()
    return [u for u in requests if not u.startswith("http://127.0.0.1")]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chromium", default=None)
    ap.add_argument("--system", type=Path, default=DEFAULT_SYSTEM)
    args = ap.parse_args()
    rep = Report()
    status0 = subprocess.run(["git", "-C", str(args.system), "status", "--porcelain"], capture_output=True, text=True).stdout
    home = Path(args.system) / "state_mock"
    hash0 = state_hashes(home)
    plat = Platform(Path(args.system), "--allow-mock", "--no-browser")
    try:
        url = plat.wait_url()
        with sync_playwright() as p:
            ext = check_main(p, args, rep, url)
            ext += check_e(p, args, rep, url)
    finally:
        plat.stop()
    status1 = subprocess.run(["git", "-C", str(args.system), "status", "--porcelain"], capture_output=True, text=True).stdout
    same = state_hashes(home) == hash0
    rep.item("ⓙ", not status0 and not status1 and not ext and same,
             f"상태 폴더 data·registry·layers 해시 그대로 {same} · 시스템 git status 빈 출력 {not status1} · 외부(127.0.0.1 밖) 요청 {len(ext)}")
    sys.exit(rep.finish())


if __name__ == "__main__":
    main()
