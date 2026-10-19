/* 힘 배치 워커 다루기 — 전체 배치 · 끌기 배치 · 멈춤/이어서 · 고정(pin) · 식힘 (명세 §5.1).
 *
 * 시스템 뷰어 `cli/viewer/static/layout.js`(4af5505)의 `forceStart` · `forcePause` · `forcePin`을 옮겨 왔다(명세 §2-2).
 * 워커(`force_worker.js`)는 시스템 것을 옮겨 두 가지(제자리 용수철 `anchor` · 식힘 `cool`)만 더한 플랫폼 사본이다 —
 * ForceAtlas2 계열 · Barnes–Hut · 결정적(난수 0 · 반복 수로 센다).
 *
 * 배치는 두 가지다(명세 §5.1):
 *   · 전체 배치 `layout` — 처음 열 때 · 다시 배치 · 간격. `force.iterations`만큼 돌고 쉰다.
 *   · 끌기 배치 `drag`   — 끌기를 시작한 순간의 좌표를 제자리로 잡고, 끄는 노드에서 멀수록 센 용수철로 붙잡는다.
 *                         누르는 동안 반복 상한 없이 돌고, 놓으면 `COOL_ITER`만큼 식히고 쉰다.
 */
import type { LayoutState } from "../types";
import type { XY } from "./seed";

/** 워커 설정 — 시스템 `FORCE_CFG` 그대로. scaling·gravity·반복 수는 `/api/graph`의 `force`가 덮는다. */
export const FORCE_CFG = { scaling: 2, gravity: 1, theta: 1.2, jitter: 1, frameEvery: 10 };
export const FORCE_ITER = 1500;

/* ── 끌기 배치의 상수 — 이 자리 하나 (요청문 P1.5 §2-①) ────────────────────────────────────────────
 * k(h) = k₀ (h ≤ 2) · min(k₀ × 3^(h − 2), 1) (h ≥ 3). h = 끄는 노드에서 방향과 무관하게 센 홉 수.
 * 기본값을 mock 표본에 맞춰 고르지 않는다 — 보기 편한 단은 사용자가 사내 그래프에서 밀대로 고른다(명세 §2-5). */
/** 「끌 때 따라오는 범위」 밀대 다섯 단의 k₀ — 좁게(용수철 셈) → 넓게(약함). */
export const FOLLOW_STEPS = [0.04, 0.03, 0.02, 0.015, 0.01];
export const FOLLOW_DEFAULT = 0.02;
/** k₀ 그대로 두는 홉 수 — 이보다 멀면 홉마다 세진다. */
export const SPRING_FLAT_HOPS = 2;
/** 홉마다 곱하는 배수. */
export const SPRING_GROWTH = 3;
/** 상한 — 엣지 하나의 끌림과 같은 크기. **빼지 않는다**: 없으면 긴 사슬에서 계산이 튄다(명세 §5.1 실측). */
export const SPRING_MAX = 1;
/** 놓은 뒤 식히는 반복 수. */
export const COOL_ITER = 300;

/** 홉 수 → 용수철 세기. */
export function springOf(hops: number, k0: number): number {
  if (hops <= SPRING_FLAT_HOPS) return k0;
  return Math.min(k0 * SPRING_GROWTH ** (hops - SPRING_FLAT_HOPS), SPRING_MAX);
}

export interface ForceRun {
  positions: Record<string, XY>;   // 시작 자리
  fixed: Set<string>;              // 그 자리에 고정할 점
  scaling: number;
  gravity: number;
  iterations: number;
}

type FrameFn = (x: Float64Array, y: Float64Array, ids: string[]) => void;

export class ForceLayout {
  readonly state: LayoutState = { running: false, paused: false, iterations: 0, max: 0, kind: "layout" };
  private worker: Worker | null = null;
  private ids: string[] = [];
  private at = new Map<string, number>();
  private edges: [number, number][] = [];
  private adj: number[][] = [];                  // 방향 없는 이웃 — 끌기 배치의 홉 수를 센다
  private mass: number[] = [];

  constructor(private onFrame: FrameFn, private onState: (s: LayoutState) => void) {}

  /** 배치할 점과 엣지를 정한다 — 질량 = 연결 수 + 1 (ForceAtlas2). */
  setGraph(ids: string[], edges: [string, string][]): void {
    this.ids = ids.slice();
    this.at = new Map(this.ids.map((id, i) => [id, i]));
    this.mass = this.ids.map(() => 1);
    this.adj = this.ids.map(() => []);
    this.edges = [];
    for (const [s, d] of edges) {
      const a = this.at.get(s), b = this.at.get(d);
      if (a === undefined || b === undefined || a === b) continue;
      this.edges.push([a, b]);
      this.adj[a].push(b);
      this.adj[b].push(a);
      this.mass[a] += 1;
      this.mass[b] += 1;
    }
  }

  /** 전체 배치 — 워커를 새로 띄워 `run.iterations`만큼 돈다(시작 · 다시 배치 · 간격). */
  start(run: ForceRun): void {
    this.launch(run, "layout", null);
  }

  /** 끌기 배치 — 지금 좌표를 제자리로, 끄는 노드에서 멀수록 센 용수철. 반복 상한 없이 돈다(놓을 때 `release`).
   *  끄는 노드에서 닿지 않는 노드는 이 끌기 동안 고정한다. */
  startDrag(node: string, positions: Record<string, XY>, pinned: Set<string>, k0: number,
            scaling: number, gravity: number): void {
    const hops = this.hopsFrom(node);
    const fixed = new Set(pinned);
    fixed.add(node);
    this.ids.forEach((id, i) => { if (hops[i] < 0) fixed.add(id); });
    const k = hops.map((h) => (h < 0 ? 0 : springOf(h, k0)));
    this.launch({ positions, fixed, scaling, gravity, iterations: Infinity }, "drag", k);
  }

  /** 놓았다 — 끌기 배치를 `COOL_ITER`만큼 식히고 쉬게 한다. */
  release(): void {
    if (!this.worker || this.state.kind !== "drag") return;
    this.worker.postMessage({ type: "cool", iters: COOL_ITER });
    this.state.max = this.state.iterations + COOL_ITER;   // 다음 프레임이 정확한 값으로 고친다
    this.state.running = true;
    this.onState(this.state);
  }

  stop(): void {
    if (this.worker) this.worker.terminate();
    this.worker = null;
    this.state.running = false;
  }

  /** 멈춤 ↔ 이어서 — 워커는 그 자리에서 선다. 이어서는 반복이 남았을 때만 돈다(워커 규칙). */
  pause(on: boolean): void {
    if (!this.worker) return;
    this.state.paused = on;
    if (on) this.state.running = false;
    else if (this.state.iterations < this.state.max) this.state.running = true;
    this.worker.postMessage({ type: on ? "stop" : "resume" });
    this.onState(this.state);
  }

  /** 사람이 끈 점 — 워커가 그 자리에 고정한다(돌고 있으면 이웃이 힘으로 따라온다). */
  pin(id: string, x: number, y: number): void {
    const i = this.at.get(id);
    if (this.worker && i !== undefined) this.worker.postMessage({ type: "pin", i, x, y });
  }

  // ── 안쪽 ─────────────────────────────────────────────────────────────────
  /** 워커를 새로 띄워 처음부터 돈다 — 전체 배치와 끌기 배치가 모두 이 길. `springs`가 있으면 끌기 배치. */
  private launch(run: ForceRun, kind: LayoutState["kind"], springs: number[] | null): void {
    this.stop();
    const w = new Worker(new URL("./force_worker.js", import.meta.url));
    this.worker = w;
    Object.assign(this.state, { running: true, paused: false, iterations: 0, max: run.iterations, kind });
    this.onState(this.state);
    w.onmessage = (ev: MessageEvent) => {
      const m = ev.data || {};
      if (m.type !== "frame" || this.worker !== w) return;
      this.state.iterations = m.iter;
      this.state.max = m.max;
      if (m.done) this.state.running = false;
      this.onFrame(m.x, m.y, this.ids);
      this.onState(this.state);
    };
    const at = (id: string) => run.positions[id] || { x: 0, y: 0 };
    w.postMessage({
      type: "start",
      x: this.ids.map((id) => at(id).x), y: this.ids.map((id) => at(id).y),
      m: this.mass, edges: this.edges, fixed: this.ids.map((id) => (run.fixed.has(id) ? 1 : 0)),
      cfg: { ...FORCE_CFG, scaling: run.scaling, gravity: run.gravity, maxIter: run.iterations },
      ...(springs ? { anchor: { k: springs } } : {}),
    });
  }

  /** 끄는 노드에서 넓이 우선으로 센 홉 수 — 엣지 방향은 보지 않는다. 닿지 않으면 −1. */
  private hopsFrom(node: string): number[] {
    const hops = this.ids.map(() => -1);
    const start = this.at.get(node);
    if (start === undefined) return hops;
    hops[start] = 0;
    const queue = [start];
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q];
      for (const j of this.adj[i]) {
        if (hops[j] >= 0) continue;
        hops[j] = hops[i] + 1;
        queue.push(j);
      }
    }
    return hops;
  }
}
