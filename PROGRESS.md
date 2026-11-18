# PROGRESS — 마감 보고 (최근 3회차만)

---

## P4 — 거르기와 상세 · P3 확인 고침 (2026-11-18 · 완료 · 완료판정 ⓐ~ⓚ 전부 PASS)

요청문 `docs/요청문/P4_거르기와상세.md` · 시스템 `5ae4444`(읽기·실행만) · 브랜치 `claude/p4-filter-detail`은 main `1dda4ae`(P3 병합)에서 땄다 · 받은 문서는 `fb2010a`에 그대로.
숫자는 전부 **mock**(ⓗ의 합성은 동작 확인용). 그리기 · 배치 코드는 바꾸지 않았다.

**전제 대조표 14행 — 전부 기대대로**: ① `1dda4ae Merge pull request #4` ② `2` · `1` · P4 있음 ③ `5ae4444` ④ `69` ⑤ 노드 `docs`(골격 `seed`) ⑥ `edgeless 0 · island 0`
⑦ `values` 있는 노드 11 · `record`(dict) 옴 ⑧ `0` ⑨ `162` ⑩ `101` ⑪ `279` ⑫ `capture_output=True` · 결과 블록만 ⑬ 저장(레포 밖) ⑭ 빈 출력.

**바꾼 파일**: `frontend/src/graph/filters.ts`(새 — 보이기 한 자리 `shownNodes` = 탐색 ∪ 연결 없는 노드 − 거른 노드 · 문서/축 값 목록) ·
`App.tsx`(거르기 상태 · 찾기/펼치기/칩 수가 거른 뒤 기준 · 손잡이 `filters`) · `Controls.tsx`(문서 · 값 · 「연결 없는 노드 n개 보이기」) · `Detail.tsx`(값 줄 · 원 레코드) ·
`explore.ts`(`withChip`에 보이기 함수) · `types.ts` · `styles.css` · `README.md` · `verify/p4_filters.py`(새) · `verify/p3_explore.py`(ⓒ 수치만 · ⓔ 고침) · `verify/p16_drag.py`(실패 시 p15 출력) · `frontend/dist/`.

**완료판정** — `python3 verify/p4_filters.py --chromium …` → 종료 코드 0
```
ⓐ PASS  목록 [['CP01', 11], ['PFMEA01', 31], ['PPT02', 2], ['QPPT01', 3]] = 따로 셈 → True (mock)
ⓑ PASS  「PFMEA01」 끔 → 보이는 50 = 따로 셈 50 True · 그린 노드 같음 True · 남은 노드 좌표 변화 최대 0.0e+00 · 다시 켬 → 이전 집합 True · 「전부 끄기」 → 34 = 따로 셈 True · 「전부 켜기」 → 이전 집합 True (mock)
ⓒ PASS  「PFMEA01」 누름 → 문서 패널 「문서 PFMEA01」 · /api/doc/PFMEA01 200
ⓓ PASS  layer 「quality」 끔 → 보이는 53 = 따로 셈 53 True · 다시 켬 → 이전 집합 True (mock)
ⓔ PASS  가로채 넣음 → 「연결 없는 노드 1개 보이기」 · 처음 숨김 True · 켬 → 보이고 그려짐 True · 끔 → 빠짐 True · 오류 0
ⓕ PASS  문서 PFMEA01 끔 — 머리 줄 「노드 50/73 · 엣지 68/105」 노드 50 = 보이는 50 · 깊이 표 = 그린 수 True · 범례 합 50 = 50
ⓖ PASS  7T5DP7 누름 → 값 줄 1 = values 그대로 True · 원 레코드 펼친 JSON = /api/node record True · values 없는 JZ25NT → 값 칸 없음 True (mock)
ⓙ PASS  상태 폴더 해시 그대로 True · 시스템 git status 빈 출력 True · 외부(127.0.0.1 밖) 요청 0
ⓚ PASS  verify/captures/p4_doc_off_mock.png (mock 띠 True)
```
- ⓗ `python3 verify/p3_explore.py` → 종료 코드 0. `ⓔ-많이 PASS 새 182 > 기존 34 → 배치 layout` · `ⓔ PASS 새 105 ≤ 기존 536 · settle · 4홉 이상 이동 / 반경 0.665% (< 2%) · 연결 ÷ 비연결 0.480`.
  `--only c` → `ⓒ(수치) 걸음 0.03 0.33 0.31 0.26 0.28 0.27 0.29 0.25 0.24 0.24 · 평균 0.25초 — 동작 확인 · 판정은 사내 손맛`(4코어 · 합성 2,000).
- ⓘ `p1_contract` · `p1_process` · `p1_screen` · `p2_query` · `p16_drag --ref <전제 13>` 전부 종료 코드 0(「다시 배치」 뒤 좌표 다른 노드 0 · 안쪽 p15도 0 — 이번에는 간헐 실패가 나오지 않아 새 출력은 찍히지 않았다).

**가결정** P-46~P-53(`DECISIONS.md`): P-46 문서 목록은 골격 밖 노드 기준 · P-47 문서 없는 골격 밖 노드는 문서로 거르지 않음 · P-48 축 값 목록(「—」 포함 12개) · P-49 찾기·펼치기 대상 · P-50 칩 +n은 거른 뒤 · P-51 늘어난 노드의 출발 자리 · P-52 확인 잣대 · P-53 P3 고친 줄 이름. **BLOCKERS B-02 닫음(A)**.

**명세에 바꿀 문장 제안**: §5.3 「골격이 아닌 노드는 `docs` 중 켜진 문서가 하나라도 있으면 보인다」 → 「… 보인다(나온 문서가 없는 노드는 문서로 거르지 않는다). 목록은 골격 밖 노드의 `docs`에서 센다」(P-46 · P-47).

**시스템에 필요한 것** 없음. **소요 시간** 컨테이너 시계 01:17 → 01:30(이 시계는 긴 확인 실행 동안 덜 흐른 것으로 보인다 — 실제는 한 시간 남짓으로 본다 · 두 시간 안).

**사내에서 볼 것** ① 왼쪽 칸 「문서」 목록이 사내 문서 id와 노드 수로 보이는지 ② 문서 하나를 껐다 켰을 때 **그 문서에서만 나온 노드만** 빠지는지(다른 문서에도 나온 노드는 남는다 · 남은 노드는 그 자리)
③ 노드 상세의 **값 줄**(값이 있는 노드에서)과 **원 레코드**(눌러서 펼침)가 시스템 CLI가 보여 주는 것과 같은지 ④ 「연결 없는 노드 n개 보이기」의 n과 켰을 때의 모습.
P3 사내 첫 실행 항목(PROGRESS P3 §9 — 그리기 장치 · 펼친 화면 · 끌기 손맛 · 첫 배치 시간 · 따라오는 범위 단)은 그대로.

---

## P3 — 탐색과 깊이 · 연결 수 크기 · 그리기 부하 (2026-11-17 · 완료판정 13개 중 11 PASS · ⓒ·ⓔ FAIL — BLOCKERS B-02)

요청문 `docs/요청문/P3_탐색과깊이.md` · 시스템 `5ae4444`(읽기·실행만 — 실행 뒤 `git status --porcelain` 빈 출력) · 브랜치 `claude/p3-explore-depth`는 main(`7da51e8` — P2 병합)에서 땄다.
받은 문서 둘은 첫 커밋 `b5154d4`에 내용 그대로. mock 숫자에는 「mock」, 합성 그래프 숫자에는 「합성」을 붙였다 — **둘 다 품질 근거가 아니다**(동작 확인용).

**먼저 볼 것 — 둘이 FAIL이다.**
- **ⓒ 끌기 한 걸음**: 줄기는 했지만 1/3에 못 미친다. 2코어 1.02 → 0.45초(44%) · 4코어 0.52 → 0.28초(54%). 요청문 ⑦의 네 가지는 다 넣었다. 남은 부하는 아래 3절.
- **ⓔ 펼칠 때 배치**: 요청문 ⑤와 ⓔ가 ⓓ의 펼치기에서 서로 부딪친다. 새 182 > 기존 34라서 ⑤는 전체 배치를 시키고, 그러면 먼 노드가 움직인다. 명세가 답하지 않는 자리라 **BLOCKERS B-02**에 적었다.
  새 노드 ≤ 기존 노드인 펼침(ⓔ′)에서는 0.665% · 0.480으로 PASS다.

### 1. 전제 대조표 — 14행 · 12행만 조건에 따라 갈림

| # | 확인 | 기대 | 실측 |
|---|---|---|---|
| 1 | `git log --oneline -3 origin/main` | PR #3 병합 | `7da51e8 Merge pull request #3` · `3442aab P2: 질의·문서·연결 현황` (처음 확인 때는 병합 전이라 멈추고 보고 → 사용자가 병합) |
| 2 | 「카테고리별 깊이」 · 「### 5.7 그리기 부하」 · `ls docs/요청문/` | 5 · 1 · P3 있음 | `5` · `1` · `P3_탐색과깊이.md` 있음 |
| 3 | 시스템 HEAD | `5ae4444` | `5ae4444` |
| 4 | `/api/graph` `anchor` 값 키 · 골격 hops | `anchor·host·hops` · 0 | `anchor · host · hops` · 골격(`roots`) 전부 hops 0 |
| 5 | `/api/neighbors/<골격 id>` | `id` · `neighbors` | `id · neighbors` |
| 6 | `view.ts` `nodeShown` 줄 | 88 | `88` |
| 7 | `view.ts` `addDirectedEdgeWithKey` 줄 | 102 | `102` |
| 8 | `view.ts` `applyFrame` 줄 | 201 | `201` |
| 9 | `style.ts` `sizeOf` 줄 | 36 | `36` |
| 10 | `QueryPanel.tsx` `overlayOf` 줄 | 29 | `29` |
| 11 | README 「브라우저가 열린다」 · `~/onto` 수 | 35 · 3 | `35` · `3` |
| 12 | 착수 전 ⓒ(합성 2,000 · 「전체」 · 허브 10걸음) | 한 걸음 평균 > 1초 | **4코어 0.52초(기대와 다름) · 2코어(`taskset -c 0,1`) 1.02초(기대대로)** — 현상(소프트웨어 그리기에서 끌기가 손을 못 따라옴)은 재현됐다. 플랫폼 트랙 실측(2코어 4.5초)과 같은 조건으로 보고 2코어를 기준으로 삼았다(P-38) |
| 13 | `python verify/p16_drag.py --save-ref <레포 밖>` | 저장됨 | 저장됨(스크래치 `p16_ref.json` · 73노드) |
| 14 | 시스템 `git status --porcelain` | 빈 출력 | 빈 출력 |

### 2. 만든·고친 파일

| 파일 | 내용 |
|---|---|
| `frontend/src/graph/explore.ts` (새) | ① 보이는 노드 한 함수 `visibleNodes`: 골격 ∪ 카테고리별 깊이(hops ≤ d) ∪ 칩(펼침·질의) ∪ 골격까지의 길(`host` 사슬) · 닻 없는 노드는 밖 · ② 첫 화면 `initialExplore`(N > `explore_threshold` 또는 소프트웨어 · N > `SOFTWARE_SKELETON_ONLY`=500 → 「골격만」) · 칩 · 연결 수 · 같은 엣지 세기 |
| `frontend/src/graph/renderer.ts` (새) | ⑦ 그리기 장치 — `WEBGL_debug_renderer_info` 이름 → GPU / 소프트웨어 / — |
| `frontend/src/graph/view.ts` | 보이는 노드만 그림(「전체」는 서버 순서 그대로) · `setVisible`(⑤ 빠짐은 빼기만 · 새 노드 > 기존이면 전체 배치 · 아니면 host 둘레 고리에서 출발 + 자리 잡기) · 같은 엣지 id는 처음 것만 · 프레임 합치기(rAF) · 끄는 동안 마우스 아래 노드 찾기 끔 · 두 번 누름 = 펼치기(`preventSigmaDefault`) · 크기 = 연결 수 |
| `frontend/src/graph/force.ts` · `types.ts` | `startSettle`(새 노드 k=0 · 기존 노드 `SETTLE_SPRING` · `COOL_ITER`) · 여러 점에서 홉 세기 · 배치 종류 `settle` |
| `frontend/src/graph/style.ts` | ⑥ `sizeOf(연결 수, 최대)` = 3 + 15 × √(연결 수 ÷ 최대) · tier 크기 상수와 `nodeShown` 뺌(라벨 크기는 tier 그대로) |
| `frontend/src/App.tsx` | 탐색 상태 · 펼치기(`/api/neighbors`) · 질의 끌어오기 칩(서버에 더 묻지 않음) · 찾기 「보임 n · 숨김 m」 + Enter 펼치기 · 머리 줄 수 · 범례 · 「화면에 없는 노드」가 `visibleNodes`를 씀 · 확인용 손잡이 `renderer` · `explore` |
| `frontend/src/panels/Controls.tsx` · `Header.tsx` · `Detail.tsx` · `styles.css` | 깊이 표(맨 위) · 「골격만」/「전체」 · 칩 + × + 「모두 접기」 · 같은 엣지 알림 · 크기 범례 「크기 = 연결 수」 · 머리 줄 「그리기 X」(툴팁에 장치 이름) · 「자리 잡기 i/max」 · 상세 「여기서 펼치기」 · 「연결 수 n · 화면에 m」 |
| `README.md` | ⑧ 사내 절: 자리표시 표 + 찾는 법 · 별칭에 `--no-browser` · 자기 PC 브라우저로 여는 두 길(VS Code 포트 전달 · `ssh -L`) · 「그리기」의 뜻 · 화면 절에 탐색·크기 · 개발 절에 시스템 `5ae4444`과 P3 확인 명령 |
| `verify/p3_synth.py` (새) | 합성 그래프(요청문 §0 꼴 · 층·카테고리·관계 이름을 적지 않음 · 임시 폴더 · 끝나면 지움) |
| `verify/p3_explore.py` (새) | 완료판정 ⓐ~ⓜ(ⓙ·ⓚ는 기존 스크립트) |
| `frontend/dist/` · `verify/captures/` | 다시 빌드 · P3 캡처 둘 + 회귀가 다시 찍은 P1·P1.5·P2 캡처 |

### 3. 완료판정

`python3 verify/p3_explore.py --chromium /opt/pw-browsers/chromium` (ⓒ만 따로 `--only c --before <전>`):

```
ⓘ PASS  사내 절 ~/onto 0 · 별칭 줄 1개 전부 --no-browser True · 포트 전달 VS Code True · ssh -L True · 「## 개발 세션 전용」 앞 mock 0
ⓐ PASS  mock → 「전체」 · 보이는 노드 = 닻 있는 노드 True · 그린 노드 같음 True · 머리 줄 「그리기 소프트웨어」 · 툴팁 「WebGL 장치 — ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)」 · 오류 0
ⓐ PASS  합성 800노드(동작 확인용) → 「골격만」 · 보이는 노드 = 골격 노드 True · 그린 노드 같음 True · 머리 줄 「그리기 소프트웨어」 · 툴팁 (같은 SwiftShader) · 오류 0
   (합성 2,000 → 「골격만」은 ⓓ·ⓕ가 그 화면에서 시작한다)
ⓗ PASS  엣지 하나를 복제해 넣음 → 그래프 그려짐(노드 73) · 「같은 엣지 1개는 한 번만 그렸다.」 · 오류 0
ⓑ PASS  합성 2000노드 · 동작 확인용 · 「Failure」(골격 밖 1004) 깊이 1 → 보이는 노드 536 = 따로 셈 536 True · 그린 노드 같음 True · 표의 수 = 그린 수 True · 「전체」 True · 「골격만」 True
ⓓ PASS  합성 2000노드 · 동작 확인용 · 골격 7T5DP7(이웃 182) 두 번 누름 → 더해진 182 = 따로 셈 182 True · 칩 「펼침: 단락 +182」 · 카메라 비율 1.0000→1.0000 · 칩 × → 펼치기 전 True · 찾기 「보임 0 · 숨김 204」 → Enter → 그 노드와 이웃 53 보임 True
ⓔ FAIL  합성 2000노드 · 동작 확인용 · 펼친 노드에서 4홉 이상 기존 노드 3개 평균 이동 / 반경 285.643% (< 1%) · 연결 쌍 ÷ 비연결 쌍 평균 거리 0.424 (< 0.5)
ⓔ′(참고) PASS  「Failure」 깊이 1(기존 536)에서 N3ETG3를 펼침 → 새 105 · 배치 settle · 4홉 이상 기존 노드 3개 평균 이동 / 반경 0.665% · 연결 ÷ 비연결 평균 거리 0.480
ⓕ PASS  합성 2000노드 · 동작 확인용 · 첫 문항 「노칭 프레스 금형 관리 어떻게 해?」 칠할 노드(닻 있음) 54 전부 보임 True · 칩 「질의: 노칭 프레스 금형 관리 어떻게 해? +56」 · 둘째 → 칩 바뀜(하나) True · 지우기 → 칩 빠지고 질의 전 집합 True · 끌어오는 동안 /api/neighbors·/api/graph 요청 0
ⓖ PASS  합성 2000노드 · 동작 확인용 · 연결 수 순으로 크기가 거꾸로이거나 같은 수에 다른 크기인 이웃 쌍 0 · 크기 4.11~18.00(상수 3~18 · 그린 픽셀 4.11~18.00) · 관계 전부 끄기·깊이 바꿈 뒤 노드마다 같음 True
ⓜ PASS  verify/captures/p3_expand_synth.png · verify/captures/p3_query_synth.png (「합성」 띠)
오류 PASS  페이지 오류 0 []
ⓛ PASS  상태 폴더 data·registry·layers 해시 그대로 True · 시스템 폴더 git status 빈 출력 True · 외부(127.0.0.1 밖) 요청 0 · 남은 합성 임시 폴더 0
FAIL: ⓔ
```

**ⓒ 끌기 한 걸음 — 전 · 후** (합성 2,000 · 「전체」 · 허브 8px × 10걸음 · 걸음마다 다음 그리기까지 기다림):

| 조건 | 착수 전(전제 12) | 후 | 판정(1/3 이하) |
|---|---|---|---|
| 2코어 `taskset -c 0,1` (기준 · P-38) | 1.02초 | `걸음 0.13 0.43 0.08 0.52 0.57 0.55 0.59 0.57 0.55 0.48 · 평균 0.45초` | **FAIL** (문턱 0.34) |
| 4코어 (참고) | 0.52초 | `걸음 0.03 0.38 0.34 0.29 0.31 0.28 0.36 0.29 0.30 0.27 · 평균 0.28초` | **FAIL** (문턱 0.17) |

- 넣은 것: 프레임 합치기(rAF에서 가장 최근 것 하나) · 끄는 동안 마우스 아래 노드 찾기 끔 · 같은 엣지 id 정리 · 보이는 노드만 그리기(「전체」에서는 효과 없음).
- 남은 부하(추정 · 아직 재지 않았다): 소프트웨어 WebGL이 한 장을 그리는 값 자체(노드 2,000 · 엣지 약 4,300 · 라벨 · `zIndex` 정렬)와, 2코어에서 힘 배치 워커와 그리기가 CPU를 나눠 쓰는 것.
  다음 후보는 끄는 동안 라벨·엣지 그리기 줄이기(sigma `hideEdgesOnMove`·`hideLabelsOnMove` 꼴) 또는 Canvas 2D(이 회차 밖 — 요청문 §4). 명세가 정할 일이라 제안만 한다(6절).

**ⓙ 회귀 — 전부 종료 코드 0**
- `python3 verify/p1_contract.py` → 전부 PASS · `python3 verify/p1_process.py` → 전부 PASS · `python3 verify/p1_screen.py --chromium …` → 전부 PASS(ⓓ 보이는 노드 73 = 서버 anchor 노드 73 · ⓙ 쓰기 0 · ⓚ 외부 요청 0 — mock) ·
  `python3 verify/p2_query.py --chromium …` → 전부 PASS. mock은 「전체」로 열린다.

**ⓚ 전체 배치 그대로** — `python3 verify/p16_drag.py --chromium … --ref <전제 13의 파일>` → 종료 코드 0:
```
ⓒ PASS  「다시 배치」 뒤 쉰 좌표 73개 — 저장한 좌표와 다른 노드 0개 · 가장 큰 차이 0.00e+00
ⓑ PASS  허브 PH73Y3 끈 거리 66.70 — 1홉 77%(16) · 2홉 36%(20) · 3홉 13%(20) · 4홉 이상 5%(16)
ⓐ PASS  허브를 끌어 놓고 쉰 뒤 2px · 2초 끌기 네 번 — Z90NED 0.377% → 0JTRBV 0.252% → NR5NNA 0.194% → 51VNVF 0.173% (매번 < 1%)
ⓓ PASS  p15_drag.py 종료 코드 0 — P1.5 ⓐ~ⓙ · 그 안의 ⓘ로 P1 확인 셋
ⓔ PASS  「## 개발 세션 전용」 앞 93줄에서 doctor 0개
```
- 첫 판에서는 ⓓ가 FAIL이었다. 안쪽 `p1_process.py`가 종료 코드 1을 냈다. 따로 세 번 돌리면 셋 다 0이었고, `p15_drag.py`도 따로 돌리면 전부 PASS였다.
  코드를 바꾸지 않고 다시 돌린 `p16_drag.py`는 위처럼 전부 PASS다. 안쪽 실행의 출력은 감춰져서 원인을 잡지 못했다. 자식 프로세스·포트 쪽의 간헐적 실패로 보고 기록만 해 둔다.

### 4. 화면 캡처 (합성 — 동작 확인용 · 「합성」 띠)

- `verify/captures/p3_expand_synth.png` — 「골격만」에서 하나 펼친 화면
- `verify/captures/p3_query_synth.png` — 질의를 끌어온 화면

### 5. 가결정 — `DECISIONS.md` P-38 ~ P-45

P-38 ⓒ·전제 12는 2코어에서 잰다 · P-39 찾기 수는 닻 있는 노드만 · P-40 크기 최소·최대 3·18px · P-41 자리 잡기의 용수철 = 상한 · 출발 고리 ·
P-42 마우스 아래 노드 찾기 끄기(sigma 비공개 칸) · P-43 마지막 프레임은 바로 적용 · P-44 「합성」 띠는 확인 스크립트가 · P-45 합성 Zipf 후보에 만든 노드도.

### 6. 명세에 바꿀 문장 제안 (이 세션은 고치지 않았다)

1. §5.1 「새 노드가 이미 있던 노드보다 많으면 보이는 노드로 전체 배치」 뒤에 → 「이때는 먼 노드도 움직인다 — 기존 노드를 붙잡는 성질은 새 노드 ≤ 기존 노드일 때만 약속한다.」
   요청문 ⓔ는 → 「새 노드 ≤ 기존 노드인 펼치기에서 잰다」 (B-02 · 권고 A).
2. §5.7 → 「끌기 한 걸음은 2코어(`taskset -c 0,1`)의 머리 없는 Chromium에서 잰다」 (P-38 — 코어 수에 따라 전이 0.52초와 1.02초로 갈린다).
3. §5.7에 더할 다음 수단(ⓒ 1/3에 못 미침) → 「끄는 동안 엣지·라벨을 그리지 않는다(sigma `hideEdgesOnMove` · `hideLabelsOnMove` 꼴)」를 후보로 — 플랫폼 트랙이 정한다.

### 7. 시스템에 필요한 것

없음.

### 8. 소요 시간

받은 문서 커밋(16:10)부터 마감(약 16:50)까지 컨테이너 시계로 약 40분이다. 그 전의 P2 병합 확인 · 구현 · 합성 · 확인 스크립트 작업은 이 시계에 들어가지 않는다(대화가 한 번 끊겼다 이어졌다).
실제로 든 시간은 두 시간 상한을 넘겼다고 본다. ⓒ·ⓔ는 그래서 더 파지 않고 그대로 보고한다.

### 9. 사용자가 사내에서 처음 켤 때 할 일

**설치·켜기** (README 「사내에서 켜기」)
1. 시스템 CLI를 쓰는 그 파이썬에 설치한다. 시스템 CLI 셸에서 `which python`을 본 뒤 `<그 파이썬> -m pip install -r <플랫폼 폴더>/requirements.txt`를 돌린다.
   `<플랫폼 폴더>`·`<시스템 코드 폴더>`는 각자 `run.py`가 있는 폴더다. 상태 폴더 `$ONTO_HOME`과는 다르다.
2. `~/.zshrc`에 별칭 한 줄을 넣고 `source ~/.zshrc` → `onto-platform`:
   `alias onto-platform='<그 파이썬> <플랫폼 폴더>/run.py --system <시스템 코드 폴더> --no-browser'`
3. **자기 PC 브라우저로 연다**. VS Code는 「플랫폼 주소」 줄의 포트를 넘겨 준다(`[system]` 줄의 주소는 열지 않는다).
   그 밖의 SSH는 `ssh -L 8800:127.0.0.1:8800 <서버>`를 한 뒤 PC 브라우저에서 `http://127.0.0.1:8800/`을 연다.
4. 머리 줄 「상태」가 `echo $ONTO_HOME`과 같은지 본다.
5. 끝낼 때 Ctrl+C → `pgrep -af "run.py viewer"`가 빈 출력인지 본다.

**1단계를 닫는 데 필요한 넷 — 적어서 플랫폼 트랙에 넘긴다**
6. 머리 줄 **「그리기」(GPU · 소프트웨어)와 툴팁의 장치 이름**.
7. **골격에서 하나 펼친 화면**(두 번 누름 또는 「여기서 펼치기」)과 **「전체」에서의 끌기 손맛**(허브 하나 · 잎 하나).
8. **첫 배치가 쉬기까지의 시간**(머리 줄 「힘 진행」이 「쉼」이 될 때까지 · 「골격만」과 「전체」 각각).
9. **「끌 때 따라오는 범위」 다섯 단 중 고른 단**.

**질의 확인** (P2 보고 9~12 그대로 + P3)
10. **원본 열기**: 노드 상세의 나온 문서 → 문서 패널 「원본 열기」가 원본 파일을 여는지.
11. **LLM 선별 칩 모양**: 점선 테두리 + 점수 · 이유로 보이는지, 그래프에서 자주색으로 칠해지는지.
12. **상태 줄**: 단계(벡터 준비 › 링킹 › 확장 › 수집 › 답변)를 따라 바뀌는지.
13. **첫 질의의 벡터 준비 시간**.
14. **질의 끌어오기**: 「골격만」에서 질의하면 칠할 노드가 화면에 더해지고, 왼쪽 칸에 칩 「질의: … +n」이 뜨는지.

---

## P2 — 질의·문서·연결 현황 (2026-10-20 · 완료 · 1단계 마지막 회차)

요청문 `docs/요청문/P2_질의와문서.md` · 시스템 `4af5505`(읽기·실행만 — 실행 뒤 `git status --porcelain` 빈 출력) · 브랜치는 main(`d79a7f3` — P1.6 병합)에서 땄다.
숫자는 전부 **mock**이다. 2단계 화면(인입·큐·등록 등)은 만들지 않았다(명세 §1).

### 1. 전제 대조표 — 11행 전부 기대값과 같음

| # | 확인 | 기대 | 실측 |
|---|---|---|---|
| 1 | PROGRESS 완료판정 · P1.6 병합 | 전부 통과 · 병합 | P1 ⓐ~ⓛ · P1.5 ⓐ~ⓙ · P1.6 ⓐ~ⓔ 전부 PASS · `d79a7f3 Merge pull request #2` |
| 2 | `/api/query` 칸 | §4 칸 · trace 아홉 키 | 시험 문항 12개 모두 빠진 칸 0 · trace 아홉 키 전부 |
| 3 | `grep -n "body = as_json(answer(q))" cli/viewer/server.py` | 144 | `144` |
| 4 | `/api/query?q=` | `{"error": "q가 비었다"}` · 400 | `400 {'error': 'q가 비었다'}` |
| 5 | `/api/status` | 네 칸 · 단계 다섯 | `line · query · stages · vectors` · `벡터 준비 · 링킹 · 확장 · 수집 · 답변` |
| 6 | `/api/doc/<id>` · `/api/doc/seed` | 여덟 칸 · 404 | CP01 — 여덟 칸 · seed `404 그 doc_id는 문서 대장에 없다` |
| 7 | `/api/funnel` | 다섯 칸 | `keys · orphans · rows · total · 정의` |
| 8 | `tests/fixtures/queries.json` | `queries[].q` 12개 | 12개 |
| 9 | `trace.answer.mode` | 개발 `"mock"` | 12개 모두 `mock` |
| 10 | `trace.linking[].method` · `l.method === "embed+llm"` | 개발 `dict`만 · 97 | `dict`만 · `97`(그 밖 156 · 193) |
| 11 | 링킹이 빈 문항 | 있다(마지막) | 문항 12 「리튬이온 배터리 동작 원리 설명해줘」 |

### 2. 만든·고친 파일

| 파일 | 내용 |
|---|---|
| `frontend/src/panels/QueryPanel.tsx` | 질의 탭 — 질문 · 상태 줄(0.4초) · 경로·의도·LLM 배지 · 미스·잘림·note · 칸 일곱(ⓐ~ⓖ) · 겹쳐 보기 만들기(`overlayOf` — trace에 적힌 것만) · 오류 카드 |
| `frontend/src/panels/DocPanel.tsx` | 문서 패널 — 원본 열기/안내 · 판정 대장 행 수 · tally · 만든 노드 · 시트 역할 · 청크 |
| `frontend/src/panels/FunnelView.tsx` | 연결 현황 — 정의 문장 · 표 · 합계 · orphan 카드 |
| `frontend/src/panels/Detail.tsx` | 노드 상세 [P2] — 「이 노드로 질문」 · 나온 문서(`seed` 제외) · 닻까지의 길 · 근거 원문 · 붙은 자리 |
| `frontend/src/graph/view.ts` · `style.ts` | 겹쳐 보기(`setOverlay` — 리듀서만 · 색과 경로 엣지 굵기) · 겹쳐 보기 색 |
| `frontend/src/App.tsx` · `types.ts` · `styles.css` | 탭 셋 · 오른쪽 칸 노드 상세 ↔ 문서 패널 · 「화면에 없는 노드 n개」 · P2 응답 모양 · 글과 목록 꼴 |
| `verify/p2_query.py` | 새 확인 스크립트 ⓐ~ⓚ |
| `README.md` · `DECISIONS.md` | 화면 절에 질의·문서·연결 현황 · 개발 절에 확인 스크립트 · P-30~P-37 |
| `frontend/dist/` · `verify/captures/p2_*.png` | 다시 빌드 · 캡처(mock) |

### 3. 완료판정 — `python verify/p2_query.py` → 종료 코드 0 (두 번 연달아 전부 PASS)

```
ⓐ PASS  문항 12개 — 칸 항목 수 = 응답 목록 길이(ⓐ·ⓑ·ⓒ·ⓓ·ⓔ·ⓖ · 쓴 것 표시 = used 수) · 첫 문항 응답 {'linking': 3, 'hops': 14, 'facts': 36, 'facts_used': 36, 'collection': 19, 'collection_used': 0, 'doc_search': 8, 'doc_search_used': 0, 'records': 16}
ⓑ PASS  문항 12개 모두 칠한 노드·굵은 엣지 = trace · 첫 문항: 칠한 노드 12 = 기대 12(화면에 없는 것 0) · 링킹∩확장 0개 링킹 색 · 굵은 엣지 14 = 기대 14 · 12번 질의 전후 좌표 바뀐 노드 0개
ⓔ PASS  문항 12 「리튬이온 배터리 동작 원리 설명해줘」 — 링킹 칸 0개 · 미스 알림 「미스(사전 단): 리튬이온 배터리 동작 원리 설명해줘」 · 칠한 노드 0 · 굵은 엣지 0
ⓒ PASS  묻는 동안(버튼 막힘) 상태 줄 1번 바뀜 — 처음 「질의 보냄 — 서버가 받기를 기다린다」 · 끝난 뒤 「질의 끝 — ✓ 벡터 준비 › ✓ 링킹 › ✓ 확장 › ✓ 수집 › ✓ 답변 · 경과 0초」 · data-stage=끝 · ✓ 5개 = query.seen ['벡터 준비', '링킹', '확장', '수집', '답변']
ⓕ PASS  누른 노드 B6683S → 상세 B6683S · 근거 청크 화면 5(카드 5) = 응답 evidence 5 · 닻까지의 길 1단계 = anchor_path.steps 1
ⓖ PASS  문서 PFMEA01 — tally 화면 {'anchor': 12, 'new': 30, 'attached': 38, 'match': 7, 'pending': 1, 'orphan': 2} = 응답 · 대장 90행 = 90 · 노드 31 = 31 · raw_rel=None → 안내 문장 있음 · /raw/없는/파일.xlsx 플랫폼 404 「원본 자리(<상태>/raw/) 아래의 파일이 아니다」 = 시스템 404
ⓘ PASS  노드 「절연 파괴」 → 질문 칸 「절연 파괴」 · 누른 뒤 1초 동안 /api/query 요청 0건
ⓗ PASS  행 6 = rows 6 · 합계 줄 = total · orphan 카드 2 = 2 · 정의 문장이 표 위(y 108 < 134)
ⓓ PASS  빈 질문 → 「HTTP 400 — q가 비었다」 · 시스템 서버(pid [1106]) 끈 뒤 → 「HTTP 502 — 시스템 서버가 꺼졌다 — 플랫폼을 다시 켜라」
ⓙ PASS  해시 대상 22개 중 바뀐 것 0개 · 시스템 git status --porcelain 빈 출력
ⓚ PASS  verify/captures/p2_query_mock.png · verify/captures/p2_funnel_mock.png (mock 표본)
```

- 「링킹과 확장 둘 다에 있으면 링킹 색」은 문항 12개 중 8개(문항 2~9)에 그런 노드가 하나씩 있어 실제로 잰다(ⓑ는 노드마다 색을 정확히 대조).
- 회귀: `python verify/p16_drag.py --ref <기준 파일>` → 종료 코드 0 — P1.6 ⓐ~ⓔ · 그 안의 P1.5 ⓐ~ⓙ · P1 셋(쓰기 0 · 외부 요청 0 포함) 전부 PASS.
- 처음 돌렸을 때 ⓒ가 FAIL이었다 — 화면이 아니라 잣대의 흠(응답을 늦추는 가로채기가 동기 Playwright에서 겹치지 않았다). MutationObserver로 바꿨다(P-37).

### 4. 화면 캡처 (전부 mock)

- `verify/captures/p2_query_mock.png` — 질의 결과 + 겹쳐 보기(문항 1)
- `verify/captures/p2_funnel_mock.png` — 연결 현황
- `verify/captures/p2_doc_mock.png` — 문서 패널(덤)

### 5. 가결정 — `DECISIONS.md`

P-30 화면 배치(탭 셋 · 질의 탭 왼쪽 440px · 연결 현황은 캔버스 위에 덮음) · P-31 겹쳐 보기 색 · P-32 확장 경로 표시 상한 30 · P-33 빈 질문도 서버에 · P-34 칸의 모양(레코드 JSON 전부 · 짧은 답의 없는 칸은 「—」 · LLM 배지) ·
P-35 상태 줄 · P-36 빠진 칸 카드는 그 칸 안에 · P-37 확인 스크립트의 잣대.

### 6. 명세에 바꿀 문장 제안 (이 세션은 고치지 않았다)

1. §6.1 칸 일곱의 ⓕ 「짧은 답: `trace.answer.text` · 모드 배지(`trace.answer.mode`) · 줄 수 · 쓴 근거 수」
   → 「… · 줄 수 · 쓴 근거 수(`answer.lines` · `answer.used_chunks` — 실호출 응답에만 있다. 없으면 「—」)」 (P-34 — mock 응답의 `answer`는 `text`·`sources`·`mode`뿐이다)
2. §6 머리에 → 「질의·연결 현황을 보는 동안에도 그래프 캔버스는 떠 있다 — 질의의 겹쳐 보기가 그 위에 칠해지고, 연결 현황은 캔버스 위에 덮어 보인다.」 (P-30)

### 7. 시스템에 필요한 것

없음.

### 8. 소요 시간

약 15분(04:15 착수 → 04:30 마감 — 전제 대조 3분 · 화면 5분 · 확인·회귀 4분 · 장부 3분). 두 시간 상한 안.

### 9. 사용자가 사내에서 처음 켤 때 할 일 (1단계를 닫는 데 필요한 것 — 명세 §1)

**설치·켜기**
1. 시스템 CLI를 쓰는 그 파이썬에 설치: 시스템 CLI 셸에서 `which python` → `<그 파이썬> -m pip install -r <플랫폼 폴더>/requirements.txt`.
2. `~/.zshrc`에 별칭 한 줄: `alias onto-platform='<그 파이썬> <플랫폼 폴더>/run.py --system <시스템 코드 폴더>'` → `source ~/.zshrc` → `onto-platform`.
3. 머리 줄 「상태」가 `echo $ONTO_HOME`과 같은지 본다.
4. 끝낼 때 Ctrl+C → `pgrep -af "run.py viewer"`가 빈 출력인지 본다.

**1단계를 닫는 데 필요한 넷 — 적어서 플랫폼 트랙에 넘긴다**
5. 머리 줄 「노드 n/N」의 **N이 1,500을 넘는가** — 넘으면 다음 회차는 탐색 모드가 먼저다(명세 §7.1).
6. **숨긴 연결 없는 노드 수** — 그래프 탭 「연결 없는 노드 n개는 숨겼다」(머리 줄 「노드 n/N」의 차이와 같다).
7. **첫 배치가 쉬기까지의 시간**(머리 줄 「힘 진행 — 반복 …」이 「쉼」이 될 때까지)과 **끌기 손맛**(허브 하나 · 잎 하나를 끌어 본다).
8. **「끌 때 따라오는 범위」 다섯 단 중 고른 단** — 가장 좁게 ↔ 가장 넓게를 바꿔 가며 끌어 보고(다음 끌기부터 적용) 보기 편한 단.

**질의 확인 — 개발(mock)에서 볼 수 없던 것**
9. **원본 열기** — 노드 상세의 나온 문서 → 문서 패널 「원본 열기」가 원본 파일을 여는지(개발 표본은 전부 `raw_rel` 없음이라 안내 문장만 봤다).
10. **LLM 선별 칩 모양** — 질의 탭 ⓐ에서 「임베딩 후보 + LLM 선별」 칩이 점선 테두리 + 점수 · 이유로 보이고, 그래프에서 자주색으로 칠해지는지.
11. **상태 줄이 단계를 따라 바뀌는지** — 묻는 동안 「질의 중 — 벡터 준비 › 링킹 › 확장 › 수집 › 답변」의 굵은 단계가 옮겨 가는지(개발은 수십 ms라 「끝」만 봤다).
12. **첫 질의의 벡터 준비 시간** — 켠 직후 머리 줄의 벡터 줄, 또는 첫 질의 상태 줄의 「벡터 준비」 경과 초.

---

> P1.6 마감 보고는 git 기록에 있다 — `git show 1dda4ae:PROGRESS.md`. P1.5는 `git show 7da51e8:PROGRESS.md` · P1은 `git show 1c22560:PROGRESS.md`.
