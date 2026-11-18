/* 그래프 그리기 — sigma 하나 · 리듀서 · 끌기 · 힘 배치 배선 (명세 §5.1~5.4 · §5.7).
 *
 * 세 자리로 갈라 둔다(시스템 뷰어 `render.js`의 원칙을 옮겼다):
 *   · `constructor`   — 그래프를 만든다(데이터가 올 때 한 번 · sigma도 한 번만)
 *   · `setVisible()`  — 보이는 노드가 바뀔 때 노드를 더하고 뺀다(sigma는 그대로 하나 · 명세 §5.1 「보이는 노드가 바뀔 때」)
 *   · `setView()`     — 리듀서만 다시 돈다(색 축 · 관계 토글 · 찾기 · 라벨 · 고른 점 — 좌표를 건드리지 않는다)
 * 그리는 그래프에는 보이는 노드만 넣는다 — 숨긴 노드는 리듀서도 배치도 돌지 않는다(명세 §5.7).
 * 찾기는 강조만 한다 — 다시 배치하지 않는다.
 */
import Graph from "graphology";
import Sigma from "sigma";
import { EdgeArrowProgram, NodeCircleProgram } from "sigma/rendering";
import type { NodeDisplayData, EdgeDisplayData } from "sigma/types";
import { EdgeCurvedArrowProgram } from "@sigma/edge-curve";
import { createNodeBorderProgram } from "@sigma/node-border";

import type { GEdge, GNode, Graph as GraphData, LayoutState } from "../types";
import { ForceLayout, FORCE_CFG, FORCE_ITER, FOLLOW_DEFAULT } from "./force";
import { seedPositions, type XY } from "./seed";
import {
  COLOR, FONT, type Axis, axisValue, colorOf, edgeShown, isSkeleton, labelScaleOf, shortName, sizeOf,
} from "./style";

/** 화면 쪽 선택 — 바뀌면 리듀서만 다시 돈다. */
export interface ViewState {
  axis: Axis;
  rels: Set<string>;
  search: string;
  fullLabels: boolean;
  selected: string | null;
}

/** 질의 겹쳐 보기 — 칠할 노드(종류)와 굵게 할 엣지(`src|rel|dst`). 응답의 trace에 적힌 것만 담는다(명세 §6.1). */
export type OverlayKind = "link" | "pick" | "reach";
export interface Overlay { nodes: Record<string, OverlayKind>; edges: Set<string> }
export const edgeKey = (src: string, rel: string, dst: string) => `${src}|${rel}|${dst}`;

/** 관계 이름은 확대했을 때만 — 카메라 비율이 이보다 작으면(DECISIONS P-07). */
const EDGE_LABEL_RATIO = 0.5;
const CROSS_CURVATURE = 0.3;
/** 새로 보이는 노드의 출발 고리 반경 — host와 이웃 사이 엣지 길이(중앙값)에 곱한다(DECISIONS P-41). */
const FRESH_RING = 0.5;

type NodeAttrs = { x: number; y: number; size: number; color: string; label: string; type: string;
                   node: GNode; labelScale: number; borderColor: string };
type EdgeAttrs = { size: number; color: string; type: string; label: string; curvature: number; edge: GEdge };

/** sigma 3.0.3의 마우스 아래 노드 찾기 듣개 — 공개 API에 끄는 설정이 없어 비공개 칸을 쓴다(명세 §5.7 · DECISIONS P-42).
 *  sigma 판을 바꾸면 이 칸 이름을 다시 확인한다(package.json에서 3.0.3 고정). */
type SigmaInternals = { activeListeners: { handleMove: (...a: unknown[]) => void } };

/** 찾기 술어 — 이름(부분 · 대소문자 무시) 또는 id(전체)다. 별칭 글자는 `/api/graph`에 없다(명세 §4). */
export function searchHit(n: GNode, q: string): boolean {
  if (!q) return false;
  return String(n.name).toLowerCase().includes(q) || String(n.id).toLowerCase() === q;
}

/** 라벨 그리기 — sigma 기본과 같고 글자 크기만 tier 계단을 따른다(시스템 `render.js`의 drawLabel). */
function drawLabel(ctx: CanvasRenderingContext2D, data: Partial<NodeDisplayData> & { labelScale?: number },
                   settings: { labelSize: number; labelWeight: string; labelFont: string }) {
  if (!data.label) return;
  const size = Math.round(settings.labelSize * (data.labelScale || 1));
  ctx.fillStyle = COLOR.fg;
  ctx.font = `${settings.labelWeight} ${size}px ${settings.labelFont}`;
  ctx.fillText(data.label, (data.x ?? 0) + (data.size ?? 0) + 3, (data.y ?? 0) + size / 3);
}

export class GraphView {
  readonly graph = new Graph<NodeAttrs, EdgeAttrs>({ multi: true, type: "directed", allowSelfLoops: true });
  readonly sigma: Sigma<NodeAttrs, EdgeAttrs>;
  readonly layout: ForceLayout;
  private view: ViewState;
  private seed: Record<string, XY> = {};
  private pinned = new Map<string, XY>();        // 사람이 놓은 점 — 그 세션 동안 그 자리
  private hover: string | null = null;
  private hoverNbrs = new Set<string>();
  // 누른 손짓 하나 — moved: 움직였다(끌기) · dragLayout: 이 손짓이 끌기 배치를 시작했다(놓을 때 식힌다)
  private press: { node: string; moved: boolean; dragLayout: boolean } | null = null;
  private dragging: string | null = null;
  private hitTestOff = false;                     // 끄는 동안 마우스 아래 노드 찾기를 뗐다(명세 §5.7)
  private follow = FOLLOW_DEFAULT;                // 「끌 때 따라오는 범위」의 k₀ — 다음 끌기부터
  private overlay: Overlay | null = null;         // 질의 겹쳐 보기 — 리듀서만 바꾼다
  private zoomedIn = false;
  private scaling: number;
  private readonly gravity: number;
  private readonly iterations: number;
  private readonly edgesOnce: GEdge[];            // 같은 id는 처음 것만(명세 §5.7)
  private readonly degree: Map<string, number>;
  private readonly maxDegree: number;
  // 프레임 합치기(명세 §5.7) — 받은 좌표는 두고, 다음 그리기 때 가장 최근 것 하나만 적용한다.
  private pendingFrame: { x: Float64Array; y: Float64Array; order: string[] } | null = null;
  private frameRaf = 0;

  constructor(container: HTMLElement, private data: GraphData, view: ViewState, visible: Set<string>,
              degree: Map<string, number>,
              private onSelect: (id: string | null) => void, onLayout: (s: LayoutState) => void,
              private onExpand: (id: string) => void) {
    this.view = view;
    const force = data.force || {};
    this.scaling = force.scaling ?? FORCE_CFG.scaling;
    this.gravity = force.gravity ?? FORCE_CFG.gravity;
    this.iterations = force.iterations ?? FORCE_ITER;
    this.degree = degree;
    this.maxDegree = Math.max(0, ...degree.values());
    const seen = new Set<string>();
    this.edgesOnce = data.edges.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));

    // ── 그래프 — 보이는 노드와 양 끝이 다 보이는 엣지(서버 순서 그대로 — 전체 배치 좌표가 바뀌지 않게) ──
    const nodes = data.nodes.filter((n) => visible.has(n.id));
    const edges = this.edgesAmong(visible);
    this.seed = seedPositions(nodes, edges, data.anchor, data.roots || []);
    for (const n of nodes) this.addNode(n, this.seed[n.id]);
    for (const e of edges) this.addEdge(e);

    // ── sigma — 한 번만 만든다 ───────────────────────────────────────────────
    const bordered = createNodeBorderProgram({
      borders: [
        { color: { attribute: "borderColor", defaultValue: COLOR.border }, size: { value: 0.18 } },
        { color: { attribute: "color" }, size: { fill: true } },
      ],
    });
    this.sigma = new Sigma<NodeAttrs, EdgeAttrs>(this.graph, container, {
      renderEdgeLabels: true,
      zIndex: true,
      labelFont: FONT, labelSize: 12, labelWeight: "normal", labelDensity: 0.6,
      labelColor: { color: COLOR.fg },
      edgeLabelFont: FONT, edgeLabelSize: 11, edgeLabelColor: { color: COLOR.dim },
      defaultDrawNodeLabel: drawLabel as never,
      nodeProgramClasses: { circle: NodeCircleProgram, bordered },
      edgeProgramClasses: { arrow: EdgeArrowProgram, curvedArrow: EdgeCurvedArrowProgram },
      nodeReducer: (id, a) => this.nodeReducer(id, a),
      edgeReducer: (id, a) => this.edgeReducer(id, a),
    });
    this.wire();

    // ── 힘 배치 — 워커가 이어서 옮긴다 ─────────────────────────────────────
    this.layout = new ForceLayout((x, y, order) => this.applyFrame(x, y, order), onLayout);
    this.layout.setGraph(nodes.map((n) => n.id), edges.map((e) => [e.src, e.dst]));
    this.relayout();
  }

  destroy(): void {
    this.layout.stop();
    cancelAnimationFrame(this.frameRaf);
    this.sigma.kill();
  }

  // ── 화면 쪽 선택 → 리듀서만 ──────────────────────────────────────────────
  setView(view: ViewState): void {
    this.view = view;
    this.sigma.refresh({ skipIndexation: true });
  }

  /** 질의 겹쳐 보기 — 색·굵기만(리듀서) · 배치를 다시 하지 않는다. null이면 지운다. */
  setOverlay(o: Overlay | null): void {
    this.overlay = o;
    this.sigma.refresh({ skipIndexation: true });
  }

  /** 그리는(숨김 제외) 노드·엣지 id — 리듀서와 같은 판정이다. */
  visible(): { nodes: string[]; edges: string[] } {
    const nodes = this.graph.nodes();
    const edges = this.graph.filterEdges((_k, a) => edgeShown(a.edge, this.view.rels));
    return { nodes, edges };
  }

  /** 보이는 노드가 바뀌었다(명세 §5.1 [P3] · §5.4) — 다시 배치하지 않는다.
   *  · 빠지는 노드는 빠지기만 한다(남은 노드는 그 자리).
   *  · 새 노드는 닻의 host(보이면) 둘레에서 출발 — host가 안 보이면 `origin`(펼친 노드) 둘레.
   *    이미 있던 노드는 제자리 용수철로 붙잡고 식힘만큼 돈다.
   *  · 새 노드가 이미 있던 노드보다 많으면 보이는 노드로 전체 배치. */
  setVisible(ids: Set<string>, origin: string | null): void {
    const removed = this.graph.filterNodes((id) => !ids.has(id));
    const fresh = this.data.nodes.filter((n) => ids.has(n.id) && !this.graph.hasNode(n.id));
    if (!removed.length && !fresh.length) return;

    const wasRunning = this.layout.state.running && this.layout.state.kind === "layout";
    this.layout.stop();                             // 워커의 점 순서가 바뀐다 — 앞 판의 프레임을 버린다
    this.pendingFrame = null;
    for (const id of removed) {
      this.graph.dropNode(id);
      this.pinned.delete(id);
      if (this.press?.node === id) { this.press = null; this.dragging = null; }
    }

    const nodes = this.data.nodes.filter((n) => ids.has(n.id));
    const edges = this.edgesAmong(ids);
    this.seed = seedPositions(nodes, edges, this.data.anchor, this.data.roots || []);   // 「다시 배치」의 시작 자리
    const kept = this.graph.order;

    if (fresh.length > kept) {
      // 새 노드가 더 많다 — 보이는 노드로 전체 배치(시작 자리부터)
      for (const n of fresh) this.addNode(n, this.seed[n.id]);
      for (const e of edges) this.addEdge(e);
      this.layout.setGraph(nodes.map((n) => n.id), edges.map((e) => [e.src, e.dst]));
      this.relayout();
      return;
    }

    if (fresh.length) {
      const ring = FRESH_RING * this.typicalEdgeLength();
      // host가 먼저 자리를 갖도록 닻까지의 홉 수가 작은 것부터 놓는다(시작 자리 seed.ts와 같은 순서 규칙).
      const order = fresh.slice().sort((a, b) =>
        ((this.data.anchor[a.id]?.hops ?? 0) - (this.data.anchor[b.id]?.hops ?? 0)) || a.id.localeCompare(b.id));
      const around = new Map<string, number>();     // 둘레 고리에서 몇 번째 자리
      for (const n of order) {
        const host = this.data.anchor[n.id]?.host;
        const c = host && host !== n.id && this.graph.hasNode(host) ? host
          : origin && this.graph.hasNode(origin) ? origin : null;
        let p: XY = this.seed[n.id];
        if (c) {
          const j = around.get(c) || 0;
          around.set(c, j + 1);
          const a = this.graph.getNodeAttributes(c);
          const ang = -Math.PI / 2 + j * 2.399963;    // 황금각 — 몇 개가 와도 겹치지 않게(결정적)
          const r = ring * (1 + 0.15 * Math.sqrt(j));
          p = { x: a.x + r * Math.cos(ang), y: a.y + r * Math.sin(ang) };
        }
        this.addNode(n, p);
      }
    }
    for (const e of edges) this.addEdge(e);
    this.layout.setGraph(nodes.map((n) => n.id), edges.map((e) => [e.src, e.dst]));

    if (fresh.length) {
      this.layout.startSettle(new Set(fresh.map((n) => n.id)), this.currentPositions(),
                              new Set(this.pinned.keys()), this.scaling, this.gravity);
    } else if (wasRunning) {
      // 빠지기만 했는데 전체 배치가 돌던 중이었다 — 남은 노드로 지금 자리에서 이어 돈다
      this.layout.start({ positions: this.currentPositions(), fixed: new Set(this.pinned.keys()),
                          scaling: this.scaling, gravity: this.gravity, iterations: this.iterations });
    }
  }

  // ── 배치 조절 ────────────────────────────────────────────────────────────
  /** 다시 배치 — 고정을 풀고 시작 자리부터 다시 돈다(보이는 노드만). */
  relayout(): void {
    this.pinned.clear();
    this.sigma.setCustomBBox(null);            // 화면 맞춤을 다시 켠다(끌 때 굳혔던 틀을 푼다)
    this.layout.start({ positions: this.seed, fixed: new Set(), scaling: this.scaling, gravity: this.gravity,
                        iterations: this.iterations });
  }

  /** 간격(퍼짐) — 반발 세기에 곱한다. 지금 자리에서 다시 돈다(DECISIONS P-06). */
  setSpacing(mult: number): void {
    const base = this.data.force?.scaling ?? FORCE_CFG.scaling;
    this.scaling = base * mult;
    this.sigma.setCustomBBox(null);
    this.layout.start({ positions: this.currentPositions(), fixed: new Set(this.pinned.keys()),
                        scaling: this.scaling, gravity: this.gravity, iterations: this.iterations });
  }

  pause(on: boolean): void {
    this.layout.pause(on);
  }

  /** 끌 때 따라오는 범위 — 용수철 k₀. 다음 끌기부터 쓴다. */
  setFollow(k0: number): void {
    this.follow = k0;
  }

  /** 그 노드로 — 카메라를 옮긴다(인접 엣지를 눌렀을 때). */
  focus(id: string): void {
    if (!this.graph.hasNode(id)) return;
    const d = this.sigma.getNodeDisplayData(id);
    if (d) this.sigma.getCamera().animate({ x: d.x, y: d.y }, { duration: 300 });
  }

  // ── 안쪽 ─────────────────────────────────────────────────────────────────
  private addNode(n: GNode, p: XY): void {
    this.graph.addNode(n.id, {
      x: p.x, y: p.y, size: sizeOf(this.degree.get(n.id) || 0, this.maxDegree), color: COLOR.dim,
      label: shortName(n.name), node: n, labelScale: labelScaleOf(n), borderColor: COLOR.border,
      type: isSkeleton(n) ? "bordered" : "circle",          // 골격 노드는 테두리로 가른다
    });
  }

  /** 엣지 하나 — 같은 id가 이미 있으면 그리지 않는다(처음 것만 · 그래프 전체가 깨지지 않게 · 명세 §5.7). */
  private addEdge(e: GEdge): void {
    if (this.graph.hasEdge(e.id) || !this.graph.hasNode(e.src) || !this.graph.hasNode(e.dst)) return;
    // 층을 건너는 엣지는 한눈에 다른 선 — 곡선 + 다른 색(명세 §5.2).
    this.graph.addDirectedEdgeWithKey(e.id, e.src, e.dst, {
      size: e.cross ? 1.6 : 1, color: e.cross ? COLOR.cross : COLOR.line,
      type: e.cross ? "curvedArrow" : "arrow", label: e.rel, curvature: e.cross ? CROSS_CURVATURE : 0, edge: e,
    });
  }

  private edgesAmong(ids: Set<string>): GEdge[] {
    return this.edgesOnce.filter((e) => ids.has(e.src) && ids.has(e.dst));
  }

  /** 지금 그래프의 엣지 길이 중앙값 — 새 노드의 출발 고리 크기에 쓴다. 엣지가 없으면 1. */
  private typicalEdgeLength(): number {
    const ls: number[] = [];
    this.graph.forEachEdge((_k, _a, s, t, sa, ta) => {
      if (s !== t) ls.push(Math.hypot(sa.x - ta.x, sa.y - ta.y));
    });
    if (!ls.length) return 1;
    ls.sort((a, b) => a - b);
    return ls[Math.floor(ls.length / 2)] || 1;
  }

  private currentPositions(): Record<string, XY> {
    const pos: Record<string, XY> = {};
    this.graph.forEachNode((id, a) => { pos[id] = { x: a.x, y: a.y }; });
    return pos;
  }

  /** 워커의 한 프레임 — 프레임 합치기(명세 §5.7): 받은 좌표는 두고 다음 그리기 때 가장 최근 것 하나만 적용한다.
   *  마지막 프레임(배치가 쉼)은 바로 적용한다 — 쉰 좌표가 그리기 한 번을 기다리지 않게. */
  private applyFrame(x: Float64Array, y: Float64Array, order: string[]): void {
    this.pendingFrame = { x, y, order };
    if (!this.layout?.state.running) {
      cancelAnimationFrame(this.frameRaf);
      this.frameRaf = 0;
      this.flushFrame();
      return;
    }
    if (!this.frameRaf) {
      this.frameRaf = requestAnimationFrame(() => { this.frameRaf = 0; this.flushFrame(); });
    }
  }

  private flushFrame(): void {
    const f = this.pendingFrame;
    this.pendingFrame = null;
    if (!f) return;
    const at = new Map(f.order.map((id, i) => [id, i]));
    this.graph.updateEachNodeAttributes((id, a) => {
      const i = at.get(id);
      if (i === undefined || id === this.dragging) return a;   // 끄는 중인 점은 손이 정한다
      a.x = f.x[i];
      a.y = f.y[i];
      return a;
    }, { attributes: ["x", "y"] });
  }

  private nodeReducer(id: string, a: NodeAttrs): Partial<NodeDisplayData> {
    const n = a.node, v = this.view;
    const res: Partial<NodeDisplayData> & { labelScale: number } = {
      ...a, color: colorOf(axisValue(n, v.axis)), label: v.fullLabels ? n.name : shortName(n.name), zIndex: 1,
    };
    const ov = this.overlay?.nodes[id];
    if (ov) Object.assign(res, { color: COLOR[ov], zIndex: 2 });   // 질의 겹쳐 보기 — 색만
    const q = v.search.trim().toLowerCase();
    if (q) {
      if (searchHit(n, q)) {
        Object.assign(res, { size: a.size + 4, zIndex: 3, highlighted: true, forceLabel: true, label: n.name });
      } else {
        Object.assign(res, { color: COLOR.faint, label: "" });
      }
    }
    if (this.hover) {
      if (id === this.hover) Object.assign(res, { zIndex: 4, label: n.name });      // 올린 점은 전체 이름
      else if (!this.hoverNbrs.has(id)) Object.assign(res, { color: COLOR.faint, label: "" });
    }
    if (id === v.selected) {
      Object.assign(res, { zIndex: 4, highlighted: true, forceLabel: true, label: n.name });
    }
    return res;
  }

  private edgeReducer(_key: string, a: EdgeAttrs): Partial<EdgeDisplayData> {
    const e = a.edge;
    const res: Partial<EdgeDisplayData> = { ...a, label: this.zoomedIn ? e.rel : "" };
    if (!edgeShown(e, this.view.rels)) return { ...res, hidden: true };
    if (this.hover && e.src !== this.hover && e.dst !== this.hover) res.color = COLOR.faint;
    if (this.overlay?.edges.has(edgeKey(e.src, e.rel, e.dst))) Object.assign(res, { color: COLOR.path, size: 3, zIndex: 2 });
    return res;
  }

  private wire(): void {
    const sg = this.sigma;
    sg.on("enterNode", ({ node }) => {
      this.hover = node;
      this.hoverNbrs = new Set([node, ...this.graph.neighbors(node)]);
      sg.refresh({ skipIndexation: true });
    });
    sg.on("leaveNode", () => {
      this.hover = null;
      this.hoverNbrs = new Set();
      sg.refresh({ skipIndexation: true });
    });
    sg.on("clickNode", ({ node }) => this.onSelect(node));
    sg.on("clickStage", () => this.onSelect(null));
    // 두 번 누르면 펼친다(명세 §5.4) — sigma 기본의 두 번 누름 확대는 막는다.
    sg.on("doubleClickNode", ({ node, preventSigmaDefault }) => {
      preventSigmaDefault();
      this.onExpand(node);
    });
    // 관계 이름은 확대했을 때 — 문턱을 넘나들 때만 리듀서를 다시 돈다.
    sg.getCamera().on("updated", (state) => {
      const zoomed = state.ratio < EDGE_LABEL_RATIO;
      if (zoomed !== this.zoomedIn) {
        this.zoomedIn = zoomed;
        sg.refresh({ skipIndexation: true });
      }
    });

    // 끌기 — 누른 채 움직이면 그 점이 손을 따라가고 연결된 노드가 따라온다. 놓으면 그 자리에 고정(명세 §5.1).
    //   · 전체 배치가 도는 중 → 그 점만 pin(배치는 이어진다) · 도중에 전체 배치가 끝나면 다음 움직임부터 끌기 배치
    //   · 사람이 「멈춤」을 눌렀다 → 그 점만 옮긴다(멈춤을 풀지 않는다)
    //   · 그 밖(쉼 · 끌기 배치 중 · 식히는 중 · 자리 잡는 중) → 끌기 배치를 새로 시작 — 그 순간이 평형이 되도록 제자리를 잡는다
    // 누른 채 움직이지 않고 떼면 누르기다(상세) — 배치는 건드리지 않는다(DECISIONS P-15).
    sg.on("downNode", ({ node }) => { this.press = { node, moved: false, dragLayout: false }; });
    const mouse = sg.getMouseCaptor();
    const hitTest = (sg as unknown as SigmaInternals).activeListeners.handleMove;
    mouse.on("mousemovebody", (e) => {
      if (!this.press) return;
      const node = this.press.node;
      if (!this.press.moved) {
        this.press.moved = true;
        this.dragging = node;
        // 끄는 동안 좌표 틀을 굳힌다 — 안 굳히면 점이 움직일 때마다 화면 맞춤이 다시 돌아 손과 어긋난다.
        if (!sg.getCustomBBox()) sg.setCustomBBox(sg.getBBox());
        // 끄는 동안 마우스 아래 노드 찾기를 끈다(명세 §5.7) — 움직일 때마다 그래픽 메모리에서 한 점을 읽는데,
        // 소프트웨어 그리기에서 그 한 번이 수백 ms다. sigma 3.0.3에 끄는 설정이 없어 듣개를 떼고, 놓을 때 다시 붙인다.
        if (!this.hitTestOff) { mouse.off("mousemove", hitTest); this.hitTestOff = true; }
      }
      const s = this.layout.state;
      const layoutRunning = s.kind === "layout" && s.running;
      if (!this.press.dragLayout && !s.paused && !layoutRunning) {
        // 출발 좌표는 이 움직임을 반영하기 전 좌표다(워커가 여기서 알짜 힘을 재 제자리를 잡는다). 놓아 둔 점과 끄는 점은 고정.
        this.layout.startDrag(node, this.currentPositions(), new Set(this.pinned.keys()), this.follow,
                              this.scaling, this.gravity);
        this.press.dragLayout = true;
      }
      const p = sg.viewportToGraph(e);
      this.graph.mergeNodeAttributes(node, { x: p.x, y: p.y });
      this.pinned.set(node, p);
      this.layout.pin(node, p.x, p.y);
      e.preventSigmaDefault();
      e.original.preventDefault();
      e.original.stopPropagation();
    });
    const drop = () => {
      if (this.press?.dragLayout) this.layout.release();   // 이 손짓이 시작한 끌기 배치만 식힌다
      if (this.hitTestOff) { mouse.on("mousemove", hitTest); this.hitTestOff = false; }
      this.press = null;
      this.dragging = null;
    };
    mouse.on("mouseup", drop);
    mouse.on("mouseleave", drop);
  }
}
