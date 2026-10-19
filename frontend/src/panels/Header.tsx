/* 머리 줄 — 시스템 모드 · 상태 루트 · 시스템 커밋 · 층 · 문서 수 · 보이는 노드/엣지 · 힘 상태 · 질의 벡터 준비 줄 (명세 §5.6). */
import type { Health, LayoutState, PlatformStatus } from "../types";
import { COOL_ITER } from "../graph/force";

interface Props {
  health: Health | null;
  platform: PlatformStatus | null;
  counts: { nodes: number; nodesAll: number; edges: number; edgesAll: number } | null;
  layout: LayoutState;
  vectorLine: string;
}

/** 시스템 커밋을 모르면(zip으로 받은 폴더) 폴더 이름을 보인다. */
function commitOrFolder(p: PlatformStatus | null): string {
  if (!p) return "—";
  if (p.system_commit) return p.system_commit;
  const parts = p.system_dir.split(/[\\/]/).filter(Boolean);
  return `${parts[parts.length - 1] ?? p.system_dir} (커밋 모름)`;
}

/** 힘 상태 — 전체 배치: 진행/쉼 + 반복 · 끌기 배치: 끌기(상한 없음 — 수를 보이지 않는다) → 식힘 n/300 → 쉼. 멈춤은 둘 다. */
function layoutWord(s: LayoutState): string {
  if (s.paused) return "멈춤";
  if (s.kind === "drag") {
    if (!s.running) return "쉼";
    if (!Number.isFinite(s.max)) return "끌기";
    const done = Math.max(0, COOL_ITER - (s.max - s.iterations));
    return `식힘 ${done}/${COOL_ITER}`;
  }
  if (!s.max) return "—";
  return `${s.running ? "진행" : "쉼"} — 반복 ${s.iterations}/${s.max}`;
}

// 머리 줄은 한 줄 · 높이가 늘 같다 — 힘 상태처럼 길이가 바뀌는 글자가 줄바꿈을 바꾸면 캔버스가 위아래로 뛰어
// 끄는 순간 노드가 손에서 빠진다(DECISIONS P-22). 긴 글자(상태 폴더 · 벡터 줄)는 줄여 보이고 전체는 툴팁에.
export function Header({ health, platform, counts, layout, vectorLine }: Props) {
  return (
    <header className="head">
      <span className="title">온톨로지 시스템 플랫폼</span>
      <span className="badge" data-testid="mode">모드 {health?.mode ?? "—"}</span>
      <span className="item shrink" title={`시스템 상태 루트 ${health?.home ?? ""}`}>상태 {health?.home ?? "—"}</span>
      <span className="item">시스템 {commitOrFolder(platform)}</span>
      <span className="item">층 {health ? health.layers.join(" · ") : "—"}</span>
      <span className="item">문서 {health?.docs ?? "—"}</span>
      <span className="item" data-testid="counts">
        {counts ? `노드 ${counts.nodes}/${counts.nodesAll} · 엣지 ${counts.edges}/${counts.edgesAll}` : "—"}
      </span>
      <span className="item layout-state" data-testid="layout-state">
        힘 {layoutWord(layout)}
      </span>
      <span className="item muted shrink vector" data-testid="vector-line" title={vectorLine}>{vectorLine || "벡터 —"}</span>
    </header>
  );
}
