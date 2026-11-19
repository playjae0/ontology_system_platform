/* 힘 배치 워커 — d3-force(Neo4j식 배치 · 명세 §5.1 [P5]). 플랫폼 코드다.
 *
 * P4까지는 시스템 뷰어의 ForceAtlas2 워커를 옮겨 썼다. ForceAtlas2는 비슷한 것끼리 뭉치게 하는 계산이라(허브가 잎을 끌어당기고
 * 전체를 가운데로 당긴다) 간격을 키워도 뭉침이 남았다 — P5에서 d3-force(`d3-force@3.0.0` · ISC · 빌드에 묶여 들어간다)로 바꿨다.
 *
 * 힘 넷(+ 끌기 · 자리 잡기의 붙잡기 하나):
 *   · forceLink     — 엣지마다 쉬는 길이 (rₛ + rₜ + GAP) × s 의 용수철(세기는 d3 기본 1/min(양 끝 연결 수))
 *   · forceManyBody — 밀어냄 CHARGE × s² · `distanceMax`까지
 *   · forceCollide  — 원 겹침 막기(반지름 r + PAD)
 *   · forceX/Y      — 원점을 향한 약한 당김(CENTER)
 *   · anchor        — `vᵢ += α · kᵢ · (제자리ᵢ − xᵢ)` — 끌기 배치 · 자리 잡기에서만. **제자리는 시작 순간이 평형인 자리다**(B-01과 같은 원리):
 *                     속도 0에서 다른 힘을 α = 1로 한 번 돌린 속도 변화를 Fᵢ라 하면 제자리ᵢ = xᵢ − Fᵢ / kᵢ(고정점 · k 0은 지금 자리).
 *
 * 라이브러리 타이머는 쓰지 않는다 — `simulation.stop()` 뒤 `tick()`을 직접 돌고 반복 수로 센다. **결정적이다**:
 * d3-force 3의 난수는 시뮬레이션마다 고정 시드 · 같은 시작 자리 · 같은 반복 수면 같은 좌표.
 *
 * 메시지: start {x, y, r, edges, fixed, cfg, anchor?} · stop · resume · pin {i, x, y} · cool {iters}
 *         → frame {x, y, iter, max, done, ms}
 */
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from "d3-force";

let sim = null, nodes = [], N = 0, iter = 0, maxIter = 0, running = false, runMs = 0, cfg = {};
let AK = null, AX = null, AY = null;                // 붙잡기 — 없으면 null

/** 붙잡기 힘 — d3 사용자 힘(alpha를 받는다). 고정된 점은 건드리지 않는다. */
function anchorForce(alpha) {
  for (let i = 0; i < N; i++) {
    const k = AK[i], n = nodes[i];
    if (!(k > 0) || n.fx != null) continue;
    n.vx += alpha * k * (AX[i] - n.x);
    n.vy += alpha * k * (AY[i] - n.y);
  }
}

/** 제자리 — 시작 자리에서 다른 힘을 α = 1로 한 번 돌려 얻은 속도 변화를 붙잡기가 정확히 상쇄하는 자리. 좌표는 움직이지 않는다. */
function anchorAtBalance() {
  AX = Float64Array.from(nodes, (n) => n.x);
  AY = Float64Array.from(nodes, (n) => n.y);
  for (const n of nodes) { n.vx = 0; n.vy = 0; }
  for (const name of ["link", "charge", "collide", "x", "y"]) sim.force(name)(1);
  for (let i = 0; i < N; i++) {
    const n = nodes[i];
    if (n.fx == null && AK[i] > 0) { AX[i] = n.x - n.vx / AK[i]; AY[i] = n.y - n.vy / AK[i]; }
  }
  for (const n of nodes) { n.vx = 0; n.vy = 0; }
}

function init(m) {
  cfg = m.cfg;
  const s = cfg.spacing || 1;
  N = m.x.length;
  nodes = m.x.map((x, i) => ({ index: i, x, y: m.y[i], vx: 0, vy: 0, r: m.r[i] }));
  (m.fixed || []).forEach((f, i) => { if (f) { nodes[i].fx = nodes[i].x; nodes[i].fy = nodes[i].y; } });
  const links = m.edges.map(([a, b]) => ({ source: a, target: b }));
  sim = forceSimulation(nodes).stop()
    .alpha(cfg.alpha).alphaTarget(cfg.alphaTarget).alphaDecay(cfg.alphaDecay).velocityDecay(cfg.velocityDecay)
    .force("link", forceLink(links).id((d) => d.index).distance((l) => (l.source.r + l.target.r + cfg.gap) * s))
    .force("charge", forceManyBody().strength(cfg.charge * s * s).distanceMax(cfg.distanceMax * s))
    .force("collide", forceCollide((d) => d.r + cfg.pad))
    .force("x", forceX(0).strength(cfg.center))
    .force("y", forceY(0).strength(cfg.center));
  AK = m.anchor ? Float64Array.from(m.anchor.k) : null;
  if (AK) { anchorAtBalance(); sim.force("anchor", anchorForce); }
  iter = 0; maxIter = cfg.maxIter; runMs = 0;
}

function post(done) {
  const x = Float64Array.from(nodes, (n) => n.x), y = Float64Array.from(nodes, (n) => n.y);
  postMessage({ type: "frame", x, y, iter, max: maxIter, done, ms: Math.round(runMs) }, [x.buffer, y.buffer]);
}

function loop() {
  if (!running) return;
  const t = performance.now();
  const until = Math.min(maxIter, iter + cfg.frameEvery);
  while (iter < until) { sim.tick(); iter += 1; }
  runMs += performance.now() - t;
  const done = iter >= maxIter;
  if (done) running = false;
  post(done);
  if (!done) setTimeout(loop, 0);                   // 메시지(멈춤 · 고정)를 받을 틈 — 좌표는 반복 수로만 정해진다
}

onmessage = (ev) => {
  const m = ev.data || {};
  if (m.type === "start") { init(m); running = true; post(false); setTimeout(loop, 0); }
  else if (m.type === "stop") { running = false; post(iter >= maxIter); }
  else if (m.type === "resume") { if (!running && iter < maxIter) { running = true; setTimeout(loop, 0); } }
  else if (m.type === "pin" && N && m.i >= 0 && m.i < N) {
    const n = nodes[m.i];
    n.fx = m.x; n.fy = m.y; n.x = m.x; n.y = m.y; n.vx = 0; n.vy = 0;
  } else if (m.type === "cool" && N) {              // 놓은 뒤 식힘 — 데우기를 끄고 지금부터 iters만 더 돌고 쉰다
    sim.alphaTarget(0);
    maxIter = iter + m.iters;
    if (!running) { running = true; setTimeout(loop, 0); }
  }
};
