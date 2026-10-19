# PROGRESS — 마감 보고 (최근 3회차만)

---

## P1.5 — 끌기 배치와 P1 보완 (2026-10-19 · 완료 · 열린 질문 1 — BLOCKERS B-01)

요청문 `docs/요청문/P1.5_끌기와보완.md` · 시스템 `4af5505`(읽기·실행만 — 실행 뒤 `git status --porcelain` 빈 출력) · 작업 브랜치는 main(`1c22560`)에서 땄다.
아래 숫자는 전부 **mock** 표본이고 품질 근거가 아니다. 끌기 세기의 기본값은 mock으로 고르지 않았다(요청문 값 그대로).

### 1. 전제 대조표 — 착수 전에 실제로 돌림 · 8행 전부 기대값과 같음

먼저 받은 `docs/` 세 파일을 내용 그대로 넣어 커밋했다(`cmp`로 같음 확인 · 커밋 `09de999`).

| # | 확인 | 기대 | 실측 |
|---|---|---|---|
| 1 | `git log --oneline -1 origin/main` | `1c22560` | `1c22560 P1: 뼈대와 그래프 화면` |
| 2 | `grep -c "끌기 배치" docs/명세.md` · `ls docs/요청문/` | 7 · P1.5 있음 | `7` · `P1.5_끌기와보완.md P1_뼈대와그래프.md P2_질의와문서.md` |
| 3 | P1 확인 셋 | 전부 PASS (ⓕ-도는 중은 running=False일 수 있음) | 셋 다 종료 코드 0 · 전부 PASS · 「ⓕ-도는 중 PASS … 누를 때 배치 running=True …」(이번에는 잡혔다) |
| 4 | `grep -n 'm.type === "pin"' …force_worker.js` | 136 | `136` |
| 5 | `grep -n "private rewarm"` · `grep -n "REWARM_ITER = "` | 182 · 15 | `182` · `15` |
| 6 | `grep -n "this.layout.setGraph" …view.ts` | 123 | `123` |
| 7 | `grep -n "MOCK_REFUSAL" run.py` · `grep -n "^REFUSAL" verify/p1_process.py` | 31 · 84 · 20 | `31` · `84` · `20` |
| 8 | `git -C ../ontology_system status --porcelain` | 빈 출력 | 빈 출력 |

### 2. 만든·고친 파일

| 파일 | 내용 |
|---|---|
| `frontend/src/graph/force_worker.js` | 플랫폼 사본에 두 가지만 더함 — `start`의 선택 칸 `anchor: {k}`(제자리 용수철 · 중력 다음) · `cool {iters}`(식힘). 머리 주석을 「위 두 가지만 더했다」로. `anchor`가 없으면 시스템 원본과 같은 계산(원본과 `diff`: 더한 줄 4묶음뿐) |
| `frontend/src/graph/force.ts` | `startDrag`(방향 없는 넓이 우선 홉 · k(h) · 닿지 않는 노드 고정 · 반복 상한 없음) · `release`(식힘 300) · 상태 `kind` · 상수 한 자리(k₀ 다섯 단 · 3배 · 상한 1 · 식힘 300). 머리 주석의 「워커는 시스템 것 그대로」를 고침 |
| `frontend/src/graph/view.ts` | 끌기 손짓 — 전체 배치 중이면 pin만 · 멈춤이면 그 점만 · 그 밖이면 `startDrag` · 손짓 도중 전체 배치가 끝나면 다음 움직임부터 끌기 배치 · 놓을 때 이 손짓이 시작한 끌기 배치만 `release`. `rewarm`·`REWARM_ITER` 삭제 |
| `frontend/src/panels/Controls.tsx` · `App.tsx` · `types.ts` | 밀대 「끌 때 따라오는 범위」(`data-testid="follow"` · 5단 · 기본 가운데) · 손잡이 `layout.kind` |
| `frontend/src/panels/Header.tsx` · `styles.css` | 힘 상태 「끌기」·「식힘 n/300」 · **머리 줄 한 줄 고정**(P-22 — 아래 4절) |
| `run.py` | 거부 문면 네 줄(`--allow-mock` 안내 없음 · 종료 코드 2) · `--allow-mock`을 `--help`에서 숨김 |
| `README.md` | 사내 절 새로 씀(리눅스 · 시스템 CLI와 같은 파이썬 · 셸 별칭 · `doctor` 대조 · `pgrep` · 종료 코드) · 맨 아래 「개발 세션 전용」 절로 `--allow-mock`·verify 옮김 |
| `verify/p1_process.py` | ⓑ를 새 네 줄 대조로 |
| `verify/p1_screen.py` | ⓕ-도는 중을 「누른 채 다시 배치(포커스 + Enter) → 곧바로 움직임 · 첫 움직임 직후 layout·running일 때만 · 다섯 번까지」로 · 기준 좌표 P-20 · ⓕ-쉰 뒤 뺌 · ⓕ-고정은 첫 노드만 · `wait_rest`에 두 프레임 대기(P-23) |
| `verify/p15_drag.py` | 새 확인 스크립트 — ⓐ~ⓙ (ⓘ는 위 P1 셋을 함께 돌린다) |
| `frontend/dist/` · `verify/captures/*.png` | 다시 빌드 · 캡처 다시 찍음(mock) |
| `DECISIONS.md` · `BLOCKERS.md` · `docs/` | P-05 「P1.5에서 끌기 배치로 바뀜」 · P-20~P-27 · B-01 · 받은 문서 셋 |

### 3. 완료판정 — `python verify/p15_drag.py` → 종료 코드 0 (두 번 연달아 돌려 두 번 다 전부 PASS)

```
ⓑ PASS  노드 XGB37G 2px · 2초 머묾(그동안 kind=drag) → 다른 노드 평균 이동 0.1188 = 그래프 반경(RMS) 107.56의 0.110% (< 1%)
ⓐ PASS  허브 NVDVN5(연결 17) 끈 거리 76.91 · 끈 거리 대비 평균 이동(노드 수) — 1홉 71%(17) · 2홉 46%(30) · 3홉 12%(23) · 4홉 이상 6%(28) · 판정 1홉 ≥ 30% · 1홉 > 2홉 > 4홉 이상 · 4홉 이상 ≤ 20%
ⓙ PASS  verify/captures/p15_hub_drag_mock.png (mock 표본 — 허브를 끌어 놓고 쉰 뒤)
ⓒ PASS  끈 채 3초 — 1초마다 [kind, running, iterations] = [['drag', True, 1930], ['drag', True, 3350], ['drag', True, 4850], ['drag', True, 6240]]
ⓓ PASS  놓은 뒤 0.11초에 running=False(끝 상태 ['drag', False, 7470]) · 끈 노드 어긋남 0.00e+00 · 그 전에 놓아 둔 노드 어긋남 {'XGB37G': 0.0, 'NVDVN5': 0.0}
ⓔ PASS  1번째에 잡음 · 다 끈 뒤 ['layout', True, 650] → 누른 채 쉼 ['layout', False, 1500] → 놓은 뒤 ['layout', False, 1500] — 끈 점만 고정된 채 전체 배치가 force.iterations 1500까지 돔(끌기 배치로 안 바뀜) · 끈 노드 어긋남 0.00e+00
ⓕ PASS  1홉 평균 이동 — 「가장 좁게」 64% < 「가장 넓게」 79% · 끈 거리 76.911 / 76.911 · 두 번째 다시 배치가 같은 자리에서 쉼=True
ⓖ PASS  종료 코드 2 · ONTO_HOME 줄 True · 상태 폴더 줄 True · 출력에 「--allow-mock」 없음 · --help에 「allow-mock」 없음
ⓗ PASS  「## 개발 세션 전용」 앞 63줄에서 mock(대소문자 무관) 0개
ⓘ PASS  P1 확인 스크립트 종료 코드 {'p1_contract.py': 0, 'p1_process.py': 0, 'p1_screen.py': 0} (쓰기 0 ⓙ · 외부 요청 0 ⓚ 포함)
```

ⓘ 안의 P1 줄(고친 스크립트):

```
P1 ⓑ PASS  종료 코드 2 · 거부 네 줄 그대로 · 「--allow-mock」 글자 없음 · 띄웠던 시스템 서버 pid 3079 살아 있음=False · 새로 남은 run.py viewer []
P1 ⓕ-도는 중 PASS  1번째에 잡음(첫 움직임 직후 kind=layout · running=True) · 놓을 때 kind=drag · 기준 = 끌지 않은 전체 배치의 쉰 좌표 · 노드 NVDVN5 이웃 17 · 끈 거리 75.874 · 이웃 평균 이동 57.046 = 75% · 내적 +4283.3477 · 놓은 자리에서 2초 뒤 어긋남 0.00e+00
P1 ⓕ-고정 PASS  배치가 쉬었을 때 놓은 자리에서 어긋남 0.00e+00
P1 ⓙ PASS  해시 대상 22개 중 바뀐 것 0개 · 시스템 git status --porcelain 빈 출력
P1 ⓚ PASS  요청 10건 전부 127.0.0.1:8800 · 밖으로 0건
(그 밖 P1 ⓐ ⓒ ⓓ ⓔ ⓖ ⓗ ⓘ ⓛ 전부 PASS)
```

- 플랫폼 트랙 실측(같은 워커 · k₀ 0.02 — 1홉 72% · 2홉 43% · 3홉 14% · 4홉 이상 6% · 좁게 62~65% · 넓게 79~82%)과 화면 실측(71 · 46 · 12 · 6 · 64 · 79)이 맞는다(mock).
- 머리 줄은 「진행 — 반복 190/1500 → 쉼 — 반복 1500/1500 → 끌기 → 식힘 70…290/300 → 쉼」으로 바뀐다(scratch 실측).

### 4. 돌리다가 찾아 고친 것 · 남긴 것

1. **머리 줄이 끄는 순간 캔버스를 24px 밀었다 (고침 · P-22).** 힘 상태 글자가 짧아지면 머리 줄이 두 줄 → 한 줄(58 → 35px)이 되어 끄기를 시작하는 순간 캔버스가 위로 뛰었다 —
   노드가 손에서 빠지고, p15 확인이 가끔 엉뚱한 곳을 눌렀던 원인이다. 머리 줄을 한 줄 높이 고정으로 바꾼 뒤 모든 상태에서 35px.
2. **P1 ⓕ-도는 중의 잣대 (고침 · P-20).** 요청문대로 「누른 채 다시 배치」로 잡으면 배치가 시작 자리에서 다시 펼쳐지므로 그 움직임이 이웃 이동에 섞여 세 번 중 두 번 FAIL(내적 음수)이었다.
   끌지 않았다면 돌아왔을 좌표(전체 배치는 결정적이다)를 기준으로 바꿔 네 번 연달아 PASS(이웃 75~78%).
3. **앞선 끌기가 남긴 용수철 힘 (명세 질문 · BLOCKERS B-01).** 전체 배치가 쉰 뒤의 2px 끌기는 0.11~0.16%로 흐르지 않는다(ⓑ).
   그러나 **허브를 끈 다음** 다른 노드를 끌면 끌지 않은 곳이 5.4% → 3.9% → 2.2% → 1.2%(그래프 반경 대비 · 연달아 네 번)로 풀린다 —
   끌기마다 제자리와 k(h)를 새로 잡는 명세 규칙의 귀결이다(식힘을 늘려도 안 사라진다). 이 회차는 명세 문장대로 두었다.
   권고는 B(미리 당긴 용수철 — 시작 순간 알짜 힘을 상쇄하도록 제자리를 잡는다)다. 선택지·근거는 `BLOCKERS.md` B-01.

### 5. 화면 캡처 (전부 mock)

- `verify/captures/p15_hub_drag_mock.png` — 허브(탭용접)를 끌어 놓고 쉰 뒤(ⓙ) · 1홉 노드가 허브 둘레로 모이고 먼 갈래는 제자리.
- P1 캡처 다섯 장(`p1_*_mock.png`)도 다시 찍었다(머리 줄 한 줄).

### 6. 가결정 — `DECISIONS.md`

P-05에 「P1.5에서 끌기 배치로 바뀜」 · P-20 ⓕ-도는 중의 기준 좌표 · P-21 ⓑ는 쉰 뒤에 잰다(B-01) · **P-22 머리 줄 한 줄 고정** · P-23 `wait_rest` 두 프레임 ·
P-24 ⓔ는 누른 채 가만히 쉬기를 기다린다 · P-25 끌기 배치의 작은 자리(제자리 시점 · 놓기 = mouseup·mouseleave · 상태 글자 · 밀대 이름) · P-26 「없음」 ·
P-27 README 예 경로 · `doctor`는 `python doctor.py`(시스템 `run.py`에 `doctor` 명령이 없다).

### 7. 명세에 바꿀 문장 제안 (이 세션은 고치지 않았다)

1. §3.3 「머리 줄 「상태」가 시스템 `doctor` 첫 줄의 상태 폴더와 같은지 본다.」
   → 「머리 줄 「상태」가 시스템 `doctor`(시스템 코드 폴더에서 `python doctor.py` — `run.py`의 명령이 아니다) 머리 아래 「상태 폴더 …」 줄과 같은지 본다.」 (P-27)
2. §5.6 「시스템 모드 · 상태 루트 · … · 질의 벡터 준비 줄(`/api/status`의 `line`).」 뒤에
   → 「머리 줄은 한 줄이고 높이가 바뀌지 않는다 — 길이가 바뀌는 글자(힘 상태 · 벡터 줄)가 줄바꿈을 바꾸면 캔버스가 뛰어 끄는 순간 노드가 손에서 빠진다. 긴 글자는 말줄임 + 툴팁.」 (P-22)
3. §5.1 끌기 배치 「끌기를 시작한 순간의 모든 좌표를 「제자리」로 잡고」 — B-01을 B로 정하면
   → 「끌기를 시작한 순간 각 노드에 걸린 알짜 힘을 용수철이 정확히 상쇄하도록 제자리를 잡고(제자리 = 지금 좌표 − 알짜 힘 / (k·질량)) — 시작 순간이 평형이라 어느 상태에서 끌어도 끌지 않은 곳은 흐르지 않는다」. (B-01)
4. (P2 요청문에) 화면 확인에서 「다시 배치」 직후의 좌표를 기준으로 삼지 않는다 — 시작 자리에서 펼쳐지는 움직임이 섞인다. 기준은 쉰 좌표. (P-20)

### 8. 시스템에 필요한 것

없음. (참고: 시스템 `run.py`에는 `doctor` 명령이 없고 `python doctor.py`다 — 문서만 맞췄다.)

### 9. 사용자가 사내에서 볼 것

1. **설치·별칭** — README 「사내 실행」 절대로: 시스템 CLI의 파이썬에 `pip install -r requirements.txt` → `~/.zshrc`에 `onto-platform` 별칭 한 줄 → `onto-platform`.
   머리 줄 「상태」가 `python doctor.py`의 「상태 폴더」와 같은지 · Ctrl+C 뒤 `pgrep -af "run.py viewer"`가 빈 출력인지.
2. **「끌 때 따라오는 범위」 다섯 단을 골라 달라** — 밀대를 가장 좁게 → 가장 넓게로 바꿔 가며(다음 끌기부터 적용) **허브 하나와 잎 하나**를 끌어 보고,
   「연결된 것이 같이 따라온다」가 가장 잘 보이는 단을 알려 주면 플랫폼 트랙이 기본값으로 바꾼다. 지금 기본은 가운데(k₀ 0.02 — mock으로 고르지 않은 값).
3. **B-01을 겪어 보고 판단해 달라** — 허브를 크게 끌어 놓은 다음 **다른 노드를 살짝** 끌 때, 끌지 않은 곳이 조금씩 풀리는 것이 거슬리는지.
   거슬리면 B(미리 당긴 용수철)로 가자는 것이 구현 세션의 권고다.
4. **큰 그래프에서의 손맛** — 끌기 배치는 누르는 동안 상한 없이 돈다. 노드가 수천 개일 때 끄는 손을 따라오는 속도와 놓은 뒤 식힘(300회)이 끝나는 시간이 괜찮은지.
5. 거부 문면은 실데이터 설정이 안 읽혔을 때만 본다 — 보이면 문면의 「이 셸의 ONTO_HOME」과 「시스템이 읽은 상태 폴더」를 보고 셸 설정과 그 폴더의 `llm.json`을 확인한다.

### 10. 소요 시간

약 30분(08:30 착수 → 09:00 마감 — 문서·전제 대조 5분 · 끌기 배치 10분 · 보완 5분 · 확인과 원인 찾기 10분). 한 시간 목표 안.

---

## P1 — 뼈대와 그래프 (2026-10-19 · 완료)

요청문 `docs/요청문/P1_뼈대와그래프.md` · 시스템 `playjae0/ontology_system` @ `4af5505`(읽기·실행만) · 개발 데이터는 **시스템 mock 표본**이다 —
아래 숫자는 전부 mock이고 품질 근거가 아니다. 보기 편한지는 사내 실제 그래프로 판정한다.

### 1. 전제 대조표 — 착수 전에 실제로 돌림 · 14행 전부 기대값과 같음

| # | 확인 | 기대 | 실측 |
|---|---|---|---|
| 1 | `git rev-parse --short HEAD` | `4af5505` | `4af5505` |
| 2 | `grep -n '"--no-browser"' cli/viewer/server.py` | 182·183·184 | `182: no_browser = "--no-browser" in args` · `183: while …` · `184: args.remove(…)` |
| 3 | `grep -n 'print(f"\[viewer\] {url}")' …` | 197 | `197: print(f"[viewer] {url}")` |
| 4 | `grep -n '^HOST = "127.0.0.1"' …` | 41 | `41: HOST = "127.0.0.1"` |
| 5 | 「쓰기 라우트는 만들지 않는다」 · `grep -c "def do_POST"` | 155 · 0 | `155` · `0` |
| 6 | 데이터 주소 | static 110 · health 115 · graph 117 · funnel 119 · node/neighbors 121 · doc 127 · status 131 · query 134 · raw 148 | 같음(110·115·117·119·121·127·131·134·148) |
| 7 | `grep -n "def _free_port"` | 46 | `46: def _free_port(start):` |
| 8 | `is_live` · `if not is_live(n):` | 39 · 367 포함 | `core/state/status.py:39` · `cli/export.py: 89 · 154 · 367` |
| 9 | `"prov": ", ".join(prov[:4])` | 374 | `374` |
| 10 | `m.type === "pin"` | 132 | `132` |
| 11 | `python -u run.py viewer --no-browser --port 8765` | `[viewer] http://127.0.0.1:8765/` | `[viewer] http://127.0.0.1:8765/` (8765가 차 있던 두 번째 실행은 8766 — 「다음 빈 포트」도 확인) |
| 12 | `curl /api/health` | `home`·`mode`·`mock`·`doc_types`·`layers`·`docs` · mode mock | `{"home": ".../state_mock", "mode": "mock", "mock": "1", "doc_types": 4, "layers": ["process","quality"], "docs": 6}` |
| 13 | `curl /api/graph` | §4 칸 전부 · 비어 있지 않음 | 위 9칸 · 노드 13칸 · 엣지 8칸 전부 있음 · 노드 99 · 엣지 150(mock) |
| 14 | 위를 다 돌린 뒤 `git status --porcelain` | 빈 출력 | 빈 출력 |

(덧붙여 §4의 나머지 주소 `/api/node`·`/api/neighbors`·`/api/doc`·`/api/funnel`·`/api/status`·`/api/query`(+`trace`)의 칸도 실측해 명세 §4와 같음을 봤다 —
`contract.py`의 목록이 그것이다. `/api/doc/seed`는 명세 말대로 404.)

### 2. 만든 파일

| 파일 | 내용 |
|---|---|
| `run.py` | 진입점 — 명세 §3.1 순서 그대로(띄우기 → 주소 읽기 → mock 거부 → health·graph 칸 확인 → 127.0.0.1 서버 · 끝날 때 자식 끄기) |
| `backend/system_server.py` | 시스템과 닿는 유일한 자리 — 자식 띄우기(`-u` · `PYTHONIOENCODING=utf-8`만 더함 · 별도 프로세스 묶음) · 출력 펌프(콘솔 `[system]` + `logs/`) · 주소 줄 120초 대기 · 끄기(SIGTERM → 5초 → kill) · GET 중계(퍼센트 인코딩 그대로 · 600/60초) · 시스템 커밋 |
| `backend/contract.py` | 명세 §4 칸 목록 + `check(주소, 응답, 상태) → 빠진 칸` 하나 + 경로→주소 |
| `backend/app.py` | 라우트(얇게) — `/api/*`·`/raw/*` 중계 + `X-Platform-Missing` · `/platform/status` · `frontend/dist` |
| `requirements.txt` · `.gitignore` · `README.md` | fastapi 0.120.4 · uvicorn 0.38.0 고정 · 사내 실행법 |
| `frontend/` | React 18 + TS + Vite 5 · sigma 3.0.3 · graphology 0.26.0 · @sigma/edge-curve 3.1.0 · @sigma/node-border 3.0.0 (`package-lock.json` 포함) |
| `frontend/src/graph/force_worker.js` | 시스템 `cli/viewer/static/force_worker.js`를 **글자 그대로 복사**(머리 주석만 더함 — `diff`로 확인) |
| `frontend/src/graph/force.ts` | 시스템 `layout.js`의 forceStart·forcePause·forcePin 이식 + 다시 데우기 |
| `frontend/src/graph/seed.ts` | 시작 자리 — 관계 이름 없이 새로 씀(골격 넓이 우선 · 나머지 host 둘레) |
| `frontend/src/graph/view.ts` | sigma 한 번 · 리듀서(색 축·관계·찾기·라벨·hover·고른 점) · 끌기 · 확대 시 관계 이름 |
| `frontend/src/graph/style.ts` | 색(값→결정적 16진 — 시스템 render.js에서 옮김) · tier 크기 · 라벨 · 보이기 판정 두 함수 |
| `frontend/src/App.tsx` · `api.ts` · `types.ts` · `panels/*` | 배선 · 머리 줄+mock 띠 · 조절 · 노드 상세 · 빠진 칸 카드 · `window.__platform` |
| `frontend/dist/` | 빌드 산출(커밋 — 사내에는 Node가 없다) |
| `verify/common.py` · `p1_process.py` · `p1_contract.py` · `p1_screen.py` | 완료판정 확인(Playwright Python) |
| `verify/captures/*.png` | 화면 캡처 5장 — **mock 표본** |
| `DECISIONS.md` · `BLOCKERS.md` · `PROGRESS.md` | 장부 |
| `CLAUDE.md` · `docs/명세.md` · `docs/요청문/P1·P2` | 받은 정본을 그대로 넣음(고치지 않음) |

### 3. 완료판정 — 전부 실행 (`python verify/p1_process.py` · `p1_contract.py` · `p1_screen.py` → 셋 다 종료 코드 0)

```
ⓐ-Ctrl+C PASS  주소 찍힘 http://127.0.0.1:8800/ · 시스템 서버 [2265] → Ctrl+C 뒤 남은 것 [] · 새로 남은 run.py viewer [] · 플랫폼 종료 코드 0
ⓐ-SIGTERM PASS  주소 찍힘 http://127.0.0.1:8800/ · 시스템 서버 [2282] → SIGTERM 뒤 남은 것 [] · 새로 남은 run.py viewer [] · 플랫폼 종료 코드 0
ⓑ PASS  종료 코드 2 · 거부 문면 있음 · 띄웠던 시스템 서버 pid 2299 살아 있음=False · 새로 남은 run.py viewer []
ⓒ-빠진 칸 PASS  97건 — 정상 → [] · 칸 하나 뺌 → 정확히 그 칸 · 새 칸 무시
ⓒ-오류 응답 PASS  6건 — 전부 확인하지 않음(빈 목록): [[], [], [], [], [], []]
ⓓ PASS  visible 노드 99 = 서버 anchor 노드 99 · visible 엣지 150 = 양 끝 보이는 엣지 150 · (서버 전체 노드 99 · 엣지 150)
ⓔ PASS  연결 쌍 평균 / 비연결 쌍 평균 = 0.160 (< 0.5) · 연결 쌍 140 · 비연결 쌍 4711
ⓕ-도는 중 PASS  노드 NVDVN5 이웃 17 · 누를 때 배치 running=True · 끈 거리 75.921 · 이웃 평균 이동 72.597 = 96% · 내적 +5316.2298 · 놓은 자리에서 2초 뒤 어긋남 0.00e+00
ⓕ-쉰 뒤 PASS  노드 XGB37G 이웃 11 · 누를 때 배치 running=False · 끈 거리 74.566 · 이웃 평균 이동 60.407 = 81% · 내적 +4480.3195 · 놓은 자리에서 2초 뒤 어긋남 0.00e+00
ⓕ-고정 PASS  두 번 끈 뒤 배치가 쉬었을 때 놓은 자리에서 어긋남 — 첫 노드 0.00e+00 · 둘째 노드 0.00e+00
ⓖ PASS  관계 토글 8개 전부 끔 → 보이는 엣지 22 = cross 22 · cross 모양 [('curvedArrow', '#7b3fa8')] · 나머지 모양 [('arrow', '#b9c0ca')]
ⓗ PASS  찾기 「화재」 → 걸린 노드 1개 강조(highlighted) · 나머지 98개 흐림 · 좌표 바뀐 노드 0개 · 반복 수 1500→1500 · 배치 running=False
ⓘ PASS  누른 노드 NVDVN5 → 상세 id NVDVN5 · 인접 엣지 화면 17(줄 17) = 서버 17 · 칸 11개 중 다른 값 없음
ⓙ PASS  해시 대상 22개 중 바뀐 것 0개 · 시스템 git status --porcelain 빈 출력
ⓚ PASS  요청 26건 전부 127.0.0.1:8800 · 밖으로 0건 · 경로 ['/', '/api/graph', '/api/health', '/api/status', '/assets/…', '/platform/status']
ⓛ PASS  verify/captures/p1_graph_mock.png (mock 표본 — 배치가 쉰 전체 그래프)
```

- ⓕ는 Playwright 마우스로 끌었다(노드의 화면 좌표 → 캔버스 가운데 쪽으로 캔버스 폭의 25% · 25걸음). 「도는 중」은 「다시 배치」 직후 반복 200 넘어서,
  「쉰 뒤」는 반복 1500을 다 돌아 쉰 상태에서(다시 데우기 경로).
- ⓕ를 의심해 따로 잰 것(scratch · mock): ① 끌기 없이 다시 데우기만 하면 다른 노드 평균 이동 0.11~0.20(그래프 폭 ≈ 306) — 데우기 자체가 그림을 흔들지 않는다.
  ② 약 59 끌었을 때 평균 이동 — 노칭(이웃 11): 이웃 46 · 2홉 37 · 그 밖 19 / 스태킹: 이웃 46 · 2홉 19 · 그 밖 25 / 탭용접(이웃 17 · 허브): 이웃 55 · 2홉 42 · 그 밖 39.
  이웃이 늘 가장 많이 따라온다. 다만 그 밖의 노드도 꽤 움직인다 — mock 그래프가 연결 덩어리 하나라 선형 끌림이 전체로 번진다(허브일수록 크다).
  「끈 노드 근처만 움직이기」를 원하면 끌림·중력 상수의 문제라 사내 그래프를 본 뒤 정할 일이다(지금은 시스템 손잡이 `viewer_force` 값 그대로).
- 요청문 밖이지만 돌려 본 것(scratch): 확대(카메라 비율 0.3)에서 엣지 라벨 150개 · 보통 0개 / 「전체 이름」 켜면 `::` 이름 70개가 전체로 /
  `X-Platform-Missing` 헤더가 오면 빠진 칸 카드가 뜬다(브라우저 쪽에서 헤더만 덧붙여 봄 — 플랫폼 코드에 가짜 분기 없음) /
  쓰는 중 시스템 서버를 SIGKILL하면 `/api/graph`가 502 `{"error": "시스템 서버가 꺼졌다 — 플랫폼을 다시 켜라"}` /
  시스템 서버가 주소 전에 죽으면 「주소를 찍지 못하고 끝났다(종료 코드 3) — 그때까지의 출력:」과 그 출력을 찍고 종료 코드 1.

**돌리지 못한 경로 — 사내에서 처음 타는 곳(정직하게 적는다)**

1. **Windows** — 개발 환경이 Linux다. 사내가 Windows면 자식 끄기(`CREATE_NEW_PROCESS_GROUP` + `terminate`)·Ctrl+C·cp949 콘솔 경로는 아직 한 번도 안 돌았다.
   사내 첫 실행에서 「Ctrl+C 뒤 작업 관리자에 python이 하나 남는지」를 봐 주면 된다.
2. **연결 없는 노드 숨김** — mock 표본은 `anchor`가 99개 전부라 실제로 숨겨진 노드가 0이다. ⓓ는 「보이는 것 = anchor」만 증명했고 숨김이 일어나는 장면은 사내 그래프에서 처음 나온다.
3. **zip으로 받은 시스템 폴더**(`.git` 없음 → 커밋 `null` → 머리 줄에 폴더 이름) — 코드만 있고 이 세션에서는 `.git`이 있는 폴더만 돌렸다.
4. **큰 그래프** — mock은 노드 99개라 힘 배치가 0.9초에 쉰다. 수천 개에서 다시 데우기 300회가 끄는 손을 따라갈 만큼 빠른지는 사내에서 본다(느리면 P-05 값을 줄인다).

### 4. 화면 캡처 (전부 mock 표본)

- `verify/captures/p1_graph_mock.png` — 배치가 쉰 전체 그래프(ⓛ)
- `verify/captures/p1_search_mock.png` — 찾기 강조(ⓗ) · `p1_detail_mock.png` — 노드 상세(ⓘ) · `p1_cross_only_mock.png` — 관계 전부 끔 → cross만(ⓖ) · `p1_after_drag_mock.png` — 두 번 끈 뒤(ⓕ)

### 5. 가결정 — `DECISIONS.md`

P-01 verify는 Playwright Python · P-02 포트 고르기 · P-03 중계 시간 초과 504 · P-04 빠진 칸 헤더는 UTF-8 퍼센트 인코딩 ·
**P-05 다시 데우기 반복 300**(쉰 워커에서 첫 움직임에 · 사람이 멈춤이면 그 점만) · P-06 간격 = scaling 배수 · P-07 관계 이름은 카메라 비율 < 0.5 ·
P-08 손잡이에 `sigma` 추가 · P-09 시작 자리 세부 · P-10 관계 토글은 그리기만 · P-11 숨긴 노드는 그래프에 안 넣음 · P-12 인접 엣지는 서버 전부 ·
P-13 콘솔 `[system]` 머리 · P-14 종료 코드 1/2/3 · P-15 끌기/누르기 가르기 · P-16 찾기 술어 · P-17 커밋 모름 표기 · P-18 벡터 줄 폴링 · P-19 의존 판.

### 6. 명세에 바꿀 문장 제안 (이 세션은 고치지 않았다)

1. §3.1-6 「쓰는 중에 시스템 서버가 죽으면 중계는 502와 `{"error": "시스템 서버가 꺼졌다 — 플랫폼을 다시 켜라"}`를 낸다.」
   → 「… 를 낸다. 시간 제한(`/api/query` 10분 · 나머지 60초) 안에 답하지 않으면 504와 `{"error": "시스템 서버가 N초 안에 답하지 않았다"}`를 낸다.」 (P-03)
2. §4 칸 확인 「빠진 칸이 있으면 화면에 「시스템이 바뀌어 화면이 못 따라간다 — 빠진 칸: …」을 띄운다.」
   → 「빠진 칸이 있으면 응답 헤더 `X-Platform-Missing`(칸 이름을 UTF-8 퍼센트 인코딩해 쉼표로 잇는다 — `정의` 같은 한글 칸이 있다)으로 알리고, 화면에 「…」을 띄운다.」 (P-04)
3. §5.1 「조절: 간격(퍼짐) · 멈춤/이어서 · 다시 배치.」 → 「조절: 간격(퍼짐 — 반발 세기 `scaling`에 곱하는 배수) · 멈춤/이어서 · 다시 배치.」 (P-06)
4. §5.3 「관계 토글 [P1]」 → 「관계 토글 [P1] — 그리기만 거른다(배치는 그대로)」 (P-10)
5. §5.5 「인접 엣지(누르면 그 노드로)」 → 「인접 엣지(`/api/graph`의 전부 — 다른 끝이 숨겨져 있어도 「화면에 없음」으로 · 누르면 그 노드로)」 (P-12)
6. (P2 요청문에) 확인용 손잡이를 다시 정할 때 `window.__platform = { graph, sigma, visible(), layout: { running, iterations } }`로 — `sigma`가 없으면 마우스로 노드를 집을 화면 좌표를 못 얻는다. (P-08)

### 7. 시스템에 필요한 것

없음 — P1은 `4af5505`가 내놓은 창구(뷰어 서버 · `/api/health`·`/api/graph`·`/api/status`)만으로 됐다. 시스템 파일은 하나도 고치지 않았다(실행 뒤 `git status --porcelain` 빈 출력).
참고: 시스템을 실행하면 시스템 폴더에 `__pycache__/`와 `state_mock/`(work/ 포함)이 생기지만 둘 다 시스템 `.gitignore` 안이라 porcelain에 안 잡힌다.

### 8. 소요 시간

약 30분(05:00 착수 → 05:30 마감 · 전제 대조표 5분 · 백엔드 10분 · 화면 10분 · 확인·장부 10분). 두 시간 상한 안.
