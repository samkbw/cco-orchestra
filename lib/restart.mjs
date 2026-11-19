// VS Code 다시 시작: 설치를 마친 뒤 열려 있는 VS Code(그 안의 Claude)가 새 플러그인·연결을 읽게 한다.
// 정상 종료 방식으로 닫아서 VS Code가 저장 안 한 파일과 열린 창을 기억했다가 다시 열게 한다. 강제 종료는 하지 않는다.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { findCodeCli } from './check.mjs'
import { isWindows, log, run, timed } from './sys.mjs'

const WAIT_CLOSE_MS = 30000
const WAIT_OPEN_MS = 20000
const CLAUDE_OPEN_DELAY_MS = 6000
const POLL_MS = 500

export function isVsCodeRunning() {
  if (isWindows) return /Code\.exe/i.test(run('tasklist', ['/FI', 'IMAGENAME eq Code.exe', '/NH'], { timeoutMs: 15000 }).stdout)
  return run('pgrep', ['-f', 'Visual Studio Code.app/Contents/MacOS'], { timeoutMs: 15000 }).code === 0
}

// 이 설치 프로그램이 VS Code 안 터미널에서 돌고 있으면, VS Code를 닫는 순간 설치 프로그램도 같이 닫힌다.
export const isInsideVsCode = () => process.env.TERM_PROGRAM === 'vscode' || Boolean(process.env.VSCODE_PID)

function askClose() {
  if (isWindows) run('taskkill', ['/IM', 'Code.exe'], { timeoutMs: 15000 })
  else run('osascript', ['-e', 'quit app "Visual Studio Code"'], { timeoutMs: 15000 })
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// VS Code 실행 파일: code 명령 위치(…\bin\code)의 한 단계 위, 없으면 기본 설치 위치
function codeExe() {
  const cli = findCodeCli()
  const fromCli = cli && cli !== 'code' ? path.join(path.dirname(cli), '..', 'Code.exe') : null
  const candidates = [fromCli, path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Microsoft VS Code', 'Code.exe'), path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Microsoft VS Code', 'Code.exe')]
  return candidates.find(file => file && fs.existsSync(file)) ?? null
}

// 인자 없이 열면 VS Code가 직전 창들을 그대로 다시 연다.
// Windows는 start로 띄워 이 설치 창과 완전히 떼어 놓는다 (설치 창을 닫아도 같이 꺼지지 않게).
function reopen() {
  if (!isWindows) {
    run('open', ['-a', 'Visual Studio Code'], { timeoutMs: 15000 })
    return
  }
  const exe = codeExe()
  log(`VS Code 다시 열기: ${exe ?? 'code 명령'}`)
  // start의 첫 따옴표는 창 제목: 명령 줄을 그대로 넘겨야 따옴표가 깨지지 않는다.
  const line = exe ? `start "" "${exe}"` : 'start "" code'
  spawnSync('cmd', ['/d', '/s', '/c', `"${line}"`], { windowsHide: true, windowsVerbatimArguments: true, timeout: 15000 })
}

// Claude Code 확장이 받는 주소 (확장의 URI 처리 /open → Claude를 편집기 영역에 연다)
const CLAUDE_URI = 'vscode://anthropic.claude-code/open'

function openClaude() {
  log('Claude Code 열기')
  if (isWindows) spawnSync('cmd', ['/d', '/s', '/c', `"start "" "${CLAUDE_URI}""`], { windowsHide: true, windowsVerbatimArguments: true, timeout: 15000 })
  else run('open', [CLAUDE_URI], { timeoutMs: 15000 })
}

async function waitOpened() {
  const started = Date.now()
  while (Date.now() - started < WAIT_OPEN_MS) {
    if (isVsCodeRunning()) return true
    await sleep(POLL_MS)
  }
  return false
}

// 결과: 'restarted' | 'closeTimeout'(저장 여부 창 등에서 멈춤) | 'openFailed'(닫았지만 다시 뜨지 않음)
export async function restartVsCode() {
  return timed('VS Code 다시 시작', async () => {
    askClose()
    const started = Date.now()
    while (isVsCodeRunning()) {
      if (Date.now() - started > WAIT_CLOSE_MS) {
        log('VS Code가 닫히지 않음 (저장 여부를 묻는 창 등)')
        return 'closeTimeout'
      }
      await sleep(POLL_MS)
    }
    reopen()
    // 실제로 다시 뜬 것을 확인한 뒤에만 "다시 열었다"고 알린다.
    if (await waitOpened()) {
      // VS Code가 창을 다 띄울 때까지 잠시 기다린 뒤 Claude Code를 연다 (Claude Code 확장의 열기 주소).
      await sleep(CLAUDE_OPEN_DELAY_MS)
      openClaude()
      return 'restarted'
    }
    log('VS Code를 다시 열지 못함 (20초 안에 뜨지 않음)')
    return 'openFailed'
  })
}
