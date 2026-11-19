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
