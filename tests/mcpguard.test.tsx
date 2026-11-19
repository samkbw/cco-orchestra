import { expect, test } from 'claude-code/testing'

import { isOtherDispatch } from '../hooks/mcpguard'

// mcp.connect 이벤트는 테스트 도구에서 직접 일으킬 수 없다. 막기 = 이 플러그인 연결이 아닌 cco-dispatch && 전역 사용자.
// 전역 사용자 판단(is-global)은 CLI 테스트(test/autoclean.test.mjs)에서 확인한다.

test('막을 대상: 이 플러그인 연결이 아닌 cco-dispatch만', async () => {
  expect(isOtherDispatch('cco-dispatch', 'orchestra')).toBe(true)
  expect(isOtherDispatch('plugin:other:cco-dispatch', 'orchestra')).toBe(true)
  expect(isOtherDispatch('plugin:orchestra:cco-dispatch', 'orchestra')).toBe(false)
  expect(isOtherDispatch('athena-catalog', 'orchestra')).toBe(false)
  expect(isOtherDispatch('my-cco-dispatch-tool', 'orchestra')).toBe(false)
})

test('플러그인 이름이 달라도 자기 연결은 막지 않는다', async () => {
  expect(isOtherDispatch('plugin:orch2:cco-dispatch', 'orch2')).toBe(false)
  expect(isOtherDispatch('plugin:orchestra:cco-dispatch', 'orch2')).toBe(true)
})
