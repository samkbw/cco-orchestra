import type { EngineInterface } from 'claude-code'

// 패널은 터미널 명령(bin/orch.mjs)을 --json으로 불러 같은 동작을 한다. 확인·설치 코드는 lib/에 한 벌만 있다.
const LONG_MS = 600000

export type CoreResult = { ok: boolean; error?: string; [key: string]: any }

export async function core($: EngineInterface, args: string[], cwd: string, timeoutMs = 120000): Promise<CoreResult> {
  const cli = `${$.plugin.root.replace(/\\/g, '/')}/bin/orch.mjs`
  let ran
  try {
    ran = await $.process.run(['node', cli, ...args, '--json', '--cwd', cwd], { cwd, timeoutMs: Math.min(timeoutMs, LONG_MS) })
  } catch (err) {
    // node가 없거나 시간 초과
    return { ok: false, error: String(err), isNodeMissing: /ENOENT|not found|cannot start/i.test(String(err)) }
  }
  const line = ran.stdout.trim().split(/\r?\n/).filter(text => text.startsWith('{')).pop()
  if (!line) return { ok: false, error: ran.stderr.trim().split(/\r?\n/)[0] || `종료 코드 ${ran.exitCode}` }
  try {
    return JSON.parse(line) as CoreResult
  } catch {
    return { ok: false, error: `결과를 읽지 못함: ${line.slice(0, 200)}` }
  }
}

export const STEP_TIMEOUT_MS = LONG_MS

// Node.js가 없을 때만: 패널에서 바로 설치 (Windows winget, macOS brew). 그 밖에는 안내만.
export async function installNode($: EngineInterface): Promise<string> {
  const isWindows = (await $.process.run(['cmd', '/c', 'ver'], { timeoutMs: 10000 }).catch(() => null))?.exitCode === 0
  const argv = isWindows
    ? ['winget', 'install', '--id', 'OpenJS.NodeJS.LTS', '-e', '--accept-package-agreements', '--accept-source-agreements']
    : ['brew', 'install', 'node']
  const ran = await $.process.run(argv, { timeoutMs: LONG_MS })
  if (ran.exitCode !== 0) throw new Error(`Node.js 설치 실패: ${(ran.stderr || ran.stdout).trim().split(/\r?\n/).pop() ?? ''}`)
  return 'Node.js를 설치했습니다. Claude를 다시 시작한 뒤 /orch install 을 실행해 주세요.'
}
