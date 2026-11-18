/* 왼쪽 조절 — 카테고리별 깊이와 칩([P3]) · 찾기 · 배치(간격 · 멈춤/이어서 · 다시 배치) · 라벨 · 관계 토글 · 색 축과 범례 · 크기
 * (명세 §5.1~5.4). 보이는 노드는 받은 `shown` 하나로 센다(명세 §5.4 — 범례 · 찾기 · 깊이 표가 같은 값). */
import { useEffect, useMemo, useState } from "react";

import type { Graph, LayoutState } from "../types";
import { AXES, type Axis, axisValue, colorOf, COLOR, SIZE_MAX, SIZE_MIN, sizeOf } from "../graph/style";
import { FOLLOW_STEPS } from "../graph/force";
import { DEPTHS, type Depth, type Explore, drawnByCategory, exploreCategories, exploreMode } from "../graph/explore";

interface Props {
  graph: Graph;
  axis: Axis; onAxis: (a: Axis) => void;
  rels: Set<string>; onRels: (r: Set<string>) => void;
  search: string; onSearch: (q: string) => void;
  hits: { shown: number; hidden: number; first: string | null } | null;
  onSearchEnter: (q: string) => void;
  shown: Set<string>;
  explore: Explore;
  onDepth: (cat: string, d: Depth) => void;
  onAllDepths: (d: Depth, clearChips: boolean) => void;
  onDropChip: (key: string) => void;
  onFoldAll: () => void;
  dupEdges: number;
  expandNote: string | null;
  maxDegree: number;
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
const depthWord = (d: Depth) => (d === "all" ? "전부" : String(d));

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
    p.graph.nodes.filter((n) => p.shown.has(n.id))
      .forEach((n) => { const v = axisValue(n, p.axis); cnt.set(v, (cnt.get(v) || 0) + 1); });
    return [...cnt.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [p.graph, p.axis, p.shown]);

  // 깊이 표 — 카테고리마다 [이름, 전체 수] · 그려지는 수.
  const cats = useMemo(() => exploreCategories(p.graph), [p.graph]);
  const drawn = useMemo(() => drawnByCategory(p.graph, p.shown), [p.graph, p.shown]);
  const mode = exploreMode(p.explore);
  const expandChips = p.explore.chips.filter((c) => c.kind === "expand");

  const toggleRel = (rel: string, on: boolean) => {
    const next = new Set(p.rels);
    if (on) next.add(rel); else next.delete(rel);
    p.onRels(next);
  };

  const stepIndex = Math.max(0, SPACING_STEPS.indexOf(p.spacing));
  const followIndex = Math.max(0, FOLLOW_STEPS.indexOf(p.follow));

  return (
    <div className="controls">
      <h3>탐색 — 카테고리별 깊이</h3>
      <div className="row">
        <button className={mode === "skeleton" ? "on" : ""} onClick={() => p.onAllDepths(0, true)}
                data-testid="depth-skeleton">골격만</button>
        <button className={mode === "all" ? "on" : ""} onClick={() => p.onAllDepths("all", false)}
                data-testid="depth-all">전체</button>
      </div>
      <table className="depths" data-testid="depth-table">
        <tbody>
          {cats.map(([cat, total]) => (
            <tr key={cat} data-cat={cat}>
              <td className="cat" title={cat}>{cat}</td>
              <td className="steps">
                {DEPTHS.map((d) => (
                  <button key={String(d)} className={(p.explore.depths[cat] ?? 0) === d ? "on" : ""}
                          onClick={() => p.onDepth(cat, d)} data-depth={String(d)}>{depthWord(d)}</button>
                ))}
              </td>
              <td className="muted num" data-testid="depth-count">{drawn.get(cat) || 0}/{total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="note">깊이 = 가장 가까운 골격 노드까지의 홉 수(시스템이 준 값). 깊은 노드는 골격까지의 길과 함께 보인다.
        노드를 두 번 누르면 펼친다.</div>
      {p.explore.chips.length > 0 && (
        <div className="xchips" data-testid="chips">
          {p.explore.chips.map((c) => (
            <span className="xchip" key={c.key} data-kind={c.kind} data-testid="chip" title={c.label}>
              <span className="xchip-label">{c.label} +{c.added}</span>
              <button onClick={() => p.onDropChip(c.key)} aria-label="빼기" data-testid="chip-x">×</button>
            </span>
          ))}
          {expandChips.length > 0 && <button onClick={p.onFoldAll} data-testid="fold-all">모두 접기</button>}
        </div>
      )}
      {p.expandNote && <div className="note err">{p.expandNote}</div>}
      {p.dupEdges > 0 && <div className="note" data-testid="dup-edges">같은 엣지 {p.dupEdges}개는 한 번만 그렸다.</div>}

      <h3>찾기</h3>
      <input type="search" placeholder="이름 · id — 강조 · Enter는 첫 결과에서 펼치기" value={typed}
             onChange={(e) => setTyped(e.target.value)} data-testid="search"
             onKeyDown={(e) => { if (e.key === "Enter" && typed.trim()) { p.onSearch(typed); p.onSearchEnter(typed); } }} />
      {p.hits !== null && (
        <div className="note" data-testid="search-hits">보임 {p.hits.shown} · 숨김 {p.hits.hidden}</div>
      )}

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

      <h3>크기 = 연결 수</h3>
      <div className="legend" data-testid="size-legend">
        {([["작은", 0], ["가운데", Math.round(p.maxDegree / 4)], [`최대 ${p.maxDegree}`, p.maxDegree]] as [string, number][])
          .map(([k, deg]) => {
            const px = 2 * sizeOf(deg, p.maxDegree);
            return (
              <div className="row" key={k}>
                <span className="dot" style={{ width: px, height: px }} /><span>{k}</span>
                {k !== `최대 ${p.maxDegree}` && <span className="muted">연결 {deg}</span>}
              </div>
            );
          })}
        <div className="note">원의 넓이가 연결 수에 비례한다(반지름 {SIZE_MIN}~{SIZE_MAX}px · 전체 엣지로 센다 — 토글·깊이로 바뀌지
          않는다). 라벨 글자 크기는 tier.</div>
        <div className="row"><span className="dot ring" /><span>테두리 = 골격 노드(status seed)</span></div>
      </div>
    </div>
  );
}
