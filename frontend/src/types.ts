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

/* ── P2 — 질의 · 노드 근거 · 문서 · 연결 현황 (명세 §4 · §6) ───────────────────────── */

export interface QueryStatus {
  query: { active: boolean; question: string | null; stage: string | null; seen: string[]; elapsed: number };
  vectors: { active: boolean; made?: number };
  stages: string[];
  line: string;
}

export interface Linking {
  surface?: string;
  node_id: string;
  layer: string | null;
  canonical: string;
  method: string;           // 시스템 어휘 — 사전 / 임베딩 후보 + LLM 선별(`embed+llm`)
  score?: number;
  where?: string;
  why?: string;
}

export interface HopEdge {
  src: string; rel: string; dst: string;
  src_name?: string; dst_name?: string;
  layer?: string; bridge?: boolean;
}

export interface Hop {
  label: string;
  kind?: string;
  nodes: string[];
  edges: HopEdge[];
}

export interface Trace {
  intent: string | null;
  linking: Linking[];
  link_stage: { mode?: string; candidates?: unknown[] } | null;
  hops: Hop[];
  facts: { key?: number; text: string; used?: boolean }[];
  collection: { chunk_id: string; doc_id: string; source_locator?: string; tier?: number; rank?: number;
                kept?: boolean; used?: boolean; channel?: string; via_node?: string }[];
  doc_search: { chunk_id: string; doc_id: string; source_locator?: string; rank?: number; embed?: number | null;
                bm25?: number | null; ref?: boolean; in_graph?: boolean; used?: boolean }[];
  answer: { text?: string; mode?: string; lines?: number; sources?: unknown[]; used_chunks?: unknown[] } | null;
  miss: string[];
}

export interface ChunkText { chunk_id: string; doc_id?: string; text?: string }

export interface QueryResult {
  question: string;
  path: string;
  linked_nodes: unknown[];
  facts: unknown[];
  chunks: ChunkText[];
  doc_search: ChunkText[];
  related?: ChunkText[];     // 「관련 원문」 청크가 있을 때만 온다
  records: Record<string, unknown>[];
  records_total: number;
  truncated: number | boolean;
  note: string | null;
  trace: Trace;
}

export interface NodeEvidence {
  id: string;
  name: string;
  anchor_path: { anchor: string; anchor_name: string; hops: number;
                 steps: { rel: string; src: string; src_name: string; dst: string; dst_name: string }[] } | null;
  evidence: { chunk_id: string; doc_id: string; locator?: string; section?: string; image?: boolean; text?: string }[];
  evidence_total: number;
  landed: { doc_id: string; locator?: string; surface?: string; target?: string; verdict?: string; path?: string;
            from?: string | null; attached?: { rel: string; other: string; path?: string; dir?: string }[] }[];
}

export interface DocInfo {
  doc_id: string;
  registry: Record<string, unknown>;
  raw_rel: string | null;
  rows: number;
  tally: Record<string, number>;
  sheet_roles: Record<string, string>;
  nodes: { id: string; canonical: string; layer: string | null; category?: string; status?: string }[];
  chunks: { chunk_id: string; source_locator?: string; section?: string; text?: string; sheet_role?: string | null }[];
}

export interface Funnel {
  keys: string[];
  rows: Record<string, string | number>[];
  total: Record<string, string | number>;
  orphans: { doc_id: string; locator?: string; surface?: string; reason?: string; attempts?: number; at?: string }[];
  정의: string;
}
