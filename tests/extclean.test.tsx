import { expect, test } from 'claude-code/testing'

const CLAUDE_MD = '# 내 규칙\n\n<!-- claude-code-orchestrator:policy:start -->\n# Dispatch policy\n<!-- claude-code-orchestrator:policy:end -->\n'
const PLAIN_MD = '# 내 규칙\n\nWrite all reports in English.\n'

function base(on: any, opts: { mode: string; md: string; keep?: boolean }, calls: string[][], toasts: string[]) {
  on('command.register', () => ({ value: { command: 'orch' } as never }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', (_$: unknown, e: any) => {
    toasts.push(String(e.text ?? e.message ?? JSON.stringify(e)))
    return { value: undefined }
  })
  on('session.root', () => ({ value: 'C:/p' }))
  on('session.start', (_$: unknown, e: any) => ({ cwd: e.cwd }))
  on('fs.stat', (_$: unknown, e: any) => (String(e.path).endsWith('CLAUDE.md') ? { value: { kind: 'file', size: opts.md.length, mtimeMs: 1, isLink: false } as never } : { deny: 'none' }))
  on('fs.exists', () => ({ value: true as never }))
  on('fs.read', (_$: unknown, e: any) => {
    const file = String(e.path)
    if (file.endsWith('state.json')) return { value: JSON.stringify({ mode: opts.mode, records: { [opts.mode]: { scope: opts.mode } }, keepExt: opts.keep ? { 'c:/p': true } : {} }) as never }
    return { value: opts.md as never }
  })
  on('process.run', (_$: unknown, e: any) => {
    const args = (e as { argv: string[] }).argv.slice(2)
    calls.push(args)
    const answer = args[0] === 'clean-ext' ? { ok: true, file: 'C:/p/CLAUDE.md', changed: true } : { ok: true, check: { state: { mode: opts.mode, record: { scope: opts.mode }, tune: 'done' } }, rows: [], notices: [], actions: [], steps: [] }
    return { value: { exitCode: 0, stdout: JSON.stringify(answer), stderr: '' } as never }
  })
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

test('전역 사용자: 확장이 프로젝트에 넣은 규칙 구간을 자동으로 지우고 알린다', async ($, on) => {
  const calls: string[][] = []
  const toasts: string[] = []
  base(on, { mode: 'global', md: CLAUDE_MD }, calls, toasts)
  await $.session.start({ cwd: 'C:/p', surface: 'vscode', isInteractive: true } as never)
  await wait(400)
  expect(calls.some(args => args[0] === 'clean-ext')).toBe(true)
  expect(toasts.some(text => text.includes('지웠습니다'))).toBe(true)
})

test('프로젝트 설정자: 확장 규칙이 있어도 지우지 않는다', async ($, on) => {
  const calls: string[][] = []
  base(on, { mode: 'project', md: CLAUDE_MD }, calls, [])
  await $.session.start({ cwd: 'C:/p', surface: 'vscode', isInteractive: true } as never)
  await wait(400)
  expect(calls.some(args => args[0] === 'clean-ext')).toBe(false)
})

test('전역 사용자라도 확장 표시가 없는 영어 규칙은 지우지 않는다', async ($, on) => {
  const calls: string[][] = []
  base(on, { mode: 'global', md: PLAIN_MD }, calls, [])
  await $.session.start({ cwd: 'C:/p', surface: 'vscode', isInteractive: true } as never)
  await wait(400)
  expect(calls.some(args => args[0] === 'clean-ext')).toBe(false)
})

test('[그대로 두기]를 누른 프로젝트는 지우지 않는다', async ($, on) => {
  const calls: string[][] = []
  base(on, { mode: 'global', md: CLAUDE_MD, keep: true }, calls, [])
  await $.session.start({ cwd: 'C:/p', surface: 'vscode', isInteractive: true } as never)
  await wait(400)
  expect(calls.some(args => args[0] === 'clean-ext')).toBe(false)
})
