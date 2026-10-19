# -*- coding: utf-8 -*-
"""플랫폼 진입점 — 명령 하나로 시스템 데이터 서버와 플랫폼을 함께 켠다(명세 §3.1).

    python run.py --system <시스템 폴더> [--port N] [--allow-mock] [--no-browser]

1. 시스템 데이터 서버를 자식으로 띄운다(시스템 폴더에서 `python -u run.py viewer --no-browser --port N`).
2. 그 출력에서 `[viewer] http://127.0.0.1:<포트>/` 줄을 찾아 주소를 읽는다.
3. `/api/health`의 `mode`가 `"mock"`이고 `--allow-mock`이 없으면 거부하고 멈춘다.
4. `/api/health`·`/api/graph`의 칸을 확인한다 — 빠지면 빠진 칸을 찍고 멈춘다.
5. 플랫폼 주소를 찍고(기본으로 브라우저를 연다), 끝날 때(Ctrl+C·SIGTERM·오류) 시스템 서버도 끈다.
"""
from __future__ import annotations

import argparse
import signal
import sys
import threading
import time
import webbrowser
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "frontend" / "dist"

# 종료 코드
EXIT_START = 1        # 시스템 서버를 못 띄웠다
EXIT_MOCK = 2         # 시스템이 mock인데 --allow-mock이 없다
EXIT_MISSING = 3      # 화면이 쓰는 칸이 빠졌다

MOCK_REFUSAL = "시스템이 mock 모드로 떠 있다 — 사내 데이터가 아니다. 개발 중이면 --allow-mock"


def parse_args(argv):
    p = argparse.ArgumentParser(description="온톨로지 시스템 플랫폼 — 시스템 데이터 서버와 화면을 함께 켠다")
    p.add_argument("--system", required=True, help="시스템 코드 폴더(run.py가 있는 곳)")
    p.add_argument("--port", type=int, default=8800, help="플랫폼 포트(기본 8800 · 차 있으면 다음 빈 번호)")
    p.add_argument("--allow-mock", action="store_true", help="시스템이 mock이어도 연다 — 개발 세션만")
    p.add_argument("--no-browser", action="store_true", help="브라우저를 열지 않는다")
    return p.parse_args(argv)


def _raise_interrupt(signum, frame):
    """SIGTERM을 Ctrl+C와 같은 길로 — `finally`에서 시스템 서버를 끈다."""
    raise KeyboardInterrupt


def main(argv=None) -> int:
    # 콘솔이 cp949여도 시스템 출력의 「—」 같은 글자에서 죽지 않게 — 못 싣는 글자는 바꿔 찍는다.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")
        except (AttributeError, ValueError):
            pass
    args = parse_args(argv)
    system_dir = Path(args.system).resolve()
    if not (system_dir / "run.py").is_file():
        print(f"[platform] 시스템 폴더에 run.py가 없다 — {system_dir}")
        return EXIT_START
    if not (DIST / "index.html").is_file():
        print(f"[platform] 화면 파일이 없다 — {DIST / 'index.html'} (frontend에서 빌드한 dist를 넣는다)")
        return EXIT_START

    # 시스템 코드를 부르지 않는다 — 여기서 부르는 것은 플랫폼 자신의 backend뿐이다.
    from backend import contract
    from backend.app import create_app
    from backend.system_server import SystemServer, SystemStartError, free_port, system_commit

    signal.signal(signal.SIGTERM, _raise_interrupt)
    server = SystemServer(system_dir, ROOT / "logs")
    try:
        try:
            system_url = server.start()
        except SystemStartError as e:
            server.note(f"[platform] {e.reason} — 그때까지의 출력:")
            for line in e.output:
                print(line)
            return EXIT_START
        server.note(f"[platform] 시스템 서버 주소 — {system_url}")

        _code, health = server.get_json("/api/health")
        mode = health.get("mode") if isinstance(health, dict) else None
        if mode == "mock" and not args.allow_mock:
            server.note(f"[platform] {MOCK_REFUSAL}")
            return EXIT_MOCK

        missing: dict[str, list[str]] = {}
        for address in ("/api/health", "/api/graph"):
            code, body = (_code, health) if address == "/api/health" else server.get_json(address)
            if contract.is_error(body, code):
                server.note(f"[platform] 시스템이 {address}에 오류로 답했다 — {body.get('error')}")
                return EXIT_START
            missing[address] = contract.check(address, body, code)
        lacking = {a: m for a, m in missing.items() if m}
        if lacking:
            server.note("[platform] 시스템이 바뀌어 화면이 못 따라간다 — 빠진 칸:")
            for address, names in lacking.items():
                server.note(f"  {address}: {', '.join(names)}")
            return EXIT_MISSING

        status = {
            "system_url": system_url,
            "system_dir": str(system_dir),
            "system_commit": system_commit(system_dir),
            "mode": mode,
            "allow_mock": args.allow_mock,
            "missing": missing,
            "started_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        }
        port = free_port(args.port)
        app = create_app(server, status, DIST)
        return serve(server, app, port, open_browser=not args.no_browser)
    except KeyboardInterrupt:
        server.note("[platform] 멈췄다")
        return 0
    finally:
        server.close()


def serve(server, app, port: int, open_browser: bool) -> int:
    """플랫폼 서버를 127.0.0.1에만 연다. 돌아오면(Ctrl+C·SIGTERM) 부른 쪽이 시스템 서버를 끈다."""
    import uvicorn

    web = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    url = f"http://127.0.0.1:{port}/"

    def announce():
        while not web.started and not web.should_exit:
            time.sleep(0.05)
        if web.started:
            server.note(f"[platform] 플랫폼 주소 — {url}   (Ctrl+C로 멈춘다 · 시스템 서버도 함께 끈다)")
            if open_browser:
                webbrowser.open(url)

    threading.Thread(target=announce, name="announce", daemon=True).start()
    web.run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
