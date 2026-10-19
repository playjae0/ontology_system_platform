import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 화면은 플랫폼 서버(127.0.0.1)가 내준다 — 외부 주소 0 · 빌드 산출 `dist/`를 레포에 넣는다(사내에는 Node가 없다).
export default defineConfig({
  plugins: [react()],
  base: "/",
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
  worker: { format: "iife" },
  server: {
    // 개발 중 `npm run dev`로 볼 때만 — 켜 둔 플랫폼으로 넘긴다.
    proxy: { "/api": "http://127.0.0.1:8800", "/raw": "http://127.0.0.1:8800", "/platform": "http://127.0.0.1:8800" },
  },
});
