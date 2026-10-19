/* 머리 줄 — 시스템 모드 · 상태 루트 · 시스템 커밋 · 층 · 문서 수 · 보이는 노드/엣지 · 힘 상태 · 질의 벡터 준비 줄 (명세 §5.6). */
import type { Health, LayoutState, PlatformStatus } from "../types";

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

function layoutWord(s: LayoutState): string {
  if (s.paused) return "멈춤";
  if (s.running) return "진행";
  return s.max ? "쉼" : "—";
}

export function Header({ health, platform, counts, layout, vectorLine }: Props) {
  return (
    <header className="head">
      <span className="title">온톨로지 시스템 플랫폼</span>
      <span className="badge" data-testid="mode">모드 {health?.mode ?? "—"}</span>
      <span className="item" title="시스템 상태 루트">상태 {health?.home ?? "—"}</span>
      <span className="item">시스템 {commitOrFolder(platform)}</span>
      <span className="item">층 {health ? health.layers.join(" · ") : "—"}</span>
      <span className="item">문서 {health?.docs ?? "—"}</span>
      <span className="item" data-testid="counts">
        {counts ? `노드 ${counts.nodes}/${counts.nodesAll} · 엣지 ${counts.edges}/${counts.edgesAll}` : "—"}
      </span>
      <span className="item" data-testid="layout-state">
        힘 {layoutWord(layout)}{layout.max ? ` — 반복 ${layout.iterations}/${layout.max}` : ""}
      </span>
      <span className="item muted" data-testid="vector-line">{vectorLine || "벡터 —"}</span>
    </header>
  );
}
