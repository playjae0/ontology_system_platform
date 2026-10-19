/* 플랫폼 백엔드에 묻는다 — 상태 코드와 「빠진 칸」 헤더를 함께 돌려준다.
 *
 * 오류(HTTP ≥ 400 또는 본문에 `error`)는 고치지 않고 그대로 화면에 싣는다(명세 §2-6).
 * 빠진 칸은 백엔드가 `X-Platform-Missing`에 UTF-8 퍼센트 인코딩 · 쉼표로 이어 싣는다(DECISIONS P-04).
 */

export interface Got<T> {
  status: number;
  data: T;
  error: string | null;     // 서버 문면 그대로
  missing: string[];        // 응답에서 빠진 칸 — 비면 다 있다
}

export async function getJSON<T>(path: string): Promise<Got<T>> {
  let r: Response;
  try {
    r = await fetch(path);
  } catch (err) {
    return { status: 0, data: {} as T, error: `플랫폼 서버에 닿지 못했다 — ${err}`, missing: [] };
  }
  const head = r.headers.get("X-Platform-Missing");
  const missing = head ? head.split(",").map((s) => decodeURIComponent(s)) : [];
  const text = await r.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { status: r.status, data: {} as T, error: text || `HTTP ${r.status}`, missing };
  }
  const body = data as { error?: unknown };
  const error = r.status >= 400 || (body && typeof body === "object" && "error" in body)
    ? String(body?.error ?? text) : null;
  return { status: r.status, data: data as T, error, missing };
}
