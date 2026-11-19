@echo off
chcp 65001 >nul
setlocal
title 오케스트라 설치
echo.
echo  ==============================================
echo    오케스트라 설치 (Claude Code Orchestrator)
echo  ==============================================
echo.

rem 1) Node.js: 있으면 그대로, 없으면 winget으로 설치
where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js가 없어 먼저 설치합니다...
  where winget >nul 2>nul
  if errorlevel 1 (
    echo  winget이 없어 자동 설치할 수 없습니다.
    echo  https://nodejs.org 에서 LTS 버전을 설치한 뒤 이 파일을 다시 실행해 주세요.
    pause
    exit /b 1
  )
  winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
  set "PATH=%PATH%;%ProgramFiles%\nodejs;%APPDATA%\npm"
)
where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js를 찾지 못했습니다. PC를 다시 시작한 뒤 이 파일을 다시 실행해 주세요.
  pause
  exit /b 1
)

rem 2) 패키지를 내려받아 설치 화면 실행 (git 없이 GitHub에서 바로 받음)
call npx -y https://github.com/samkbw/cco-orchestra/archive/refs/heads/main.tar.gz install %*
echo.
pause
