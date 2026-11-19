#!/usr/bin/env node
// 플러그인 연결(cco-dispatch) 실행: 확장 프로그램이 설치한 서버(~/.claude-code-orchestrator/mcp/server.js)를 그대로 띄운다.
// 서버 파일은 확장 프로그램 것이므로 복사하거나 고치지 않는다. 확장이 업데이트되면 새 서버가 그대로 쓰인다.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const serverJs = path.join(os.homedir(), '.claude-code-orchestrator', 'mcp', 'server.js')

if (!fs.existsSync(serverJs)) {
  // stdout은 MCP 통신용이라 오류는 stderr로만 남긴다.
  console.error(`orchestra: 연결 서버가 없습니다 (${serverJs}). VS Code에서 Claude Code Orchestrator 확장을 한 번 열어 주세요.`)
  process.exit(1)
}

const child = spawn(process.execPath, [serverJs], { stdio: 'inherit' })
const stop = signal => child.kill(signal)
process.on('SIGINT', () => stop('SIGINT'))
process.on('SIGTERM', () => stop('SIGTERM'))
child.on('error', err => {
  console.error(`orchestra: 연결 서버 실행 실패: ${err.message}`)
  process.exit(1)
})
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
