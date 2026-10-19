# -*- coding: utf-8 -*-
"""시스템과 닿는 유일한 자리 — 띄우기 · 끄기 · 주소 읽기 · 중계 (명세 §3.1 · CLAUDE.md §2·§7).

시스템 코드는 불러오지(import) 않는다. 시스템 폴더에서 `python -u run.py viewer --no-browser --port N`을
자식 프로세스로 띄우고, 그 서버에 HTTP GET으로 묻는다. 시스템 상태 폴더에는 아무것도 쓰지 않는다.
(나중 회차: 명령 실행 `python run.py <명령> …`도 이 파일에 붙인다.)
"""
from __future__ import annotations

import http.client
import json
import os
import re
import signal
import socket
import subprocess
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

HOST = "127.0.0.1"
SYSTEM_PORT_FROM = 8765        # 시스템 뷰어의 기본 번호부터 빈 번호를 찾는다(DECISIONS P-02)
PORT_TRIES = 40                # 시스템 `_free_port`와 같은 폭
START_TIMEOUT = 120            # 주소 줄을 기다리는 초 — 사내 그래프가 크면 그래프를 읽고 나서 찍는다
QUERY_TIMEOUT = 600            # `/api/query` 10분
OTHER_TIMEOUT = 60             # 나머지 60초
STOP_GRACE = 5                 # 끌 때 기다리는 초 — 넘으면 강제로 끈다

URL_LINE = re.compile(r"\[viewer\] (http://127\.0\.0\.1:(\d+)/)")
DEAD = {"error": "시스템 서버가 꺼졌다 — 플랫폼을 다시 켜라"}


class SystemStartError(RuntimeError):
    """시스템 서버가 주소를 찍지 못했다 — 그때까지의 출력을 함께 든다."""

    def __init__(self, reason: str, output: list[str]):
        super().__init__(reason)
        self.reason = reason
        self.output = output


def free_port(start: int, tries: int = PORT_TRIES) -> int:
    """`start`부터 위로 훑어 127.0.0.1에서 비어 있는 첫 번호."""
    for port in range(start, start + tries):
        with socket.socket() as s:
            # 막 끈 서버의 번호(TIME_WAIT)도 빈 번호로 본다 — uvicorn이 이 옵션으로 연다. Windows에서는 이 옵션이
            # 쓰는 중인 번호까지 내주므로 켜지 않는다.
            if os.name != "nt":
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind((HOST, port))
                return port
            except OSError:
                continue
    raise SystemExit(f"[platform] {start}부터 {tries}개를 봤지만 빈 포트가 없다 — --port로 다른 번호를 준다")


def system_commit(system_dir: Path) -> str | None:
    """시스템 커밋 — 폴더에 `.git`이 있으면 `git rev-parse --short HEAD`, 없으면 None(사내는 zip일 수 있다)."""
    if not (system_dir / ".git").exists():
        return None
    try:
        out = subprocess.run(["git", "-C", str(system_dir), "rev-parse", "--short", "HEAD"],
                             capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return None
    if out.returncode != 0:
        return None
    return out.stdout.strip() or None


class SystemServer:
    """시스템 데이터 서버 자식 프로세스 하나 — 띄우고, 출력을 콘솔·로그에 흘리고, GET을 중계하고, 끈다."""

    def __init__(self, system_dir: Path, log_dir: Path):
        self.system_dir = system_dir
        self.log_path = log_dir / f"platform_{datetime.now():%Y-%m-%d}.log"
        self.proc: subprocess.Popen | None = None
        self.url: str | None = None
        self.port: int | None = None
        self._found = threading.Event()
        self._early: list[str] = []          # 주소 줄을 찾기 전까지의 출력 — 실패하면 그대로 보인다
        self._reader: threading.Thread | None = None
        self._log_lock = threading.Lock()
        log_dir.mkdir(parents=True, exist_ok=True)
        self._log = open(self.log_path, "a", encoding="utf-8")

    # ── 기록 ────────────────────────────────────────────────────────────────
    def note(self, line: str) -> None:
        """플랫폼 자신의 줄 — 콘솔과 로그에."""
        print(line, flush=True)
        self._write_log(line)

    def _write_log(self, line: str) -> None:
        with self._log_lock:
            self._log.write(f"{datetime.now():%H:%M:%S} {line}\n")
            self._log.flush()

    def _pump(self) -> None:
        """자식의 출력(표준 출력 + 표준 오류)을 끝까지 읽는다 — 안 읽으면 파이프가 차서 자식이 선다."""
        assert self.proc and self.proc.stdout
        for raw in self.proc.stdout:
            line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
            print(f"[system] {line}", flush=True)
            self._write_log(f"[system] {line}")
            if not self._found.is_set():
                self._early.append(line)
                m = URL_LINE.search(line)
                if m:
                    self.url, self.port = m.group(1), int(m.group(2))
                    self._found.set()

    # ── 띄우기 · 끄기 ───────────────────────────────────────────────────────
    def start(self) -> str:
        """자식을 띄우고 주소 줄을 읽는다. 못 읽으면 자식을 끄고 SystemStartError."""
        port = free_port(SYSTEM_PORT_FROM)
        cmd = [sys.executable, "-u", "run.py", "viewer", "--no-browser", "--port", str(port)]
        env = dict(os.environ)                       # 셸 그대로 물려준다(ONTO_HOME·USE_MOCK·게이트웨이 설정)
        env["PYTHONIOENCODING"] = "utf-8"            # 하나만 더한다 — cp949 파이프에서 시스템이 죽지 않게(명세 §3.1-1)
        # 자식은 따로인 프로세스 묶음으로 띄운다 — Ctrl+C는 플랫폼만 받고, 자식은 플랫폼이 끈다(끄는 순서를 한 자리로).
        group = ({"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt"
                 else {"start_new_session": True})
        self.note(f"[platform] 시스템 서버를 띄운다 — {self.system_dir} 에서 {' '.join(cmd[1:])}")
        self.proc = subprocess.Popen(cmd, cwd=self.system_dir, env=env, stdin=subprocess.DEVNULL,
                                     stdout=subprocess.PIPE, stderr=subprocess.STDOUT, **group)
        self._reader = threading.Thread(target=self._pump, name="system-output", daemon=True)
        self._reader.start()

        deadline = time.monotonic() + START_TIMEOUT
        while not self._found.wait(0.2):
            if self.proc.poll() is not None:
                self._reader.join(timeout=2)         # 남은 출력까지 모은다
                raise SystemStartError(
                    f"시스템 서버가 주소를 찍지 못하고 끝났다(종료 코드 {self.proc.returncode})", list(self._early))
            if time.monotonic() > deadline:
                self.stop()
                raise SystemStartError(f"시스템 서버가 {START_TIMEOUT}초 안에 주소를 찍지 않았다", list(self._early))
        return self.url

    def alive(self) -> bool:
        return self.proc is not None and self.proc.poll() is None

    def stop(self) -> None:
        """자식을 끈다 — 기다렸다가 안 끝나면 강제로. 남는 프로세스 0."""
        if self.proc is None or self.proc.poll() is not None:
            return
        self.note(f"[platform] 시스템 서버를 끈다 (pid {self.proc.pid})")
        try:
            if os.name == "nt":
                self.proc.terminate()
            else:
                os.killpg(self.proc.pid, signal.SIGTERM)   # 자식이 만든 손자까지 한 묶음으로
            self.proc.wait(timeout=STOP_GRACE)
        except (subprocess.TimeoutExpired, ProcessLookupError, PermissionError):
            if self.proc.poll() is None:
                self.proc.kill()
                self.proc.wait(timeout=STOP_GRACE)
        if self._reader:
            self._reader.join(timeout=2)

    def close(self) -> None:
        self.stop()
        with self._log_lock:
            self._log.close()

    # ── 중계 ────────────────────────────────────────────────────────────────
    def get(self, target: str) -> tuple[int, str, bytes]:
        """시스템 서버에 GET — `(상태, Content-Type, 본문)`. `target`은 퍼센트 인코딩이 그대로인 경로+쿼리다.

        자식이 죽었으면 502와 명세 §3.1-6의 문면. 시간을 넘기면 504(DECISIONS P-03).
        """
        if not self.alive():
            return 502, "application/json; charset=utf-8", _json(DEAD)
        timeout = QUERY_TIMEOUT if target.split("?", 1)[0] == "/api/query" else OTHER_TIMEOUT
        conn = http.client.HTTPConnection(HOST, self.port, timeout=timeout)
        try:
            conn.request("GET", target)
            resp = conn.getresponse()
            return resp.status, resp.getheader("Content-Type", "application/octet-stream"), resp.read()
        except (socket.timeout, TimeoutError):
            return 504, "application/json; charset=utf-8", _json(
                {"error": f"시스템 서버가 {timeout}초 안에 답하지 않았다"})
        except (OSError, http.client.HTTPException) as e:
            if not self.alive():
                return 502, "application/json; charset=utf-8", _json(DEAD)
            return 502, "application/json; charset=utf-8", _json(
                {"error": f"시스템 서버 중계 실패 — {type(e).__name__}: {e}"})
        finally:
            conn.close()

    def get_json(self, target: str) -> tuple[int, object]:
        """켤 때 쓰는 GET — `(상태, 푼 JSON)`. JSON이 아니면 `{"error": 본문}`."""
        status, _ctype, body = self.get(target)
        try:
            return status, json.loads(body)
        except ValueError:
            return status, {"error": body.decode("utf-8", errors="replace")}


def _json(obj) -> bytes:
    return json.dumps(obj, ensure_ascii=False).encode("utf-8")
