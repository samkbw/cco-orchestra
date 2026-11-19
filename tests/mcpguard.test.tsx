import { expect, test } from 'claude-code/testing'

import { isGlobalState, isOtherDispatch } from '../hooks/mcpguard'

// mcp.connect 이벤트는 테스트 도구에서 직접 일으킬 수 없어, 막을지 정하는 두 조건을 따로 확인한다.
// (막기 = 플러그인 연결이 아닌 cco-dispatch && 전역 사용자)

test('막을 대상: 플러그인 연결이 아닌 cco-dispatch만', async () => {
  expect(isOtherDispatch('cco-dispatch')).toBe(true)
  expect(isOtherDispatch('plugin:other:cco-dispatch')).toBe(true)
  expect(isOtherDispatch('plugin:orchestra:cco-dispatch')).toBe(false)
  expect(isOtherDispatch('athena-catalog')).toBe(false)
  expect(isOtherDispatch('my-cco-dispatch-tool')).toBe(false)
})

test('전역 사용자일 때만 막는다', async () => {
  expect(isGlobalState(JSON.stringify({ mode: 'global', records: { global: { scope: 'global' } } }))).toBe(true)
  expect(isGlobalState(JSON.stringify({ mode: 'project', records: { 'project:c:/p': { scope: 'project' } } }))).toBe(false)
  // 전역을 골랐다가 프로젝트로 바꾼 사람
  expect(isGlobalState(JSON.stringify({ mode: 'project', records: { global: { scope: 'global' } } }))).toBe(false)
  // 설정 전, 기록이 깨진 경우: 막지 않는다
  expect(isGlobalState(null)).toBe(false)
  expect(isGlobalState('{깨짐')).toBe(false)
})
