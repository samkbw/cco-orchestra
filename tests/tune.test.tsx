import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'orchestra',
  component: 'Pane',
  requestId: 'orchestra',
  surface: 'vscode',
  props: { title: '🎼 오케스트라', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
} as const

const status = (tune: string) => ({
  ok: true,
  check: { state: { mode: 'global', record: { scope: 'global', target: 'C:/u/.claude/CLAUDE.md' }, tune } },
  rows: [],
  notices: [],
  actions: [],
  steps: [],
})

async function waitFor(ui: any, text: RegExp) {
  for (let i = 0; i < 50; i++) {
    const found = await ui.find({ text })
    if (found) return found
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  return undefined
}

function base(on: any, tune: string, calls: string[][]) {
  on('command.register', () => ({ value: { command: 'orch' } as never }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.root', () => ({ value: 'C:/p' }))
  on('session.start', (_$: unknown, e: any) => ({ cwd: e.cwd }))
  on('fs.stat', () => ({ deny: 'no tasks file' }))
  on('process.run', (_$: unknown, e: any) => {
    const args = (e as { argv: string[] }).argv.slice(2)
    calls.push(args)
    const answer = args[0] === 'tune' ? { ok: true, tune: args[1] === 'start' ? 'done' : 'later' } : status(tune)
    return { value: { exitCode: 0, stdout: JSON.stringify(answer), stderr: '' } as never }
  })
}

test('규칙 맞추기를 안 했으면 시작할 때 규칙 맞추기 화면이 뜬다', async ($, on) => {
  base(on, 'pending', [])
  await $.session.start({ cwd: 'C:/p', surface: 'vscode', isInteractive: true } as never)
  const ui = await $.ui.mount(PANE as never)
  expect(await waitFor(ui, /규칙을 내 방식에 맞추기/)).toBeDefined()
  expect(await ui.find({ text: /지금 규칙 맞추기/ })).toBeDefined()
  expect(await ui.find({ text: /나중에/ })).toBeDefined()
})

test('[지금 규칙 맞추기]를 누르면 기록하고 Claude에게 질문을 맡긴다', async ($, on) => {
  const calls: string[][] = []
  let submitted = ''
  base(on, 'pending', calls)
  on('prompt.submit', (_$: unknown, e: any) => {
    submitted = String(e.text)
    return { text: e.text } as never
  })
  await $.session.start({ cwd: 'C:/p', surface: 'vscode', isInteractive: true } as never)
  const ui = await $.ui.mount(PANE as never)
  await waitFor(ui, /지금 규칙 맞추기/)
  await ui.press({ key: 'tuneStart' })
  expect(await waitFor(ui, /Claude가 대화창에서 질문을 시작합니다/)).toBeDefined()
  expect(calls.some(args => args[0] === 'tune' && args[1] === 'start')).toBe(true)
  for (let i = 0; i < 50 && !submitted; i++) await new Promise(resolve => setTimeout(resolve, 20))
  expect(submitted).toContain('[오케스트라 규칙 맞추기]')
  expect(submitted).toContain('C:/u/.claude/CLAUDE.md')
})

test('이미 맞췄으면 시작할 때 규칙 맞추기 화면이 뜨지 않는다', async ($, on) => {
  base(on, 'done', [])
  await $.session.start({ cwd: 'C:/p', surface: 'vscode', isInteractive: true } as never)
  const ui = await $.ui.mount(PANE as never)
  await new Promise(resolve => setTimeout(resolve, 300))
  expect(await ui.find({ text: /규칙을 내 방식에 맞추기/ })).toBeUndefined()
})
