import { expect, test } from 'claude-code/testing'

import { END, EXT_END, EXT_START, START, findBlock, hasExtBlock, hashText, removeExtBlock, toBlock, upsertBlock } from '../hooks/rules'

const BASE = `${EXT_START}\n\n# Dispatch policy\n\n## Session start protocol\n- a\n\n## Precedence\n\n- override\n\n## Division of labor\n- b\n${EXT_END}\n`
const PANE = {
  plugin: 'orchestra',
  component: 'Pane',
  requestId: 'orchestra',
  props: { title: '🎼 오케스트라', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

test('기본 규칙에서 우선순위 규칙과 확장 표시를 빼고 패키지 구간으로 감싼다', async () => {
  const block = toBlock(BASE, '2.0.1')
  expect(block.startsWith(START)).toBe(true)
  expect(block.endsWith(END)).toBe(true)
  expect(block.includes('Precedence')).toBe(false)
  expect(block.includes('Division of labor')).toBe(true)
  expect(block.includes(EXT_START)).toBe(false)
})

test('구간이 있으면 바꾸고 없으면 붙이며, 사용자 규칙은 그대로 둔다', async () => {
  const mine = '# 내 규칙\n* 짧게 답한다\n'
  const once = upsertBlock(mine, toBlock(BASE, '2.0.1'))
  const twice = upsertBlock(once, toBlock(BASE, '2.0.2'))
  expect(twice.startsWith(mine.trim())).toBe(true)
  expect(twice.split(START).length).toBe(2)
  expect(findBlock(twice)?.includes('2.0.2')).toBe(true)
  expect(hashText(findBlock(once)!)).not.toBe(hashText(findBlock(twice)!))
})

test('확장 프로그램이 넣은 프로젝트 규칙만 지운다', async () => {
  const project = `# 프로젝트 규칙\n* A\n\n${BASE}\n# 뒤 규칙\n* B\n`
  expect(hasExtBlock(project)).toBe(true)
  const out = removeExtBlock(project)
  expect(hasExtBlock(out)).toBe(false)
  expect(out.includes('* A')).toBe(true)
  expect(out.includes('* B')).toBe(true)
})

test('처음 실행하면 적용 범위를 고르는 안내가 뜬다', async ($, on) => {
  on('command.register', () => ({ value: { command: 'orch' } as never }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.log', () => ({ value: undefined }))
  on('store.get', () => ({ value: undefined }))
  on('fs.exists', (_$, e) => ({ value: /extensions$|prompts\.js$|server\.js$/.test(String((e as { path?: string }).path ?? '')) }))
  on('fs.list', () => ({ value: [{ name: 'toragonite.claude-code-orchestrator-2.0.1', kind: 'directory', size: 0, mtimeMs: 0, isLink: false }] as never }))
  on('fs.read', () => ({ value: '' }))
  on('fs.write', () => ({ value: undefined }))
  on('process.run', (_$, e) => {
    const argv = (e as { argv: string[] }).argv
    const stdout = argv[2]?.includes('homedir')
      ? JSON.stringify({ home: 'C:/Users/u', platform: 'win32', node: 'node' })
      : JSON.stringify({ found: true, installed: true, fixDir: null })
    return { value: { exitCode: 0, stdout, stderr: '' } as never }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: 'C:/p', surface: 'terminal', isInteractive: true } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' } as never)
  let title: unknown
  for (let i = 0; i < 20 && !title; i++) {
    title = await ui.find({ text: /어디에 적용할까요/ })
    if (!title) await new Promise(resolve => setTimeout(resolve, 20))
  }
  expect(title).toBeDefined()
  expect(await ui.find({ text: /모든 프로젝트에 적용 \(추천\)/ })).toBeDefined()
})
