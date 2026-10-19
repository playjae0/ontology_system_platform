# -*- coding: utf-8 -*-
"""플랫폼 라우트 — 얇게 둔다. 시스템과 닿는 일은 `system_server.py`, 칸 확인은 `contract.py`가 한다.

    /                 화면(frontend/dist)
    /api/* · /raw/*   시스템 데이터 서버로 그대로 넘긴다(GET · 상태·본문·Content-Type 그대로)
    /platform/status  플랫폼 쪽 상태
"""
from __future__ import annotations

from pathlib import Path
from urllib.parse import quote

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from backend import contract
from backend.system_server import SystemServer


def create_app(server: SystemServer, status: dict, dist: Path) -> FastAPI:
    """`status`는 `/platform/status`가 내는 dict다 — 중계가 빠진 칸을 `status["missing"]`에 고쳐 적는다."""
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    @app.get("/platform/status")
    def platform_status():
        return status

    def relay(request: Request) -> Response:
        # 경로·쿼리의 퍼센트 인코딩을 그대로 넘긴다 — 풀었다 다시 싸면 `%2F` 같은 글자가 바뀐다.
        path = request.scope.get("raw_path", request.url.path.encode()).decode("latin-1")
        query = request.scope.get("query_string", b"").decode("latin-1")
        code, ctype, body = server.get(path + ("?" + query if query else ""))
        headers = {}
        address = contract.address_of(request.url.path)
        if address:
            missing = contract.check(address, body, code)     # 오류 응답이면 확인하지 않고 빈 목록
            if code < 400:
                status["missing"][address] = missing          # 오류 응답은 지난 확인을 그대로 둔다
            if missing:
                # 헤더는 latin-1만 실린다 — 칸 이름(예: `정의`)을 UTF-8 퍼센트 인코딩으로 싣는다(DECISIONS P-04).
                headers["X-Platform-Missing"] = ",".join(quote(m, safe="[]._") for m in missing)
        return Response(content=body, status_code=code, media_type=ctype, headers=headers)

    app.add_api_route("/api/{rest:path}", relay, methods=["GET"])
    app.add_api_route("/raw/{rest:path}", relay, methods=["GET"])

    # 화면 — 위 라우트에 안 걸린 나머지 전부(맨 뒤에 붙인다).
    app.mount("/", StaticFiles(directory=dist, html=True), name="screen")
    return app
