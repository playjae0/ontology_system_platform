/* 힘 배치 워커 다루기 — 전체 배치 · 끌기 배치 · 자리 잡기 · 멈춤/이어서 · 고정(pin) · 식힘 (명세 §5.1).
 *
 * 계산은 d3-force(`force_worker.js` · 명세 §5.1 [P5]) — Neo4j식 배치: 쉬는 길이 용수철(forceLink) · 밀어냄(forceManyBody) ·
 * 원 겹침 막기(forceCollide) · 약한 당김(forceX/forceY). 라이브러리 타이머는 쓰지 않고 워커가 `tick()`을 직접 돈다 — 반복 수로 센다.
 * **결정적이다**: d3-force 3의 고정 시드 난수 · 같은 시작 자리 · 같은 반복 수면 같은 좌표.
 *
 * 배치는 세 가지다(명세 §5.1):
 *   · 전체 배치 `layout` — 처음 열 때 · 다시 배치 · 간격. alpha 1에서 `LAYOUT_TICKS`만큼 돌고 쉰다.
 *   · 끌기 배치 `drag`   — 끄는 노드는 손에 고정 · alpha를 `DRAG_ALPHA`로 데운 채 누르는 동안 돈다. 끄는 노드에서 멀수록 센
 *                         붙잡기 힘이 다른 노드를 제자리로 당긴다(제자리는 시작 순간이 평형인 자리 — B-01과 같은 원리 · 워커가 잰다).
 *                         놓으면 `COOL_ITER`만큼 식히고 쉰다.
 *   · 자리 잡기 `settle` — 보이는 노드가 늘 때. 새 노드는 자유롭게, 이미 있던 노드는 `SETTLE_SPRING`으로 붙잡고 `COOL_ITER`만큼.
 * 바깥 함수(start · startDrag · startSettle · release · pause · pin)와 `LayoutState`는 P4까지와 같다 — 확인 스크립트가 이 손잡이로 잰다.
 */
import type { LayoutState } from "../types";
import type { XY } from "./seed";
import { R_MIN } from "./style";

/* ── 배치 상수 — 이 자리 하나 (요청문 P5 §2-① 처음 값 · 가결정 DECISIONS P-54) ───────────────────
 * mock · 합성 표본의 모양에 맞춰 고르지 않는다 — 사내 결과로 맞춘다(명세 §2-5 · §7.1). 원 반지름은 `style.ts` R_MIN · R_MAX. */
/** 엣지 쉬는 길이 = rₛ + rₜ + GAP (배치 단위). */
export const GAP = 60;
/** 겹침 막기 반지름 = r + PAD. */
export const PAD = 4;
/** 밀어냄 세기(음수 = 밀어냄)와 닿는 거리. */
export const CHARGE = -300;
export const DISTANCE_MAX = 800;
/** 원점을 향한 약한 당김(forceX · forceY 세기) — 떨어진 덩어리가 멀리 가지 않게. */
export const CENTER = 0.02;
/** 전체 배치의 반복 수 — 이 반복에서 alpha가 ALPHA_MIN에 닿도록 alphaDecay를 정한다. */
export const LAYOUT_TICKS = 400;
export const ALPHA_MIN = 0.001;
export const ALPHA_DECAY = 1 - Math.pow(ALPHA_MIN, 1 / LAYOUT_TICKS);
/** 속도 감쇠(d3 기본). */
export const VELOCITY_DECAY = 0.4;
/** 끌기 · 자리 잡기에서 데우는 alpha(d3 끌기의 관례값). */
export const DRAG_ALPHA = 0.3;
/** 시작 자리(`seed.ts`) 좌표에 곱하는 배율 — 골격 줄 사이가 원 둘과 엣지 하나 길이가 되게. */
export const SEED_SCALE = 2 * R_MIN + GAP;
/** 프레임 — 몇 반복마다 좌표 하나를 보낸다. */
export const FRAME_EVERY = 10;

/* ── 끌기 배치의 붙잡기 세기 — P1.5 그대로 (요청문 P1.5 §2-① · P5 §2-②) ─────────────────────────
 * k(h) = k₀ (h ≤ 2) · min(k₀ × 3^(h − 2), 1) (h ≥ 3). h = 끄는 노드에서 방향과 무관하게 센 홉 수.
 * d3 방식으로는 `vᵢ += α · kᵢ · (제자리ᵢ − xᵢ)`(질량 없음). */
/** 「끌 때 따라오는 범위」 밀대 다섯 단의 k₀ — 좁게(붙잡기 셈) → 넓게(약함). */
export const FOLLOW_STEPS = [0.04, 0.03, 0.02, 0.015, 0.01];
export const FOLLOW_DEFAULT = 0.02;
/** k₀ 그대로 두는 홉 수 — 이보다 멀면 홉마다 세진다. */
export const SPRING_FLAT_HOPS = 2;
/** 홉마다 곱하는 배수. */
export const SPRING_GROWTH = 3;
/** 상한. */
export const SPRING_MAX = 1;
/** 보이는 노드가 늘 때 이미 있던 노드를 붙잡는 세기 — 끌기 배치의 상한과 같은 값(DECISIONS P-41). */
export const SETTLE_SPRING = SPRING_MAX;
/** 놓은 뒤 · 자리 잡기에서 식히는 반복 수. */
export const COOL_ITER = 300;

/** 홉 수 → 붙잡기 세기. */
export function springOf(hops: number, k0: number): number {
  if (hops <= SPRING_FLAT_HOPS) return k0;
  return Math.min(k0 * SPRING_GROWTH ** (hops - SPRING_FLAT_HOPS), SPRING_MAX);
}

export interface ForceRun {
  positions: Record<string, XY>;   // 시작 자리
  fixed: Set<string>;              // 그 자리에 고정할 점
  spacing: number;                 // 「간격」 배수 s — 쉬는 길이 × s · 밀어냄 × s²
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
  private radius: number[] = [];

  constructor(private onFrame: FrameFn, private onState: (s: LayoutState) => void) {}

  /** 배치할 점 · 엣지 · 원 반지름(배치 단위 — 겹침 막기와 쉬는 길이에 쓴다)을 정한다. */
  setGraph(ids: string[], edges: [string, string][], radius: (id: string) => number): void {
    this.ids = ids.slice();
    this.at = new Map(this.ids.map((id, i) => [id, i]));
    this.radius = this.ids.map((id) => radius(id));
    this.adj = this.ids.map(() => []);
    this.edges = [];
    for (const [s, d] of edges) {
      const a = this.at.get(s), b = this.at.get(d);
      if (a === undefined || b === undefined || a === b) continue;
      this.edges.push([a, b]);
      this.adj[a].push(b);
      this.adj[b].push(a);
    }
  }

  /** 전체 배치 — 워커를 새로 띄워 alpha 1에서 `run.iterations`만큼 돈다(시작 · 다시 배치 · 간격). */
  start(run: ForceRun): void {
    this.launch(run, "layout", null, 1, 0);
  }

  /** 끌기 배치 — 지금 좌표에서 출발 · 끄는 노드에서 멀수록 센 붙잡기(제자리는 워커가 평형으로 잡는다).
   *  반복 상한 없이 데운 채 돈다(놓을 때 `release`). 끄는 노드에서 닿지 않는 노드는 이 끌기 동안 고정한다. */
  startDrag(node: string, positions: Record<string, XY>, pinned: Set<string>, k0: number, spacing: number): void {
    const hops = this.hopsFrom(node);
    const fixed = new Set(pinned);
    fixed.add(node);
    this.ids.forEach((id, i) => { if (hops[i] < 0) fixed.add(id); });
    const k = hops.map((h) => (h < 0 ? 0 : springOf(h, k0)));
    this.launch({ positions, fixed, spacing, iterations: Infinity }, "drag", k, DRAG_ALPHA, DRAG_ALPHA);
  }

  /** 보이는 노드가 늘었다(명세 §5.1 [P3]) — 새 노드는 자유롭게(k 0), 이미 있던 노드는 `SETTLE_SPRING`으로 붙잡고
   *  `DRAG_ALPHA`에서 `COOL_ITER`만큼 식는다(DECISIONS P-41). */
  startSettle(fresh: Set<string>, positions: Record<string, XY>, pinned: Set<string>, spacing: number): void {
    const k = this.ids.map((id) => (fresh.has(id) ? 0 : SETTLE_SPRING));
    this.launch({ positions, fixed: new Set(pinned), spacing, iterations: COOL_ITER }, "settle", k, DRAG_ALPHA, 0);
  }

  /** 놓았다 — 끌기 배치를 식힌다(alphaTarget 0 · `COOL_ITER`만큼 더 돌고 쉰다). */
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
  /** 워커를 새로 띄워 처음부터 돈다 — 세 배치가 모두 이 길. `springs`가 있으면 붙잡기 힘을 더한다. */
  private launch(run: ForceRun, kind: LayoutState["kind"], springs: number[] | null, alpha: number, alphaTarget: number): void {
    this.stop();
    const w = new Worker(new URL("./force_worker.js", import.meta.url), { type: "module" });
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
      x: this.ids.map((id) => at(id).x), y: this.ids.map((id) => at(id).y), r: this.radius,
      edges: this.edges, fixed: this.ids.map((id) => (run.fixed.has(id) ? 1 : 0)),
      cfg: { gap: GAP, pad: PAD, charge: CHARGE, distanceMax: DISTANCE_MAX, center: CENTER, spacing: run.spacing,
             alpha, alphaTarget, alphaDecay: ALPHA_DECAY, velocityDecay: VELOCITY_DECAY,
             maxIter: run.iterations, frameEvery: FRAME_EVERY },
      ...(springs ? { anchor: { k: springs } } : {}),
    });
  }

  /** 끄는 노드에서 넓이 우선으로 센 홉 수 — 엣지 방향은 보지 않는다. 닿지 않으면 −1. */
  private hopsFrom(node: string): number[] {
    const hops = this.ids.map(() => -1);
    const s = this.at.get(node);
    if (s === undefined) return hops;
    hops[s] = 0;
    const queue = [s];
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
