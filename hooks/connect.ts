import type { EngineInterface } from 'claude-code'

export const SERVER_NAME = 'cco-dispatch'

export type Scope = 'global' | 'project'

const scopeFlag = (scope: Scope) => (scope === 'global' ? 'user' : 'project')

function firstLine(text: string): string {
  return text.trim().split(/\r?\n/).find(line => line.trim() !== '') ?? ''
}

// claude 명령은 셸 없이 실행한다. 못 찾으면 원인을 알기 쉽게 바꿔 알린다.
async function claude($: EngineInterface, args: string[], cwd: string) {
  try {
    return await $.process.run(['claude', ...args], { cwd, timeoutMs: 30000 })
  } catch (err) {
    throw new Error(`claude 명령을 실행하지 못함 (Claude Code CLI가 PATH에 있는지 확인): ${String(err)}`)
  }
}

async function isRegistered($: EngineInterface, scope: Scope, cwd: string): Promise<boolean> {
  const ran = await claude($, ['mcp', 'get', SERVER_NAME], cwd)
  const where = /Scope:\s*(.+)/.exec(ran.stdout)?.[1] ?? ''
  return ran.exitCode === 0 && (scope === 'global' ? /User/i.test(where) : /Project/i.test(where))
}

// cco-dispatch 연결을 넣는다. global은 사용자 설정(모든 프로젝트), project는 그 프로젝트 .mcp.json.
// 같은 범위에 이미 있으면 지우고 다시 넣어 경로를 최신으로 맞추고, 다시 넣기가 실패하면 옛 등록으로 되돌린다.
export async function addServer($: EngineInterface, scope: Scope, node: string, serverJs: string, cwd: string): Promise<void> {
  const flag = scopeFlag(scope)
  const had = await isRegistered($, scope, cwd).catch(() => false)
  if (had) await claude($, ['mcp', 'remove', '-s', flag, SERVER_NAME], cwd)
  const ran = await claude($, ['mcp', 'add', '-s', flag, SERVER_NAME, '--', node, serverJs], cwd)
  if (ran.exitCode !== 0) {
    if (had) await claude($, ['mcp', 'add', '-s', flag, SERVER_NAME, '--', 'node', serverJs], cwd).catch(() => undefined)
    throw new Error(`연결 등록 실패: ${firstLine(ran.stderr) || firstLine(ran.stdout)}`)
  }
}

// 적용 범위를 바꿀 때 예전 범위의 연결을 지운다. 없으면 그냥 넘어간다.
export async function removeServer($: EngineInterface, scope: Scope, cwd: string): Promise<boolean> {
  if (!(await isRegistered($, scope, cwd).catch(() => false))) return false
  const ran = await claude($, ['mcp', 'remove', '-s', scopeFlag(scope), SERVER_NAME], cwd)
  if (ran.exitCode !== 0) throw new Error(`예전 연결 삭제 실패: ${firstLine(ran.stderr) || firstLine(ran.stdout)}`)
  return true
}

// 연결 상태 한 줄 (예: "✔ Connected · User config"). where는 실제 적용 중인 범위.
export async function serverStatus($: EngineInterface, cwd: string): Promise<{ isOk: boolean; text: string; where: string }> {
  try {
    const ran = await claude($, ['mcp', 'get', SERVER_NAME], cwd)
    if (ran.exitCode !== 0) return { isOk: false, text: '등록 안 됨', where: '' }
    const where = /Scope:\s*(.+)/.exec(ran.stdout)?.[1]?.trim() ?? ''
    const status = /Status:\s*(.+)/.exec(ran.stdout)?.[1]?.trim() ?? ''
    return { isOk: /Connected/i.test(status), text: [status, where].filter(Boolean).join(' · '), where }
  } catch (err) {
    return { isOk: false, text: `확인 불가 (${String(err)})`, where: '' }
  }
}
