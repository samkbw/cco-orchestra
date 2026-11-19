// 설치 단계: 빠진 것만 계획하고, 있는 것은 건드리지 않는다.
import fs from 'node:fs'
import path from 'node:path'

import { EXT_ID, check, claudeWorkers, codexWorkers, findCodex, readRegistry } from './check.mjs'
import { backup, firstLine, has, home, isWindows, log, registryFile, run, runShown, serverJs, timed, writeText } from './sys.mjs'

const SERVER_WAIT_MS = 120000
// 플러그인 패널의 실행 상한(10분)보다 짧게 두어, 패널이 먼저 끊어 자식 프로그램이 남지 않게 한다.
const LONG_STEP_MS = 540000

// 앞 단계가 실패하거나 건너뛰면 같이 건너뛸 단계
export const DEPENDS_ON = { codexPath: 'codex', codexLogin: 'codex', worker: 'codex' }

// 계획: 빠진 것만. isOptional은 건너뛰어도 오케스트라는 동작한다(Codex 관련).
export function plan(c) {
  const steps = []
  if (!c.node.isOk) steps.push({ id: 'node', title: `Node.js ${c.node.version} → 18 이상 필요`, manual: 'https://nodejs.org 에서 LTS 버전을 설치해 주세요 (기존 설치 위에 덮어 설치됨).' })
  if (!c.claudeCli) steps.push({ id: 'claude', title: 'Claude Code CLI(claude 명령)를 찾지 못함', manual: 'https://claude.com/claude-code 안내대로 설치해 주세요.' })
  if (!c.ext) {
    steps.push(c.vscode.hasCli
      ? { id: 'ext', title: 'VS Code 확장 "Claude Code Orchestrator" 설치', detail: `code --install-extension ${EXT_ID}` }
      : { id: 'ext', title: 'VS Code 확장 "Claude Code Orchestrator" 설치', manual: 'VS Code를 https://code.visualstudio.com 에서 설치한 뒤, 확장(Extensions)에서 "Claude Code Orchestrator"를 찾아 설치해 주세요.' })
  }
  if (!c.server) {
    steps.push(c.vscode.hasCli
      ? { id: 'server', title: '연결 서버 만들기 (VS Code 새 창을 열어 확장 프로그램을 켬)', detail: 'VS Code 창이 열리면 그대로 두세요. 최대 2분 기다립니다.' }
      : { id: 'server', title: '연결 서버 만들기', manual: 'VS Code를 한 번 열어 주세요. 확장 프로그램이 켜지면서 자동으로 만들어집니다.' })
  }
  // 메인 대화는 지휘만 하므로, 작업할 Claude 워커가 없으면 메인 계정을 같이 쓰는 워커 1개를 넣는다.
  if ((c.worker.claudeWorkers ?? []).length === 0) {
    steps.push(c.worker.registryError
      ? { id: 'claudeWorker', title: 'Claude 작업 워커 등록', manual: `${c.worker.registryError} · VS Code 오케스트라 화면에서 직접 추가해 주세요.` }
      : { id: 'claudeWorker', title: 'Claude 작업 워커 등록 (메인 계정을 같이 씀, 우선 워커)', detail: `${registryFile}에 워커 1개 추가 (기존 워커·설정은 그대로). 사용량은 메인 계정과 같이 줄어듭니다.` })
  }
  const codexStep = !c.codex.isInstalled
    ? has('npm')
      ? { id: 'codex', title: 'Codex CLI 설치 (선택)', detail: 'npm i -g @openai/codex', isOptional: true }
      : { id: 'codex', title: 'Codex CLI 설치 (선택)', manual: 'npm이 없어 자동 설치할 수 없습니다. Node.js를 설치하면 npm도 함께 설치됩니다.', isOptional: true }
    : null
  if (codexStep) steps.push(codexStep)
  // Codex가 이미 있거나 이번에 자동 설치할 때만 뒤 단계를 계획한다.
  const willHaveCodex = c.codex.isInstalled || (codexStep !== null && !codexStep.manual)
  if (c.codex.isInstalled && !c.codex.isFound && c.codex.fixDir) {
    steps.push({ id: 'codexPath', title: 'Codex를 오케스트라가 찾을 수 있게 PATH에 폴더 1개 추가', detail: c.codex.fixDir, isOptional: true })
  }
  if (willHaveCodex && c.codex.isLoggedIn !== true) {
    steps.push({ id: 'codexLogin', title: 'Codex 로그인 (선택)', detail: '로그인 창이 열립니다. 로그인을 마치면 다음 단계로 넘어갑니다.', isOptional: true })
  }
  if (willHaveCodex && c.worker.codexWorkers.length === 0) {
    steps.push(c.worker.registryError
      ? { id: 'worker', title: 'Codex를 오케스트라 워커로 등록 (선택)', manual: `${c.worker.registryError} · VS Code 오케스트라 화면에서 직접 추가해 주세요.`, isOptional: true }
      : { id: 'worker', title: 'Codex를 오케스트라 워커로 등록 (선택)', detail: `${registryFile}에 워커 1개 추가 (기존 워커·설정은 그대로)`, isOptional: true })
  }
  return steps
}

async function waitForServer() {
  const until = Date.now() + SERVER_WAIT_MS
  while (Date.now() < until) {
    if (fs.existsSync(serverJs)) return true
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  return fs.existsSync(serverJs)
}

// 사용자 PATH 끝에 폴더 1개만 더한다. 같은 폴더(대소문자·끝 \ 차이 무시)가 있으면 그대로 둔다.
// %USERPROFILE% 같은 값이 풀리지 않게 레지스트리 원문으로 다루고, 원래 값 종류(REG_SZ/REG_EXPAND_SZ)를 지킨다.
function addUserPath(dir) {
  const script = [
    `$d='${dir.replace(/'/g, "''")}'`,
    "$k=Get-Item 'HKCU:\\Environment'",
    "$p=[string]$k.GetValue('Path','',[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)",
    "$kind=if($k.GetValueNames() -contains 'Path'){$k.GetValueKind('Path')}else{'ExpandString'}",
    "$norm={param($x) $x.Trim().TrimEnd('\\').ToLower()}",
    "$has=@($p -split ';' | Where-Object { (& $norm $_) -eq (& $norm $d) }).Count -gt 0",
    "if(-not $has){$n=if($p.Trim() -eq ''){$d}else{$p.TrimEnd(';')+';'+$d}; Set-ItemProperty -Path 'HKCU:\\Environment' -Name Path -Value $n -Type $kind}",
    "Write-Output ('BEFORE=' + $p)",
    "Write-Output ('ADDED=' + (-not $has))",
  ].join('; ')
  const out = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeoutMs: 30000 })
  if (out.code !== 0) throw new Error(`PATH 추가 실패: ${firstLine(out.stderr) || firstLine(out.stdout)}`)
  const before = /BEFORE=(.*)/.exec(out.stdout)?.[1] ?? ''
  const added = /ADDED=True/.test(out.stdout)
  log(`PATH ${added ? `추가: ${dir}` : `이미 있음: ${dir}`} (이전 사용자 PATH: ${before})`)
  process.env.PATH = `${process.env.PATH}${path.delimiter}${dir}`
  return added
}

const osPath = p => p.replace(/\//g, isWindows ? '\\' : '/')

// 워커 1개만 추가한다. 같은 종류 워커가 이미 있으면 아무것도 하지 않는다.
// 확장 프로그램이 그사이 파일을 바꿨을 수 있어 쓰기 직전에 다시 읽고, 해당 목록(key)에 1개만 더한다.
// kind: codex → vendorWorkers, claude → workers (확장 프로그램 규칙)
function addWorker(kind) {
  const key = kind === 'codex' ? 'vendorWorkers' : 'workers'
  const existing = kind === 'codex' ? codexWorkers : claudeWorkers
  const reg = readRegistry()
  if (!reg) throw new Error('워커 목록 파일이 아직 없습니다. VS Code를 한 번 열어 확장 프로그램을 켠 뒤 다시 해 주세요.')
  for (const k of ['workers', 'vendorWorkers']) {
    if (reg[k] !== undefined && reg[k] !== null && !Array.isArray(reg[k])) {
      throw new Error('워커 목록 파일 형식이 예상과 달라 건드리지 않았습니다. VS Code 오케스트라 화면에서 직접 추가해 주세요.')
    }
  }
  if (existing(reg).length > 0) return 'already'
  const names = new Set([...(reg.workers ?? []), ...(reg.vendorWorkers ?? [])].map(w => w?.name))
  let name = kind
  for (let i = 2; names.has(name); i++) name = `${kind}${i}`
  const entry = kind === 'codex'
    ? { name, configDir: osPath(process.env.CODEX_HOME || `${home}/.codex`), provider: 'codex' }
    : { name, configDir: osPath(process.env.CLAUDE_CONFIG_DIR || `${home}/.claude`), preferred: true }
  backup(registryFile)
  const latest = readRegistry() ?? reg
  if (existing(latest).length > 0) return 'already'
  writeText(registryFile, `${JSON.stringify({ ...latest, [key]: [...(latest[key] ?? []), entry] }, null, 2)}\n`)
  return name
}

// 한 단계 실행. isInteractive: 터미널에서 사람이 보고 있음 (로그인 화면을 그대로 넘김)
export async function runStep(id, { isInteractive = false } = {}) {
  return timed(`설치 단계 ${id}`, async () => {
    switch (id) {
      case 'ext': {
        const out = run('code', ['--install-extension', EXT_ID], { timeoutMs: 300000 })
        if (out.code !== 0) throw new Error(`확장 설치 실패: ${firstLine(out.stderr) || firstLine(out.stdout)}`)
        return '확장 프로그램을 설치했습니다.'
      }
      case 'server': {
        // 이미 열린 VS Code는 새 확장을 켜지 않을 수 있어 새 창을 연다.
        if (!fs.existsSync(serverJs)) await runShown('code', ['-n'], { timeoutMs: 30000 })
        if (!(await waitForServer())) throw new Error('2분 안에 연결 서버가 만들어지지 않았습니다. VS Code를 완전히 껐다 켠 뒤 [다시 확인]을 눌러 주세요.')
        return '연결 서버가 준비됐습니다.'
      }
      case 'codex': {
        const out = run('npm', ['i', '-g', '@openai/codex'], { timeoutMs: LONG_STEP_MS })
        if (out.code !== 0) throw new Error(`Codex 설치 실패: ${firstLine(out.stderr) || firstLine(out.stdout)}`)
        const fix = findCodex().fixDir
        if (fix) addUserPath(fix)
        return fix ? 'Codex를 설치하고, 찾을 수 있게 PATH에 추가했습니다.' : 'Codex를 설치했습니다.'
      }
      case 'codexPath': {
        const fix = findCodex().fixDir
        if (!fix) return '이미 찾을 수 있어 그대로 두었습니다.'
        return addUserPath(fix) ? 'PATH에 추가했습니다. (VS Code는 완전히 껐다 켜야 적용)' : '이미 PATH에 있어 그대로 두었습니다. (VS Code를 완전히 껐다 켜면 적용)'
      }
      case 'codexLogin': {
        const out = await runShown('codex', ['login'], { isInteractive, timeoutMs: LONG_STEP_MS })
        if (out.code !== 0) throw new Error(`Codex 로그인이 끝나지 않았습니다: ${firstLine(out.text)}`)
        return 'Codex 로그인을 마쳤습니다.'
      }
      case 'worker': {
        const name = addWorker('codex')
        return name === 'already' ? '이미 Codex 워커가 있어 그대로 두었습니다.' : `Codex 워커 "${name}"를 등록했습니다.`
      }
      case 'claudeWorker': {
        const name = addWorker('claude')
        return name === 'already' ? '이미 Claude 워커가 있어 그대로 두었습니다.' : `Claude 워커 "${name}"를 등록했습니다 (메인 계정을 같이 씀, 우선 워커).`
      }
      default:
        throw new Error(`자동으로 할 수 없는 단계입니다: ${id}`)
    }
  })
}

export function freshPlan(cwd) {
  const c = check({ cwd, withMcp: false })
  log(`확인: 빠진 것 ${plan(c).map(s => s.id).join(', ') || '없음'}`)
  return { check: c, steps: plan(c) }
}
