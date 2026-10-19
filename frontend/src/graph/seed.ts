/* 힘 배치의 시작 자리 — 결정적이다(같은 데이터 → 같은 시작 · 난수 0) (명세 §5.1).
 *
 * - 골격 노드(`status` = seed)는 `roots`에서 출발해 골격 노드끼리의 엣지를 따라(관계 이름과 무관하게 · 방향 없이)
 *   넓이 우선으로 줄을 세운다 — 깊이가 줄, 방문 순서가 줄 안의 자리.
 * - 나머지 노드는 닻의 `host` 둘레 고리에서 출발한다(host가 앞 위성이면 그 위성 둘레).
 *
 * 시스템 뷰어 `layout.js`의 시작 자리는 관계 이름 하나를 코드에 박아 골격 나무를 만든다 — 그래서 옮기지 않고 새로 썼다
 * (요청문 P1 §2-②). 열 때마다 비슷한 그림이 되게 하려는 것이고, 힘이 곧 자리를 옮기므로 똑같을 필요는 없다.
 */
import type { Anchor, GEdge, GNode } from "../types";
import { isSkeleton } from "./style";

export interface XY { x: number; y: number }

const ROW_GAP = 3;          // 골격 줄 사이
const COL_GAP = 2;          // 골격 줄 안의 이웃 사이
const RING_MIN = 0.8;       // host 둘레 고리의 최소 반경
const RING_PER = 0.12;      // 고리 반경 — 자식 하나마다 더한다(자식이 많으면 넓게)

/** 같은 입력에서 늘 같은 순서 — 이름 → id. */
const byName = (a: GNode, b: GNode) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

export function seedPositions(nodes: GNode[], edges: GEdge[], anchor: Record<string, Anchor>,
                              roots: string[]): Record<string, XY> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const pos: Record<string, XY> = {};

  // ── 골격 — 골격 노드끼리의 엣지로 넓이 우선 ───────────────────────────────
  const skeleton = nodes.filter(isSkeleton);
  const isSk = new Set(skeleton.map((n) => n.id));
  const adj = new Map<string, GNode[]>(skeleton.map((n) => [n.id, []]));
  for (const e of edges) {
    if (e.src === e.dst || !isSk.has(e.src) || !isSk.has(e.dst)) continue;
    adj.get(e.src)!.push(byId.get(e.dst)!);
    adj.get(e.dst)!.push(byId.get(e.src)!);
  }
  adj.forEach((list) => list.sort(byName));

  const rows: string[][] = [];
  const seen = new Set<string>();
  const walk = (start: string) => {          // 한 덩어리를 넓이 우선으로
    if (seen.has(start)) return;
    seen.add(start);
    const queue: [string, number][] = [[start, 0]];
    while (queue.length) {
      const [id, depth] = queue.shift()!;
      (rows[depth] = rows[depth] || []).push(id);
      for (const nb of adj.get(id)!) {
        if (seen.has(nb.id)) continue;
        seen.add(nb.id);
        queue.push([nb.id, depth + 1]);
      }
    }
  };
  roots.filter((id) => isSk.has(id)).forEach(walk);       // 뿌리 순서는 서버가 준 그대로
  skeleton.slice().sort(byName).forEach((n) => walk(n.id)); // 뿌리에서 닿지 않는 골격 덩어리
  rows.forEach((row, depth) => {
    row.forEach((id, i) => { pos[id] = { x: (i - (row.length - 1) / 2) * COL_GAP, y: -depth * ROW_GAP }; });
  });

  // ── 나머지 — 닻의 host 둘레 고리 ─────────────────────────────────────────
  // host가 먼저 자리를 갖도록 닻까지의 홉 수가 작은 것부터 놓는다.
  const rest = nodes.filter((n) => !isSk.has(n.id))
    .sort((a, b) => ((anchor[a.id]?.hops ?? 0) - (anchor[b.id]?.hops ?? 0)) || byName(a, b));
  const kids = new Map<string, GNode[]>();          // host → 그 둘레에 놓을 노드
  for (const n of rest) {
    const a = anchor[n.id];
    const host = a && byId.has(a.host) && a.host !== n.id ? a.host
      : a && byId.has(a.anchor) && a.anchor !== n.id ? a.anchor : null;
    if (host) (kids.get(host) || kids.set(host, []).get(host)!).push(n);
  }
  const placeAround = (hostId: string, guard: number) => {
    const list = kids.get(hostId);
    const c = pos[hostId];
    if (!list || !c || guard > 64) return;
    const r = RING_MIN + RING_PER * list.length;
    list.forEach((n, j) => {
      if (pos[n.id]) return;
      const ang = -Math.PI / 2 + (2 * Math.PI * j) / list.length;
      pos[n.id] = { x: c.x + r * Math.cos(ang), y: c.y + r * Math.sin(ang) };
      placeAround(n.id, guard + 1);                 // 그 위성 둘레의 위성
    });
  };
  Object.keys(pos).forEach((id) => placeAround(id, 0));
  // host가 자리를 못 얻은 노드(골격에 닿지 않는 덩어리)와 닻 정보가 없는 노드는 아래 띠에 줄 세운다.
  const loose = rest.filter((n) => !pos[n.id]);
  const ys = Object.values(pos).map((p) => p.y);
  const y0 = (ys.length ? Math.min(...ys) : 0) - ROW_GAP;
  const per = Math.max(8, Math.ceil(Math.sqrt(loose.length) * 2));
  loose.forEach((n, i) => {
    pos[n.id] = { x: ((i % per) - (per - 1) / 2) * COL_GAP, y: y0 - Math.floor(i / per) * ROW_GAP };
  });
  return pos;
}
