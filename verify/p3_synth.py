# -*- coding: utf-8 -*-
"""P3 합성 그래프 — 시스템 mock 상태를 임시 폴더에 복사하고 노드를 더해 N개로 만든다(요청문 P3 §0).

    python verify/p3_synth.py --n 2000            # 만들고 수만 찍고 지운다(확인용)
    from p3_synth import synth_system             # p3_explore.py가 쓴다
    with synth_system(2000) as sysdir: ...        # sysdir를 `run.py --system`에 넘긴다 · 끝나면 지운다

왜 폴더째 복사하나: 시스템은 `USE_MOCK=1`이면 `ONTO_HOME`을 무시하고 **시스템 폴더 안의** `state_mock/`을 읽는다.
그래서 시스템 폴더를 그대로 두고 상태만 바꿀 수 없다 — `.git`을 뺀 폴더 전체를 레포 밖 임시 폴더로 복사해 그 사본의
`state_mock/data/<층>/graph.json`만 바꾼다. 시스템 폴더는 읽기만 한다(끝나고 `git status --porcelain`이 비어 있다).

만드는 법(요청문 그대로):
  · 본 = mock 그래프의 골격 밖 노드(`status` ≠ `seed`)를 id 순으로 돌려 가며 쓴다.
  · 새 노드: 카테고리 · 층 · tier · status는 본 그대로 · 이름 `<본 이름>·합성<i>` · provenance `SYN#R<i>` · 26자 id.
  · 본에 닿는 엣지마다 같은 관계 · 같은 방향 · 같은 층 그래프에 하나 — 상대는 본의 상대와 **같은 카테고리** 노드 중
    Zipf(s = 0.8)로 고른다(앞 순위 몇 노드에 몰린다). 같은 (src, rel, dst)는 한 벌 · 두 끝이 같은 엣지는 만들지 않는다.
  · 층 · 카테고리 · 관계 이름은 여기에 적지 않는다 — 전부 데이터에서 읽는다.
합성 그래프의 수는 **동작 확인용**이다(품질 근거 아님 · CLAUDE.md §3). 화면 캡처에는 「합성」을 적는다.
"""
from __future__ import annotations

import argparse
import contextlib
import json
import random
import shutil
import sys
import tempfile
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DEFAULT_SYSTEM  # noqa: E402

ZIPF_S = 0.8
SEED = 20261117                      # 같은 N → 같은 그래프(결정적)
CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def synth_id(i: int) -> str:
    """26자 id — `SYN` + Crockford base32. 시스템 id(ULID 꼴)와 길이를 맞추고 앞머리로 합성임을 가른다."""
    body = ""
    for _ in range(23):
        body = CROCKFORD[i % 32] + body
        i //= 32
    return "SYN" + body


def _graph_files(state: Path) -> list[Path]:
    return sorted(state.glob("data/*/graph.json"))


def grow(state: Path, n: int) -> dict:
    """`state`(복사본의 state_mock) 안 그래프 파일들에 노드를 더해 전체 n개로 만든다. 만든 수를 돌려준다."""
    files = _graph_files(state)
    graphs = {f: json.loads(f.read_text(encoding="utf-8")) for f in files}

    nodes: dict[str, dict] = {}                      # id → 노드(층 파일과 함께)
    home: dict[str, Path] = {}
    for f, g in graphs.items():
        for nid, node in g["nodes"].items():
            nodes[nid] = node
            home[nid] = f
    total0 = len(nodes)
    if n <= total0:
        return {"added_nodes": 0, "added_edges": 0, "nodes": total0}

    # 엣지 목록 — 층 파일마다 · 같은 (src, rel, dst)는 그래프 전체에 한 벌(B180)
    seen = {(e["src"], e["rel"], e["dst"]) for g in graphs.values() for e in g["edges"]}
    incident: dict[str, list[tuple[Path, dict]]] = {}
    for f, g in graphs.items():
        for e in g["edges"]:
            incident.setdefault(e["src"], []).append((f, e))
            incident.setdefault(e["dst"], []).append((f, e))

    templates = sorted(nid for nid, nd in nodes.items() if nd.get("status") != "seed" and incident.get(nid))
    if not templates:
        raise SystemExit("골격 밖 노드가 없어 합성할 본이 없다")

    # 카테고리 → 상대 후보(이미 있던 노드 id 순 · 만든 노드는 만든 순으로 뒤에) — Zipf 순위가 이 순서다.
    by_cat: dict[str, list[str]] = {}
    for nid in sorted(nodes):
        by_cat.setdefault(nodes[nid].get("category"), []).append(nid)

    rng = random.Random(SEED)
    weights_cache: dict[int, list[float]] = {}

    def zipf_pick(cands: list[str]) -> str:
        k = len(cands)
        if k not in weights_cache:
            weights_cache[k] = [1.0 / (r + 1) ** ZIPF_S for r in range(k)]
        return rng.choices(cands, weights=weights_cache[k], k=1)[0]

    added_nodes = added_edges = 0
    for i in range(1, n - total0 + 1):
        t = templates[(i - 1) % len(templates)]
        tn = nodes[t]
        nid = synth_id(i)
        node = dict(tn)
        node.update(id=nid, canonical=f"{tn.get('canonical', t)}·합성{i}", provenance=[f"SYN#R{i}"],
                    aliases=[], attrs={})
        f_home = home[t]
        graphs[f_home]["nodes"][nid] = node
        nodes[nid] = node
        home[nid] = f_home
        added_nodes += 1

        for f, e in incident[t]:
            other = e["dst"] if e["src"] == t else e["src"]
            cands = by_cat.get(nodes[other].get("category"), [])
            if not cands:
                continue
            for _try in range(8):                     # 겹침·제자리 엣지면 다시 뽑는다
                o = zipf_pick(cands)
                if o == nid:
                    continue
                src, dst = (nid, o) if e["src"] == t else (o, nid)
                key = (src, e["rel"], dst)
                if key in seen:
                    continue
                seen.add(key)
                new = {k: v for k, v in e.items() if k not in ("src", "dst", "provenance", "polarity_by")}
                new.update(src=src, dst=dst, provenance=[f"SYN#R{i}"])
                graphs[f]["edges"].append(new)
                added_edges += 1
                break
        by_cat.setdefault(node.get("category"), []).append(nid)

    for f, g in graphs.items():
        f.write_text(json.dumps(g, ensure_ascii=False), encoding="utf-8")
    return {"added_nodes": added_nodes, "added_edges": added_edges, "nodes": total0 + added_nodes}


def degrees(state: Path) -> Counter:
    deg: Counter = Counter()
    for f in _graph_files(state):
        for e in json.loads(f.read_text(encoding="utf-8"))["edges"]:
            deg[e["src"]] += 1
            deg[e["dst"]] += 1
    return deg


@contextlib.contextmanager
def synth_system(n: int, system: Path = DEFAULT_SYSTEM):
    """시스템 폴더를 레포 밖 임시 폴더로 복사(`.git` 제외)하고 노드를 n개로 늘린다 · 끝나면 지운다."""
    tmp = Path(tempfile.mkdtemp(prefix="p3synth_"))
    dst = tmp / system.name
    try:
        shutil.copytree(system, dst, ignore=shutil.ignore_patterns(".git", "__pycache__"))
        info = grow(dst / "state_mock", n)
        info["dir"] = str(dst)
        yield dst, info
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=2000)
    ap.add_argument("--system", type=Path, default=DEFAULT_SYSTEM)
    args = ap.parse_args()
    with synth_system(args.n, args.system) as (d, info):
        deg = degrees(d / "state_mock")
        edges = sum(len(json.loads(f.read_text(encoding="utf-8"))["edges"]) for f in _graph_files(d / "state_mock"))
        print(f"합성 {info['nodes']}노드(+{info['added_nodes']}) · 엣지 {edges}(+{info['added_edges']}) · "
              f"연결 수 최대 {max(deg.values())} — 동작 확인용(품질 근거 아님) · 임시 폴더 {d}")
    print(f"지웠다: {not d.parent.exists()}")


if __name__ == "__main__":
    main()
