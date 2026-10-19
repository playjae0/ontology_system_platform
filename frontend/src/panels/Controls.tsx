/* 왼쪽 조절 — 찾기 · 색 축과 범례 · 크기 · 관계 토글 · 라벨 · 배치(간격 · 멈춤/이어서 · 다시 배치) (명세 §5.1~5.3 [P1]). */
import { useEffect, useMemo, useState } from "react";

import type { Graph, LayoutState } from "../types";
import { AXES, type Axis, axisValue, colorOf, COLOR, nodeShown, SIZE_OTHER, TIER_SIZE } from "../graph/style";
import { FOLLOW_STEPS } from "../graph/force";

interface Props {
  graph: Graph;
  axis: Axis; onAxis: (a: Axis) => void;
  rels: Set<string>; onRels: (r: Set<string>) => void;
  search: string; onSearch: (q: string) => void; hits: number | null;
  fullLabels: boolean; onFullLabels: (on: boolean) => void;
  spacing: number; onSpacing: (m: number) => void;
  follow: number; onFollow: (k0: number) => void;
  layout: LayoutState; onPause: (on: boolean) => void; onRelayout: () => void;
  hiddenNodes: number;
}

const SEARCH_DEBOUNCE_MS = 150;
const SPACING_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
/** 「끌 때 따라오는 범위」 다섯 단의 이름 — 값(k₀)은 force.ts 머리의 FOLLOW_STEPS. */
const FOLLOW_WORDS = ["가장 좁게", "좁게", "가운데", "넓게", "가장 넓게"];

export function Controls(p: Props) {
  // 찾기 — 글자마다가 아니라 잠깐 쉰 뒤에(강조만 하니 좌표는 그대로다).
  const [typed, setTyped] = useState(p.search);
  useEffect(() => {
    const t = window.setTimeout(() => p.onSearch(typed), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [typed]);  // eslint-disable-line react-hooks/exhaustive-deps

  // 범례 — 보이는 노드의 그 축 값과 수(많은 것부터).
  const legend = useMemo(() => {
    const cnt = new Map<string, number>();
    p.graph.nodes.filter((n) => nodeShown(n, p.graph.anchor))
      .forEach((n) => { const v = axisValue(n, p.axis); cnt.set(v, (cnt.get(v) || 0) + 1); });
    return [...cnt.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [p.graph, p.axis]);

  const toggleRel = (rel: string, on: boolean) => {
    const next = new Set(p.rels);
    if (on) next.add(rel); else next.delete(rel);
    p.onRels(next);
  };

  const stepIndex = Math.max(0, SPACING_STEPS.indexOf(p.spacing));
  const followIndex = Math.max(0, FOLLOW_STEPS.indexOf(p.follow));

  return (
    <div className="controls">
      <h3>찾기</h3>
      <input type="search" placeholder="이름 · id — 강조만 한다" value={typed}
             onChange={(e) => setTyped(e.target.value)} data-testid="search" />
      {p.hits !== null && <div className="note" data-testid="search-hits">걸린 노드 {p.hits}</div>}

      <h3>배치</h3>
      <div className="row">
        <button data-testid="pause" disabled={!p.layout.paused && !p.layout.running}
                onClick={() => p.onPause(!p.layout.paused)}>
          {p.layout.paused ? "이어서" : "멈춤"}
        </button>
        <button data-testid="relayout" onClick={p.onRelayout}>다시 배치</button>
      </div>
      <label className="note">
        간격 ×{p.spacing}
        <input type="range" min={0} max={SPACING_STEPS.length - 1} step={1} value={stepIndex}
               onChange={(e) => p.onSpacing(SPACING_STEPS[Number(e.target.value)])} data-testid="spacing" />
      </label>
      <label className="note">
        끌 때 따라오는 범위 — {FOLLOW_WORDS[followIndex]}
        <input type="range" min={0} max={FOLLOW_STEPS.length - 1} step={1} value={followIndex}
               onChange={(e) => p.onFollow(FOLLOW_STEPS[Number(e.target.value)])} data-testid="follow" />
      </label>
      <div className="note range-ends"><span>좁게</span><span>넓게</span></div>
      <div className="note">끌면 가까운 노드일수록 많이 따라온다(다음 끌기부터 적용). 놓은 노드는 그 자리에 고정된다 —
        「다시 배치」가 고정을 푼다. 「멈춤」 동안 끌면 그 점만 옮긴다.</div>

      <h3>라벨</h3>
      <label className="chk">
        <input type="checkbox" checked={p.fullLabels} onChange={(e) => p.onFullLabels(e.target.checked)}
               data-testid="full-labels" /> 전체 이름
      </label>

      <h3>관계</h3>
      <div className="row">
        <button onClick={() => p.onRels(new Set(p.graph.rels))} data-testid="rels-all">전부 켜기</button>
        <button onClick={() => p.onRels(new Set())} data-testid="rels-none">전부 끄기</button>
      </div>
      {p.graph.rels.map((rel) => (
        <label className="chk" key={rel}>
          <input type="checkbox" checked={p.rels.has(rel)} onChange={(e) => toggleRel(rel, e.target.checked)}
                 data-rel={rel} /> {rel}
        </label>
      ))}
      <div className="note">
        <span className="sw line" style={{ background: COLOR.cross }} /> 층을 건너는 엣지(cross)는 관계 토글과 무관하게
        언제나 곡선으로 그린다.
      </div>
      {p.hiddenNodes > 0 && <div className="note">연결 없는 노드 {p.hiddenNodes}개는 숨겼다(닻 없음).</div>}

      <h3>색</h3>
      <div className="radios">
        {AXES.map((a) => (
          <label key={a}>
            <input type="radio" name="axis" value={a} checked={a === p.axis} onChange={() => p.onAxis(a)} /> {a}
          </label>
        ))}
      </div>
      <div className="legend" data-testid="legend">
        {legend.map(([v, n]) => (
          <div className="row" key={v}>
            <span className="sw" style={{ background: colorOf(v) }} />
            <span>{v}</span><span className="muted">{n}</span>
          </div>
        ))}
      </div>

      <h3>크기</h3>
      <div className="legend">
        {([["main", TIER_SIZE.main], ["sub", TIER_SIZE.sub], ["detail", TIER_SIZE.detail],
           ["골격 밖", SIZE_OTHER]] as [string, number][]).map(([k, px]) => (
          <div className="row" key={k}>
            <span className="dot" style={{ width: px, height: px }} /><span>{k}</span>
          </div>
        ))}
        <div className="row"><span className="dot ring" /><span>테두리 = 골격 노드(status seed)</span></div>
      </div>
    </div>
  );
}
