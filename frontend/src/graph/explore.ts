/* 탐색 — 보이는 노드를 정하는 한 함수 · 카테고리별 깊이 · 펼침과 질의 칩 · 첫 화면 (명세 §5.4 [P3]).
 *
 * 보이는 노드 = 골격(seed) ∪ 카테고리별 깊이에 드는 노드 ∪ 펼친 노드 ∪ 질의로 끌어온 노드,
 *               그리고 그 노드들의 골격까지의 길(`anchor.host`를 골격까지 따라간 노드).
 * 닻이 없는 노드(연결 없는 노드)는 이 함수 밖이다(명세 §5.3). 그리기 · 머리 줄의 수 · 범례 · 찾기 · 화면에 없는 노드 수가
 * 모두 이 함수 하나를 쓴다. 깊이는 시스템이 준 `anchor[id].hops`다 — 화면이 다시 세지 않는다(명세 §2-3).
 */
import type { Graph, GNode } from "../types";
import { isSkeleton } from "./style";

/** 카테고리 한 줄의 깊이 — 0(안 보임) · 1 · 2 · 3 · 전부. */
export type Depth = 0 | 1 | 2 | 3 | "all";
export const DEPTHS: Depth[] = [0, 1, 2, 3, "all"];

/** 소프트웨어 그리기에서 「골격만」으로 여는 문턱 — 플랫폼 트랙이 정한 값 그대로(명세 §5.4 · §8 2026-11-17). 사내 실측으로 고친다. */
export const SOFTWARE_SKELETON_ONLY = 500;

/** 칩 — 펼침(노드 하나에서 펼친 것) 또는 질의(겹쳐 보기에서 끌어온 것 · 하나뿐). `added`는 칩을 더할 때 새로 보인 수. */
export interface Chip {
  key: string;
  kind: "expand" | "query";
  label: string;
  nodes: string[];
  added: number;
}

export interface Explore {
  depths: Record<string, Depth>;
  chips: Chip[];
}

/** 카테고리 열쇠 — 카테고리가 없으면 「—」(색 축과 같은 표기). */
export const catKey = (n: GNode) => (n.category == null || n.category === "" ? "—" : n.category);

/** 깊이 표의 줄 — 골격이 아닌 닻 있는 노드가 있는 카테고리마다 [이름, 전체 수](이름 순). */
export function exploreCategories(g: Graph): [string, number][] {
  const cnt = new Map<string, number>();
  for (const n of g.nodes) {
    if (!(n.id in g.anchor) || isSkeleton(n)) continue;
    cnt.set(catKey(n), (cnt.get(catKey(n)) || 0) + 1);
  }
  return [...cnt.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** 모든 카테고리를 같은 깊이로 — 「골격만」은 0, 「전체」는 전부. */
export function uniformDepths(g: Graph, d: Depth): Record<string, Depth> {
  return Object.fromEntries(exploreCategories(g).map(([c]) => [c, d]));
}

/** 닻이 있는 노드 수 — 첫 화면 규칙의 N. */
export const anchoredCount = (g: Graph) => g.nodes.filter((n) => n.id in g.anchor).length;

/** 첫 화면 — N이 `explore_threshold`를 넘거나, 그리기가 소프트웨어이고 N이 500을 넘으면 「골격만」. 아니면 「전체」. */
export function initialExplore(g: Graph, software: boolean | null): Explore {
  const n = anchoredCount(g);
  const skeletonOnly = n > g.explore_threshold || (software === true && n > SOFTWARE_SKELETON_ONLY);
  return { depths: uniformDepths(g, skeletonOnly ? 0 : "all"), chips: [] };
}

/** 지금 설정의 이름 — 「전체」 · 「골격만」 · 그 밖(사람이 고른 깊이·칩). 확인용 손잡이가 읽는다. */
export function exploreMode(e: Explore): "all" | "skeleton" | "custom" {
  const ds = Object.values(e.depths);
  if (ds.every((d) => d === "all")) return "all";
  if (ds.every((d) => d === 0) && e.chips.length === 0) return "skeleton";
  return "custom";
}

/** 보이는 노드 — 이 화면의 「보이기」 판정은 이 함수 하나다. */
export function visibleNodes(g: Graph, e: Explore): Set<string> {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const out = new Set<string>();
  // 노드 하나와 그 골격까지의 길 — 넣을 때 길을 함께 넣으므로, 이미 든 노드에서 멈춰도 길은 이미 다 들어 있다.
  const add = (id: string) => {
    let cur: string | undefined = id;
    for (let guard = 0; cur && cur in g.anchor && !out.has(cur) && guard < 100000; guard++) {
      out.add(cur);
      const n = byId.get(cur);
      if (!n || isSkeleton(n)) break;
      const host: string = g.anchor[cur].host;
      cur = host === cur ? undefined : host;
    }
  };
  for (const n of g.nodes) {
    if (!(n.id in g.anchor)) continue;
    if (isSkeleton(n)) { add(n.id); continue; }
    const d = e.depths[catKey(n)] ?? 0;
    if (d === "all" || (d > 0 && g.anchor[n.id].hops <= d)) add(n.id);
  }
  for (const c of e.chips) c.nodes.forEach(add);
  return out;
}

/** 깊이 표의 수 — 카테고리마다 그려지는(보이는) 골격 밖 노드 수. */
export function drawnByCategory(g: Graph, shown: Set<string>): Map<string, number> {
  const cnt = new Map<string, number>();
  for (const n of g.nodes) {
    if (!shown.has(n.id) || isSkeleton(n)) continue;
    cnt.set(catKey(n), (cnt.get(catKey(n)) || 0) + 1);
  }
  return cnt;
}

/** 칩 하나를 더했을 때(같은 열쇠의 칩은 바꾼다) 새로 보이는 수. */
export function withChip(g: Graph, e: Explore, chip: Omit<Chip, "added">): Explore {
  const rest = e.chips.filter((c) => c.key !== chip.key);
  const before = visibleNodes(g, { ...e, chips: rest });
  const after = visibleNodes(g, { ...e, chips: [...rest, { ...chip, added: 0 }] });
  return { ...e, chips: [...rest, { ...chip, added: after.size - before.size }] };
}

/** 연결 수 — `/api/graph`의 엣지 전부(관계·층·보이기와 무관 · 양 끝 모두)로 한 번 센다(명세 §5.2). */
export function degreeOf(g: Graph): Map<string, number> {
  const deg = new Map<string, number>();
  for (const e of g.edges) {
    deg.set(e.src, (deg.get(e.src) || 0) + 1);
    deg.set(e.dst, (deg.get(e.dst) || 0) + 1);
  }
  return deg;
}

/** 같은 id로 온 엣지 중 둘째부터의 수 — 그리기는 처음 것만(명세 §5.7). */
export function duplicateEdges(g: Graph): number {
  return g.edges.length - new Set(g.edges.map((e) => e.id)).size;
}
