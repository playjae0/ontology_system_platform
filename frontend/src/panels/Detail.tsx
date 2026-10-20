/* 노드 상세 — 그래프 노드 칸 · 인접 엣지(명세 §5.5 [P1]) + 근거 · 닻까지의 길 · 붙은 자리 · 나온 문서 · 이 노드로 질문([P2]).
 *
 * 그래프 칸은 `/api/graph`가 준 그대로 싣는다 — `aliases`·`attrs`는 개수, `prov`는 앞 4개를 이은 글자 그대로다.
 * 근거는 `/api/node/<id>`를 그대로 싣는다 — 시스템 뷰어 `explore.js`의 evidence 그리기를 참고했다(명세 §2-2).
 */
import { useEffect, useMemo, useState } from "react";

import { getJSON } from "../api";
import type { GEdge, GNode, Graph, NodeEvidence } from "../types";
import { nodeShown } from "../graph/style";
import { MissingCard } from "./MissingCard";

interface Props {
  graph: Graph | null;
  selected: string | null;
  onPick: (id: string) => void;
  onAsk: (name: string) => void;          // 「이 노드로 질문」 — 질문 칸에 넣고 질의 탭으로(전송은 사람이)
  onOpenDoc: (docId: string) => void;
}

/** [칸 이름, 보이는 이름] — 화면 표기와 확인 스크립트가 같은 칸 이름(`data-field`)을 쓴다. */
const FIELDS: [keyof GNode, string][] = [
  ["layer", "layer"], ["category", "category"], ["status", "status"], ["tier", "tier"],
  ["polarity", "polarity"], ["made_by", "made_by"], ["aliases", "별칭 수"], ["attrs", "속성 수"],
  ["queue", "큐"], ["id", "id"], ["prov", "provenance"],
];

/** `docs`의 이 값은 골격이라 문서가 아니다(명세 §4 — `/api/doc/seed`는 404). */
const SKELETON_DOC = "seed";

const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

export function Detail({ graph, selected, onPick, onAsk, onOpenDoc }: Props) {
  const byId = useMemo(() => new Map((graph?.nodes ?? []).map((n) => [n.id, n])), [graph]);
  const node = selected ? byId.get(selected) : undefined;
  const adjacent: GEdge[] = useMemo(
    () => (graph && selected ? graph.edges.filter((e) => e.src === selected || e.dst === selected) : []),
    [graph, selected]);

  if (!graph || !node) return <p className="muted">노드를 누르면 상세가 뜬다.</p>;

  const docs = node.docs.filter((d) => d !== SKELETON_DOC);
  return (
    <div className="detail" data-testid="detail">
      <h2 data-testid="detail-name">{node.name}</h2>
      <button onClick={() => onAsk(node.name)} data-testid="ask-node">이 노드로 질문</button>
      <table>
        <tbody>
          {FIELDS.map(([k, label]) => (
            <tr key={k}>
              <td>{label}</td>
              <td data-field={k}>{show(node[k])}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>나온 문서 {docs.length}</h3>
      {docs.length === 0 && <p className="muted">(골격만 — 나온 문서 없음)</p>}
      {docs.map((d) => (
        <span key={d} className="chip" data-testid="node-doc" onClick={() => onOpenDoc(d)}>{d}</span>
      ))}

      <h3>인접 엣지 <span data-testid="adjacent-count">{adjacent.length}</span></h3>
      {adjacent.map((e) => {
        const out = e.src === node.id;
        const otherId = out ? e.dst : e.src;
        const other = byId.get(otherId);
        const onScreen = other ? nodeShown(other, graph.anchor) : false;
        return (
          <div className="adj" key={e.id} data-testid="adjacent">
            <span className="muted">{out ? "→" : "←"}</span>{" "}
            <span className={e.cross ? "rel cross" : "rel"}>{e.rel}</span>{" "}
            <a href="#" onClick={(ev) => { ev.preventDefault(); onPick(otherId); }}>
              {other ? other.name : otherId}
            </a>
            {!onScreen && <span className="muted"> (화면에 없음)</span>}
          </div>
        );
      })}

      <Evidence id={node.id} onOpenDoc={onOpenDoc} />
    </div>
  );
}

/** `/api/node/<id>` — 닻까지의 길 · 근거 원문 · 문서마다 붙은 자리(명세 §5.5 [P2]). */
function Evidence({ id, onOpenDoc }: { id: string; onOpenDoc: (docId: string) => void }) {
  const [ev, setEv] = useState<NodeEvidence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;                       // 빨리 다른 노드를 누르면 늦게 온 답은 버린다
    setEv(null); setError(null); setMissing([]);
    getJSON<NodeEvidence>(`/api/node/${encodeURIComponent(id)}`).then((r) => {
      if (!alive) return;
      setMissing(r.missing);
      if (r.error) setError(`HTTP ${r.status} — ${r.error}`); else setEv(r.data);
    });
    return () => { alive = false; };
  }, [id]);

  if (error) return <div className="card err" data-testid="evidence-error">{error}</div>;
  if (!ev) return <p className="muted">근거를 받는 중…</p>;
  const ap = ev.anchor_path;
  return (
    <div data-testid="evidence">
      {missing.length > 0 && <MissingCard missing={{ "/api/node/<id>": missing }} />}
      <h3>닻까지의 길 <span data-testid="anchor-steps">{ap ? ap.steps.length : 0}</span>단계</h3>
      {!ap && <p className="muted">닻 없음 — 골격에 닿는 엣지가 없다(연결 없는 노드)</p>}
      {ap && ap.steps.length === 0 && <p className="muted">골격 노드다</p>}
      {ap && ap.steps.length > 0 && (
        <div className="card">
          <div>닻 {ap.anchor_name} · {ap.hops}홉</div>
          {ap.steps.map((s, i) => <div key={i}>{s.src_name} —{s.rel}→ {s.dst_name}</div>)}
        </div>
      )}

      <h3>근거 원문 <span data-testid="evidence-count">{ev.evidence.length}</span> / {ev.evidence_total}</h3>
      {ev.evidence.length === 0 && <p className="muted">(근거 청크 없음)</p>}
      {ev.evidence.map((c) => (
        <details key={c.chunk_id} className="card" data-testid="evidence-item">
          <summary>{c.doc_id} · {c.locator ?? c.chunk_id}{c.section ? ` · ${c.section}` : ""}{c.image ? " · 그림 요약" : ""}</summary>
          <pre className="src">{c.text ?? ""}</pre>
          <a href="#" onClick={(e) => { e.preventDefault(); onOpenDoc(c.doc_id); }}>원본(문서)</a>
        </details>
      ))}
      {ev.evidence_total > ev.evidence.length && (
        <p className="muted">{ev.evidence_total - ev.evidence.length}건 더 — 시스템 CLI로 본다</p>
      )}

      <h3>붙은 자리 {ev.landed.length}</h3>
      {ev.landed.map((r, i) => (
        <div key={i} className="card">
          <div>{r.doc_id} · {r.locator ?? ""} · {r.surface ?? ""} → {r.target ?? "—"}
            {" "}[{r.verdict ?? "—"} · {r.path ?? "—"}{r.from ? ` · 소속 출처 ${r.from}` : ""}]</div>
          {(r.attached ?? []).map((a, j) => (
            <div key={j} className="muted">└ {a.rel} {a.dir ?? "→"} {a.other} ({a.path ?? ""})</div>
          ))}
        </div>
      ))}
    </div>
  );
}
