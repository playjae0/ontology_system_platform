# -*- coding: utf-8 -*-
"""P1 완료판정 ⓐ 명령 하나 · ⓑ mock 거부 — 프로세스로 잰다.

    python verify/p1_process.py [--system ../ontology_system]

ⓐ `--allow-mock --no-browser`로 켜면 시스템 서버와 플랫폼이 뜨고 플랫폼 주소가 찍힌다.
   Ctrl+C(SIGINT) · SIGTERM 뒤 시스템 서버 프로세스가 남지 않는다(ps).
ⓑ `--allow-mock` 없이 켜면 거부 문면 · 종료 코드 ≠ 0 · 시스템 서버도 꺼져 있다.
"""
from __future__ import annotations

import argparse
import signal
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DEFAULT_SYSTEM, SYSTEM_PID, Platform, Report, get_json, live, ps_table, system_viewers  # noqa: E402

REFUSAL = "시스템이 mock 모드로 떠 있다 — 사내 데이터가 아니다. 개발 중이면 --allow-mock"


def one_command(rep: Report, system: Path, sig, name: str):
    before = system_viewers()
    plat = Platform(system, "--allow-mock", "--no-browser")
    url = plat.wait_url()
    if not url:
        plat.stop()
        rep.item(f"ⓐ-{name}", False, f"플랫폼 주소가 찍히지 않았다:\n{plat.output()}")
        return
    kids = [p for p, pp, _s, a in ps_table() if pp == plat.proc.pid and "run.py viewer" in a]
    code, st = get_json(url + "platform/status")
    hcode, health = get_json(url + "api/health")
    print(f"  [{name}] 플랫폼 {url} · pid {plat.proc.pid} · 시스템 서버 pid {kids} · "
          f"/platform/status {code} system_url={st.get('system_url')} · /api/health {hcode} mode={health.get('mode')}")
    exit_code = plat.send(sig)
    gone = [k for k in kids if not live(k)]
    after = system_viewers() - before
    ok = (bool(kids) and len(gone) == len(kids) and not after and code == 200 and hcode == 200
          and not live(plat.proc.pid))
    rep.item(f"ⓐ-{name}", ok,
             f"주소 찍힘 {url} · 시스템 서버 {kids} → {name} 뒤 남은 것 {[k for k in kids if live(k)]} · "
             f"새로 남은 run.py viewer {sorted(after)} · 플랫폼 종료 코드 {exit_code}")
    tail = [ln for ln in plat.lines if ln.startswith("[platform]")][-3:]
    print("    " + "\n    ".join(tail))


def mock_refusal(rep: Report, system: Path):
    before = system_viewers()
    plat = Platform(system, "--no-browser")
    code = plat.wait_exit()
    out = plat.output()
    m = SYSTEM_PID.search(out)
    child = int(m.group(1)) if m else None
    after = system_viewers() - before
    ok = code != 0 and REFUSAL in out and child is not None and not live(child) and not after
    rep.item("ⓑ", ok, f"종료 코드 {code} · 거부 문면 {'있음' if REFUSAL in out else '없음'} · "
                      f"띄웠던 시스템 서버 pid {child} 살아 있음={live(child) if child else '—'} · "
                      f"새로 남은 run.py viewer {sorted(after)}")
    print("    " + "\n    ".join(ln for ln in plat.lines if ln.startswith("[platform]")))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--system", type=Path, default=DEFAULT_SYSTEM)
    args = ap.parse_args()
    rep = Report()
    one_command(rep, args.system, signal.SIGINT, "Ctrl+C")
    one_command(rep, args.system, signal.SIGTERM, "SIGTERM")
    mock_refusal(rep, args.system)
    return rep.finish()


if __name__ == "__main__":
    sys.exit(main())
