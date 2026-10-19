/* 그림의 약속 — 색 · 크기 · 라벨 · 보이기. 화면 어디서나 이 한 자리에서 정한다.
 *
 * 색·크기·라벨 계단은 시스템 뷰어 `cli/viewer/static/render.js`(4af5505)의 그리기 코드를 옮겨 왔다(명세 §2-2).
 * 층·카테고리·관계 이름은 여기에 없다 — 전부 데이터에서 읽는다(CLAUDE.md §7).
 */
import type { GEdge, GNode } from "../types";

/* 값 → 색: 결정적이다(같은 값이면 어느 실행에서나 같은 색). 16진으로 낸다 — WebGL 색 파서가 hsl()을 못 읽는다. */
function hslHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function colorOf(v: string): string {
  let h = 0;
  for (let i = 0; i < v.length; i++) h = (h * 31 + v.charCodeAt(i)) % 360;
  return hslHex(h, 0.62, 0.48);
}

/** 색 축 — 이 여섯 칸 중 하나의 값으로 칠한다(기본 category · 명세 §5.2). */
export const AXES = ["layer", "category", "status", "tier", "polarity", "made_by"] as const;
export type Axis = (typeof AXES)[number];
export const axisValue = (n: GNode, ax: Axis): string =>
  n[ax] == null || n[ax] === "" ? "—" : String(n[ax]);

/* 크기 — tier 계단(main > sub > detail > 골격 밖). 라벨 글자도 같은 계단. */
export const TIER_SIZE: Record<string, number> = { main: 16, sub: 10, detail: 6 };
export const SIZE_OTHER = 4;
const TIER_LABEL: Record<string, number> = { main: 1.45, sub: 1.15, detail: 1.0 };
const LABEL_OTHER = 0.9;
export const sizeOf = (n: GNode) => (n.tier && TIER_SIZE[n.tier]) || SIZE_OTHER;
export const labelScaleOf = (n: GNode) => (n.tier && TIER_LABEL[n.tier]) || LABEL_OTHER;

/* 라벨 — 이름 사슬의 끝 조각(`a::b::c` → `c`). */
export function shortName(name: string): string {
  const s = String(name ?? ""), i = s.lastIndexOf("::");
  return i >= 0 ? s.slice(i + 2) : s;
}

/* 골격 노드는 시스템 어휘 `status = seed`다(명세 §2-7 — 써도 되는 어휘). */
export const isSkeleton = (n: GNode) => n.status === "seed";

/* 보이기 — 판정은 이 두 함수뿐이다(그리기 · 머리 줄의 수 · 확인용 손잡이가 같이 쓴다). */
/** 닻에 없는 노드(연결 없는 노드)는 숨긴다(명세 §5.3 [P1]). */
export const nodeShown = (n: GNode, anchor: Record<string, unknown>) => n.id in anchor;
/** 층을 건너는 엣지는 관계 토글과 무관하게 언제나 그린다(명세 §5.2). */
export const edgeShown = (e: GEdge, rels: Set<string>) => e.cross || rels.has(e.rel);

/* 색 — 테마는 밝은 것 하나다(명세 §5.2). CSS 변수와 같은 값이다(styles.css :root). */
export const COLOR = {
  fg: "#14171c",
  dim: "#5b6472",
  faint: "#d5d9e0",
  line: "#b9c0ca",
  cross: "#7b3fa8",        // 층을 건너는 엣지 — 곡선 + 이 색
  border: "#14171c",       // 골격 노드 테두리
};

/* 글꼴 — 시스템 글꼴만(외부 폰트를 내려받지 않는다). */
export const FONT = '"Malgun Gothic", "맑은 고딕", "Noto Sans KR", "Apple SD Gothic Neo", system-ui, sans-serif';
