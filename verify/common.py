# -*- coding: utf-8 -*-
"""verify 스크립트가 같이 쓰는 것 — 플랫폼 띄우기 · 프로세스 보기 · 결과 줄.

플랫폼을 사용자가 켜는 것과 같은 명령(`python run.py --system … [--allow-mock] --no-browser`)으로 띄운다.
"""
from __future__ import annotations

import json
import os
import re
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SYSTEM = (ROOT.parent / "ontology_system").resolve()
PLATFORM_URL = re.compile(r"플랫폼 주소 — (http://127\.0\.0\.1:\d+/)")
SYSTEM_PID = re.compile(r"시스템 서버를 끈다 \(pid (\d+)\)")


class Platform:
    """`run.py`를 자식으로 띄우고 출력을 모은다."""

    def __init__(self, system: Path, *flags: str):
        self.cmd = [sys.executable, "-u", "run.py", "--system", str(system), *flags]
        env = dict(os.environ, PYTHONIOENCODING="utf-8")
        # 따로인 세션으로 — 이 스크립트에 보내는 신호가 섞이지 않게(신호는 아래 send로만 보낸다).
        self.proc = subprocess.Popen(self.cmd, cwd=ROOT, env=env, stdout=subprocess.PIPE,
                                     stderr=subprocess.STDOUT, start_new_session=True)
        self.lines: list[str] = []
        self.url: str | None = None
        self._found = threading.Event()
        threading.Thread(target=self._pump, daemon=True).start()

    def _pump(self):
        for raw in self.proc.stdout:
            line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
            self.lines.append(line)
            m = PLATFORM_URL.search(line)
            if m:
                self.url = m.group(1)
                self._found.set()
        self._found.set()

    def wait_url(self, timeout=150) -> str | None:
        self._found.wait(timeout)
        return self.url

    def send(self, sig) -> int:
        self.proc.send_signal(sig)
        return self.proc.wait(timeout=30)

    def wait_exit(self, timeout=150) -> int:
        code = self.proc.wait(timeout=timeout)
        time.sleep(0.2)                      # 출력 끝까지
        return code

    def stop(self):
        if self.proc.poll() is None:
            self.send(signal.SIGTERM)

    def output(self) -> str:
        return "\n".join(self.lines)


def get_json(url: str, timeout=60):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def ps_table() -> list[tuple[int, int, str, str]]:
    """(pid, ppid, 상태, 명령) — `ps`로 본다(완료판정 ⓐ가 ps로 확인하라고 한다)."""
    out = subprocess.run(["ps", "-eo", "pid=,ppid=,stat=,args="], capture_output=True, text=True).stdout
    rows = []
    for ln in out.splitlines():
        parts = ln.split(None, 3)
        if len(parts) == 4:
            rows.append((int(parts[0]), int(parts[1]), parts[2], parts[3]))
    return rows


def live(pid: int) -> bool:
    """살아 있는가 — 좀비(Z)는 끝난 것으로 본다."""
    return any(p == pid and not stat.startswith("Z") for p, _pp, stat, _a in ps_table())


def system_viewers() -> set[int]:
    """지금 떠 있는 시스템 데이터 서버(`run.py viewer`) pid."""
    return {p for p, _pp, stat, a in ps_table() if "run.py viewer" in a and not stat.startswith("Z")}


class Report:
    """항목별 결과 줄 — 끝에 하나라도 FAIL이면 종료 코드 1."""

    def __init__(self):
        self.rows: list[tuple[str, bool, str]] = []

    def item(self, key: str, ok: bool, detail: str):
        self.rows.append((key, ok, detail))
        print(f"{key} {'PASS' if ok else 'FAIL'} — {detail}", flush=True)

    def finish(self) -> int:
        bad = [k for k, ok, _ in self.rows if not ok]
        print("\n== 결과 ==")
        for k, ok, d in self.rows:
            print(f"  {k} {'PASS' if ok else 'FAIL'}  {d}")
        print(f"  {'전부 PASS' if not bad else 'FAIL: ' + ', '.join(bad)}")
        return 1 if bad else 0
