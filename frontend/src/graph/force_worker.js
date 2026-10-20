/* 이 파일은 시스템 뷰어의 힘 배치 워커를 **옮겨 온 것**이다 — 불러오기가 아니라 복사 · 플랫폼이 소유한다(명세 §2-2).
 *   출처: playjae0/ontology_system @ 4af5505 · cli/viewer/static/force_worker.js
 *   플랫폼 사본에 더한 것 둘 (P1.5 · 명세 §5.1 끌기 배치):
 *     ① `start`의 선택 칸 `anchor: {k}` — 노드마다 제자리 용수철 세기. 있으면 중력 다음에 `−k·m·(지금 − 제자리)`를 더한다.
 *        **제자리는 시작 순간의 알짜 힘을 상쇄하는 자리다**(P1.6 · B-01): 시작 좌표에서 알짜 힘 F(반발 + 중력 + 끌림)를 한 번 재고
 *        제자리 = 지금 − F / (k·m) — 시작 순간이 평형이라 앞선 끌기가 남긴 힘이 풀리지 않는다(고정된 점 · k 0은 제자리 = 지금).
 *        끌기 배치에서는 걸음(speed)을 `cfg.dragMaxSpeed` 이하로 묶는다(P1.6 · DECISIONS P-28): 평형 근처에서 ForceAtlas2의 걸음이
 *        커져 노드가 떨리고, 그 떨림이 쉰 자리를 바꿔 「끌지 않은 곳이 흐른다」로 보였다.
 *        **없으면 시스템 원본과 같은 계산으로 돈다**(전체 배치는 바뀌지 않는다 — 힘 계산을 `forces()` 하나로 묶었을 뿐 순서 그대로).
 *     ② 메시지 `cool {iters}` — 반복 상한을 「지금 반복 수 + iters」로 바꾸고, 쉬고 있으면 다시 돈다(놓은 뒤 식힘).
 *   위 두 가지만 더했다. 다루는 쪽은 `force.ts`다(시스템 `layout.js`의 forceStart · forcePause · forcePin을 옮겼다).
 */
/* 칸 5.2 — 뷰어 **힘 배치 워커** — ForceAtlas2 계열 · Barnes–Hut · 결정적 (B114 ①).
 *
 * 화면 스레드 밖(웹 워커)에서 돌고 위치를 **이어서** 넘긴다 — 시간 예산으로 끊지 않는다(구판 B103 ②는 덩어리마다
 * 4초 예산에서 끊어 큰 그래프가 초기 배치(원)에 가까운 채 멈췄다). 알고리즘은 우리 코드다(D-165 — 번들 · 내려받기 0).
 *
 * 힘 셋(ForceAtlas2 — Jacomy 외 2014의 식):
 *   · 반발 — 질량(연결 수 + 1)의 곱에 비례 · 거리에 반비례 `kr·mᵢ·mⱼ/d` · 노드가 많아도 사분 나무로 근사(θ)
 *   · 끌림 — 엣지 양 끝 사이 거리에 비례(선형)
 *   · 중력 — 떨어진 덩어리를 붙잡는다 · 질량에 비례하는 일정한 크기로 원점을 향해
 *   · 걸음 — 전역 흔들림/견인으로 정하는 적응 속도 + 노드마다 흔들림으로 줄인다(같은 식 · 난수 0)
 *
 * **결정적이다**: 난수 0 · 걸음은 반복 수로 센다(시각으로 끊지 않는다) · 같은 시드 좌표 · 같은 반복 수면 같은 좌표.
 * 프레임은 `frameEvery` 반복마다 하나 — 몇 번째 반복의 좌표인지를 함께 보낸다.
 *
 * 메시지: start {x, y, m, edges, fixed, cfg, anchor?} · stop · resume · pin {i, x, y} · cool {iters}
 *         → frame {x, y, iter, max, done, ms}
 */
"use strict";

let X, Y, M, DX, DY, OX, OY, FIX, EA, EB, N = 0, iter = 0, maxIter = 0, running = false;
let speed = 1, speedEff = 1, cfg = {}, runMs = 0;
let AK = null, AX, AY;                              // 제자리 용수철(플랫폼 사본 ①) — 없으면 null

function init(m) {
  X = Float64Array.from(m.x); Y = Float64Array.from(m.y); M = Float64Array.from(m.m);
  N = X.length;
  DX = new Float64Array(N); DY = new Float64Array(N); OX = new Float64Array(N); OY = new Float64Array(N);
  FIX = Uint8Array.from(m.fixed || new Array(N).fill(0));
  EA = Int32Array.from(m.edges.map((e) => e[0])); EB = Int32Array.from(m.edges.map((e) => e[1]));
  cfg = m.cfg; iter = 0; maxIter = cfg.maxIter; speed = 1; speedEff = 1; runMs = 0;
  AK = m.anchor ? Float64Array.from(m.anchor.k) : null;
  if (AK) anchorAtBalance();
}

/** 제자리(플랫폼 사본 ①) — 시작 좌표에서 알짜 힘(용수철 빼고)을 한 번 재서, 용수철이 그 힘을 정확히 상쇄하는 자리.
 *  반복 한 번의 힘 계산과 같은 계산이고 좌표는 움직이지 않는다. 잰 뒤 DX·DY는 0으로(첫 반복의 흔들림 계산에 섞이지 않게). */
function anchorAtBalance() {
  AX = Float64Array.from(X); AY = Float64Array.from(Y);
  for (let i = 0; i < N; i++) { DX[i] = 0; DY[i] = 0; }
  forces(false);
  for (let i = 0; i < N; i++) {
    if (FIX[i] || !(AK[i] > 0)) continue;
    const km = AK[i] * M[i];
    AX[i] = X[i] - DX[i] / km; AY[i] = Y[i] - DY[i] / km;
  }
  for (let i = 0; i < N; i++) { DX[i] = 0; DY[i] = 0; }
}

/** 사분 나무 — 칸마다 질량 · 질량 중심 · 자식 넷(잎은 점 하나 · 같은 자리에 쌓이면 한 칸에 모은다). */
function tree() {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < N; i++) {
    if (X[i] < x0) x0 = X[i]; if (Y[i] < y0) y0 = Y[i]; if (X[i] > x1) x1 = X[i]; if (Y[i] > y1) y1 = Y[i];
  }
  const cell = (cx0, cy0, s) => ({ x0: cx0, y0: cy0, s, m: 0, cx: 0, cy: 0, body: -1, kids: null });
  const root = cell(x0, y0, Math.max(x1 - x0, y1 - y0, 1e-3));
  const add = (c, i) => {
    const m = c.m + M[i];
    c.cx = (c.cx * c.m + X[i] * M[i]) / m; c.cy = (c.cy * c.m + Y[i] * M[i]) / m; c.m = m;
  };
  const child = (c, i) => c.kids[(X[i] >= c.x0 + c.s / 2 ? 1 : 0) + (Y[i] >= c.y0 + c.s / 2 ? 2 : 0)];
  const insert = (c, i, d) => {
    if (c.kids === null) {
      if (c.m === 0) { c.body = i; add(c, i); return; }
      if (d > 40) { add(c, i); c.body = -2; return; }
      const h = c.s / 2;
      c.kids = [0, 1, 2, 3].map((q) => cell(c.x0 + (q & 1) * h, c.y0 + (q >> 1) * h, h));
      const j = c.body; c.body = -1;
      if (j >= 0) insert(child(c, j), j, d + 1);
    }
    add(c, i);
    insert(child(c, i), i, d + 1);
  };
  for (let i = 0; i < N; i++) insert(root, i, 0);
  return root;
}

/** 반발 — 먼 칸은 질량 중심 하나로(θ) · `kr·mᵢ·mⱼ/d`(변위는 방향 × 힘). */
function repulse(root) {
  const kr = cfg.scaling, th2 = cfg.theta * cfg.theta;
  const walk = (c, i) => {
    if (c.m === 0 || (c.kids === null && c.body === i)) return;
    let dx = X[i] - c.cx, dy = Y[i] - c.cy, d2 = dx * dx + dy * dy;
    if (c.kids !== null && c.s * c.s >= th2 * d2) { for (const k of c.kids) walk(k, i); return; }
    if (d2 < 1e-9) { dx = ((i % 7) - 3) * 1e-3 + 1e-4; dy = ((i % 5) - 2) * 1e-3 + 1e-4; d2 = dx * dx + dy * dy; }
    const f = kr * M[i] * c.m / d2;                          // (dx/d) · kr·mᵢ·m/d
    DX[i] += dx * f; DY[i] += dy * f;
  };
  for (let i = 0; i < N; i++) walk(root, i);
}

/** 힘을 DX·DY에 더한다 — 반발 · 중력 · (springs면) 제자리 용수철 · 끌림. 순서는 시스템 원본 그대로. */
function forces(springs) {
  repulse(tree());
  // 중력 — 질량에 비례하는 일정한 크기로 원점을 향해(덩어리를 붙잡는다)
  const kg = cfg.gravity;
  for (let i = 0; i < N; i++) {
    const d = Math.hypot(X[i], Y[i]);
    if (d > 0) { const f = kg * M[i] / d; DX[i] -= X[i] * f; DY[i] -= Y[i] * f; }
  }
  // 제자리 용수철(플랫폼 사본 ①) — 끌기 배치에서만 · `−k·m·(지금 − 제자리)`
  if (springs && AK) {
    for (let i = 0; i < N; i++) { DX[i] -= AK[i] * M[i] * (X[i] - AX[i]); DY[i] -= AK[i] * M[i] * (Y[i] - AY[i]); }
  }
  // 끌림 — 선형
  for (let k = 0; k < EA.length; k++) {
    const a = EA[k], b = EB[k], dx = X[a] - X[b], dy = Y[a] - Y[b];
    DX[a] -= dx; DY[a] -= dy; DX[b] += dx; DY[b] += dy;
  }
}

function step() {
  for (let i = 0; i < N; i++) { OX[i] = DX[i]; OY[i] = DY[i]; DX[i] = 0; DY[i] = 0; }
  forces(true);
  // 적응 속도 — 전역 흔들림/견인(ForceAtlas2 식 그대로)
  let swing = 0, traction = 0;
  for (let i = 0; i < N; i++) {
    swing += M[i] * Math.hypot(DX[i] - OX[i], DY[i] - OY[i]);
    traction += M[i] * Math.hypot(DX[i] + OX[i], DY[i] + OY[i]) / 2;
  }
  const est = 0.05 * Math.sqrt(N), minJT = Math.sqrt(est), maxJT = 10;
  let jt = cfg.jitter * Math.max(minJT, Math.min(maxJT, est * traction / (N * N)));
  const minSE = 0.05;
  if (traction > 0 && swing / traction > 2.0) { if (speedEff > minSE) speedEff *= 0.5; jt = Math.max(jt, cfg.jitter); }
  const target = swing > 0 ? jt * speedEff * traction / swing : speed;
  if (swing > jt * traction) { if (speedEff > minSE) speedEff *= 0.7; } else if (speed < 1000) speedEff *= 1.3;
  speed = speed + Math.min(target - speed, 0.5 * speed);
  if (AK && cfg.dragMaxSpeed) speed = Math.min(speed, cfg.dragMaxSpeed);   // 끌기 배치의 걸음 상한(플랫폼 사본 ①)
  for (let i = 0; i < N; i++) {
    if (FIX[i]) continue;
    const sw = M[i] * Math.hypot(DX[i] - OX[i], DY[i] - OY[i]);
    const f = speed / (1 + Math.sqrt(speed * sw));
    X[i] += DX[i] * f; Y[i] += DY[i] * f;
  }
  iter += 1;
}

function post(done) {
  const x = Float64Array.from(X), y = Float64Array.from(Y);
  postMessage({ type: "frame", x, y, iter, max: maxIter, done, ms: Math.round(runMs) }, [x.buffer, y.buffer]);
}

function loop() {
  if (!running) return;
  const s = performance.now();
  const until = Math.min(maxIter, iter + cfg.frameEvery);
  while (iter < until) step();
  runMs += performance.now() - s;
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
  else if (m.type === "pin" && N && m.i >= 0 && m.i < N) { FIX[m.i] = 1; X[m.i] = m.x; Y[m.i] = m.y; }
  else if (m.type === "cool" && N) {                // 식힘(플랫폼 사본 ②) — 지금부터 iters만 더 돌고 쉰다
    maxIter = iter + m.iters;
    if (!running) { running = true; setTimeout(loop, 0); }
  }
};
