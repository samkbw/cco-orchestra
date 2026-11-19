// 공통: 경로, 명령 실행, 기록, 상태 파일, 백업
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const isWindows = process.platform === 'win32'
export const home = os.homedir().replace(/\\/g, '/')
export const dataDir = `${home}/.claude/orchestra`
export const logFile = `${dataDir}/orchestra.log`
export const stateFile = `${dataDir}/state.json`
export const backupDir = `${dataDir}/backup`
export const orchHome = `${home}/.claude-code-orchestrator`
export const serverJs = `${orchHome}/mcp/server.js`
export const registryFile = `${orchHome}/registry.json`

// 막 설치한 프로그램(claude, code, npm 전역)은 PATH 반영 전이라 못 찾으므로, 기본 설치 위치를 이 실행의 PATH에 더한다.
const KNOWN_BIN_DIRS = (isWindows
  ? [
      path.join(os.homedir(), '.local', 'bin'),
      path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Microsoft VS Code', 'bin'),
      path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'nodejs'),
      path.join(process.env.APPDATA ?? '', 'npm'),
    ]
  : [path.join(os.homedir(), '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin'])
  .filter(dir => dir && fs.existsSync(dir))
const pathParts = (process.env.PATH ?? '').split(path.delimiter)
const missingDirs = KNOWN_BIN_DIRS.filter(dir => !pathParts.some(p => p.toLowerCase() === dir.toLowerCase()))
if (missingDirs.length) process.env.PATH = [...pathParts, ...missingDirs].join(path.delimiter)

const LOG_KEEP = 500
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

export function log(text) {
  try {
    fs.mkdirSync(dataDir, { recursive: true })
    const stamp = new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ')
    const before = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split(/\r?\n/).filter(Boolean) : []
    fs.writeFileSync(logFile, `${[...before, `[${stamp}] ${text}`].slice(-LOG_KEEP).join('\n')}\n`)
  } catch {
    // 기록 실패는 작업을 막지 않는다.
  }
}

// 걸린 시간과 함께 시작·완료·오류를 기록한다.
export async function timed(what, work) {
  const started = Date.now()
  log(`${what} 시작`)
  try {
    const result = await work()
    log(`${what} 완료 (${Date.now() - started}ms)`)
    return result
  } catch (err) {
    log(`오류: ${what} 실패 (${Date.now() - started}ms): ${err?.message ?? err}`)
    throw err
  }
}

// Windows의 .cmd 프로그램(code, npm, codex)은 셸을 거쳐야 실행된다. 인자는 직접 따옴표로 감싼다.
const quote = arg => (/^[\w@./:=+-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '\\"')}"`)

export function run(cmd, args = [], { cwd, timeoutMs = 120000, input } = {}) {
  const viaShell = isWindows && cmd !== process.execPath
  const out = viaShell
    ? spawnSync([cmd, ...args].map(quote).join(' '), { shell: true, cwd, timeout: timeoutMs, encoding: 'utf8', input, windowsHide: true })
    : spawnSync(cmd, args, { cwd, timeout: timeoutMs, encoding: 'utf8', input, windowsHide: true })
  return { code: out.status ?? (out.error ? -1 : 0), stdout: out.stdout ?? '', stderr: out.stderr ?? out.error?.message ?? '' }
}

// 사람이 화면을 보며 해야 하는 명령(로그인 등): 터미널이면 화면을 그대로 넘긴다.
export function runShown(cmd, args = [], { timeoutMs = 600000, isInteractive } = {}) {
  return new Promise(resolve => {
    const child = spawn(isWindows ? [cmd, ...args].map(quote).join(' ') : cmd, isWindows ? [] : args, {
      shell: isWindows,
      stdio: isInteractive ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      windowsHide: !isInteractive,
    })
    let text = ''
    child.stdout?.on('data', d => (text += d))
    child.stderr?.on('data', d => (text += d))
    // Windows는 셸(cmd)만 죽이면 그 아래 프로그램이 남으므로 프로세스 트리째 끝낸다.
    const timer = setTimeout(() => {
      if (isWindows && child.pid) spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { windowsHide: true })
      else child.kill()
    }, timeoutMs)
    child.on('close', code => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, text })
    })
    child.on('error', err => {
      clearTimeout(timer)
      resolve({ code: -1, text: String(err) })
    })
  })
}

export function has(cmd) {
  const probe = isWindows ? run('where', [cmd]) : run('sh', ['-c', `command -v ${cmd}`])
  return probe.code === 0 && probe.stdout.trim() !== ''
}

export const firstLine = text => String(text ?? '').trim().split(/\r?\n/).find(line => line.trim() !== '') ?? ''

// 없으면 빈 기록. 깨져 있으면 백업해 두고 멈춘다 (빈 기록으로 덮어써 예전 기록을 잃지 않게).
export function readState() {
  if (!fs.existsSync(stateFile)) return { records: {} }
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  } catch (err) {
    const saved = backup(stateFile)
    throw new Error(`기록 파일이 깨져 있습니다 (${stateFile}, 백업: ${saved}). 파일을 고치거나 지운 뒤 다시 해 주세요: ${err.message}`)
  }
}

export function writeState(state) {
  writeText(stateFile, `${JSON.stringify(state, null, 2)}\n`)
}

// 고치기 전에 원래 파일을 복사해 둔다. 이름에 전체 경로를 줄여 넣고, 같은 초에 또 백업해도 덮어쓰지 않는다.
let backupSeq = 0
export function backup(file) {
  if (!fs.existsSync(file)) return null
  fs.mkdirSync(backupDir, { recursive: true })
  const stamp = new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 19).replace(/[-:T]/g, '')
  const where = normDir(path.dirname(file)).replace(/[:/\\]+/g, '_').slice(-60)
  const target = `${backupDir}/${stamp}-${process.pid}-${backupSeq++}-${where}-${path.basename(file)}`
  fs.copyFileSync(file, target)
  log(`백업: ${file} → ${target}`)
  return target
}

export function readText(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
}

// 쓰다가 끊겨도 반쯤 쓴 파일이 남지 않게 임시 파일에 쓰고 바꿔 끼운다.
// 링크(dotfiles 관리 등)면 링크는 두고 실제 파일에 쓴다. 바꿔 끼우기가 실패하면 임시 파일을 지운다.
export function writeText(file, text) {
  const real = fs.existsSync(file) ? fs.realpathSync(file) : file
  fs.mkdirSync(path.dirname(real), { recursive: true })
  const tmp = `${real}.orchestra-tmp`
  fs.writeFileSync(tmp, text)
  try {
    fs.renameSync(tmp, real)
  } catch (err) {
    fs.rmSync(tmp, { force: true })
    throw new Error(`파일을 쓰지 못함 (다른 프로그램이 쓰는 중일 수 있음): ${real}: ${err.message}`)
  }
}

// 폴더 표기 통일: 슬래시, 드라이브 소문자, 끝 슬래시 없음
export const normDir = dir => dir.replace(/\\/g, '/').replace(/^([A-Z]):/, (_m, d) => `${d.toLowerCase()}:`).replace(/\/+$/, '')

// 프로젝트 폴더: git 저장소면 그 맨 위, 아니면 그 폴더
export function projectRoot(cwd) {
  const top = run('git', ['rev-parse', '--show-toplevel'], { cwd, timeoutMs: 10000 })
  return (top.code === 0 && top.stdout.trim() ? top.stdout.trim() : cwd).replace(/\\/g, '/').replace(/\/+$/, '')
}
