import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'orchestra',
  component: 'Pane',
  requestId: 'orchestra',
  props: { title: '🎼 오케스트라', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
} as const

const NOT_APPLIED = {
  ok: true,
  check: { state: { mode: null, record: null } },
  rows: [{ label: 'Claude Code Orchestrator 확장', value: '설치됨 (2.0.1)', isOk: true }],
  notices: [],
  actions: [],
  steps: [{ id: 'codexPath', title: 'Codex를 오케스트라가 찾을 수 있게 PATH에 폴더 1개 추가', detail: 'C:/x', isOptional: true }],
}

async function waitFor(ui: any, text: RegExp) {
  for (let i = 0; i < 40; i++) {
    const found = await ui.find({ text })
    if (found) return found
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  return undefined
}

function engine(on: any, answer: ((args: string[]) => unknown) | null) {
  on('command.register', () => ({ value: { command: 'orch' } as never }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.root', () => ({ value: 'C:/p' }))
  on('session.start', (_$: unknown, e: any) => ({ cwd: e.cwd }))
  if (answer === null) return
  on('process.run', (_$: unknown, e: any) => {
    const argv = (e as { argv: string[] }).argv
    return { value: { exitCode: 0, stdout: JSON.stringify(answer(argv.slice(2))), stderr: '' } as never }
  })
}

test('처음 실행하면 설치 화면(확인)이 뜨고, 추가할 것과 버튼이 보인다', async ($, on) => {
  engine(on, () => NOT_APPLIED)
  await $.session.start({ cwd: 'C:/p', surface: 'terminal', isInteractive: true } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' } as never)
  expect(await waitFor(ui, /1\/3 확인/)).toBeDefined()
  expect(await ui.find({ text: /PATH에 폴더 1개 추가/ })).toBeDefined()
  expect(await ui.find({ text: /\[ 설치 \]/ })).toBeDefined()
  expect(await ui.find({ text: /Codex 없이 설치/ })).toBeDefined()
})

test('추가할 것이 없으면 바로 적용 범위를 고른다', async ($, on) => {
  engine(on, () => ({ ...NOT_APPLIED, steps: [] }))
  await $.session.start({ cwd: 'C:/p', surface: 'terminal', isInteractive: true } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' } as never)
  expect(await waitFor(ui, /어디에 적용할까요/)).toBeDefined()
  expect(await ui.find({ text: /모든 프로젝트에 적용 \(추천\)/ })).toBeDefined()
})

test('Node.js가 없으면 Node.js 설치 안내가 뜬다', async ($, on) => {
  engine(on, null)
  on('process.run', () => ({ deny: 'spawn node ENOENT' }))
  await $.session.start({ cwd: 'C:/p', surface: 'terminal', isInteractive: true } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' } as never)
  expect(await waitFor(ui, /Node\.js가 필요합니다/)).toBeDefined()
})
