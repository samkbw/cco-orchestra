#!/bin/bash
# 오케스트라 설치 (macOS: 더블클릭으로 실행)
echo
echo "  =============================================="
echo "    오케스트라 설치 (Claude Code Orchestrator)"
echo "  =============================================="
echo

export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin"

# 1) Node.js: 있으면 그대로, 없으면 brew로 설치
if ! command -v node >/dev/null 2>&1; then
  echo "  Node.js가 없어 먼저 설치합니다..."
  if ! command -v brew >/dev/null 2>&1; then
    echo "  Homebrew가 없어 자동 설치할 수 없습니다."
    echo "  https://nodejs.org 에서 LTS 버전을 설치한 뒤 이 파일을 다시 실행해 주세요."
    read -r -p "  엔터를 누르면 닫습니다. " _
    exit 1
  fi
  brew install node
fi

# 2) 패키지를 내려받아 설치 화면 실행 (git 없이 GitHub에서 바로 받음)
npx -y https://github.com/samkbw/cco-orchestra/archive/refs/heads/main.tar.gz install "$@"
echo
read -r -p "  엔터를 누르면 닫습니다. " _
