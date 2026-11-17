/* 그래프 그리기 — sigma 하나 · 리듀서 · 끌기 · 힘 배치 배선 (명세 §5.1~5.3).
 *
 * 두 자리로 갈라 둔다(시스템 뷰어 `render.js`의 원칙을 옮겼다):
 *   · `constructor` — 그래프를 만든다(데이터가 올 때 한 번 · sigma도 한 번만)
 *   · `setView()`   — 리듀서만 다시 돈다(색 축 · 관계 토글 · 찾기 · 라벨 · 고른 점 — 좌표를 건드리지 않는다)
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
  COLOR, FONT, type Axis, axisValue, colorOf, edgeShown, isSkeleton, labelScaleOf, nodeShown, shortName, sizeOf,
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

type NodeAttrs = { x: number; y: number; size: number; color: string; label: string; type: string;
                   node: GNode; labelScale: number; borderColor: string };
type EdgeAttrs = { size: number; color: string; type: string; label: string; curvature: number; edge: GEdge };

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
  private follow = FOLLOW_DEFAULT;                // 「끌 때 따라오는 범위」의 k₀ — 다음 끌기부터
  private overlay: Overlay | null = null;         // 질의 겹쳐 보기 — 리듀서만 바꾼다
  private zoomedIn = false;
  private scaling: number;
  private readonly gravity: number;
  private readonly iterations: number;

  constructor(container: HTMLElement, private data: GraphData, view: ViewState,
              private onSelect: (id: string | null) => void, onLayout: (s: LayoutState) => void) {
    this.view = view;
    const force = data.force || {};
    this.scaling = force.scaling ?? FORCE_CFG.scaling;
    this.gravity = force.gravity ?? FORCE_CFG.gravity;
    this.iterations = force.iterations ?? FORCE_ITER;

    // ── 그래프 — 보이는 노드(닻에 있는 것)와 양 끝이 다 보이는 엣지 ─────────
    const nodes = data.nodes.filter((n) => nodeShown(n, data.anchor));
    const ids = new Set(nodes.map((n) => n.id));
    const edges = data.edges.filter((e) => ids.has(e.src) && ids.has(e.dst));
    this.seed = seedPositions(nodes, edges, data.anchor, data.roots || []);
    for (const n of nodes) {
      const p = this.seed[n.id];
      this.graph.addNode(n.id, {
        x: p.x, y: p.y, size: sizeOf(n), color: COLOR.dim, label: shortName(n.name), node: n,
        labelScale: labelScaleOf(n), borderColor: COLOR.border,
        type: isSkeleton(n) ? "bordered" : "circle",          // 골격 노드는 테두리로 가른다
      });
    }
    for (const e of edges) {
      // 층을 건너는 엣지는 한눈에 다른 선 — 곡선 + 다른 색(명세 §5.2).
      this.graph.addDirectedEdgeWithKey(e.id, e.src, e.dst, {
        size: e.cross ? 1.6 : 1, color: e.cross ? COLOR.cross : COLOR.line,
        type: e.cross ? "curvedArrow" : "arrow", label: e.rel, curvature: e.cross ? CROSS_CURVATURE : 0, edge: e,
      });
    }

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

  /** 보이는(숨김 제외) 노드·엣지 id — 리듀서와 같은 판정이다. */
  visible(): { nodes: string[]; edges: string[] } {
    const nodes = this.graph.nodes();
    const edges = this.graph.filterEdges((_k, a) => edgeShown(a.edge, this.view.rels));
    return { nodes, edges };
  }

  // ── 배치 조절 ────────────────────────────────────────────────────────────
  /** 다시 배치 — 고정을 풀고 시작 자리부터 다시 돈다. */
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
  private currentPositions(): Record<string, XY> {
    const pos: Record<string, XY> = {};
    this.graph.forEachNode((id, a) => { pos[id] = { x: a.x, y: a.y }; });
    return pos;
  }

  /** 워커의 한 프레임 — 그 자리로 옮긴다(끄는 중인 점은 손이 정한다). */
  private applyFrame(x: Float64Array, y: Float64Array, order: string[]): void {
    const at = new Map(order.map((id, i) => [id, i]));
    this.graph.updateEachNodeAttributes((id, a) => {
      const i = at.get(id);
      if (i === undefined || id === this.dragging) return a;
      a.x = x[i];
      a.y = y[i];
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
    //   · 그 밖(쉼 · 끌기 배치 중 · 식히는 중) → 끌기 배치를 새로 시작 — 그 순간이 평형이 되도록 제자리를 잡는다
    // 누른 채 움직이지 않고 떼면 누르기다(상세) — 배치는 건드리지 않는다(DECISIONS P-15).
    sg.on("downNode", ({ node }) => { this.press = { node, moved: false, dragLayout: false }; });
    const mouse = sg.getMouseCaptor();
    mouse.on("mousemovebody", (e) => {
      if (!this.press) return;
      const node = this.press.node;
      if (!this.press.moved) {
        this.press.moved = true;
        this.dragging = node;
        // 끄는 동안 좌표 틀을 굳힌다 — 안 굳히면 점이 움직일 때마다 화면 맞춤이 다시 돌아 손과 어긋난다.
        if (!sg.getCustomBBox()) sg.setCustomBBox(sg.getBBox());
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
      this.press = null;
      this.dragging = null;
    };
    mouse.on("mouseup", drop);
    mouse.on("mouseleave", drop);
  }
}
