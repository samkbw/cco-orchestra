// 터미널 공통 코드 테스트: node --test test/
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { EXT_END, EXT_START, END, START, findBlock, hasExtBlock, hashText, removeBlock, removeExtBlock, toBlock, upsertBlock } from '../lib/rules.mjs'
import { plan } from '../lib/install.mjs'

const BASE = `${EXT_START}\n\n# Dispatch policy\n\n## Session start protocol\n- a, no \`cd\`, \`$\`, $& and $' here\n\n## Precedence\n\n- override\n\n## Division of labor\n- b\n${EXT_END}\n`

test('우선순위 규칙과 확장 표시를 빼고 패키지 구간으로 감싼다', () => {
  const block = toBlock(BASE, '2.0.1')
  assert.ok(block.startsWith(START) && block.endsWith(END))
  assert.ok(!block.includes('## Precedence') && block.includes('Division of labor') && !block.includes(EXT_START))
  assert.ok(block.includes('## 한눈에 보기 (한국어 요약)'))
})

test('$` 같은 글자가 있어도 다시 넣을 때 파일이 깨지지 않고, 내 규칙은 그대로', () => {
  const mine = '# 내 규칙\n* A\n'
  const twice = upsertBlock(upsertBlock(mine, toBlock(BASE, '1')), toBlock(BASE, '2'))
  assert.equal(twice.split('# 내 규칙').length, 2)
  assert.ok(findBlock(twice).includes('Claude Code Orchestrator 2'))
  assert.equal(removeBlock(twice).trim(), mine.trim())
})

test('확장 프로그램 구간만 지운다', () => {
  const out = removeExtBlock(`# P\n* A\n\n${BASE}\n# 뒤\n* B\n`)
  assert.ok(!hasExtBlock(out) && out.includes('* A') && out.includes('* B'))
})

test('줄바꿈만 바뀐 규칙은 고친 것으로 보지 않는다', () => {
  const block = toBlock(BASE, '1')
  assert.equal(hashText(block.replace(/\n/g, '\r\n')), hashText(block))
  assert.notEqual(hashText(block.replace('- b', '- b 고침')), hashText(block))
})

const READY = {
  node: { version: '24.0.0', isOk: true },
  claudeCli: true,
  claudeExt: true,
  claudeLogin: true,
  vscode: { hasCli: true },
  ext: { version: '2.0.1' },
  server: true,
  codex: { isInstalled: true, isFound: true, fixDir: null, isLoggedIn: true },
  worker: { codexWorkers: ['codex1'], claudeWorkers: ['claude'] },
}

test('Claude 작업 워커가 없으면 1개 등록을 계획한다 (메인은 지휘만 함)', () => {
  assert.deepEqual(plan({ ...READY, worker: { codexWorkers: ['codex1'], claudeWorkers: [] } }).map(s => s.id), ['claudeWorker'])
})

test('다 있으면 계획이 비어 있다 (아무것도 바꾸지 않음)', () => {
  assert.deepEqual(plan(READY), [])
})

test('빠진 것만 계획한다: 확장 없음 + Codex PATH 문제', () => {
  const ids = plan({ ...READY, ext: null, codex: { isInstalled: true, isFound: false, fixDir: 'C:/x/bin', isLoggedIn: undefined } }).map(s => s.id)
  assert.deepEqual(ids, ['ext', 'codexPath', 'codexLogin'])
})

test('VS Code가 없고 설치 도구(winget·brew)도 없으면 사이트 안내, 확장도 직접', () => {
  const steps = plan({ ...READY, ext: null, server: false, vscode: { hasCli: false, installer: null } })
  assert.match(steps.find(s => s.id === 'vscode').manual, /code\.visualstudio\.com/)
  assert.ok(steps.find(s => s.id === 'ext').manual)
})

test('VS Code가 없고 winget이 있으면 VS Code → 확장 → 서버를 자동으로 이어서 한다', () => {
  const steps = plan({ ...READY, ext: null, server: false, vscode: { hasCli: false, installer: 'winget' } })
  assert.deepEqual(steps.map(s => [s.id, Boolean(s.manual)]), [['vscode', false], ['ext', false], ['server', false]])
})

test('아무것도 없는 PC(winget 있음): VS Code → Claude Code → 오케스트라 순서로 모두 자동', () => {
  const steps = plan({ ...READY, claudeCli: false, claudeExt: false, claudeLogin: null, ext: null, server: false, vscode: { hasCli: false, installer: 'winget' }, worker: { codexWorkers: [], claudeWorkers: [] }, codex: { isInstalled: false, isFound: false, fixDir: null } })
  const ids = steps.map(s => s.id)
  assert.deepEqual(ids.slice(0, 7), ['vscode', 'claudeExt', 'claudeCli', 'claudeLogin', 'ext', 'server', 'claudeWorker'])
  assert.ok(steps.filter(s => !s.isOptional).every(s => !s.manual))
})

test('VS Code가 이미 있으면 VS Code 단계는 없다 (업데이트하지 않음)', () => {
  assert.ok(!plan({ ...READY, ext: null }).some(s => s.id === 'vscode'))
})
