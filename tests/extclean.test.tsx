import { expect, test } from 'claude-code/testing'

// 판단(전역 사용자·전역 규칙·그대로 두기·루트)은 CLI가 한다: test/autoclean.test.mjs.
// 여기서는 플러그인이 CLI를 부르고, 지웠을 때만 알리고, 파일이 그대로면 다시 부르지 않는지 확인한다.

function base(on: any, action: string, calls: string[][], toasts: string[], mtime = { value: 5 }) {
  on('command.register', () => ({ value: { command: 'orch' } as never }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', (_$: unknown, e: any) => {
    toasts.push(JSON.stringify(e))
    return { value: undefined }
  })
  on('session.root', () => ({ value: 'C:/p' }))
  on('session.start', (_$: unknown, e: any) => ({ cwd: e.cwd }))
  on('fs.stat', (_$: unknown, e: any) => (String(e.path).endsWith('CLAUDE.md') ? { value: { kind: 'file', size: 10, mtimeMs: mtime.value, isLink: false } as never } : { deny: 'none' }))
  on('prompt.submit', (_$: unknown, e: any) => ({ text: e.text }) as never)
  on('process.run', (_$: unknown, e: any) => {
    const args = (e as { argv: string[] }).argv.slice(2)
    calls.push(args)
    const answer = args[0] === 'auto-clean-ext'
      ? { ok: true, action, file: 'C:/p/CLAUDE.md', mtimeMs: mtime.value }
      : { ok: true, check: { state: { mode: 'global', record: { scope: 'global' }, tune: 'done' } }, rows: [], notices: [], actions: [], steps: [] }
    return { value: { exitCode: 0, stdout: JSON.stringify(answer), stderr: '' } as never }
  })
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const cleanCalls = (calls: string[][]) => calls.filter(args => args[0] === 'auto-clean-ext').length

test('지웠으면(cleaned) 알린다', async ($, on) => {
  const calls: string[][] = []
  const toasts: string[] = []
  base(on, 'cleaned', calls, toasts)
  await $.session.start({ cwd: 'C:/p', surface: 'vscode', isInteractive: true } as never)
  await wait(300)
  expect(cleanCalls(calls)).toBe(1)
  expect(toasts.some(text => text.includes('지웠습니다'))).toBe(true)
})

test('지우지 않았으면(프로젝트 설정자 등) 알리지 않는다', async ($, on) => {
  const toasts: string[] = []
  base(on, 'project', [], toasts)
  await $.session.start({ cwd: 'C:/p', surface: 'vscode', isInteractive: true } as never)
  await wait(300)
  expect(toasts.some(text => text.includes('지웠습니다'))).toBe(false)
})

test('파일이 그대로면 메시지를 보내도 다시 부르지 않고, 바뀌면 다시 부른다', async ($, on) => {
  const calls: string[][] = []
  const mtime = { value: 5 }
  base(on, 'none', calls, [], mtime)
  await $.session.start({ cwd: 'C:/p', surface: 'vscode', isInteractive: true } as never)
  await wait(300)
  await $.prompt.submit({ text: '안녕' } as never)
  await wait(200)
  expect(cleanCalls(calls)).toBe(1)
  mtime.value = 9
  await $.prompt.submit({ text: '다시' } as never)
  await wait(200)
  expect(cleanCalls(calls)).toBe(2)
})
