/* 그리기 장치 — WebGL이 알려 주는 장치 이름으로 GPU인지 소프트웨어인지 가른다(명세 §5.7 [P3]).
 *
 * 사내 PC에는 따로 꽂는 그래픽 카드가 없어 그리기가 소프트웨어일 수 있다. 머리 줄에 보이고, 첫 화면 규칙(§5.4)이 쓴다.
 */
export interface Renderer {
  name: string | null;        // 장치 이름 — 못 읽으면 null
  software: boolean | null;   // 못 읽으면 null(「—」)
}

/** 장치 이름에 이 낱말이 있으면 소프트웨어 그리기다(명세 §5.7). */
const SOFTWARE = /swiftshader|llvmpipe|basic render|software/i;

export function detectRenderer(): Renderer {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return { name: null, software: null };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "") : "";
    gl.getExtension("WEBGL_lose_context")?.loseContext();     // 잰 뒤 바로 놓는다 — 문맥 수에 상한이 있다
    if (!name) return { name: null, software: null };
    return { name, software: SOFTWARE.test(name) };
  } catch {
    return { name: null, software: null };
  }
}

export const rendererWord = (r: Renderer | null) =>
  !r || r.software === null ? "—" : r.software ? "소프트웨어" : "GPU";
