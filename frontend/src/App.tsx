/* 화면 — 상태와 배선. 그리기는 `graph/view.ts`, 칸마다의 모양은 `panels/`가 맡는다.
 *
 * 화면은 계산하지 않는다(명세 §2-3): 받은 것을 그리고, 사람이 고른 것(색 축·관계·찾기·라벨·고른 점·탭·질문)만 상태로 든다.
 * 탭 셋(그래프 · 질의 · 연결 현황)은 왼쪽 칸을 바꾼다. 그래프 캔버스는 늘 떠 있다 — 질의의 겹쳐 보기가 그 위에 칠해지고,
 * 연결 현황은 캔버스 위에 덮어 보인다(sigma 캔버스를 숨기면 크기를 잃는다).
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { getJSON } from "./api";
import { GraphView, searchHit, type Overlay, type ViewState } from "./graph/view";
import { type Axis, edgeShown } from "./graph/style";
import {
  type Explore, type Depth, degreeOf, duplicateEdges, exploreMode, initialExplore, uniformDepths, visibleNodes, withChip,
} from "./graph/explore";
import { type Filters, detachedNodes, emptyFilters, reachable, shownNodes } from "./graph/filters";
import { detectRenderer, type Renderer } from "./graph/renderer";
import { FOLLOW_DEFAULT } from "./graph/force";
import type { Graph, Health, LayoutState, PlatformStatus, SysStatus } from "./types";
import { Header } from "./panels/Header";
import { Controls } from "./panels/Controls";
import { Detail } from "./panels/Detail";
import { MissingCard } from "./panels/MissingCard";
import { QueryPanel } from "./panels/QueryPanel";
import { DocPanel } from "./panels/DocPanel";
import { FunnelView } from "./panels/FunnelView";

type Tab = "graph" | "query" | "funnel";
const TABS: [Tab, string][] = [["graph", "그래프"], ["query", "질의"], ["funnel", "연결 현황"]];

declare global {
  interface Window {
    /** 확인용 손잡이(읽기 전용) — verify 스크립트가 좌표와 수를 읽는 데만 쓴다(요청문 P1 §2-② · DECISIONS P-08). */
    __platform?: unknown;
  }
}

const VECTOR_POLL_MS = 2000;
/** 질의 칩의 이름에 싣는 질문 앞부분 글자 수(요청문 P3 §2-④). */
const QUERY_CHIP_CHARS = 20;

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
  const [tab, setTab] = useState<Tab>("graph");
  const [question, setQuestion] = useState("");
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [docOpen, setDocOpen] = useState<string | null>(null);   // 오른쪽 칸 — 문서 패널(없으면 노드 상세)
  // 탐색(명세 §5.4) — 카테고리별 깊이와 칩. 그래프가 오면 첫 화면 규칙으로 정한다.
  const [explore, setExplore] = useState<Explore | null>(null);
  const [expandFrom, setExpandFrom] = useState<string | null>(null);   // 새 노드가 출발할 자리(펼친 노드)
  const [expandNote, setExpandNote] = useState<string | null>(null);   // 펼치기 오류는 서버 문면 그대로
  const [renderer] = useState<Renderer>(() => detectRenderer());
  // 거르기(명세 §5.3 [P4]) — 문서 · 축 값 · 연결 없는 노드. 기본은 전부 켜짐 · 연결 없는 노드는 숨김.
  const [filters, setFilters] = useState<Filters>(() => emptyFilters());

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
      setExplore(initialExplore(g.data, renderer.software));
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

  // ── 보이는 노드 — 이 화면의 「보이기」는 이 한 값이다(명세 §5.3 · §5.4 — 탐색 ∪ 연결 없는 노드 − 거른 노드) ──
  const shown = useMemo(() => (graph && explore ? shownNodes(graph, explore, filters) : new Set<string>()),
                        [graph, explore, filters]);
  const detachedSet = useMemo(() => new Set(graph ? detachedNodes(graph) : []), [graph]);
  /** 칩의 +n — 거른 뒤에 새로 보이는 수. */
  const visWith = (e: Explore) => (graph ? shownNodes(graph, e, filtersRef.current) : new Set<string>());
  const degree = useMemo(() => (graph ? degreeOf(graph) : new Map<string, number>()), [graph]);
  const dupEdges = useMemo(() => (graph ? duplicateEdges(graph) : 0), [graph]);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const exploreRef = useRef(explore);
  exploreRef.current = explore;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  /** 펼치기(명세 §5.4) — 시스템이 준 1홉 이웃 중 닻 있는 것을 칩 하나로 더한다(화면이 이웃을 다시 찾지 않는다). */
  const expand = async (id: string) => {
    if (!graph) return;
    const r = await getJSON<{ id: string; neighbors: (string | { id: string })[] }>(
      `/api/neighbors/${encodeURIComponent(id)}`);
    noteMissing("/api/neighbors", r.missing);
    if (r.error) { setExpandNote(`/api/neighbors — HTTP ${r.status} — ${r.error}`); return; }
    setExpandNote(null);
    const nbrs = (r.data.neighbors || []).map((x) => (typeof x === "string" ? x : x.id));
    const nodes = [id, ...nbrs].filter((x) => x in graph.anchor || (filters.detached && detachedSet.has(x)));
    const name = graph.nodes.find((n) => n.id === id)?.name ?? id;
    setExpandFrom(id);
    setExplore((e) => (e ? withChip(graph, e, { key: `expand:${id}`, kind: "expand", label: `펼침: ${name}`, nodes }, visWith) : e));
  };
  const expandRef = useRef(expand);
  expandRef.current = expand;

  // 질의 끌어오기(명세 §5.4 · §6.1) — 칠할 노드 중 안 보이는 것(닻 있음)을 칩 하나로. 서버에 더 묻지 않는다.
  // 새 질의가 칩을 바꾸고, 겹쳐 보기를 지우면 칩도 빠진다.
  useEffect(() => {
    if (!graph) return;
    if (overlay) setExpandFrom(null);           // 끌어온 노드는 host 둘레에서 출발한다(펼친 노드가 아니다)
    setExplore((e) => {
      if (!e) return e;
      const rest = { ...e, chips: e.chips.filter((c) => c.kind !== "query") };
      if (!overlay) return rest.chips.length === e.chips.length ? e : rest;
      const base = visibleNodes(graph, rest);
      const pull = Object.keys(overlay.nodes).filter((id) => id in graph.anchor && !base.has(id));
      // 끌어온 노드도 거르기를 따른다 — 칩의 +n은 거른 뒤의 수(visWith).
      if (!pull.length) return rest.chips.length === e.chips.length ? e : rest;
      const q = question.trim();
      const label = `질의: ${q.length > QUERY_CHIP_CHARS ? q.slice(0, QUERY_CHIP_CHARS) + "…" : q}`;
      return withChip(graph, rest, { key: "query", kind: "query", label, nodes: pull }, visWith);
    });
  }, [overlay, graph]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── 그래프 — 데이터가 오면 한 번 만든다 ────────────────────────────────────
  const viewState: ViewState = useMemo(
    () => ({ axis, rels, search, fullLabels, selected }), [axis, rels, search, fullLabels, selected]);
  const viewStateRef = useRef(viewState);
  viewStateRef.current = viewState;

  useEffect(() => {
    if (!graph || !canvasRef.current) return;
    let v: GraphView;
    try {
      v = new GraphView(canvasRef.current, graph, viewStateRef.current, shownRef.current, degree, setSelected,
                        (s) => setLayout({ ...s }), (id) => { void expandRef.current(id); });
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
      // P3 — 지금 값의 사본(읽기 전용 · 요청문 P3 §2-⑨)
      renderer: { ...renderer },
      explore: {
        get depths() { return { ...(exploreRef.current?.depths ?? {}) }; },
        get chips() { return (exploreRef.current?.chips ?? []).map((c) => ({ ...c, nodes: [...c.nodes] })); },
        get mode() { return exploreRef.current ? exploreMode(exploreRef.current) : null; },
        get shown() { return [...shownRef.current]; },
      },
      // P4 — 거르기의 지금 값(사본)
      filters: {
        get docsOff() { return [...filtersRef.current.docsOff]; },
        get valuesOff() {
          return Object.fromEntries(Object.entries(filtersRef.current.valuesOff).map(([k, v]) => [k, [...(v ?? [])]]));
        },
        get detached() { return filtersRef.current.detached; },
      },
    };
    return () => { v.destroy(); viewRef.current = null; delete window.__platform; };
  }, [graph]);

  useEffect(() => { viewRef.current?.setView(viewState); }, [viewState]);
  useEffect(() => { viewRef.current?.setVisible(shown, expandFrom); }, [shown]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { viewRef.current?.setOverlay(overlay); }, [overlay]);

  // 질의 탭은 왼쪽 칸이 넓다 — 캔버스 크기가 바뀌므로 sigma에 알린다(창 크기 바뀜만 스스로 안다).
  useEffect(() => {
    const id = requestAnimationFrame(() => { viewRef.current?.sigma.resize(); viewRef.current?.sigma.refresh(); });
    return () => cancelAnimationFrame(id);
  }, [tab]);

  // ── 머리 줄의 수 — 보이기 판정은 그리기와 같은 함수 ────────────────────────
  const counts = useMemo(() => {
    if (!graph) return null;
    const ids = new Set<string>();
    const edges = graph.edges.filter((e) => shown.has(e.src) && shown.has(e.dst) && edgeShown(e, rels)
                                            && !ids.has(e.id) && (ids.add(e.id), true));
    return { nodes: shown.size, nodesAll: graph.nodes.length, edges: edges.length, edgesAll: graph.edges.length };
  }, [graph, rels, shown]);

  /** 찾기 — 보이지 않는 노드(닻 있음)도 찾는다. 첫 결과 = 보이는 것 먼저 · 이름 순(명세 §5.3 [P3]). */
  const findHits = (text: string) => {
    const q = text.trim().toLowerCase();
    if (!graph || !q) return null;
    const found = graph.nodes.filter((n) => reachable(graph, n, filters, detachedSet) && searchHit(n, q))
      .sort((a, b) => (Number(!shown.has(a.id)) - Number(!shown.has(b.id))) || a.name.localeCompare(b.name)
                      || a.id.localeCompare(b.id));
    const vis = found.filter((n) => shown.has(n.id)).length;
    return { shown: vis, hidden: found.length - vis, first: found[0]?.id ?? null };
  };
  const hits = useMemo(() => findHits(search), [graph, search, shown, filters]);  // eslint-disable-line react-hooks/exhaustive-deps

  const setDepth = (cat: string, d: Depth) =>
    setExplore((e) => (e ? { ...e, depths: { ...e.depths, [cat]: d } } : e));
  const setAllDepths = (d: Depth, clearChips: boolean) =>
    setExplore((e) => (e && graph ? { depths: uniformDepths(graph, d), chips: clearChips ? [] : e.chips } : e));
  const dropChip = (key: string) => setExplore((e) => (e ? { ...e, chips: e.chips.filter((c) => c.key !== key) } : e));
  /** 거르기를 바꾼다 — 새로 보이는 노드는 닻의 host 둘레에서 출발한다(펼친 노드가 아니다). */
  const changeFilters = (f: Filters) => { setExpandFrom(null); setFilters(f); };
  const foldAll = () => setExplore((e) => (e ? { ...e, chips: e.chips.filter((c) => c.kind !== "expand") } : e));

  const pick = (id: string) => {
    setSelected(id);
    setDocOpen(null);
    viewRef.current?.focus(id);
  };

  /** 칠할 노드 중 그리는 그래프에 없는 것(연결 없는 노드 등) — 「화면에 없는 노드 n개」. */
  const offscreen = useMemo(() => {
    if (!graph || !overlay) return 0;
    return Object.keys(overlay.nodes).filter((id) => !shown.has(id)).length;
  }, [graph, overlay, shown]);

  /** 「이 노드로 질문」 — 질문 칸에 이름을 넣고 질의 탭으로. 전송은 사람이 한다(명세 §6.1). */
  const askAbout = (name: string) => {
    setQuestion(name);
    setTab("query");
  };

  return (
    <div className="app">
      {health?.mode === "mock" && (
        <div className="mock-band" role="status">시스템 mock 모드 — 개발용 데이터</div>
      )}
      <Header health={health} platform={platform} counts={counts} layout={layout} vectorLine={vectorLine}
              renderer={renderer} />
      <MissingCard missing={missing} />
      <main className={tab === "query" ? "wide-left" : ""}>
        <aside className="left">
          <div className="tabs" role="tablist">
            {TABS.map(([t, label]) => (
              <button key={t} role="tab" className={tab === t ? "on" : ""} aria-selected={tab === t}
                      onClick={() => setTab(t)} data-testid={`tab-${t}`}>{label}</button>
            ))}
          </div>
          {tab === "query" && (
            <QueryPanel text={question} onText={setQuestion} onOverlay={setOverlay} offscreen={offscreen}
                        onPick={pick} onOpenDoc={setDocOpen} />
          )}
          {tab === "funnel" && <p className="note">문서마다 연결 현황 — 가운데 표. 그래프로 돌아가려면 「그래프」 탭.</p>}
          {tab === "graph" && graph && explore && (
            <Controls graph={graph} axis={axis} onAxis={setAxis} rels={rels} onRels={setRels}
                      shown={shown} explore={explore} onDepth={setDepth} onAllDepths={setAllDepths}
                      onDropChip={dropChip} onFoldAll={foldAll} dupEdges={dupEdges} expandNote={expandNote}
                      maxDegree={Math.max(0, ...degree.values())}
                      onSearchEnter={(q) => { const h = findHits(q); if (h?.first) void expand(h.first); }}
                      search={search} onSearch={setSearch} hits={hits}
                      fullLabels={fullLabels} onFullLabels={setFullLabels}
                      spacing={spacing} onSpacing={(m) => { setSpacing(m); viewRef.current?.setSpacing(m); }}
                      follow={follow} onFollow={(k) => { setFollow(k); viewRef.current?.setFollow(k); }}
                      layout={layout} onPause={(on) => viewRef.current?.pause(on)}
                      onRelayout={() => viewRef.current?.relayout()}
                      filters={filters} onFilters={changeFilters} detachedCount={detachedSet.size}
                      onOpenDoc={setDocOpen} />
          )}
        </aside>
        <section className="canvas-wrap">
          <div id="canvas" ref={canvasRef} />
          {error && <div className="canvas-error">{error}</div>}
          {!graph && !error && <div className="canvas-error muted">그래프를 받는 중…</div>}
          {tab === "funnel" && <div className="canvas-cover"><FunnelView /></div>}
        </section>
        <aside className="right">
          {docOpen
            ? <DocPanel docId={docOpen} onBack={() => setDocOpen(null)} onPick={pick} />
            : <Detail graph={graph} selected={selected} onPick={pick} onAsk={askAbout} onOpenDoc={setDocOpen}
                      shown={shown} degree={degree} onExpand={(id) => { void expand(id); }} />}
        </aside>
      </main>
    </div>
  );
}
