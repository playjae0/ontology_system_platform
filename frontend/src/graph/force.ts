/* 힘 배치 워커 다루기 — 시작 · 멈춤/이어서 · 고정(pin) · 다시 데우기 (명세 §5.1).
 *
 * 시스템 뷰어 `cli/viewer/static/layout.js`(4af5505)의 `forceStart` · `forcePause` · `forcePin`을 옮겨 왔다(명세 §2-2).
 * 워커(`force_worker.js`)는 시스템 것 그대로다 — ForceAtlas2 계열 · Barnes–Hut · 결정적(난수 0 · 반복 수로 센다).
 *
 * 더한 것 하나 — **다시 데우기**: 워커는 반복을 다 돌면 쉬고, `resume`은 반복이 남았을 때만 돈다. 그래서 쉰 뒤에 끌면
 * 지금 좌표를 시작 자리로, 고정한 점들을 `fixed`로 `start`를 다시 보낸다(반복 `REWARM_ITER` — DECISIONS P-05).
 */
import type { LayoutState } from "../types";
import type { XY } from "./seed";

/** 워커 설정 — 시스템 `FORCE_CFG` 그대로. scaling·gravity·반복 수는 `/api/graph`의 `force`가 덮는다. */
export const FORCE_CFG = { scaling: 2, gravity: 1, theta: 1.2, jitter: 1, frameEvery: 10 };
export const FORCE_ITER = 1500;
export const REWARM_ITER = 300;

export interface ForceRun {
  positions: Record<string, XY>;   // 시작 자리
  fixed: Set<string>;              // 그 자리에 고정할 점
  scaling: number;
  gravity: number;
  iterations: number;
}

type FrameFn = (x: Float64Array, y: Float64Array, ids: string[]) => void;

export class ForceLayout {
  readonly state: LayoutState = { running: false, paused: false, iterations: 0, max: 0 };
  private worker: Worker | null = null;
  private ids: string[] = [];
  private at = new Map<string, number>();
  private edges: [number, number][] = [];
  private mass: number[] = [];

  constructor(private onFrame: FrameFn, private onState: (s: LayoutState) => void) {}

  /** 배치할 점과 엣지를 정한다 — 질량 = 연결 수 + 1 (ForceAtlas2). */
  setGraph(ids: string[], edges: [string, string][]): void {
    this.ids = ids.slice();
    this.at = new Map(this.ids.map((id, i) => [id, i]));
    this.mass = this.ids.map(() => 1);
    this.edges = [];
    for (const [s, d] of edges) {
      const a = this.at.get(s), b = this.at.get(d);
      if (a === undefined || b === undefined || a === b) continue;
      this.edges.push([a, b]);
      this.mass[a] += 1;
      this.mass[b] += 1;
    }
  }

  /** 워커를 새로 띄워 처음부터 돈다(시작 · 다시 배치 · 다시 데우기가 모두 이 길). */
  start(run: ForceRun): void {
    this.stop();
    const w = new Worker(new URL("./force_worker.js", import.meta.url));
    this.worker = w;
    Object.assign(this.state, { running: true, paused: false, iterations: 0, max: run.iterations });
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
    });
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
}
