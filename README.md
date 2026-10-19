# 온톨로지 시스템 플랫폼 (`ontology_system_platform`)

온톨로지 시스템(`playjae0/ontology_system`)을 화면으로 쓰게 하는 플랫폼이다. 지금 단계는 **보기**(P1 그래프)다 —
그래프는 지금처럼 시스템 CLI로 만들고, 플랫폼은 만들어진 그래프를 본다. 정본 문서는 `docs/명세.md`다.

플랫폼은 시스템 코드를 고치지도 불러오지도 않는다. 시스템 폴더에서 시스템 데이터 서버(`run.py viewer`)를 자식으로 띄우고,
그 서버에 HTTP GET으로 묻는다. 시스템 상태 폴더(`$ONTO_HOME`)에는 아무것도 쓰지 않는다.

## 사내 실행 — Python만 있으면 된다

```bash
# 이 폴더를 시스템 코드 폴더 옆에 둔다 (예: D:\onto\ontology_system 과 D:\onto\ontology_system_platform)
pip install -r requirements.txt
python run.py --system ..\ontology_system
```

- 플랫폼 주소(`http://127.0.0.1:8800/`)가 찍히고 브라우저가 열린다. `127.0.0.1`에만 열린다.
- 시스템 설정(`ONTO_HOME`·`USE_MOCK`·게이트웨이)은 플랫폼을 켠 셸 그대로 시스템 서버에 넘어간다.
- **시스템이 mock 모드로 떠 있으면 열리지 않는다**(종료 코드 2). 개발 세션만 `--allow-mock`으로 연다.
- Ctrl+C로 멈추면 시스템 서버도 함께 꺼진다.
- 시스템 서버의 출력은 콘솔(`[system] …`)과 `logs/platform_<날짜>.log`에 같이 남는다.
- 화면은 이미 빌드되어 `frontend/dist`에 들어 있다 — 사내에서 Node를 설치할 필요가 없다. 외부 주소(CDN·폰트)를 쓰지 않는다.

| 옵션 | 뜻 |
|---|---|
| `--system <폴더>` | 시스템 코드 폴더(`run.py`가 있는 곳) — 필수 |
| `--port N` | 플랫폼 포트(기본 8800 · 차 있으면 다음 빈 번호) |
| `--allow-mock` | 시스템이 mock이어도 연다 — 개발 세션만(화면 맨 위에 mock 띠) |
| `--no-browser` | 브라우저를 열지 않는다 |

종료 코드: 0 정상 멈춤 · 1 시스템 서버를 못 띄움(그때까지의 출력을 그대로 보인다) · 2 mock 거부 · 3 화면이 쓰는 칸이 빠짐(빠진 칸을 찍는다).

## 화면 (P1)

- 그래프 — 힘 배치(웹 워커)로 퍼지고, 노드를 끌면 연결된 노드가 따라온다. 놓은 노드는 그 자리에 고정된다(「다시 배치」가 푼다).
- 크기는 tier 계단 · 골격 노드(`status` seed)는 테두리 · 층을 건너는 엣지는 보라 곡선(관계 토글과 무관하게 언제나).
- 색 축(layer · category · status · tier · polarity · made_by) · 관계 토글 · 찾기(강조만) · 전체 이름 · 간격 · 멈춤/이어서.
- 노드를 누르면 오른쪽에 상세(그래프 칸 · 인접 엣지 — 누르면 그 노드로).
- 시스템 응답에 화면이 쓰는 칸이 빠지면 「시스템이 바뀌어 화면이 못 따라간다 — 빠진 칸: …」 카드가 뜬다.

## 개발

```bash
# 시스템(읽기 전용 — 고치지 않는다)
git clone https://github.com/playjae0/ontology_system.git ../ontology_system
git -C ../ontology_system checkout 4af5505
(cd ../ontology_system && python run.py init --fresh --all && python run.py all)   # mock 표본 그래프

# 화면 빌드 (Node 22) — 산출 frontend/dist를 커밋한다
cd frontend && npm ci && npm run build && cd ..

python run.py --system ../ontology_system --allow-mock

# 확인 (Playwright Python — pip install playwright==1.56.0)
python verify/p1_process.py      # ⓐ 명령 하나 · ⓑ mock 거부
python verify/p1_contract.py     # ⓒ 칸 확인
python verify/p1_screen.py       # ⓓ~ⓛ 화면 (캡처는 verify/captures/ — mock 표본)
```

배치: `run.py`(진입) · `backend/system_server.py`(시스템과 닿는 유일한 자리) · `backend/contract.py`(화면이 쓰는 칸) ·
`backend/app.py`(라우트) · `frontend/`(React + TypeScript + Vite · sigma.js 3 + graphology) · `verify/`(회차 확인).
장부: `PROGRESS.md`(마감 보고) · `DECISIONS.md`(가결정) · `BLOCKERS.md`(명세가 답하지 않는 곳).
