/* 문서 패널 — `/api/doc/<doc_id>`의 판정 집계 · 대장 행 수 · 만든 노드 · 시트 역할 · 청크 · 원본 열기 (명세 §6.2 [P2]).
 *
 * 응답 그대로 싣는다. 원본은 `raw_rel`이 있으면 `/raw/<raw_rel>`(플랫폼이 시스템으로 중계), 없으면 안내 문장.
 */
import { useEffect, useState } from "react";

import { getJSON } from "../api";
import type { DocInfo } from "../types";
import { MissingCard } from "./MissingCard";

interface Props {
  docId: string;
  onBack: () => void;
  onPick: (nodeId: string) => void;
}

export function DocPanel({ docId, onBack, onPick }: Props) {
  const [doc, setDoc] = useState<DocInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    setDoc(null); setError(null); setMissing([]);
    getJSON<DocInfo>(`/api/doc/${encodeURIComponent(docId)}`).then((r) => {
      if (!alive) return;
      setMissing(r.missing);
      if (r.error) setError(`HTTP ${r.status} — ${r.error}`); else setDoc(r.data);
    });
    return () => { alive = false; };
  }, [docId]);

  const roles = Object.entries(doc?.sheet_roles ?? {});
  return (
    <div className="detail doc" data-testid="doc-panel">
      <a href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>← 노드 상세로</a>
      <h2>문서 {docId}</h2>
      {missing.length > 0 && <MissingCard missing={{ "/api/doc/<doc_id>": missing }} />}
      {error && <div className="card err" data-testid="doc-error">{error}</div>}
      {!doc && !error && <p className="muted">문서를 받는 중…</p>}
      {doc && (
        <>
          {doc.raw_rel
            ? <a href={`/raw/${doc.raw_rel.split("/").map(encodeURIComponent).join("/")}`} target="_blank"
                 rel="noreferrer" data-testid="doc-raw">원본 열기</a>
            : <p className="muted" data-testid="doc-raw-note">원본이 상태 폴더 raw/ 아래가 아니다</p>}

          <h3>판정 대장 <span data-testid="doc-rows">{doc.rows}</span>행</h3>
          <table data-testid="doc-tally">
            <tbody>
              {Object.entries(doc.tally).map(([k, v]) => (
                <tr key={k} data-tally-key={k}><td>{k}</td><td>{v}</td></tr>
              ))}
            </tbody>
          </table>

          <h3>만든 노드 <span data-testid="doc-nodes">{doc.nodes.length}</span></h3>
          {doc.nodes.map((n) => (
            <div key={n.id} className="adj">
              <a href="#" onClick={(e) => { e.preventDefault(); onPick(n.id); }}>{n.canonical}</a>
              <span className="muted"> [{n.layer}{n.category ? ` · ${n.category}` : ""}]</span>
            </div>
          ))}

          {roles.length > 0 && (
            <>
              <h3>시트 역할 {roles.length}</h3>
              {roles.map(([name, role]) => <div key={name} className="adj">{name} — {role}</div>)}
            </>
          )}

          <h3>청크 <span data-testid="doc-chunks">{doc.chunks.length}</span></h3>
          {doc.chunks.map((c) => (
            <details key={c.chunk_id} className="card">
              <summary>{c.source_locator ?? c.chunk_id}{c.sheet_role ? ` [${c.sheet_role}]` : ""}</summary>
              <pre className="src">{c.text ?? ""}</pre>
            </details>
          ))}
        </>
      )}
    </div>
  );
}
