# PROGRESS — 마감 보고 (최근 3회차만)

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
