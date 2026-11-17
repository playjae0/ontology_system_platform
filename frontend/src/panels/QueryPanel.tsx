/* 질의 탭 — 질문 · 상태 줄 · 칸 일곱(ⓐ~ⓖ) · 경로·의도·LLM 배지 · 미스·잘림 알림 (명세 §6.1 [P2]).
 *
 * 응답에 있는 것만 싣는다 — 화면이 고르거나 다시 세지 않는다(명세 §2-3). 칸의 항목 수는 응답 목록의 길이 그대로다.
 * 시스템 뷰어 `cli/viewer/static/query.js`(4af5505)가 같은 묶음을 싣는 방식을 그리기 코드로 참고했다(명세 §2-2).
 * 모드 등은 응답 글자 그대로 보인다 — 「mock」을 가르는 자리를 두지 않는다(명세 §2-5).
 */
import { useEffect, useRef, useState } from "react";

import { getJSON } from "../api";
import type { QueryResult, QueryStatus, Trace } from "../types";
import { edgeKey, type Overlay, type OverlayKind } from "../graph/view";
import { COLOR } from "../graph/style";
import { MissingCard } from "./MissingCard";

interface Props {
  text: string;
  onText: (q: string) => void;
  onOverlay: (o: Overlay | null) => void;
  offscreen: number;                 // 칠할 노드 중 화면에 없는 것(연결 없는 노드 등)
  onPick: (nodeId: string) => void;
  onOpenDoc: (docId: string) => void;
}

const STATUS_POLL_MS = 400;          // 묻는 동안 /api/status를 읽는 간격(요청문 P2 §2 — 0.4~1초)
const HOP_EDGE_LIMIT = 30;           // 확장 경로 칸의 표시 상한 — 넘으면 「n개 더」(DECISIONS P-30)
const PICK = "embed+llm";            // 시스템 어휘 — 임베딩 후보 + LLM 선별(명세 §6.1 · 시스템 query.js와 같은 값)

/** 겹쳐 보기 — trace에 적힌 것만 칠한다(경로를 추정하지 않는다). 링킹과 확장 둘 다에 있으면 링킹 색. */
export function overlayOf(tr: Trace): Overlay {
  const nodes: Record<string, OverlayKind> = {};
  (tr.linking || []).forEach((l) => { nodes[l.node_id] = l.method === PICK ? "pick" : "link"; });
  (tr.hops || []).forEach((h) => (h.nodes || []).forEach((n) => { if (!nodes[n]) nodes[n] = "reach"; }));
  const edges = new Set((tr.hops || []).flatMap((h) => (h.edges || []).map((e) => edgeKey(e.src, e.rel, e.dst))));
  return { nodes, edges };
}

export function QueryPanel({ text, onText, onOverlay, offscreen, onPick, onOpenDoc }: Props) {
  const [asking, setAsking] = useState(false);
  const [res, setRes] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<Record<string, string[]>>({});
  const [status, setStatus] = useState<QueryStatus | null>(null);
  const [openRecord, setOpenRecord] = useState<string | null>(null);
  const askingRef = useRef(false);

  const note = (path: string, m: string[]) =>
    setMissing((old) => { const n = { ...old }; if (m.length) n[path] = m; else delete n[path]; return n; });

  async function pollStatus() {
    const s = await getJSON<QueryStatus>("/api/status");
    note("/api/status", s.missing);
    if (!s.error) setStatus(s.data);
  }

  // 묻는 동안만 상태 줄을 읽는다 — 끝나면 마지막 상태를 한 번 더(지난 단계와 「끝」).
  useEffect(() => {
    if (!asking) return;
    pollStatus();
    const t = window.setInterval(pollStatus, STATUS_POLL_MS);
    return () => window.clearInterval(t);
  }, [asking]);  // eslint-disable-line react-hooks/exhaustive-deps

  async function ask() {
    if (askingRef.current) return;                 // 요청은 한 번에 한 건
    askingRef.current = true;
    setAsking(true); setError(null); setRes(null); setOpenRecord(null); onOverlay(null);
    // 빈 질문도 서버에 보낸다 — 서버 문면(「q가 비었다」)을 그대로 보이려고(요청문 P2 ⓓ).
    const r = await getJSON<QueryResult>(`/api/query?q=${encodeURIComponent(text.trim())}`);
    askingRef.current = false;
    setAsking(false);
    await pollStatus();
    note("/api/query", r.missing);
    if (r.error) { setError(r.status ? `HTTP ${r.status} — ${r.error}` : r.error); return; }
    setRes(r.data);
    onOverlay(overlayOf(r.data.trace));
  }

  return (
    <div className="query">
      <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="row">
        <input type="search" value={text} onChange={(e) => onText(e.target.value)} placeholder="질문"
               data-testid="q-input" />
        <button type="submit" disabled={asking} data-testid="q-send">{asking ? "묻는 중…" : "묻는다"}</button>
      </form>
      <StatusLine status={status} asking={asking} />
      {Object.entries(missing).map(([p, m]) => <MissingCard key={p} missing={{ [p]: m }} />)}
      {error && <div className="card err" data-testid="q-error">{error}</div>}
      {res && <Result res={res} offscreen={offscreen} openRecord={openRecord}
                      onChip={(id) => { onPick(id); setOpenRecord(id); }} onOpenDoc={onOpenDoc}
                      onClear={() => onOverlay(null)} />}
    </div>
  );
}

/** 상태 줄 — 단계(지난 것 ✓ · 지금 것 굵게) · 경과 초 · 벡터 준비 줄. 응답(`/api/status`) 그대로. */
function StatusLine({ status, asking }: { status: QueryStatus | null; asking: boolean }) {
  if (!status || (!asking && !status.query.question)) return null;
  const q = status.query;
  if (asking && !q.active) {
    return <div className="qstatus" data-testid="q-status" data-stage="보냄">질의 보냄 — 서버가 받기를 기다린다</div>;
  }
  return (
    <div className="qstatus" data-testid="q-status" data-stage={q.active ? q.stage ?? "" : "끝"}>
      <span>{q.active ? "질의 중 — " : "질의 끝 — "}</span>
      {status.stages.map((name, i) => {
        const seen = q.seen.includes(name), cur = q.active && q.stage === name;
        return (
          <span key={name}>
            {i ? " › " : ""}
            <span className={cur ? "on" : seen ? "" : "muted"} data-seen={seen ? "1" : undefined}>
              {seen && !cur ? "✓ " : ""}{name}
            </span>
          </span>
        );
      })}
      <span className="muted"> · 경과 {q.elapsed}초</span>
      {status.vectors && (status.vectors.active || status.vectors.made) ? <div className="muted">{status.line}</div> : null}
    </div>
  );
}

interface ResultProps {
  res: QueryResult;
  offscreen: number;
  openRecord: string | null;
  onChip: (id: string) => void;
  onOpenDoc: (docId: string) => void;
  onClear: () => void;
}

function Result({ res, offscreen, openRecord, onChip, onOpenDoc, onClear }: ResultProps) {
  const tr = res.trace;
  const texts = new Map<string, string>();
  [...(res.chunks || []), ...(res.related || []), ...(res.doc_search || [])]
    .forEach((c) => { if (c.chunk_id && c.text !== undefined) texts.set(c.chunk_id, c.text); });
  const linking = tr.linking || [];
  const picks = linking.filter((l) => l.method === PICK).length;
  const hopEdges = (tr.hops || []).flatMap((h) => (h.edges || []).map((e) => ({ label: h.label, e })));
  const facts = tr.facts || [], coll = tr.collection || [], ds = tr.doc_search || [], recs = res.records || [];
  const A = tr.answer || {};

  return (
    <div className="qresult">
      <div className="row wrap">
        <span className="badge" data-testid="q-path">경로 {res.path}</span>
        <span className="muted">의도 {tr.intent ?? "—"}</span>
        <span className="badge" data-testid="q-mode">답 {A.mode ?? "—"}</span>
      </div>
      <div className="muted" data-testid="q-llm">
        링킹 — 사전 {linking.length - picks} · 임베딩 후보 {(tr.link_stage?.candidates || []).length} → LLM 선별 {picks}
        {" "}(모드 {tr.link_stage?.mode ?? "—"})
      </div>
      <div data-testid="q-miss">
        {(tr.miss || []).length > 0 && <p className="note warn">미스(사전 단): {tr.miss.join(" · ")}</p>}
        {res.truncated ? <p className="note">근거 {String(res.truncated)}건이 상한에서 잘렸다</p> : null}
        {res.note && <p className="note">{res.note}</p>}
      </div>
      <div className="row wrap legend-inline">
        <span><span className="sw" style={{ background: COLOR.link }} /> 사전 링킹</span>
        <span><span className="sw" style={{ background: COLOR.pick }} /> LLM 선별</span>
        <span><span className="sw" style={{ background: COLOR.reach }} /> 확장으로 닿음</span>
        <a href="#" onClick={(e) => { e.preventDefault(); onClear(); }}>겹쳐 보기 지우기</a>
      </div>
      {offscreen > 0 && <p className="note warn" data-testid="q-offscreen">화면에 없는 노드 {offscreen}개</p>}

      <h3>ⓐ 링킹 {linking.length}</h3>
      <div className="chips" data-testid="q-linking">
        {linking.length === 0 && <span className="muted">(링킹 없음)</span>}
        {linking.map((l, i) => {
          const pick = l.method === PICK;
          return (
            <span key={`${l.node_id}-${i}`} data-item className={pick ? "chip pick" : "chip"}
                  title={pick ? `${l.where ?? ""}${l.why ? " — " + l.why : ""}` : undefined}
                  onClick={() => onChip(l.node_id)}>
              {l.canonical} [{l.layer}·{l.method}{pick && l.score !== undefined ? ` · ${l.score}` : ""}]
              {pick && l.why ? <span className="muted"> — {l.why}</span> : null}
            </span>
          );
        })}
      </div>

      <h3>ⓑ 확장 경로 {hopEdges.length}</h3>
      <div data-testid="q-hops" data-more={Math.max(0, hopEdges.length - HOP_EDGE_LIMIT)}>
        {hopEdges.length === 0 && <span className="muted">(확장 없음)</span>}
        {hopEdges.slice(0, HOP_EDGE_LIMIT).map(({ label, e }, i) => (
          <div key={i} data-item>{label} · {e.src_name ?? e.src} —{e.rel}→ {e.dst_name ?? e.dst}</div>
        ))}
        {hopEdges.length > HOP_EDGE_LIMIT && <div className="muted">… 엣지 {hopEdges.length - HOP_EDGE_LIMIT}개 더</div>}
      </div>

      <h3>ⓒ 그래프 사실 {facts.length} · 답에 씀 {facts.filter((f) => f.used).length}</h3>
      <div data-testid="q-facts">
        {facts.map((f, i) => (
          <div key={i} data-item className={f.used ? "card used" : "card"}>{f.used ? "✓ " : ""}{f.text}</div>
        ))}
      </div>

      <h3>ⓓ 노드 근거 청크 {coll.length} · 답에 씀 {coll.filter((c) => c.used).length}</h3>
      <div data-testid="q-collection">
        {coll.map((c, i) => {
          const head = `${c.doc_id} ${c.source_locator ?? ""} · tier ${c.tier ?? "—"}`
            + (c.channel && c.channel !== "describes" ? ` · ${c.channel === "ref" ? "관련 원문" : "관련 링크"}` : "")
            + (c.kept === false ? " · 상한에서 잘림" : "") + (c.used ? " · ✓ 답에 씀" : "");
          return (
            <ChunkCard key={i} head={head} text={texts.get(c.chunk_id) ?? "(상한에서 잘려 원문을 싣지 않았다)"}
                       cls={(c.kept === false ? "dropped" : "") + (c.used ? " used" : "")}
                       onOpen={() => onOpenDoc(c.doc_id)} />
          );
        })}
      </div>

      <h3>ⓔ 문서 검색 {ds.length} · 답에 씀 {ds.filter((c) => c.used).length}</h3>
      <div data-testid="q-docsearch">
        {ds.length === 0 && <span className="muted">(문서 검색 0)</span>}
        {ds.map((c, i) => {
          const sc = [c.embed != null ? `임베딩 ${c.embed}` : "", c.bm25 != null ? `BM25 ${c.bm25}` : "",
                      c.ref ? "찾아볼 시트" : "", c.in_graph ? "노드 근거와 겹침" : "", c.used ? "✓ 답에 씀" : ""]
            .filter(Boolean).join(" · ");
          return (
            <ChunkCard key={i} head={`${c.rank ?? i + 1}. ${c.doc_id} ${c.source_locator ?? ""} · ${sc}`}
                       text={texts.get(c.chunk_id) ?? ""} cls={c.used ? "used" : ""}
                       onOpen={() => onOpenDoc(c.doc_id)} />
          );
        })}
      </div>

      <h3>ⓕ 짧은 답</h3>
      <div data-testid="q-answer">
        <pre className="card answer">{A.text ?? "—"}</pre>
        <div className="muted">
          모드 {A.mode ?? "—"} · 줄 {A.lines ?? "—"} · 쓴 사실 {facts.filter((f) => f.used).length}
          {" "}· 쓴 청크 {A.used_chunks ? A.used_chunks.length : "—"} · 출처 {A.sources ? A.sources.length : "—"}
        </div>
      </div>

      <h3>ⓖ 노드 원 레코드 {recs.length} · 닿은 노드 {res.records_total}</h3>
      <div data-testid="q-records">
        {recs.map((r, i) => {
          const also = Array.isArray(r.also) && r.also.length ? ` (겸 ${(r.also as string[]).join("·")})` : "";
          return (
            <details key={i} data-item className="card rec" open={openRecord !== null && r.node_id === openRecord}
                     ref={(el) => { if (el && r.node_id === openRecord) el.scrollIntoView({ block: "nearest" }); }}>
              <summary>[{String(r.role)}] {String(r.canonical)} — {String(r.layer)} · {String(r.category)}{also} · {String(r.status)}</summary>
              <pre className="src">{JSON.stringify(r, null, 1)}</pre>
            </details>
          );
        })}
      </div>
    </div>
  );
}

/** 원문 카드 — 머리 한 줄 + 접어 둔 원문(누르면 펼친다) · 「원본」은 문서 패널을 연다. */
export function ChunkCard({ head, text, cls, onOpen }: { head: string; text: string; cls?: string; onOpen: () => void }) {
  return (
    <details data-item className={`card ${cls ?? ""}`}>
      <summary>{head}</summary>
      <pre className="src">{text}</pre>
      <a href="#" onClick={(e) => { e.preventDefault(); onOpen(); }}>원본(문서)</a>
    </details>
  );
}
