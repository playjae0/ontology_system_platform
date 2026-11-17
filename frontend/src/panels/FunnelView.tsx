/* 연결 현황 — `/api/funnel`: 표 위에 정의 문장 · 문서마다 깔때기 표 + 합계 · 열린 orphan 행 (명세 §6.3 [P2]).
 *
 * 응답 그대로 싣는다 — 열 이름은 `keys`, 합계는 `total`(화면이 다시 더하지 않는다).
 */
import { useEffect, useState } from "react";

import { getJSON } from "../api";
import type { Funnel } from "../types";
import { MissingCard } from "./MissingCard";

export function FunnelView() {
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    getJSON<Funnel>("/api/funnel").then((r) => {
      if (!alive) return;
      setMissing(r.missing);
      if (r.error) setError(`HTTP ${r.status} — ${r.error}`); else setFunnel(r.data);
    });
    return () => { alive = false; };
  }, []);

  return (
    <div className="funnel" data-testid="funnel">
      <h2>연결 현황</h2>
      {missing.length > 0 && <MissingCard missing={{ "/api/funnel": missing }} />}
      {error && <div className="card err" data-testid="funnel-error">{error}</div>}
      {!funnel && !error && <p className="muted">연결 현황을 받는 중…</p>}
      {funnel && (
        <>
          <p className="note" data-testid="funnel-def">{funnel.정의}</p>
          <table className="grid">
            <thead>
              <tr><th>문서</th>{funnel.keys.map((k) => <th key={k}>{k}</th>)}</tr>
            </thead>
            <tbody>
              {funnel.rows.map((r) => (
                <tr key={String(r.doc_id)} data-testid="funnel-row">
                  <td>{String(r.doc_id)}</td>{funnel.keys.map((k) => <td key={k}>{String(r[k] ?? "—")}</td>)}
                </tr>
              ))}
              <tr className="total" data-testid="funnel-total">
                <th>합계</th>{funnel.keys.map((k) => <th key={k} data-key={k}>{String(funnel.total[k] ?? "—")}</th>)}
              </tr>
            </tbody>
          </table>
          <h3>열린 orphan 행 {funnel.orphans.length}</h3>
          {funnel.orphans.length === 0 && <p className="muted">열린 orphan 행 0</p>}
          {funnel.orphans.map((o, i) => (
            <div key={i} className="card" data-testid="funnel-orphan">
              {o.doc_id} · {o.locator ?? ""} · {o.surface ?? ""} · {o.reason ?? ""} · 재시도 {o.attempts ?? 0}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
