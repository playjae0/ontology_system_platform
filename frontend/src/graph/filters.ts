/* 거르기 — 문서별 노드 끄고 켜기 · 축 값 · 연결 없는 노드 보이기 (명세 §5.3 [P4]).
 *
 * 보이는 노드 = (탐색의 `visibleNodes` ∪ 연결 없는 노드[토글이 켜졌을 때]) − 거른 노드(문서 · 축 값).
 * 거르기는 골격 밖 노드에만 걸린다 — 골격(`status` = `seed`)은 늘 보인다(명세 §5.3).
 * 화면의 「보이기」는 이 파일의 `shownNodes` 하나다 — 그리기 · 머리 줄 · 깊이 표 · 범례 · 찾기 · 화면에 없는 노드 수가 이것을 쓴다.
 * 문서 · 축 값은 받은 노드의 칸을 읽을 뿐이다(화면이 다시 계산하지 않는다 — 명세 §2-3).
 */
import type { Graph, GNode } from "../types";
import { type Axis, axisValue, isSkeleton } from "./style";
import { type Explore, visibleNodes } from "./explore";

/** `docs`의 이 값은 골격이라 문서가 아니다(명세 §4 — `/api/doc/seed`는 404). */
export const SKELETON_DOC = "seed";

/** 축 값 거르기를 두는 축 — 명세 §5.3 그대로. 값이 이보다 많은 축은 두지 않는다. */
export const FILTER_AXES: Axis[] = ["layer", "status", "tier", "polarity"];
export const FILTER_AXIS_MAX_VALUES = 12;

export interface Filters {
  docsOff: Set<string>;                          // 끈 문서(기본 비어 있음 = 전부 켜짐)
  valuesOff: Partial<Record<Axis, Set<string>>>; // 축마다 끈 값
  detached: boolean;                             // 연결 없는 노드 보이기
}

export const emptyFilters = (): Filters => ({ docsOff: new Set(), valuesOff: {}, detached: false });

/** 노드의 문서 — `seed`를 뺀 것. */
export const docsOf = (n: GNode) => (n.docs || []).filter((d) => d !== SKELETON_DOC);

/** 문서 목록 — 골격 밖 노드의 `docs`에 나온 문서마다 [문서 id, 노드 수](이름 순 · DECISIONS P-46). */
export function docList(g: Graph): [string, number][] {
  const cnt = new Map<string, number>();
  for (const n of g.nodes) {
    if (isSkeleton(n)) continue;
    for (const d of new Set(docsOf(n))) cnt.set(d, (cnt.get(d) || 0) + 1);
  }
  return [...cnt.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** 축 값 목록 — 골격 밖 노드의 그 축 값마다 [값, 노드 수](이름 순). 값이 12개를 넘는 축은 빠진다(DECISIONS P-48). */
export function axisValueLists(g: Graph): [Axis, [string, number][]][] {
  const out: [Axis, [string, number][]][] = [];
  for (const ax of FILTER_AXES) {
    const cnt = new Map<string, number>();
    for (const n of g.nodes) {
      if (isSkeleton(n)) continue;
      const v = axisValue(n, ax);
      cnt.set(v, (cnt.get(v) || 0) + 1);
    }
    if (cnt.size === 0 || cnt.size > FILTER_AXIS_MAX_VALUES) continue;
    out.push([ax, [...cnt.entries()].sort((a, b) => a[0].localeCompare(b[0]))]);
  }
  return out;
}

/** 연결 없는 노드 — 시스템이 준 `detached`의 `edgeless` + `island`(겹치면 한 번). */
export function detachedNodes(g: Graph): string[] {
  return [...new Set([...(g.detached?.edgeless || []), ...(g.detached?.island || [])])];
}

/** 거른 노드인가 — 골격은 거르지 않는다. 문서가 없는 골격 밖 노드는 문서로는 거르지 않는다(DECISIONS P-47). */
export function filteredOut(n: GNode, f: Filters): boolean {
  if (isSkeleton(n)) return false;
  if (f.docsOff.size) {
    const ds = docsOf(n);
    if (ds.length && ds.every((d) => f.docsOff.has(d))) return true;
  }
  for (const ax of FILTER_AXES) {
    const off = f.valuesOff[ax];
    if (off && off.size && off.has(axisValue(n, ax))) return true;
  }
  return false;
}

/** 보이는 노드 — 이 화면의 「보이기」 판정은 이 함수 하나다(명세 §5.3 · §5.4). */
export function shownNodes(g: Graph, e: Explore, f: Filters): Set<string> {
  const out = visibleNodes(g, e);
  if (f.detached) {
    const ids = new Set(g.nodes.map((n) => n.id));
    for (const id of detachedNodes(g)) if (ids.has(id)) out.add(id);
  }
  for (const n of g.nodes) if (out.has(n.id) && filteredOut(n, f)) out.delete(n.id);
  return out;
}

/** 찾기 · 펼치기로 보이게 할 수 있는 노드인가 — 닻이 있거나(토글이 켜졌을 때) 연결 없는 노드이고, 거른 노드가 아니다(DECISIONS P-49). */
export function reachable(g: Graph, n: GNode, f: Filters, detachedSet: Set<string>): boolean {
  if (!(n.id in g.anchor) && !(f.detached && detachedSet.has(n.id))) return false;
  return !filteredOut(n, f);
}
