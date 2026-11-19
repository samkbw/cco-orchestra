# cco-orchestra

**Claude Code Orchestrator 전용 설정 패키지** (비공식)

[Claude Code Orchestrator](https://marketplace.visualstudio.com/items?itemName=toragonite.claude-code-orchestrator) VS Code 확장 프로그램을 쓰는 분을 위한 Claude Code 플러그인입니다.
확장 프로그램은 원래 프로젝트마다 연결과 규칙을 따로 설정해야 합니다. 이 패키지는 **한 번 실행으로** 설정을 끝내고, 확장 프로그램이 업데이트되면 그에 맞춰 갱신을 도와줍니다.

> 이 패키지는 Claude Code Orchestrator 확장 프로그램 제작자와 관계없는 별도 패키지입니다. 확장 프로그램이 설치돼 있어야 동작합니다.

## 준비물

| 준비물 | 필요 여부 |
|---|---|
| [Claude Code](https://claude.com/claude-code) | 필수 |
| VS Code + **Claude Code Orchestrator** 확장 | 필수 (설치 후 VS Code를 한 번 열어 두세요) |
| [Node.js](https://nodejs.org) | 필수 (확장 프로그램도 사용) |
| Codex CLI (`npm i -g @openai/codex` 후 `codex login`) | 선택: Codex를 워커로 쓸 때만 |

빠진 것이 있으면 처음 실행할 때 무엇이 빠졌는지 알려 드립니다.

## 설치

Claude Code 입력창에:

```
/plugin install orchestra --marketplace samkbw/cco-orchestra
```

터미널에서:

```
claude plugin install orchestra --marketplace samkbw/cco-orchestra
```

설치 후 Claude Code를 다시 시작하면 안내가 시작됩니다.

## 처음 실행하면

**🎼 오케스트라를 어디에 적용할까요?**

1. **모든 프로젝트에 적용 (추천)**: 한 번만 설정하면 어느 폴더에서 Claude를 쓰든 오케스트라가 동작합니다. 처음 쓰는 분, 설정을 신경 쓰고 싶지 않은 분께 맞아요.
2. **프로젝트마다 따로 설정**: 필요한 프로젝트에서만 켜고, 프로젝트마다 규칙을 다르게 둘 수 있습니다. 프로젝트별로 일하는 방식을 다르게 관리하고 싶은 분(주로 개발자)께 맞아요.

고르면 패키지가 알아서 해 주는 일:

| 일 | 1. 모든 프로젝트 | 2. 프로젝트마다 |
|---|---|---|
| 연결(`cco-dispatch`) 등록 | Claude 사용자 설정 | 그 프로젝트 `.mcp.json` |
| 기본 규칙 넣기 | `~/.claude/CLAUDE.md` | 그 프로젝트 `CLAUDE.md` |

기본 규칙은 설치된 확장 프로그램이 만드는 규칙을 **그대로** 가져옵니다. "이 규칙이 Claude 기본 습관보다 우선한다"는 부분(Precedence)만 뺍니다.
사람마다 일하는 방식이 다르니, 한 번 읽어 보고 내 방식에 맞게 고쳐 쓰세요. Claude에게 말로 하면 됩니다.
예) "오케스트라 규칙에서 작은 일은 직접 하게 바꿔줘"

## 쓰는 법

| 명령 | 하는 일 |
|---|---|
| `/orch` | 적용 범위, 규칙 위치, 기본 규칙 버전, 연결, Codex 상태 보기. 규칙 보기·다시 설정 버튼 |

## 확장 프로그램이 업데이트되면

- 시작할 때 "기본 규칙을 갱신해 주세요" 알림이 뜹니다. 버튼 하나로 갱신합니다.
- 규칙을 **고치지 않았으면** 새 기본 규칙으로 바꿉니다.
- 규칙을 **고쳤으면** 자동으로 덮어쓰지 않습니다. 새 기본 규칙을 `~/.claude/orchestra/기본규칙-<버전>.md`에 저장하고 알려 드립니다. Claude에게 "오케스트라 규칙을 새 기본 규칙과 합쳐줘"라고 하면 됩니다.
- 패키지는 `<!-- orchestra:rules:start -->` ~ `<!-- orchestra:rules:end -->` 사이만 다룹니다. 그 밖에 적은 내 규칙은 건드리지 않습니다.

## 그 밖에 알려 드리는 것

- **모든 프로젝트에 적용**을 골랐는데 프로젝트 `CLAUDE.md`에 확장 프로그램이 넣은 규칙이 있으면, 겹치므로 지울지 물어봅니다.
- **Windows**: Codex를 npm으로 설치하면 오케스트라가 `codex.exe`를 찾지 못합니다. 버튼 하나로 PATH에 추가해 드립니다 (VS Code를 완전히 껐다 켜야 적용).

## 기록

설정 시작·완료·오류와 걸린 시간을 `~/.claude/orchestra/orchestra.log`에 남깁니다.

## 지우기

1. `/plugin`에서 `orchestra` 제거
2. 규칙 파일(`~/.claude/CLAUDE.md` 또는 프로젝트 `CLAUDE.md`)에서 `orchestra:rules` 구간 삭제
3. 연결 삭제: `claude mcp remove -s user cco-dispatch` (프로젝트마다 설정했다면 `-s project`)

## 라이선스

MIT
