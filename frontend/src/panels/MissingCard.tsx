/* 「시스템이 바뀌어 화면이 못 따라간다」 카드 — 응답 헤더 `X-Platform-Missing`이 오면 보인다(명세 §2-6 · §4). */

export function MissingCard({ missing }: { missing: Record<string, string[]> }) {
  const rows = Object.entries(missing).filter(([, m]) => m.length);
  if (!rows.length) return null;
  return (
    <div className="missing-card" role="alert" data-testid="missing-card">
      <strong>시스템이 바뀌어 화면이 못 따라간다 — 빠진 칸:</strong>
      {rows.map(([path, m]) => (
        <div key={path}><code>{path}</code> {m.join(", ")}</div>
      ))}
    </div>
  );
}
