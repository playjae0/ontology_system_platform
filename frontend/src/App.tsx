/* 화면 — 상태와 배선. 그리기는 `graph/view.ts`, 칸마다의 모양은 `panels/`가 맡는다.
 *
 * 화면은 계산하지 않는다(명세 §2-3): 받은 것을 그리고, 사람이 고른 것(색 축·관계·찾기·라벨·고른 점)만 상태로 든다.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { getJSON } from "./api";
import { GraphView, searchHit, type ViewState } from "./graph/view";
import { type Axis, edgeShown, nodeShown } from "./graph/style";
import { FOLLOW_DEFAULT } from "./graph/force";
import type { Graph, Health, LayoutState, PlatformStatus, SysStatus } from "./types";
import { Header } from "./panels/Header";
import { Controls } from "./panels/Controls";
import { Detail } from "./panels/Detail";
import { MissingCard } from "./panels/MissingCard";

declare global {
  interface Window {
    /** 확인용 손잡이(읽기 전용) — verify 스크립트가 좌표와 수를 읽는 데만 쓴다(요청문 P1 §2-② · DECISIONS P-08). */
    __platform?: unknown;
  }
}

const VECTOR_POLL_MS = 2000;

export default function App() {
  const [platform, setPlatform] = useState<PlatformStatus | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<Record<string, string[]>>({});
  const [vectorLine, setVectorLine] = useState<string>("");
  const [layout, setLayout] = useState<LayoutState>(
    { running: false, paused: false, iterations: 0, max: 0, kind: "layout" });

  const [axis, setAxis] = useState<Axis>("category");
  const [rels, setRels] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [fullLabels, setFullLabels] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [spacing, setSpacing] = useState(1);
  const [follow, setFollow] = useState(FOLLOW_DEFAULT);

  const canvasRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<GraphView | null>(null);

  /** 응답에서 빠진 칸을 모은다 — 화면 위 카드로 알린다(명세 §4). */
  const noteMissing = (path: string, m: string[]) =>
    setMissing((old) => {
      if (!m.length && !old[path]) return old;
      const next = { ...old };
      if (m.length) next[path] = m; else delete next[path];
      return next;
    });

  // ── 받기 ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const p = await getJSON<PlatformStatus>("/platform/status");
      if (!p.error) setPlatform(p.data);
      const h = await getJSON<Health>("/api/health");
      noteMissing("/api/health", h.missing);
      if (h.error) { setError(`/api/health — HTTP ${h.status} — ${h.error}`); return; }
      setHealth(h.data);
      const g = await getJSON<Graph>("/api/graph");
      noteMissing("/api/graph", g.missing);
      if (g.error) { setError(`/api/graph — HTTP ${g.status} — ${g.error}`); return; }
      setRels(new Set(g.data.rels || []));
      setGraph(g.data);
    })();
  }, []);

  // 질의 벡터 준비 줄 — 준비 중이면 짧은 간격으로 다시 읽는다.
  useEffect(() => {
    let timer: number | undefined;
    let alive = true;
    const poll = async () => {
      const s = await getJSON<SysStatus>("/api/status");
      if (!alive) return;
      noteMissing("/api/status", s.missing);
      if (s.error) { setVectorLine(`벡터 상태를 못 읽었다 — ${s.error}`); return; }
      setVectorLine(s.data.line);
      if (s.data.vectors?.active) timer = window.setTimeout(poll, VECTOR_POLL_MS);
    };
    poll();
    return () => { alive = false; window.clearTimeout(timer); };
  }, []);

  // ── 그래프 — 데이터가 오면 한 번 만든다 ────────────────────────────────────
  const viewState: ViewState = useMemo(
    () => ({ axis, rels, search, fullLabels, selected }), [axis, rels, search, fullLabels, selected]);
  const viewStateRef = useRef(viewState);
  viewStateRef.current = viewState;

  useEffect(() => {
    if (!graph || !canvasRef.current) return;
    let v: GraphView;
    try {
      v = new GraphView(canvasRef.current, graph, viewStateRef.current, setSelected,
                        (s) => setLayout({ ...s }));
    } catch (err) {
      setError(`그래프를 그리지 못했다 — ${err}`);
      return;
    }
    viewRef.current = v;
    window.__platform = {
      graph: v.graph,
      sigma: v.sigma,
      visible: () => v.visible(),
      layout: {
        get running() { return v.layout.state.running; },
        get iterations() { return v.layout.state.iterations; },
        get kind() { return v.layout.state.kind; },
      },
    };
    return () => { v.destroy(); viewRef.current = null; delete window.__platform; };
  }, [graph]);

  useEffect(() => { viewRef.current?.setView(viewState); }, [viewState]);

  // ── 머리 줄의 수 — 보이기 판정은 그리기와 같은 함수 ────────────────────────
  const counts = useMemo(() => {
    if (!graph) return null;
    const shown = new Set(graph.nodes.filter((n) => nodeShown(n, graph.anchor)).map((n) => n.id));
    const edges = graph.edges.filter((e) => shown.has(e.src) && shown.has(e.dst) && edgeShown(e, rels));
    return { nodes: shown.size, nodesAll: graph.nodes.length, edges: edges.length, edgesAll: graph.edges.length,
             hiddenNodes: graph.nodes.length - shown.size };
  }, [graph, rels]);

  const hits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!graph || !q) return null;
    return graph.nodes.filter((n) => nodeShown(n, graph.anchor) && searchHit(n, q)).length;
  }, [graph, search]);

  const pick = (id: string) => {
    setSelected(id);
    viewRef.current?.focus(id);
  };

  return (
    <div className="app">
      {health?.mode === "mock" && (
        <div className="mock-band" role="status">시스템 mock 모드 — 개발용 데이터</div>
      )}
      <Header health={health} platform={platform} counts={counts} layout={layout} vectorLine={vectorLine} />
      <MissingCard missing={missing} />
      <main>
        <aside className="left">
          {graph && (
            <Controls graph={graph} axis={axis} onAxis={setAxis} rels={rels} onRels={setRels}
                      search={search} onSearch={setSearch} hits={hits}
                      fullLabels={fullLabels} onFullLabels={setFullLabels}
                      spacing={spacing} onSpacing={(m) => { setSpacing(m); viewRef.current?.setSpacing(m); }}
                      follow={follow} onFollow={(k) => { setFollow(k); viewRef.current?.setFollow(k); }}
                      layout={layout} onPause={(on) => viewRef.current?.pause(on)}
                      onRelayout={() => viewRef.current?.relayout()}
                      hiddenNodes={counts?.hiddenNodes ?? 0} />
          )}
        </aside>
        <section className="canvas-wrap">
          <div id="canvas" ref={canvasRef} />
          {error && <div className="canvas-error">{error}</div>}
          {!graph && !error && <div className="canvas-error muted">그래프를 받는 중…</div>}
        </section>
        <aside className="right">
          <Detail graph={graph} selected={selected} onPick={pick} />
        </aside>
      </main>
    </div>
  );
}
