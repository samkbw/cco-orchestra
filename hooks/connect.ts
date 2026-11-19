import type { EngineInterface } from 'claude-code'

export const SERVER_NAME = 'cco-dispatch'

export type Scope = 'global' | 'project'

function firstLine(text: string): string {
  return text.trim().split(/\r?\n/).find(line => line.trim() !== '') ?? ''
}

// cco-dispatch 연결을 넣는다. global은 사용자 설정(모든 프로젝트), project는 그 프로젝트 .mcp.json.
// 같은 범위에 이미 있으면 지우고 다시 넣어 경로를 최신으로 맞춘다.
export async function addServer($: EngineInterface, scope: Scope, node: string, serverJs: string, cwd: string): Promise<void> {
  const flag = scope === 'global' ? 'user' : 'project'
  await $.process.run(['claude', 'mcp', 'remove', '-s', flag, SERVER_NAME], { cwd, timeoutMs: 30000 }).catch(() => undefined)
  const ran = await $.process.run(['claude', 'mcp', 'add', '-s', flag, SERVER_NAME, '--', node, serverJs], { cwd, timeoutMs: 30000 })
  if (ran.exitCode !== 0) throw new Error(`연결 등록 실패: ${firstLine(ran.stderr) || firstLine(ran.stdout)}`)
}

// 연결 상태 한 줄 (예: "✔ Connected", "User config")
export async function serverStatus($: EngineInterface, cwd: string): Promise<{ isOk: boolean; text: string }> {
  try {
    const ran = await $.process.run(['claude', 'mcp', 'get', SERVER_NAME], { cwd, timeoutMs: 30000 })
    if (ran.exitCode !== 0) return { isOk: false, text: '등록 안 됨' }
    const scope = /Scope:\s*(.+)/.exec(ran.stdout)?.[1]?.trim() ?? ''
    const status = /Status:\s*(.+)/.exec(ran.stdout)?.[1]?.trim() ?? ''
    return { isOk: /Connected/i.test(status), text: [status, scope].filter(Boolean).join(' · ') }
  } catch (err) {
    return { isOk: false, text: `확인 불가 (${String(err)})` }
  }
}
