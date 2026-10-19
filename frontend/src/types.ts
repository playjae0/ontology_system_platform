/* 시스템 응답의 모양 — 화면이 쓰는 칸만 적는다(명세 §4 · 칸 확인은 백엔드 `contract.py` 한 자리). */

export interface Health {
  home: string;
  mode: string;
  layers: string[];
  docs: number;
  doc_types: number;
}

export interface GNode {
  id: string;
  name: string;
  category: string | null;
  layer: string | null;
  status: string | null;
  tier: string | null;
  polarity: string | null;
  made_by: string | null;
  aliases: number;          // 개수다 — 별칭 글자는 없다
  attrs: number;            // 개수다 — 속성 값은 없다
  docs: string[];
  prov: string;             // provenance 앞 4개를 쉼표로 이은 글자
  queue: string | null;
}

export interface GEdge {
  id: string;
  src: string;
  dst: string;
  rel: string;
  layer: string | null;
  status: string | null;
  prov: string;
  cross: boolean;           // 층을 건너는 엣지
}

export interface Anchor {
  anchor: string;
  host: string;
  hops: number;
}

export interface Force {
  scaling?: number;
  gravity?: number;
  iterations?: number;
}

export interface Graph {
  nodes: GNode[];
  edges: GEdge[];
  layers: string[];
  rels: string[];
  anchor: Record<string, Anchor>;
  detached: { edgeless: string[]; island: string[] };
  roots: string[];
  explore_threshold: number;
  force: Force;
}

export interface SysStatus {
  vectors: { active: boolean };
  line: string;
}

export interface PlatformStatus {
  system_url: string;
  system_dir: string;
  system_commit: string | null;
  mode: string;
  allow_mock: boolean;
  missing: Record<string, string[]>;
  started_at: string;
}

/** 힘 배치의 지금 상태 — 머리 줄과 확인용 손잡이가 읽는다. */
export interface LayoutState {
  running: boolean;         // 워커가 반복을 돌고 있다
  paused: boolean;          // 사람이 「멈춤」을 눌렀다
  iterations: number;       // 이번 판에서 돈 반복 수
  max: number;              // 이번 판의 반복 상한(끌기 배치는 놓을 때까지 Infinity)
  kind: "layout" | "drag";  // 전체 배치 / 끌기 배치
}
