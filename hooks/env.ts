import type { EngineInterface } from 'claude-code'

// 이 PC의 준비 상태: Node.js, 확장 프로그램, 연결 서버, Codex
export type Env = {
  home: string
  node: string
  isWindows: boolean
  extDir: string | null
  extVersion: string | null
  serverJs: string
  hasServer: boolean
  codex: CodexState
}

export type CodexState = {
  // 설치 여부 (npm 전역 또는 PATH)
  isInstalled: boolean
  // orchestrator가 찾는 방식(Windows는 PATH의 codex.exe)으로 찾히는지
  isFound: boolean
  // Windows npm 설치에서 PATH에 넣어야 할 codex.exe 폴더
  fixDir: string | null
  // 확인 자체가 실패했을 때 이유
  error?: string
}

const EXT_PREFIX = 'toragonite.claude-code-orchestrator-'
const EXT_ROOTS = ['.vscode/extensions', '.vscode-insiders/extensions', '.cursor/extensions']

const NODE_INFO = 'process.stdout.write(JSON.stringify({home:require("os").homedir(),platform:process.platform,node:process.execPath}))'

// orchestrator와 같은 방식으로 codex를 찾고, Windows npm 설치면 codex.exe 폴더도 찾는다.
const CODEX_PROBE = `
const fs=require('fs'),p=require('path');const win=process.platform==='win32';const exe=win?'codex.exe':'codex';
const isFile=f=>{try{return fs.statSync(f).isFile()}catch{return false}};
const found=(process.env.PATH||'').split(p.delimiter).some(d=>d&&isFile(p.join(d,exe)));
let fixDir=null,npm=false;
if(win){const npmDir=p.join(process.env.APPDATA||'','npm');npm=isFile(p.join(npmDir,'codex.cmd'));
const base=p.join(npmDir,'node_modules','@openai','codex','node_modules');
try{for(const d of fs.readdirSync(base)){if(!d.startsWith('codex-win32'))continue;const v=p.join(base,d,'vendor');
for(const t of fs.readdirSync(v)){const b=p.join(v,t,'bin');if(isFile(p.join(b,'codex.exe')))fixDir=b}}}catch{}}
process.stdout.write(JSON.stringify({found,installed:found||npm||fixDir!==null,fixDir}))`

function compareVersion(a: string, b: string): number {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0)
  return 0
}

// 설치된 확장 프로그램 중 가장 높은 버전을 찾는다.
async function findExtension($: EngineInterface, home: string): Promise<{ dir: string; version: string } | null> {
  let best: { dir: string; version: string } | null = null
  for (const root of EXT_ROOTS) {
    const dir = `${home}/${root}`
    if (!(await $.fs.exists(dir))) continue
    for (const entry of await $.fs.list(dir)) {
      const m = new RegExp(`^${EXT_PREFIX.replace(/\./g, '\\.')}(\\d+\\.\\d+\\.\\d+)`).exec(entry.name)
      if (!m || entry.kind !== 'directory') continue
      if (!(await $.fs.exists(`${dir}/${entry.name}/out/prompts.js`))) continue
      if (!best || compareVersion(m[1], best.version) > 0) best = { dir: `${dir}/${entry.name}`, version: m[1] }
    }
  }
  return best
}

export async function probeCodex($: EngineInterface, node: string): Promise<CodexState> {
  const ran = await $.process.run([node, '-e', CODEX_PROBE], { timeoutMs: 15000 })
  if (ran.exitCode !== 0) throw new Error(`Codex 확인 실패: ${ran.stderr.trim().split(/\r?\n/)[0] ?? ''}`)
  const raw = JSON.parse(ran.stdout) as { found: boolean; installed: boolean; fixDir: string | null }
  return { isInstalled: raw.installed, isFound: raw.found, fixDir: raw.found ? null : raw.fixDir }
}

export async function safeProbeCodex($: EngineInterface, node: string): Promise<CodexState> {
  try {
    return await probeCodex($, node)
  } catch (err) {
    return { isInstalled: false, isFound: false, fixDir: null, error: String(err) }
  }
}

// Node.js가 없으면 orchestrator도 동작하지 않으므로 null을 돌려준다.
export async function detectEnv($: EngineInterface): Promise<Env | null> {
  let info: { home: string; platform: string; node: string }
  try {
    const ran = await $.process.run(['node', '-e', NODE_INFO], { timeoutMs: 15000 })
    if (ran.exitCode !== 0) return null
    info = JSON.parse(ran.stdout)
  } catch {
    return null
  }
  const home = info.home.replace(/\\/g, '/')
  const ext = await findExtension($, home)
  const serverJs = `${home}/.claude-code-orchestrator/mcp/server.js`
  return {
    home,
    node: info.node,
    isWindows: info.platform === 'win32',
    extDir: ext?.dir ?? null,
    extVersion: ext?.version ?? null,
    serverJs,
    hasServer: await $.fs.exists(serverJs),
    // Codex는 선택이라, 확인이 실패해도 설정은 막지 않는다 (이유는 error에 남긴다).
    codex: await safeProbeCodex($, info.node),
  }
}

// Windows: codex.exe 폴더를 사용자 PATH 끝에 더한다 (이미 있으면 그대로).
// %USERPROFILE% 같은 값이 풀려 버리지 않게 레지스트리 원문을 읽고 ExpandString으로 쓴다.
export async function addCodexPath($: EngineInterface, dir: string): Promise<void> {
  const raw = "([string](Get-Item 'HKCU:\\Environment').GetValue('Path','',[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames))"
  const script = [
    `$d='${dir.replace(/'/g, "''")}'`,
    `$p=${raw}`,
    "if((($p -split ';') -notcontains $d)){$n=if($p.Trim() -eq ''){$d}else{$p.TrimEnd(';')+';'+$d}; Set-ItemProperty -Path 'HKCU:\\Environment' -Name Path -Value $n -Type ExpandString}",
    `((${raw} -split ';') -contains $d)`,
  ].join('; ')
  const ran = await $.process.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script], { timeoutMs: 20000 })
  if (ran.exitCode !== 0 || !/True/.test(ran.stdout)) throw new Error(`PATH 추가 실패: ${ran.stderr.trim().split(/\r?\n/)[0] ?? ran.stdout.trim()}`)
}

export async function codexLogin($: EngineInterface): Promise<string> {
  try {
    const ran = await $.process.run(['codex', 'login', 'status'], { timeoutMs: 15000 })
    const text = `${ran.stdout}\n${ran.stderr}`.trim().split(/\r?\n/).find(line => line.trim() !== '') ?? ''
    return ran.exitCode === 0 ? text : `로그인 안 됨 (${text})`
  } catch (err) {
    return `확인 불가 (${String(err)})`
  }
}
