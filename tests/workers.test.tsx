import { expect, test } from 'claude-code/testing'

const NOW = Date.now()
const LINES = [
  { id: 'a', title: '로그인 화면 수정', worker: 'claude', model: 'opus', cwd: 'C:\\p', ts: NOW - 5000, status: 'running' },
  { id: 'b', title: '테스트 작성', worker: 'codex1', model: 'gpt-6.1-sol', cwd: 'C:\\p', ts: NOW - 3000, status: 'running' },
  { id: 'x', title: '다른 폴더 일', worker: 'claude', model: 'opus', cwd: 'C:\\other', ts: NOW - 3000, status: 'running' },
]
  .map(line => JSON.stringify(line))
  .join('\n')

async function waitFor(ui: any, text: RegExp) {
  for (let i = 0; i < 50; i++) {
    const found = await ui.find({ text })
    if (found) return found
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  return undefined
}

test('맡긴 일이 진행 중이면 입력창 위 띠에 이 폴더의 일만 보인다', async ($, on) => {
  on('command.register', () => ({ value: { command: 'orch' } as never }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.root', () => ({ value: 'C:/p' }))
  on('session.start', (_$: unknown, e: any) => ({ cwd: e.cwd }))
  on('process.run', () => ({ deny: 'not in test' }))
  on('fs.stat', () => ({ value: { size: LINES.length, isFile: true } as never }))
  on('fs.read', () => ({ value: LINES as never }))
  await $.session.start({ cwd: 'C:/p', surface: 'terminal', isInteractive: true } as never)
  const ui = await $.ui.mount({ plugin: 'orchestra', component: 'AbovePrompt', surface: 'terminal', props: {} } as never)
  expect(await waitFor(ui, /워커 2개 진행 중/)).toBeDefined()
  expect(await ui.find({ text: /로그인 화면 수정.*claude · opus.*진행 중/ })).toBeDefined()
  expect(await ui.find({ text: /테스트 작성.*codex1/ })).toBeDefined()
  expect(await ui.find({ text: /다른 폴더 일/ })).toBeUndefined()
})

test('VS Code 채팅창: 워커에게 맡긴 줄 아래에 그 줄의 일이 보인다', async ($, on) => {
  on('command.register', () => ({ value: { command: 'orch' } as never }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.root', () => ({ value: 'C:/p' }))
  on('session.start', (_$: unknown, e: any) => ({ cwd: e.cwd }))
  on('process.run', () => ({ deny: 'not in test' }))
  on('fs.stat', () => ({ value: { size: LINES.length, isFile: true } as never }))
  on('fs.read', () => ({ value: LINES as never }))
  await $.session.start({ cwd: 'C:/p', surface: 'vscode', isInteractive: true } as never)
  const ui = await $.ui.mount({
    plugin: 'orchestra',
    component: 'ToolUse',
    surface: 'vscode',
    requestId: 't1',
    props: { tool_use_id: 't1', tool: 'mcp__plugin_orchestra_cco-dispatch__dispatch_tasks', input: { tasks: [{ title: '로그인 화면 수정' }] }, isRunning: true, isErrored: false, isInterrupted: false },
  } as never)
  expect(await waitFor(ui, /로그인 화면 수정.*claude · opus.*진행 중/)).toBeDefined()
  expect(await ui.find({ text: /테스트 작성/ })).toBeUndefined()
})

function base(on: any) {
  on('command.register', () => ({ value: { command: 'orch' } as never }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.root', () => ({ value: 'C:/p' }))
  on('session.start', (_$: unknown, e: any) => ({ cwd: e.cwd }))
  on('fs.stat', () => ({ value: { size: LINES.length, isFile: true } as never }))
  on('fs.read', () => ({ value: LINES as never }))
}

test('진행 중 문구 줄에 워커 개수가 붙는다', async ($, on) => {
  base(on)
  on('process.run', () => ({ deny: 'not in test' }))
  let seen = ''
  on('ui.render', { component: 'Spinner' }, (h$: any, e: any) => {
    seen = String(e.props.suffix)
    const { Text } = h$.ui.resolve(e)
    return <Text>spinner</Text>
  })
  await $.session.start({ cwd: 'C:/p', surface: 'terminal', isInteractive: true } as never)
  await new Promise(resolve => setTimeout(resolve, 300))
  await $.ui.mount({ plugin: 'orchestra', component: 'Spinner', surface: 'terminal', props: { word: 'Thinking', message: null, suffix: '…', mode: 'thinking' } } as never).catch(() => undefined)
  expect(seen).toContain('워커 2개 진행 중')
})

test('오케스트라 패널 상태 화면에 워커 현황 칸이 보인다', async ($, on) => {
  base(on)
  on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify({ ok: true, check: { state: { mode: 'global', record: { scope: 'global' } } }, rows: [], notices: [], actions: [], steps: [] }), stderr: '' } as never }))
  await $.session.start({ cwd: 'C:/p', surface: 'vscode', isInteractive: true } as never)
  const ui = await $.ui.mount({ plugin: 'orchestra', component: 'Pane', requestId: 'orchestra', surface: 'vscode', props: { title: '🎼 오케스트라', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} } } as never)
  await $.command.run({ command: 'orch', args: '' } as never).catch(() => undefined)
  expect(await waitFor(ui, /워커 현황/)).toBeDefined()
  expect(await waitFor(ui, /로그인 화면 수정.*진행 중/)).toBeDefined()
})
