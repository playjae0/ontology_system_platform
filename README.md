# 온톨로지 시스템 플랫폼 (`ontology_system_platform`)

온톨로지 시스템(`playjae0/ontology_system`)을 화면으로 쓰게 하는 플랫폼이다. 지금 단계는 **보기**(그래프)다 —
그래프는 지금처럼 시스템 CLI로 만들고, 플랫폼은 만들어진 그래프를 본다. 정본 문서는 `docs/명세.md`다.

플랫폼은 시스템 코드를 고치지도 불러오지도 않는다. 시스템 폴더에서 시스템 데이터 서버(`run.py viewer`)를 자식으로 띄우고,
그 서버에 HTTP GET으로 묻는다. 시스템 상태 폴더(`$ONTO_HOME`)에는 아무것도 쓰지 않는다.

## 사내 실행

Python만 있으면 된다 — 화면은 이미 빌드되어 `frontend/dist`에 들어 있다(Node 불필요 · 외부 주소 0). 플랫폼 폴더는 시스템 코드 폴더 옆에 둔다.

**1. 시스템 CLI를 쓰는 그 파이썬(가상환경)에 설치한다.** 플랫폼은 자기를 실행한 파이썬으로 시스템 서버를 띄우므로, 다른 파이썬으로 켜면
시스템의 선택 의존(로컬 임베딩 등)이 없어 질의가 깨질 수 있다.

```bash
which python                                   # 시스템 CLI를 치던 셸에서 — 이 경로를 아래에 쓴다 (예: ~/onto/venv/bin/python)
~/onto/venv/bin/python -m pip install -r ~/onto/ontology_system_platform/requirements.txt
```

**2. 셸 설정에 별칭 한 줄을 한 번 등록한다.** 파이썬도 경로로 박는다 — 가상환경을 켜지 않은 셸에서도 같은 파이썬이 되게.

```bash
echo "alias onto-platform='~/onto/venv/bin/python ~/onto/ontology_system_platform/run.py --system ~/onto/ontology_system'" >> ~/.zshrc
source ~/.zshrc
onto-platform
```

- 경로는 예다 — `<시스템 CLI의 파이썬 경로> <플랫폼 폴더>/run.py --system <시스템 코드 폴더>` 꼴로 자기 경로를 넣는다.
- 플랫폼 폴더 안에 경로 설정 파일을 두지 않는다(회차마다 폴더를 통째로 바꾸므로 함께 사라진다). 시스템 코드 폴더 이름을 바꿔 반입하면 이 한 줄도 고친다.
- 상태 폴더는 플랫폼이 모른다 — 켠 셸의 환경(`ONTO_HOME`)이 그대로 시스템 서버로 간다. 시스템 설정은 `$ONTO_HOME/llm.json`이다.

**3. 켜진 뒤 확인한다.**

- 플랫폼 주소(`http://127.0.0.1:8800/`)가 찍히고 브라우저가 열린다. `127.0.0.1`에만 열린다.
- 화면 머리 줄의 「상태」가 시스템 `doctor` 첫 줄(시스템 코드 폴더에서 `python doctor.py` — 머리 아래 「상태 폴더 …」 줄)의
  상태 폴더와 같은지 본다 — 다르면 셸의 `ONTO_HOME`을 확인한다.
- 멈출 때는 Ctrl+C — 시스템 서버도 함께 꺼진다. 그 뒤 `pgrep -af "run.py viewer"`가 빈 출력이어야 한다.
- 시스템 서버의 출력은 콘솔(`[system] …`)과 플랫폼 폴더의 `logs/platform_<날짜>.log`에 같이 남는다.

| 옵션 | 뜻 |
|---|---|
| `--system <폴더>` | 시스템 코드 폴더(`run.py`가 있는 곳) — 필수 |
| `--port N` | 플랫폼 포트(기본 8800 · 차 있으면 다음 빈 번호) |
| `--no-browser` | 브라우저를 열지 않는다 |

종료 코드: **0** 정상 · **1** 시스템 서버를 못 띄움(그때까지의 출력을 그대로 보인다) · **2** 시스템이 실데이터로 뜨지 않음
(이 셸의 `ONTO_HOME`과 시스템이 읽은 상태 폴더를 찍는다 — 셸 설정의 `ONTO_HOME`과 그 폴더의 `llm.json`을 확인한다) · **3** 칸 빠짐(빠진 칸을 찍는다).

## 화면

- 그래프 — 힘 배치(웹 워커)로 퍼진다. 노드를 끌면 연결된 노드가 따라온다 — 가까울수록 많이, 멀수록 적게. 놓으면 그 자리에 고정된다(「다시 배치」가 푼다).
- **끌 때 따라오는 범위** 밀대(좁게 ↔ 넓게 5단) — 다음 끌기부터 적용된다. 사내 그래프에서 허브와 잎을 끌어 보며 보기 편한 단을 고른다.
- 크기는 tier 계단 · 골격 노드(`status` seed)는 테두리 · 층을 건너는 엣지는 보라 곡선(관계 토글과 무관하게 언제나).
- 색 축(layer · category · status · tier · polarity · made_by) · 관계 토글 · 찾기(강조만) · 전체 이름 · 간격 · 멈춤/이어서(멈춘 동안 끌면 그 점만 옮긴다).
- 머리 줄 힘 상태 — 진행 · 쉼 · 멈춤 · 끌기 · 식힘.
- 노드를 누르면 오른쪽에 상세(그래프 칸 · 인접 엣지 — 누르면 그 노드로).
- 시스템 응답에 화면이 쓰는 칸이 빠지면 「시스템이 바뀌어 화면이 못 따라간다 — 빠진 칸: …」 카드가 뜬다.

배치: `run.py`(진입) · `backend/system_server.py`(시스템과 닿는 유일한 자리) · `backend/contract.py`(화면이 쓰는 칸) ·
`backend/app.py`(라우트) · `frontend/`(React + TypeScript + Vite · sigma.js 3 + graphology) · `verify/`(회차 확인).
장부: `PROGRESS.md`(마감 보고) · `DECISIONS.md`(가결정) · `BLOCKERS.md`(명세가 답하지 않는 곳).

## 개발 세션 전용

사내에서는 쓰지 않는다. 개발 세션은 사내 데이터를 볼 수 없어 시스템 mock 상태로 한다(mock으로 본 숫자는 품질 근거가 아니다).

| 옵션 | 뜻 |
|---|---|
| `--allow-mock` | 시스템이 mock 모드여도 화면을 연다(화면 맨 위에 mock 띠). 도움말(`--help`)에는 보이지 않는다 |

```bash
# 시스템(읽기 전용 — 고치지 않는다)
git clone https://github.com/playjae0/ontology_system.git ../ontology_system
git -C ../ontology_system checkout 4af5505
(cd ../ontology_system && python run.py init --fresh --all && python run.py all)   # mock 표본 그래프

# 화면 빌드 (Node 22) — 산출 frontend/dist를 커밋한다
cd frontend && npm ci && npm run build && cd ..

python run.py --system ../ontology_system --allow-mock

# 확인 (Playwright Python — pip install playwright==1.56.0)
python verify/p1_process.py      # P1 ⓐ 명령 하나 · ⓑ 실데이터 아님 거부
python verify/p1_contract.py     # P1 ⓒ 칸 확인
python verify/p1_screen.py       # P1 ⓓ~ⓛ 화면
python verify/p15_drag.py        # P1.5 ⓐ~ⓙ 끌기 배치 · 거부 문면 · README · 회귀(위 셋을 함께 돌린다)
```

캡처는 `verify/captures/`에 남는다 — 전부 mock 표본이다.
