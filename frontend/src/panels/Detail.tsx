/* 노드 상세 — 그래프 노드 칸과 인접 엣지 (명세 §5.5 [P1]). 근거(`/api/node`)는 P2다.
 *
 * 값은 `/api/graph`가 준 그대로 싣는다 — `aliases`·`attrs`는 개수, `prov`는 앞 4개를 이은 글자 그대로다.
 */
import { useMemo } from "react";

import type { GEdge, GNode, Graph } from "../types";
import { nodeShown } from "../graph/style";

interface Props {
  graph: Graph | null;
  selected: string | null;
  onPick: (id: string) => void;
}

/** [칸 이름, 보이는 이름] — 화면 표기와 확인 스크립트가 같은 칸 이름(`data-field`)을 쓴다. */
const FIELDS: [keyof GNode, string][] = [
  ["layer", "layer"], ["category", "category"], ["status", "status"], ["tier", "tier"],
  ["polarity", "polarity"], ["made_by", "made_by"], ["aliases", "별칭 수"], ["attrs", "속성 수"],
  ["queue", "큐"], ["id", "id"], ["prov", "provenance"],
];

const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

export function Detail({ graph, selected, onPick }: Props) {
  const byId = useMemo(() => new Map((graph?.nodes ?? []).map((n) => [n.id, n])), [graph]);
  const node = selected ? byId.get(selected) : undefined;
  const adjacent: GEdge[] = useMemo(
    () => (graph && selected ? graph.edges.filter((e) => e.src === selected || e.dst === selected) : []),
    [graph, selected]);

  if (!graph || !node) return <p className="muted">노드를 누르면 상세가 뜬다.</p>;

  return (
    <div className="detail" data-testid="detail">
      <h2 data-testid="detail-name">{node.name}</h2>
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
    </div>
  );
}
