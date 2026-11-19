# cco-orchestra

**Claude Code Orchestrator 전용 설정 패키지** (비공식)

[Claude Code Orchestrator](https://marketplace.visualstudio.com/items?itemName=toragonite.claude-code-orchestrator) VS Code 확장 프로그램을 쓰는 분을 위한 설치·설정 도구입니다.
확장 프로그램은 원래 프로젝트마다 연결과 규칙을 따로 설정해야 합니다. 이 패키지는 **설치 프로그램처럼** 빠진 것을 설치하고, 한 번에 설정을 끝내고, 확장 프로그램이 업데이트되면 갱신을 도와줍니다.

> 이 패키지는 Claude Code Orchestrator 확장 프로그램 제작자와 관계없는 별도 패키지입니다.

## ⬇ 다운로드 (설치 파일)

| 내 PC | 받기 | 실행 |
|---|---|---|
| **Windows** | [**orchestra-install.cmd 받기**](https://github.com/samkbw/cco-orchestra/releases/latest/download/orchestra-install.cmd) | 받은 파일을 더블클릭 |
| **macOS** | [**orchestra-install.command 받기**](https://github.com/samkbw/cco-orchestra/releases/latest/download/orchestra-install.command) | 받은 파일을 더블클릭 |

설치 파일이 순서대로 다 해 줍니다. 있는 것은 건드리지 않고 없는 것만 설치합니다.

```
Node.js → VS Code → Claude Code(VS Code 확장 + claude 명령 + 로그인)
→ Claude Code Orchestrator 확장 → 연결 서버 → Claude 작업 워커
→ Codex(선택: 설치·로그인·워커) → 적용 범위 고르기 → Claude 플러그인 등록
```

**처음 실행할 때 경고가 뜨면**
- Windows "PC 보호" 창: [추가 정보] → [실행]
- macOS "확인되지 않은 개발자": 파일을 오른쪽 클릭 → [열기] → [열기]
  (그래도 안 열리면 터미널에서 `chmod +x ~/Downloads/orchestra-install.command` 후 다시 더블클릭)

로그인 창(Claude, Codex)은 직접 로그인해 주세요. 끝나면 Claude Code를 다시 시작하면 됩니다.

## 원칙: 이미 있는 것은 건드리지 않습니다

| 항목 | 이미 있으면 | 없을 때만 |
|---|---|---|
| Node.js | 버전만 확인 | 설치 (Claude 패널에서) |
| VS Code | 그대로 (업데이트하지 않음) | 설치 (Windows winget · macOS brew, 없으면 사이트 안내) |
| VS Code 확장 | 그대로 (업데이트하지 않음) | 설치 |
| Codex CLI | 그대로 | 설치 |
| PATH | 내 값·순서 그대로 | 빠진 폴더 1개만 끝에 추가 |
| Claude 작업 워커 | 내 워커·설정 그대로 | 메인 계정을 같이 쓰는 워커 1개 추가 (우선 워커) |
| Codex 워커 | 내 워커·설정 그대로 | 워커 1개 추가 |
| 연결 (`cco-dispatch`) | 직접 등록한 것은 그대로 두고 알림 | 오케스트라 플러그인이 연결 (따로 등록하지 않음) |
| `CLAUDE.md` | 패키지 구간 밖은 손대지 않음 | 구간 추가 |

- 설치 화면·`orch install`은 바꾸기 전에 무엇을 추가할지 먼저 보여 주고 동의를 받습니다. (`--yes`, `apply`, `sync`처럼 직접 고른 명령은 바로 실행)
- 범위를 바꾸면 예전 범위에서 이 패키지가 넣은 **그대로인 것만** 지웁니다. 고친 규칙은 남기고 알려 드립니다. 전역 연결·규칙은 다른 프로젝트도 쓰므로 자동으로 지우지 않습니다.
- 고치는 파일은 먼저 `~/.claude/orchestra/backup/`에 백업합니다.
- 모든 작업은 `~/.claude/orchestra/orchestra.log`에 기록합니다.

## 설치: 3가지 방법 (결과는 같습니다)

### A. Claude 입력창에서 (초보자 추천)

```
/plugin install orchestra --marketplace samkbw/cco-orchestra
```

Claude Code를 다시 시작하면 설치 화면이 자동으로 뜹니다. 화면을 따라 누르면 됩니다.

### B. git으로 받아서 (숙련자)

```
git clone https://github.com/samkbw/cco-orchestra
node cco-orchestra/bin/orch.mjs install
```

### C. 한 줄로 (숙련자, Node.js 필요)

```
npx github:samkbw/cco-orchestra install
```

B·C는 터미널에서 묻고 진행하며, 끝나면 Claude 플러그인 등록까지 해 줍니다.

## 설치 화면 (A 방법)

```
1/3 확인    지금 PC에 무엇이 있는지 (✔ 있음 / ✖ 없음)와 추가할 것 목록
            [설치] [Codex 없이 설치] [취소]
2/3 설치    단계마다 진행 표시 (Codex 로그인은 로그인 창이 열립니다)
3/3 범위    1. 모든 프로젝트에 적용 (추천) / 2. 프로젝트마다 따로 설정
완료        결과 요약 + "기본 규칙을 내 방식에 맞게 고치세요" 안내
```

**어디에 적용할까요?**

1. **모든 프로젝트에 적용 (추천)**: 한 번만 설정하면 어느 폴더에서 Claude를 쓰든 오케스트라가 동작합니다. 처음 쓰는 분, 설정을 신경 쓰고 싶지 않은 분께 맞아요.
2. **프로젝트마다 따로 설정**: 필요한 프로젝트에서만 켜고, 프로젝트마다 규칙을 다르게 둘 수 있습니다. 프로젝트별로 일하는 방식을 다르게 관리하고 싶은 분(주로 개발자)께 맞아요.

| | 1. 모든 프로젝트 | 2. 프로젝트마다 |
|---|---|---|
| 기본 규칙 | `~/.claude/CLAUDE.md` | 그 프로젝트 `CLAUDE.md` |

연결(`cco-dispatch`)은 두 경우 모두 오케스트라 플러그인이 맡습니다. 설치 화면에서 적용하면 Claude를 다시 시작하지 않아도 바로 연결됩니다.

범위를 바꾸면 예전 범위에서 **이 패키지가 넣은 것만** 지웁니다.

## 누가 무엇을 하나

| 역할 | 누가 |
|---|---|
| 대화·지휘 (분석, 일 나누기, 결과 확인) | 지금 대화하는 Claude (메인) |
| 작업 (코드 작성 등) | 워커: Claude 작업 워커 + Codex 워커 |

Claude 작업 워커는 메인 계정을 같이 쓰므로 사용량도 같이 줄어듭니다. 사용량을 나누려면 VS Code 오케스트라 화면에서 다른 Claude 계정을 워커로 추가하세요.

## 자동으로 할 수 없는 것

- **VS Code 설치 도구가 없을 때**: winget(Windows)·brew(macOS)가 없으면 설치 사이트(https://code.visualstudio.com)를 안내합니다.
- **Codex 로그인**: 로그인 창은 열어 드리고, 로그인은 직접 해야 합니다.
- **터미널 설치(B·C·설치 파일) 뒤 이미 열려 있는 Claude**: `/reload-plugins`를 입력하면 연결됩니다. 새로 연 Claude는 바로 연결됩니다.

## 명령어

| Claude 입력창 | 터미널 | 하는 일 |
|---|---|---|
| `/orch` | `orch status` | 상태와 알림 보기 |
| `/orch install` | `orch install` | 설치 화면 (터미널은 질문으로 진행) |
| | `orch check` | 확인만 (아무것도 바꾸지 않음) |
| `/orch apply global` | `orch apply global` | 모든 프로젝트에 적용 |
| `/orch apply project` | `orch apply project` | 이 프로젝트에 적용 |
| `/orch sync` | `orch sync` | 확장 업데이트 뒤 기본 규칙 갱신 |
| | `orch merge-done` | 고친 규칙을 직접 합친 뒤 기록 |
| | `orch clean-ext` | 확장 프로그램이 프로젝트에 넣은 규칙 지우기 |
| | `orch step <id>` | 설치 단계 하나만 (ext, server, codex, codexPath, codexLogin, worker) |

터미널 옵션: `--yes`(묻지 않음), `--scope global|project`, `--skip-codex`, `--no-plugin`, `--cwd <폴더>`, `--json`
터미널에서 `orch`는 `node <받은 폴더>/bin/orch.mjs` 또는 `npx github:samkbw/cco-orchestra`로 실행합니다.

## 기본 규칙

설치된 확장 프로그램이 만드는 규칙을 **그대로** 가져옵니다. "이 규칙이 Claude 기본 습관보다 우선한다"는 부분(Precedence)만 뺍니다.
사람마다 일하는 방식이 다르니, 한 번 읽어 보고 내 방식에 맞게 고쳐 쓰세요. Claude에게 말로 하면 됩니다.
예) "오케스트라 규칙에서 작은 일은 직접 하게 바꿔줘"

### 확장 프로그램이 업데이트되면

- 시작할 때 "기본 규칙을 갱신해 주세요" 알림이 뜹니다.
- 규칙을 **고치지 않았으면** 새 기본 규칙으로 바꿉니다.
- 규칙을 **고쳤으면** 덮어쓰지 않고, 새 기본 규칙을 `~/.claude/orchestra/기본규칙-<버전>.md`에 저장합니다. Claude에게 "오케스트라 규칙을 새 기본 규칙과 합쳐줘"라고 한 뒤 [합치기 끝냄]을 누르면 됩니다.
- 패키지는 `<!-- orchestra:rules:start -->` ~ `<!-- orchestra:rules:end -->` 사이만 다룹니다.

## 지우기

1. `/plugin`에서 `orchestra` 제거 (연결도 같이 없어집니다)
2. 규칙 파일(`~/.claude/CLAUDE.md` 또는 프로젝트 `CLAUDE.md`)에서 `orchestra:rules` 구간 삭제
3. (0.3.0 이하에서 설치했다면) 예전 연결 삭제: `claude mcp remove -s user cco-dispatch`
4. (추가했다면) Codex 워커: VS Code 오케스트라 화면에서 워커 삭제
5. (추가했다면) PATH: Windows 설정 → 환경 변수에서 Codex `...\vendor\...\bin` 폴더 삭제. 추가 전 값은 기록 파일에 남아 있습니다.
6. 기록·백업 폴더 삭제: `~/.claude/orchestra`

## 라이선스

MIT
